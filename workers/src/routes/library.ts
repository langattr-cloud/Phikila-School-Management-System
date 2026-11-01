import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const libraryRoutes = new Hono()

const movementActions = new Set([
  'issue_to_teacher',
  'issue_to_student',
  'student_return_to_teacher',
  'teacher_return_to_library',
  'mark_lost',
  'reconcile_copy',
  'exclude_before_issue',
  'restore_excluded_copy',
])
const copyConditions = new Set(['good', 'damaged', 'lost'])

function actorId(user: { id: string } | null): string | null {
  return user?.id ?? null
}


async function requireLibraryRole(c: any, allowed: string[]) {
  const { error, user } = requireAuth(c as never)
  if (error || !user) return { error: error ?? c.json({ detail: 'Not authenticated.' }, 401), user: null, membership: null }
  const { data, error: membershipError } = await db().from('tt_memberships')
    .select('role,teacher_id,school_id').eq('user_id', user.id).eq('is_active', true)
  if (membershipError) return { error: c.json({ detail: 'Library role could not be verified.' }, 503), user, membership: null }
  const eligible = (data ?? []).filter((item: any) => allowed.includes(String(item.role ?? '').toLowerCase()))
  const requestedSchool = c.req.header('X-School-Id')
  let membership: any = null
  if (requestedSchool) {
    const schoolId = Number(requestedSchool)
    if (!Number.isSafeInteger(schoolId) || schoolId <= 0) {
      return { error: c.json({ detail: 'Invalid X-School-Id header.' }, 400), user, membership: null }
    }
    membership = eligible.find((item: any) => Number(item.school_id) === schoolId) ?? null
  } else {
    const schoolIds = [...new Set(eligible.map((item: any) => Number(item.school_id)).filter((id: number) => Number.isSafeInteger(id) && id > 0))]
    if (schoolIds.length > 1) {
      return { error: c.json({ detail: 'X-School-Id is required for users with multiple school memberships.' }, 400), user, membership: null }
    }
    membership = eligible[0] ?? null
  }
  if (!membership) return { error: c.json({ detail: 'An authorized school Library role is required.' }, 403), user, membership: null }
  const schoolId = Number(membership.school_id)
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) {
    return { error: c.json({ detail: 'The selected school membership is invalid.' }, 403), user, membership: null }
  }
  return { error: null, user, membership }
}

async function requireLibrarySchool(c: any, roles: string[] = ['admin', 'super_admin', 'librarian']) {
  const access = await requireLibraryRole(c, roles)
  if (access.error) return { ...access, schoolId: null as number | null }
  const schoolId = Number(access.membership?.school_id)
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) {
    return { ...access, error: c.json({ detail: 'An active school membership is required.' }, 403), schoolId: null as number | null }
  }
  return { ...access, schoolId }
}

function timetableTeacherName(profile: Record<string, any>) {
  const details = profile.timetableDetails && typeof profile.timetableDetails === 'object' ? profile.timetableDetails : {}
  const first = String(details.firstName || profile.firstName || profile.first_name || '').trim()
  const last = String(profile.lastName || profile.last_name || '').trim()
  const rawName = String(profile.name || '').trim()
  if (first && last) return first + ' ' + last
  if (first && rawName && first.toLocaleLowerCase() !== rawName.toLocaleLowerCase()) return first + ' ' + rawName
  return rawName || first || last
}

libraryRoutes.get('/teacher-directory', async (c) => {
  const access = await requireLibraryRole(c, ['admin', 'super_admin', 'librarian', 'teacher'])
  if (access.error) return access.error
  const schoolId = Number(access.membership?.school_id)
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return c.json([])
  const client = db()
  const { data: owners, error: ownerError } = await client.from('tt_memberships')
    .select('user_id').eq('school_id', schoolId).eq('is_active', true).in('role', ['admin', 'super_admin'])
  if (ownerError) return jsonError(c, 'School teacher profiles could not be loaded.', 503)
  const ownerIds = [...new Set((owners ?? []).map((item: any) => String(item.user_id)).filter(Boolean))]
  if (!ownerIds.length) return c.json([])
  const { data: profiles, error: profileError } = await client.from('timetable_teacher_profiles')
    .select('id,owner_id,profile').in('owner_id', ownerIds).order('id')
  if (profileError) return jsonError(c, 'Saved timetable teacher profiles could not be loaded.', 503)
  return c.json((profiles ?? []).map((row: any) => ({
    id: Number(row.id),
    name: timetableTeacherName(row.profile ?? {}),
    staff_number: String(row.profile?.short ?? row.profile?.code ?? '').trim() || null,
  })).filter((teacher: any) => Number.isSafeInteger(teacher.id) && teacher.name))
})

