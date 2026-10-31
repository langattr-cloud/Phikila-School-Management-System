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
  assert.match(routes, /grade: book\.grade/)
  assert.match(routes, /subject: book\.subject/)
  assert.match(routes, /copy_number/)
})
