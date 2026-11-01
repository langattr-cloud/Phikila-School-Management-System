import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import app from '../src/index.ts'

const migration = await readFile(
  new URL('../supabase/migrations/002_library_chain_of_custody.sql', import.meta.url),
  'utf8',
)
const accountabilityMigration = await readFile(new URL('../supabase/migrations/003_library_teacher_accountability.sql', import.meta.url), 'utf8')
const routes = await readFile(new URL('../src/routes/library.ts', import.meta.url), 'utf8')

test('library copy register enforces unique physical copy numbers per title', () => {
  assert.match(migration, /unique\s*\(book_id,\s*copy_number\)/i)
  assert.match(migration, /insert into public\.library_book_copies[\s\S]*?generate_series/i)
})

test('custody transitions are serialized and reject skipping chain levels', () => {
  assert.match(migration, /for update/i)
  assert.match(migration, /Only an available library copy can be issued to a named teacher/i)
  assert.match(migration, /Only a teacher-held copy can be issued to a named student/i)
  assert.match(migration, /Only a student-held copy can be returned to a teacher/i)
  assert.match(migration, /Only a teacher-held copy can be returned to the library/i)
  assert.match(migration, /must be returned to the teacher who issued it/i)
  assert.match(migration, /p_action='reconcile_copy'[\s\S]*?status<>'unreconciled'/i)
  assert.match(migration, /legacy loans: physical copy assignments unknown/i)
})

test('every successful transition appends a movement record before updating the copy', () => {
  assert.match(migration, /insert into public\.library_copy_movements[\s\S]*?update public\.library_book_copies/i)
  assert.match(migration, /transaction_ref uuid not null/i)
  assert.match(migration, /performed_by uuid/i)
  assert.match(migration, /before update or delete on public\.library_copy_movements/i)
  assert.match(migration, /Library movement history is immutable/i)
  assert.match(migration, /grant select,insert on public\.library_copy_movements to service_role/i)
})