async function enrichStudentRows(rows: any[], schoolId: number) {
  const admissions = [...new Set(rows.map(row => String(row.admission_number ?? '').trim()).filter(Boolean))]
  if (!admissions.length) return []
  const client = db()
  const modernResult = await client.from('students_v2').select('id,admission_number').eq('school_id', schoolId).in('admission_number', admissions)
  if (modernResult.error) throw modernResult.error
  const modern = modernResult.data ?? []
  const ids = modern.map(row => Number(row.id))
  const enrollmentResult = ids.length
    ? await client.from('student_enrollments').select('student_id,grade_id,stream_id,class_id,school_class_id,status,created_at').eq('school_id', schoolId).in('student_id', ids).eq('status', 'enrolled').order('created_at', { ascending: false })
    : { data: [], error: null }
  if (enrollmentResult.error) throw enrollmentResult.error
  const enrollments = enrollmentResult.data ?? []
  const latest = new Map<number, any>()
  for (const row of enrollments) if (!latest.has(Number(row.student_id))) latest.set(Number(row.student_id), row)
  const classIds = [...new Set(enrollments.map(row => Number(row.school_class_id ?? row.class_id)).filter(Number.isSafeInteger))]
  const gradeIds = [...new Set(enrollments.map(row => Number(row.grade_id)).filter(Number.isSafeInteger))]
  const streamIds = [...new Set(enrollments.map(row => Number(row.stream_id)).filter(Number.isSafeInteger))]
  const [classResult, gradeResult, streamResult] = await Promise.all([
    classIds.length ? client.from('school_classes').select('id,name,display_name,grade').eq('school_id', schoolId).in('id', classIds) : Promise.resolve({ data: [], error: null }),
    gradeIds.length ? client.from('grades').select('id,name').eq('school_id', schoolId).in('id', gradeIds) : Promise.resolve({ data: [], error: null }),
    streamIds.length ? client.from('streams').select('id,name').eq('school_id', schoolId).in('id', streamIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (classResult.error || gradeResult.error || streamResult.error) throw classResult.error ?? gradeResult.error ?? streamResult.error
  const classes = new Map((classResult.data ?? []).map(row => [Number(row.id), row]))
  const grades = new Map((gradeResult.data ?? []).map(row => [Number(row.id), row.name]))
  const streams = new Map((streamResult.data ?? []).map(row => [Number(row.id), row.name]))
  const modernIds = new Map(modern.map(row => [String(row.admission_number), Number(row.id)]))
  const legacyCounts = new Map<string, number>()
  for (const row of rows) {
    const admission = String(row.admission_number ?? '')
    legacyCounts.set(admission, (legacyCounts.get(admission) ?? 0) + 1)
  }
  // The legacy students table has no school_id. If an admission number maps
  // to multiple legacy rows, fail closed rather than exposing another school's
  // record or assigning custody to an ambiguous student identity.
  return rows.filter(row => {
    const admission = String(row.admission_number ?? '')
    return modernIds.has(admission) && legacyCounts.get(admission) === 1
  }).map(row => {
    const enrollment = latest.get(modernIds.get(String(row.admission_number ?? '')) ?? -1)
    const classId = enrollment ? Number(enrollment.school_class_id ?? enrollment.class_id) : NaN
    const schoolClass = Number.isSafeInteger(classId) ? classes.get(classId) : null
    const grade = enrollment?.grade_id == null ? null : grades.get(Number(enrollment.grade_id))
    const stream = enrollment?.stream_id == null ? null : streams.get(Number(enrollment.stream_id))
    return {
      id: Number(row.id), admission_number: row.admission_number,
      name: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' '),
      current_class: schoolClass?.display_name || schoolClass?.name || [grade ?? schoolClass?.grade, stream].filter(Boolean).join(' ') || null,
    }
  })
}

libraryRoutes.get('/student-directory', async (c) => {
  const access = await requireLibraryRole(c, ['admin', 'super_admin', 'librarian', 'teacher'])
  if (access.error) return access.error
  const schoolId = Number(access.membership?.school_id)
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return c.json([])
  const { data: schoolStudents, error: schoolStudentError } = await db().from('students_v2')
    .select('admission_number,status').eq('school_id', schoolId).order('admission_number')
  if (schoolStudentError) return jsonError(c, schoolStudentError.message, 500)
  const activeAdmissions = [...new Set((schoolStudents ?? [])
    .filter(row => !['inactive', 'withdrawn', 'archived', 'deleted'].includes(String(row.status ?? '').toLowerCase()))
    .map(row => String(row.admission_number ?? '').trim()).filter(Boolean))]
  if (!activeAdmissions.length) return c.json([])
  const { data, error } = await db().from('students')
    .select('id,admission_number,first_name,middle_name,last_name,status').in('admission_number', activeAdmissions).order('admission_number')
  if (error) return jsonError(c, error.message, 500)
  const active = (data ?? []).filter(row => !['inactive', 'withdrawn', 'archived', 'deleted'].includes(String(row.status ?? '').toLowerCase()))
  try { return c.json(await enrichStudentRows(active, schoolId)) }
  catch (err) { return jsonError(c, err instanceof Error ? err.message : 'Student details could not be loaded.', 500) }
})

libraryRoutes.get('/student-allocations', async (c) => {
  const access = await requireLibraryRole(c, ['admin', 'super_admin', 'librarian'])
  if (access.error) return access.error
  const { data: copies, error } = await db().from('library_teacher_accountability').select('*').eq('school_id', Number(access.membership?.school_id)).eq('current_holder_type', 'student').neq('status', 'lost').order('book_title').order('copy_number')
  if (error) return jsonError(c, error.message, 500)
  const ids = [...new Set((copies ?? []).map(row => Number(row.student_id)).filter(Number.isSafeInteger))]
  const studentResult = ids.length
    ? await db().from('students').select('id,admission_number,first_name,middle_name,last_name').in('id', ids)
    : { data: [], error: null }
  if (studentResult.error) return jsonError(c, studentResult.error.message, 500)
  let students: any[] = []
  try { students = await enrichStudentRows(studentResult.data ?? [], Number(access.membership?.school_id)) }
  catch (err) { return jsonError(c, err instanceof Error ? err.message : 'Student details could not be loaded.', 500) }
  const byId = new Map(students.map(row => [row.id, row]))
  return c.json({ items: (copies ?? []).filter(copy => byId.has(Number(copy.student_id))).map(copy => {
    const student = byId.get(Number(copy.student_id))
    return {
      copy_id: copy.copy_id, copy_number: copy.copy_number, book_title: copy.book_title,
      accountable_teacher_name: copy.accountable_teacher_name ?? 'Unknown teacher',
      student_name: student?.name ?? copy.student_name ?? 'Unknown student',
      student_admission_number: student?.admission_number ?? null,
      student_class: student?.current_class ?? null, student_issue_at: copy.student_issue_at ?? null,
    }
  }) })
})

// ── Books ─────────────────────────────────────────────────────────────────
// Grade → subject → title inventory. Totals count physical copy rows, regardless of custody status.
libraryRoutes.get('/books/grade-subject-summary', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const client = db()
  const [{ data: bookRows, error: bookError }, { data: copyRows, error: copyError }] = await Promise.all([
    client.from('library_books').select('id,title,author,grade,subject,total_copies').eq('school_id', schoolId).order('grade').order('subject').order('title'),
    client.from('library_book_copies').select('id,book_id,copy_number,status,current_holder_type').eq('school_id', schoolId),
  ])
  if (bookError) return jsonError(c, bookError.message, 500)
  if (copyError) return jsonError(c, copyError.message, 500)
  const copiesByBook = new Map<number, Array<{ id: string; book_id: number; copy_number: string; status: string; current_holder_type: string }>>()
  for (const copy of copyRows ?? []) {
    const group = copiesByBook.get(copy.book_id) ?? []
    group.push(copy)
    copiesByBook.set(copy.book_id, group)
  }
  const groups = new Map<string, { grade: string; subject: string; title_count: number; total_copies: number; titles: Array<Record<string, unknown>> }>()
  for (const book of bookRows ?? []) {
    const grade = book.grade || 'Unassigned'
    const subject = book.subject || 'Unassigned'
    const key = grade + String.fromCharCode(0) + subject
    const group: { grade: string; subject: string; title_count: number; total_copies: number; titles: Array<Record<string, unknown>> } = groups.get(key) ?? { grade, subject, title_count: 0, total_copies: 0, titles: [] }
    const copies = copiesByBook.get(book.id) ?? []
    group.title_count += 1
    group.total_copies += copies.length
    group.titles.push({ ...book, total_copies: copies.length, copies })
    groups.set(key, group)
  }
  return c.json([...groups.values()].sort((a, b) => a.grade.localeCompare(b.grade) || a.subject.localeCompare(b.subject)))
})

libraryRoutes.get('/books', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const { data } = await db().from('library_books').select('*').eq('school_id', schoolId).order('title')
  return c.json(data ?? [])
})

libraryRoutes.get('/books/stats', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const client = db()
  const [books, loans, copies] = await Promise.all([
    client.from('library_books').select('total_copies').eq('school_id', schoolId),
    client.from('library_loans').select('status').eq('school_id', schoolId),
    client.from('library_book_copies').select('status,current_holder_type').eq('school_id', schoolId),
  ])
  if (books.error || loans.error || copies.error) return jsonError(c, (books.error ?? loans.error ?? copies.error)?.message ?? 'Library statistics could not be loaded.', 500)
  const copyRows = copies.data ?? []
  return c.json({
    total_titles: books.data?.length ?? 0,
    total_copies: copyRows.length || (books.data ?? []).reduce((n, b) => n + (b.total_copies ?? 0), 0),
    available_copies: copyRows.filter((x) => x.status === 'available').length,
    with_teachers: copyRows.filter((x) => x.current_holder_type === 'teacher').length,
    with_students: copyRows.filter((x) => x.current_holder_type === 'student').length,
    lost_copies: copyRows.filter((x) => x.status === 'lost').length,
    excluded_copies: copyRows.filter((x) => x.status === 'excluded').length,
    unreconciled_copies: copyRows.filter((x) => x.status === 'unreconciled').length,
    active_loans: (loans.data ?? []).filter((l) => l.status === 'borrowed' || l.status === 'overdue' || l.status === 'on_loan').length,
  })
})