test('library API exposes individual copies, movement history and holder reconciliation', () => {
  assert.match(routes, /get\('\/copies'/)
  assert.match(routes, /get\('\/copies\/:copyId\/movements'/)
  assert.match(routes, /post\('\/copies\/:copyId\/movements'/)
  assert.match(routes, /get\('\/reconciliation'/)
})

test('custody and reconciliation endpoints require verified authentication', async () => {
  for (const path of [
    '/api/v1/library/copies',
    '/api/v1/library/reconciliation',
    '/api/v1/library/teacher-accountability',
    '/api/v1/library/student-directory',
    '/api/v1/library/student-allocations',
    '/api/v1/library/copies/00000000-0000-0000-0000-000000000000/movements',
  ]) {
    const response = await app.request(path)
    assert.equal(response.status, 401, path)
  }
})

test('teacher accountability includes student-held copies until library acceptance', () => {
  assert.match(accountabilityMigration, /library_teacher_accountability/i)
  assert.match(accountabilityMigration, /action = 'issue_to_student'/i)
  assert.match(accountabilityMigration, /action = 'issue_to_teacher'/i)
  assert.match(accountabilityMigration, /current_holder_type in \('teacher','student'\)/i)
  assert.match(routes, /get\('\/teacher-accountability'/)
  assert.match(routes, /retained_by_teacher/)
  assert.match(routes, /with_students/)
})


test('grade and subject inventory summary counts individually registered physical copies', async () => {
  const classificationMigration = await readFile(new URL('../supabase/migrations/004_library_grade_subject.sql', import.meta.url), 'utf8')
  assert.match(classificationMigration, /add column if not exists grade text/i)
  assert.match(classificationMigration, /add column if not exists subject text/i)
  assert.match(routes, /grade-subject-summary/)
  assert.match(routes, /group.total_copies \+= copies.length/)
  assert.match(routes, /Grade and subject are required/)
})

test('teacher inventory summary groups accountable physical copies by teacher, grade, subject and title', () => {
  assert.match(routes, /teacher-inventory-summary/)
  assert.match(routes, /accountable_teacher_id/)
  assert.match(routes, /addCopy\('all'/)
  assert.match(routes, /const grade = book\.grade/)
  assert.match(routes, /const grade = book\.grade \|\| 'Unassigned', subject = book\.subject \|\| 'Unassigned'/)
  assert.match(routes, /copy_number/)
})


test('pre-issue missing copies can be excluded and restored without entering teacher custody', async () => {
  const exclusionMigration = await readFile(new URL('../supabase/migrations/005_library_preissue_exclusions.sql', import.meta.url), 'utf8')
  assert.match(exclusionMigration, /status in \([^)]*'excluded'/i)
  assert.match(exclusionMigration, /exclude_before_issue/)
  assert.match(exclusionMigration, /restore_excluded_copy/)
  assert.match(exclusionMigration, /Only an available copy still in library custody can be excluded before issue/i)
  assert.match(exclusionMigration, /Only a copy previously excluded before issue can be restored/i)
  assert.match(exclusionMigration, /for update/i)
  assert.match(exclusionMigration, /insert into public\.library_copy_movements[\s\S]*?update public\.library_book_copies/i)
  assert.match(routes, /set_library_copy_preissue_exclusion/)
  assert.match(routes, /A reason is required for pre-issue exclusion or restoration/i)
})


test('student directory and librarian allocation register use active membership authorization', () => {
  assert.match(routes, /from\('tt_memberships'\)/)
  assert.match(routes, /eq\('is_active', true\)/)
  assert.match(routes, /get\('\/student-directory'/)
  assert.match(routes, /get\('\/student-allocations'/)
  assert.match(routes, /get\('\/student-allocations'[\s\S]*?\['admin', 'super_admin', 'librarian'\]/)
  assert.match(routes, /Select an active student from the Student module/)
})


test('student issue validates the selected Student module record after parsing the holder fields', () => {
  const movementRoute = routes.slice(routes.indexOf("libraryRoutes.post('/copies/:copyId/movements'"))
  assert.ok(movementRoute.indexOf('const toHolderId =') < movementRoute.indexOf("if (action === 'issue_to_student') {"))
  assert.match(movementRoute, /students'\)\s*\n\s*\.select\('id,admission_number,first_name,middle_name,last_name,status'\)/)
  assert.match(movementRoute, /from\('students_v2'\)[\s\S]*?\.eq\('school_id', schoolId\)[\s\S]*?\.eq\('admission_number', student\.admission_number\)/)
})


test('Library teacher directory is sourced from saved timetable profiles owned by school administrators', async () => {
  const library = await readFile(new URL('../src/routes/library.ts', import.meta.url), 'utf8')
  assert.match(library, /libraryRoutes\.get\('\/teacher-directory'/)
  assert.match(library, /from\('tt_memberships'\)/)
  assert.match(library, /from\('timetable_teacher_profiles'\)/)
  assert.match(library, /timetableTeacherName/)
  assert.match(library, /owner_id/)
})




test('library student directory and enrollment enrichment are scoped to the active school', async () => {
  const library = await readFile(new URL('../src/routes/library.ts', import.meta.url), 'utf8')
  assert.match(library, /students_v2'\)\s*\n\s*\.select\('admission_number,status'\)\.eq\('school_id', schoolId\)/)
  assert.match(library, /student_enrollments'\)\.select\([\s\S]*?\.eq\('school_id', schoolId\)/)
  assert.match(library, /school_classes'\)\.select\([\s\S]*?\.eq\('school_id', schoolId\)/)
  assert.match(library, /grades'\)\.select\([\s\S]*?\.eq\('school_id', schoolId\)/)
  assert.match(library, /streams'\)\.select\([\s\S]*?\.eq\('school_id', schoolId\)/)
})

test('library membership selection rejects ambiguous multi-school membership without explicit school header', async () => {
  const library = await readFile(new URL('../src/routes/library.ts', import.meta.url), 'utf8')
  assert.match(library, /X-School-Id is required for users with multiple school memberships/)
  assert.match(library, /Number\(item\.school_id\) === schoolId && allowed\.includes/)
  assert.match(library, /You do not have an active membership in the requested school/)
})

test('student custody issue verifies that the selected student belongs to the active school', async () => {
  const library = await readFile(new URL('../src/routes/library.ts', import.meta.url), 'utf8')
  assert.match(library, /from\('students_v2'\)[\s\S]*?\.eq\('school_id', schoolId\)[\s\S]*?\.eq\('admission_number', student\.admission_number\)/)
  assert.match(library, /The selected student is not active in your current school/)
})


test('library membership selection requires an explicit school when a user belongs to multiple schools', () => {
  assert.match(routes, /X-School-Id is required for users with multiple school memberships/)
  assert.match(routes, /eligible\.find\(\(item: any\) => Number\(item\.school_id\) === schoolId\)/)
})


test('library membership selection requires an explicit school when a user belongs to multiple schools', () => {
  assert.match(routes, /X-School-Id is required for users with multiple school memberships/)
  assert.match(routes, /eligible\.find\(\(item: any\) => Number\(item\.school_id\) === schoolId\)/)
})

test('student directory and allocation lookups are scoped to the selected school', () => {
  assert.match(routes, /from\('students_v2'\)[\s\S]*?eq\('school_id', schoolId\)/)
  assert.match(routes, /from\('student_enrollments'\)[\s\S]*?eq\('school_id', schoolId\)/)
  assert.match(routes, /filter\(copy => byId\.has\(Number\(copy\.student_id\)\)\)/)
})


test('Library custody uses saved timetable teacher IDs for custody holder references', async () => {
  const page = await readFile(new URL('../../frontend/src/pages/LibraryPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /apiFetch<DirectoryTeacher\[\]>\('\/api\/v1\/library\/teacher-directory'\)/)
  assert.doesNotMatch(page, /apiFetch<DirectoryTeacher\[\]>\('\/api\/v1\/teachers\/'\)/)
})