libraryRoutes.post('/books', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const title = String(body.title ?? '').trim()
  const grade = String(body.grade ?? '').trim()
  const subject = String(body.subject ?? '').trim()
  const count = Number(body.total_copies ?? 1)
  if (!title) return c.json({ detail: 'Book title is required.' }, 400)
  if (!grade || !subject) return c.json({ detail: 'Grade and subject are required for every catalogue title.' }, 400)
  if (!Number.isSafeInteger(count) || count < 1 || count > 5000) {
    return c.json({ detail: 'total_copies must be a whole number between 1 and 5,000.' }, 400)
  }
  const payload = { ...body, school_id: schoolId, title, grade, subject, total_copies: count, available_copies: count }
  const { data, error: insertError } = await db().from('library_books').insert(payload).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  const width = Math.max(2, String(count).length)
  const copies = Array.from({ length: count }, (_, i) => ({
    book_id: data.id,
    school_id: schoolId,
    copy_number: String(i + 1).padStart(width, '0') + '/' + String(count).padStart(width, '0'),
  }))
  const { error: copyError } = await db().from('library_book_copies').insert(copies)
  if (copyError) {
    await db().from('library_books').delete().eq('id', data.id)
    return jsonError(c, 'Book and copy register could not be created: ' + copyError.message, 500)
  }
  return c.json(data, 201)
})

libraryRoutes.get('/books/:bookId', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const client = db()
  const bookId = c.req.param('bookId')
  const [{ data }, { data: loans }, { data: copies }] = await Promise.all([
    client.from('library_books').select('*').eq('school_id', schoolId).eq('id', bookId).maybeSingle(),
    client.from('library_loans').select('*').eq('school_id', schoolId).eq('book_id', bookId).order('created_at', { ascending: false }),
    client.from('library_book_copies').select('*').eq('school_id', schoolId).eq('book_id', bookId).order('copy_number'),
  ])
  if (!data) return c.json({ detail: 'Book not found.' }, 404)
  return c.json({ ...data, loans: loans ?? [], copies: copies ?? [] })
})

libraryRoutes.patch('/books/:bookId', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('library_books').update({ ...body, school_id: schoolId }).eq('school_id', schoolId).eq('id', c.req.param('bookId')).select().maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

libraryRoutes.delete('/books/:bookId', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const bookId = c.req.param('bookId')
  const { data: copies, error: copyLookupError } = await db().from('library_book_copies')
    .select('id').eq('school_id', schoolId).eq('book_id', bookId).limit(1)
  if (copyLookupError) return jsonError(c, copyLookupError.message, 500)
  if (copies?.length) return c.json({ detail: 'This title has a physical-copy register. Keep it for custody history; archive support is required before deletion.' }, 409)
  const { error: deleteError } = await db().from('library_books').delete().eq('school_id', schoolId).eq('id', bookId)
  if (deleteError) return jsonError(c, deleteError.message, 400)
  return c.body(null, 204)
})

// ── Physical copy register and chain-of-custody ────────────────────────────
libraryRoutes.get('/copies', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  let query = db().from('library_book_copies').select('*, book:library_books(id,title,author,isbn)').eq('school_id', schoolId).order('copy_number')
  const bookId = c.req.query('book_id')
  const holderType = c.req.query('holder_type')
  const holderId = c.req.query('holder_id')
  const status = c.req.query('status')
  if (bookId) query = query.eq('book_id', bookId)
  if (holderType) query = query.eq('current_holder_type', holderType)
  if (holderId) query = query.eq('current_holder_id', holderId)
  if (status) query = query.eq('status', status)
  const { data, error: queryError } = await query
  if (queryError) return jsonError(c, queryError.message, 500)
  return c.json(data ?? [])
})

libraryRoutes.get('/copies/:copyId/movements', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const { data, error: queryError } = await db().from('library_copy_movements')
    .select('*').eq('school_id', Number(access.membership?.school_id)).eq('copy_id', c.req.param('copyId')).order('performed_at', { ascending: false })
  if (queryError) return jsonError(c, queryError.message, 500)
  return c.json(data ?? [])
})

libraryRoutes.post('/copies/:copyId/movements', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action ?? '')
  const condition = String(body.condition ?? 'good')
  if (!movementActions.has(action)) return c.json({ detail: 'Unsupported movement action.' }, 400)
  const roles = action === 'issue_to_student' || action === 'student_return_to_teacher'
    ? ['teacher', 'admin', 'super_admin']
    : action === 'issue_to_teacher' || action === 'teacher_return_to_library' || action === 'reconcile_copy' || action === 'exclude_before_issue' || action === 'restore_excluded_copy'
      ? ['librarian', 'admin', 'super_admin']
      : ['teacher', 'librarian', 'admin', 'super_admin']
  const access = await requireLibraryRole(c, roles)
  if (access.error) return access.error
  const schoolId = Number(access.membership?.school_id)
  const role = String(access.membership?.role ?? '').toLowerCase()
  // Every movement, including librarian/admin actions, must first prove that
  // the copy belongs to the selected school. Never rely on UUID secrecy.
  const { data: copy, error: copyError } = await db().from('library_book_copies')
    .select('current_holder_type,current_holder_id').eq('school_id', schoolId)
    .eq('id', c.req.param('copyId')).maybeSingle()
  if (copyError) return jsonError(c, copyError.message, 500)
  if (!copy) return c.json({ detail: 'Book copy not found in the selected school.' }, 404)
  if (role === 'teacher' && (action === 'issue_to_student' || action === 'student_return_to_teacher')) {
    const teacherId = Number(access.membership?.teacher_id)
    if (!Number.isSafeInteger(teacherId) || teacherId <= 0) return c.json({ detail: 'Your membership is not linked to a teacher record.' }, 403)
    const { data: owners, error: ownerError } = await db().from('tt_memberships')
      .select('user_id').eq('school_id', schoolId).eq('is_active', true).in('role', ['admin', 'super_admin'])
    if (ownerError) return jsonError(c, 'School teacher profiles could not be verified.', 503)
    const ownerIds = [...new Set((owners ?? []).map((item: any) => String(item.user_id)).filter(Boolean))]
    const { data: teacherProfile, error: teacherProfileError } = ownerIds.length
      ? await db().from('timetable_teacher_profiles').select('id,profile').eq('id', teacherId).in('owner_id', ownerIds).maybeSingle()
      : { data: null, error: null }
    if (teacherProfileError) return jsonError(c, 'Your saved timetable teacher identity could not be verified.', 503)
    if (!teacherProfile) return c.json({ detail: 'Your teacher membership is not linked to a saved teacher profile in this school.' }, 403)
    if (action === 'issue_to_student' && (copy.current_holder_type !== 'teacher' || Number(copy.current_holder_id) !== teacherId)) return c.json({ detail: 'Teachers may only issue copies held in their own custody.' }, 403)
    if (action === 'student_return_to_teacher' && Number(body.to_holder_id) !== teacherId) return c.json({ detail: 'A student must return the copy to the teacher who issued it.' }, 403)
  }
  if (!copyConditions.has(condition)) return c.json({ detail: 'Condition must be good, damaged, or lost.' }, 400)

  const toHolderId = body.to_holder_id == null || body.to_holder_id === '' ? null : Number(body.to_holder_id)
  if (toHolderId !== null && (!Number.isSafeInteger(toHolderId) || toHolderId <= 0)) {
    return c.json({ detail: 'to_holder_id must be a positive integer.' }, 400)
  }
  const toHolderName = body.to_holder_name == null ? null : String(body.to_holder_name).trim()
  if (action === 'issue_to_student') {
    const schoolId = Number(access.membership?.school_id)
    const { data: student, error: studentError } = await db().from('students')
      .select('id,admission_number,first_name,middle_name,last_name,status').eq('id', toHolderId).maybeSingle()
    if (studentError) return jsonError(c, studentError.message, 500)
    if (!student || ['inactive', 'withdrawn', 'archived', 'deleted'].includes(String(student.status ?? '').toLowerCase())) {
      return c.json({ detail: 'Select an active student from the Student module.' }, 422)
    }
    const { data: schoolStudent, error: schoolStudentError } = await db().from('students_v2')
      .select('id,status').eq('school_id', schoolId).eq('admission_number', student.admission_number).maybeSingle()
    if (schoolStudentError) return jsonError(c, schoolStudentError.message, 500)
    if (!schoolStudent || ['inactive', 'withdrawn', 'archived', 'deleted'].includes(String(schoolStudent.status ?? '').toLowerCase())) {
      return c.json({ detail: 'The selected student is not active in your current school.' }, 422)
    }
    const expectedName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')
    if (toHolderName !== expectedName) return c.json({ detail: 'Student name does not match the selected Student module record.' }, 422)
  }
  const reconcileHolderType = body.to_holder_type == null ? null : String(body.to_holder_type)
  if (action === 'issue_to_teacher' || (action === 'reconcile_copy' && reconcileHolderType === 'teacher')) {
    const { data: owners, error: ownerError } = await db().from('tt_memberships')
      .select('user_id').eq('school_id', schoolId).eq('is_active', true).in('role', ['admin', 'super_admin'])
    if (ownerError) return jsonError(c, 'School teacher profiles could not be verified.', 503)
    const ownerIds = [...new Set((owners ?? []).map((item: any) => String(item.user_id)).filter(Boolean))]
    const { data: teacherProfile, error: teacherProfileError } = ownerIds.length && toHolderId
      ? await db().from('timetable_teacher_profiles').select('id,profile').eq('id', toHolderId).in('owner_id', ownerIds).maybeSingle()
      : { data: null, error: null }
    if (teacherProfileError) return jsonError(c, 'Saved timetable teacher profile could not be verified.', 503)
    if (!teacherProfile) return c.json({ detail: 'Select a teacher from the saved timetable teacher directory for this school.' }, 422)
    const expectedTeacherName = timetableTeacherName(teacherProfile.profile ?? {})
    if (!expectedTeacherName || toHolderName !== expectedTeacherName) {
      return c.json({ detail: 'Teacher name does not match the selected saved timetable teacher profile.' }, 422)
    }
  }
  if (['issue_to_teacher', 'issue_to_student', 'student_return_to_teacher'].includes(action)
      && (!toHolderId || !toHolderName)) {
    return c.json({ detail: 'A valid receiving holder ID and name are required for this action.' }, 400)
  }
  if (action === 'reconcile_copy' && !['library', 'teacher'].includes(reconcileHolderType ?? '')) {
    return c.json({ detail: 'Physically verify the copy at the library or with its responsible teacher.' }, 400)
  }
  if (action === 'reconcile_copy' && reconcileHolderType !== 'library' && (!toHolderId || !toHolderName)) {
    return c.json({ detail: 'A verified teacher ID and name are required when the copy is with a teacher.' }, 400)
  }
  const dueDate = body.due_date == null || body.due_date === '' ? null : String(body.due_date)
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return c.json({ detail: 'due_date must use YYYY-MM-DD format.' }, 400)
  }

  if (action === 'exclude_before_issue' || action === 'restore_excluded_copy') {
    const reason = body.notes == null ? '' : String(body.notes).trim()
    if (!reason) return c.json({ detail: 'A reason is required for pre-issue exclusion or restoration.' }, 400)
    const { data, error: exclusionError } = await db().rpc('set_library_copy_preissue_exclusion', {
      p_copy_id: c.req.param('copyId'),
      p_action: action,
      p_reason: reason,
      p_performed_by: actorId(user),
    })
    if (exclusionError) {
      const status = exclusionError.code === 'P0002' ? 404
        : exclusionError.code === '23514' ? 409
        : exclusionError.code === '22023' ? 400 : 500
      return jsonError(c, exclusionError.message, status)
    }
    return c.json(data)
  }

  const { data, error: movementError } = await db().rpc('move_library_book_copy', {
    p_copy_id: c.req.param('copyId'),
    p_action: action,
    p_to_holder_id: toHolderId,
    p_to_holder_name: toHolderName,
    p_condition: condition,
    p_due_date: dueDate,
    p_notes: body.notes == null ? null : String(body.notes),
    p_performed_by: actorId(user),
    p_reconcile_holder_type: reconcileHolderType,
  })
  if (movementError) {
    const status = movementError.code === 'P0002' ? 404
      : movementError.code === '23514' ? 409
      : movementError.code === '22023' ? 400 : 500
    return jsonError(c, movementError.message, status)
  }
  return c.json(data)
})

// Teacher → grade → subject → title report. All Teachers aggregates accountable copies across teachers.
libraryRoutes.get('/teacher-inventory-summary', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const teacherId = c.req.query('teacher_id')
  let custodyQuery = db().from('library_teacher_accountability').select('*').eq('school_id', schoolId).order('accountable_teacher_name').order('copy_number')
  if (teacherId && teacherId !== 'all') custodyQuery = custodyQuery.eq('accountable_teacher_id', teacherId)
  const { data: custodyRows, error: custodyError } = await custodyQuery
  if (custodyError) return jsonError(c, custodyError.message, 500)
  type CustodyRow = {
    accountable_teacher_id: number | null
    accountable_teacher_name: string | null
    book_id: number
    copy_id: string
    copy_number: string
    status: string
    current_holder_type: string
    current_holder_name: string | null
  }
  type InventoryCopy = { copy_id: string; copy_number: string; status: string; current_holder_type: string; current_holder_name: string | null }
  type InventoryTitle = { book_id: number; title: string; total_copies: number; copies: InventoryCopy[] }
  type InventoryGroup = { grade: string; subject: string; total_copies: number; titles: Map<number, InventoryTitle> }
  type InventoryTeacher = { teacher_id: number | null; teacher_name: string; groups: Map<string, InventoryGroup> }
  const rows = (custodyRows ?? []) as CustodyRow[]
  const bookIds = [...new Set(rows.map((row: CustodyRow) => row.book_id))]
  const { data: bookRows, error: booksError } = bookIds.length ? await db().from('library_books').select('id,title,grade,subject').eq('school_id', schoolId).in('id', bookIds) : { data: [], error: null }
  if (booksError) return jsonError(c, booksError.message, 500)
  const books = new Map<number, { id: number; title: string; grade: string | null; subject: string | null }>((bookRows ?? []).map(book => [book.id, book]))
  const teachers = new Map<string, InventoryTeacher>()
  const addCopy = (key: string, id: number | null, name: string, row: CustodyRow): void => {
    const book = books.get(row.book_id)
    if (!book) return
    const teacher: InventoryTeacher = teachers.get(key) ?? { teacher_id: id, teacher_name: name, groups: new Map<string, InventoryGroup>() }
    const grade = book.grade || 'Unassigned', subject = book.subject || 'Unassigned'
    const groupKey = grade + String.fromCharCode(0) + subject
    const group: InventoryGroup = teacher.groups.get(groupKey) ?? { grade, subject, total_copies: 0, titles: new Map<number, InventoryTitle>() }
    const title: InventoryTitle = group.titles.get(row.book_id) ?? { book_id: row.book_id, title: book.title, total_copies: 0, copies: [] }
    title.total_copies++; group.total_copies++
    title.copies.push({ copy_id: row.copy_id, copy_number: row.copy_number, status: row.status, current_holder_type: row.current_holder_type, current_holder_name: row.current_holder_name })
    group.titles.set(row.book_id, title); teacher.groups.set(groupKey, group); teachers.set(key, teacher)
  }
  for (const row of rows) {
    if (row.accountable_teacher_id == null) continue
    addCopy(String(row.accountable_teacher_id), row.accountable_teacher_id, row.accountable_teacher_name ?? 'Teacher ' + row.accountable_teacher_id, row)
    if (!teacherId || teacherId === 'all') addCopy('all', null, 'All Teachers', row)
  }
  const serialize = (teacher: InventoryTeacher) => ({
    teacher_id: teacher.teacher_id, teacher_name: teacher.teacher_name,
    total_copies: [...teacher.groups.values()].reduce((sum, group) => sum + group.total_copies, 0),
    grades: [...new Set([...teacher.groups.values()].map(group => group.grade))].sort().map(grade => ({
      grade, total_copies: [...teacher.groups.values()].filter(group => group.grade === grade).reduce((sum, group) => sum + group.total_copies, 0),
      subjects: [...teacher.groups.values()].filter(group => group.grade === grade).sort((a,b) => a.subject.localeCompare(b.subject)).map(group => ({
        subject: group.subject, total_copies: group.total_copies,
        titles: [...group.titles.values()].sort((a,b) => a.title.localeCompare(b.title)).map(title => ({ ...title, copies: title.copies.sort((a,b) => a.copy_number.localeCompare(b.copy_number)) }))
      }))
    }))
  })
  const output = [...teachers.values()].sort((a,b) => a.teacher_name.localeCompare(b.teacher_name)).map(serialize)
  return c.json({ teachers: output.filter(teacher => teacher.teacher_id !== null), all_teachers: teacherId && teacherId !== 'all' ? null : output.find(teacher => teacher.teacher_id === null) ?? null })
})
// Teacher accountability includes student-held copies until the teacher physically
// returns each numbered copy and the library records acceptance.
libraryRoutes.get('/teacher-accountability', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const teacherId = c.req.query('teacher_id')
  let query = db().from('library_teacher_accountability').select('*').eq('school_id', schoolId)
    .order('accountable_teacher_name').order('book_title').order('copy_number')
  if (teacherId) query = query.eq('accountable_teacher_id', teacherId)
  const { data, error: queryError } = await query
  if (queryError) return jsonError(c, queryError.message, 500)
  const rows: any[] = data ?? []
  const teachers = new Map<string, {
    teacher_id: number; teacher_name: string; total_accountable: number;
    with_students: number; retained_by_teacher: number; lost: number; copies: typeof rows
  }>()
  for (const copy of rows) {
    if (copy.accountable_teacher_id == null) continue
    const key = String(copy.accountable_teacher_id)
    const group: { teacher_id: number; teacher_name: string; total_accountable: number; with_students: number; retained_by_teacher: number; lost: number; copies: typeof rows } = teachers.get(key) ?? {
      teacher_id: copy.accountable_teacher_id,
      teacher_name: copy.accountable_teacher_name ?? 'Teacher ' + key,
      total_accountable: 0, with_students: 0, retained_by_teacher: 0, lost: 0, copies: [],
    }
    group.total_accountable++
    if (copy.current_holder_type === 'student' && copy.status !== 'lost') group.with_students++
    else if (copy.current_holder_type === 'teacher' && copy.status !== 'lost') group.retained_by_teacher++
    if (copy.status === 'lost') group.lost++
    group.copies.push(copy)
    teachers.set(key, group)
  }
  return c.json({
    total_accountable: rows.length,
    with_students: rows.filter(x => x.current_holder_type === 'student' && x.status !== 'lost').length,
    retained_by_teachers: rows.filter(x => x.current_holder_type === 'teacher' && x.status !== 'lost').length,
    lost: rows.filter(x => x.status === 'lost').length,
    teachers: [...teachers.values()],
    copies: rows,
  })
})

// Exact, per-copy reconciliation; a copy stays assigned to its last recorded holder.
libraryRoutes.get('/reconciliation', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const client = db()
  const teacherId = c.req.query('teacher_id')
  let query = client.from('library_book_copies')
    .select('id,book_id,copy_number,status,current_holder_type,current_holder_id,current_holder_name,condition,due_date,book:library_books(id,title)')
    .eq('school_id', schoolId).neq('current_holder_type', 'library')
    .order('book_id').order('copy_number')
  if (teacherId) {
    query = query.eq('current_holder_type', 'teacher').eq('current_holder_id', teacherId)
  }
  const { data, error: queryError } = await query
  if (queryError) return jsonError(c, queryError.message, 500)
  const outstanding: any[] = data ?? []
  const grouped = new Map<string, { holder_type: string; holder_id: number | null; holder_name: string | null; copies: typeof outstanding }>()
  for (const copy of outstanding) {
    const key = copy.current_holder_type + ':' + String(copy.current_holder_id)
    const group: { holder_type: string; holder_id: number | null; holder_name: string | null; copies: typeof outstanding } = grouped.get(key) ?? {
      holder_type: copy.current_holder_type,
      holder_id: copy.current_holder_id,
      holder_name: copy.current_holder_name,
      copies: [],
    }
    group.copies.push(copy)
    grouped.set(key, group)
  }
  return c.json({
    outstanding_count: outstanding.length,
    with_teachers: outstanding.filter((x) => x.current_holder_type === 'teacher').length,
    with_students: outstanding.filter((x) => x.current_holder_type === 'student').length,
    unreconciled_count: outstanding.filter((x) => x.status === 'unreconciled').length,
    lost_count: outstanding.filter((x) => x.status === 'lost').length,
    outstanding_copies: outstanding,
    by_holder: [...grouped.values()],
  })
})

// ── Legacy aggregate loans (kept for compatibility with existing clients) ──
libraryRoutes.get('/loans', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const { data } = await db().from('library_loans').select('*').eq('school_id', schoolId).order('created_at', { ascending: false })
  return c.json(data ?? [])
})

libraryRoutes.post('/loans', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('library_loans').insert({ ...body, school_id: schoolId }).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

libraryRoutes.post('/loans/:loanId/return', async (c) => {
  const access = await requireLibrarySchool(c)
  if (access.error) return access.error
  const schoolId = access.schoolId
  const client = db()
  const loanId = c.req.param('loanId')
  const { data: loan } = await client.from('library_loans').select('*').eq('school_id', schoolId).eq('id', loanId).maybeSingle()
  if (!loan) return c.json({ detail: 'Loan not found.' }, 404)
  if (loan.status === 'returned') return c.json({ detail: 'Loan already returned.' }, 409)
  const { data, error: updateError } = await client.from('library_loans')
     .update({ status: 'returned', returned_date: new Date().toISOString().slice(0, 10) })
    .eq('school_id', schoolId).eq('id', loanId).select().single()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})
