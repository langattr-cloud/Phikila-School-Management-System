import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const academicsRoutes = new Hono()

// ── Academic years ────────────────────────────────────────────────────────
academicsRoutes.get('/years', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('academic_years').select('*').order('id', { ascending: false })
  return c.json(data ?? [])
})

academicsRoutes.get('/years/:yearId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('academic_years').select('*').eq('id', c.req.param('yearId')).maybeSingle()
  if (!data) return c.json({ detail: 'Academic year not found.' }, 404)
  return c.json(data)
})

academicsRoutes.patch('/years/:yearId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db().from('academic_years').update(body).eq('id', c.req.param('yearId')).select().maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  if (!data) return c.json({ detail: 'Academic year not found.' }, 404)
  return c.json(data)
})

academicsRoutes.post('/years', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('academic_years').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

// ── Terms ─────────────────────────────────────────────────────────────────
academicsRoutes.get('/terms', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('terms').select('*').order('id')
  return c.json(data ?? [])
})

academicsRoutes.get('/terms/:termId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('terms').select('*').eq('id', c.req.param('termId')).maybeSingle()
  if (!data) return c.json({ detail: 'Term not found.' }, 404)
  return c.json(data)
})

academicsRoutes.post('/terms', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('terms').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

// ── Levels ────────────────────────────────────────────────────────────────
academicsRoutes.get('/levels', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('levels').select('*').order('sort_order')
  return c.json(data ?? [])
})

academicsRoutes.get('/levels/:levelId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('levels').select('*').eq('id', c.req.param('levelId')).maybeSingle()
  if (!data) return c.json({ detail: 'Level not found.' }, 404)
  return c.json(data)
})

academicsRoutes.post('/levels', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('levels').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

// ── Grades ────────────────────────────────────────────────────────────────
academicsRoutes.get('/grades', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const levelId = c.req.query('level_id')
  let query = db().from('grades').select('*').eq('status', true).order('display_order').order('id')
  if (levelId) query = query.eq('level_id', levelId)
  const { data, error: queryError } = await query
  if (queryError) return jsonError(c, queryError.message, 400)
  return c.json(data ?? [])
})

academicsRoutes.post('/grades', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('grades').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

academicsRoutes.patch('/grades/:gradeId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db().from('grades').update(body).eq('id', c.req.param('gradeId')).select().maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  if (!data) return c.json({ detail: 'Grade not found.' }, 404)
  return c.json(data)
})


async function requireAcademicSchoolAccess(c: any) {
  const { error, user } = requireAuth(c as never)
  if (error || !user) return { error: error ?? c.json({ detail: 'Not authenticated.' }, 401), schoolId: null as number | null }
  const { data: memberships, error: membershipError } = await db().from('tt_memberships')
    .select('school_id,role').eq('user_id', user.id).eq('is_active', true)
  if (membershipError) return { error: c.json({ detail: 'Academic school access could not be verified.' }, 503), schoolId: null as number | null }
  const eligible = (memberships ?? []).filter((item: any) => ['admin', 'super_admin'].includes(String(item.role ?? '').toLowerCase()))
  const requestedSchool = c.req.header('X-School-Id')
  let membership: any = null
  if (requestedSchool) {
    const parsed = Number(requestedSchool)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return { error: c.json({ detail: 'Invalid X-School-Id header.' }, 400), schoolId: null as number | null }
    membership = eligible.find((item: any) => Number(item.school_id) === parsed) ?? null
  } else {
    const schoolIds = [...new Set(eligible.map((item: any) => Number(item.school_id)))]
    if (schoolIds.length > 1) return { error: c.json({ detail: 'X-School-Id is required for users with multiple school memberships.' }, 400), schoolId: null as number | null }
    membership = eligible[0] ?? null
  }
  if (!membership) return { error: c.json({ detail: 'Active school administrator membership required.' }, 403), schoolId: null as number | null }
  const schoolId = Number(membership.school_id)
  const { data: school, error: schoolError } = await db().from('tt_schools')
    .select('id,status').eq('id', schoolId).maybeSingle()
  if (schoolError || !school) return { error: c.json({ detail: 'Academic school access could not be verified.' }, 503), schoolId: null as number | null }
  if (school.status !== 'active') return { error: c.json({ detail: 'Academic access is disabled for this school.' }, 403), schoolId: null as number | null }
  return { error: null, schoolId }
}

async function validateStreamScope(client: ReturnType<typeof db>, schoolId: number, academicYearId: number, levelId: number, gradeId: number) {
  const [{ data: year }, { data: grade }] = await Promise.all([
    client.from('academic_years').select('id').eq('id', academicYearId).eq('school_id', schoolId).maybeSingle(),
    client.from('grades').select('id,level_id,status').eq('id', gradeId).eq('school_id', schoolId).eq('level_id', levelId).eq('status', true).maybeSingle(),
  ])
  return Boolean(year && grade)
}

// ── Streams ───────────────────────────────────────────────────────────────

academicsRoutes.get('/years/:yearId/grades/:gradeId/streams', async (c) => {
  const access = await requireAcademicSchoolAccess(c)
  if (access.error) return access.error
  const { data, error: queryError } = await db().from('streams').select('*')
    .eq('school_id', access.schoolId!)
    .eq('academic_year_id', c.req.param('yearId'))
    .eq('grade_id', c.req.param('gradeId'))
    .eq('status', 'ACTIVE')
    .order('id')
  if (queryError) return jsonError(c, queryError.message, 400)
  return c.json(data ?? [])
})

academicsRoutes.get('/levels/:levelId/streams', async (c) => {
  const access = await requireAcademicSchoolAccess(c)
  if (access.error) return access.error
  const { data, error: queryError } = await db().from('streams').select('*')
    .eq('school_id', access.schoolId!).eq('level_id', c.req.param('levelId')).order('id')
  if (queryError) return jsonError(c, queryError.message, 400)
  return c.json(data ?? [])
})

academicsRoutes.get('/streams/:streamId', async (c) => {
  const access = await requireAcademicSchoolAccess(c)
  if (access.error) return access.error
  const { data, error: queryError } = await db().from('streams').select('*')
    .eq('school_id', access.schoolId!).eq('id', c.req.param('streamId')).maybeSingle()
  if (queryError) return jsonError(c, queryError.message, 400)
  if (!data) return c.json({ detail: 'Stream not found.' }, 404)
  return c.json(data)
})

academicsRoutes.post('/streams', async (c) => {
  const access = await requireAcademicSchoolAccess(c)
  if (access.error) return access.error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  const academicYearId = Number(body.academic_year_id)
  const levelId = Number(body.level_id)
  const gradeId = Number(body.grade_id)
  const name = String(body.name ?? '').trim()
  if (!Number.isSafeInteger(academicYearId) || !Number.isSafeInteger(levelId) || !Number.isSafeInteger(gradeId) || !name) {
    return jsonError(c, 'Academic year, level, grade and stream name are required.', 422)
  }
  if (!await validateStreamScope(client, access.schoolId!, academicYearId, levelId, gradeId)) {
    return jsonError(c, 'Selected academic year or grade is not available for this school.', 422)
  }
  const payload = {
    school_id: access.schoolId!, academic_year_id: academicYearId, level_id: levelId, grade_id: gradeId,
    name, code: typeof body.code === 'string' ? body.code.trim() || null : null,
    class_teacher_id: Number.isSafeInteger(Number(body.class_teacher_id)) && body.class_teacher_id !== null ? Number(body.class_teacher_id) : null,
    status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  }
  const { data, error: insertError } = await client.from('streams').insert(payload).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

academicsRoutes.post('/streams/bulk', async (c) => {
  const access = await requireAcademicSchoolAccess(c)
  if (access.error) return access.error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  const items = Array.isArray(body.streams) ? body.streams : []
  if (!body.academic_year_id || !body.level_id || !body.grade_id || items.length === 0) return jsonError(c, 'Academic year, level, grade and at least one stream are required.', 422)
  const academicYearId = Number(body.academic_year_id)
  const levelId = Number(body.level_id)
  const gradeId = Number(body.grade_id)
  if (!Number.isSafeInteger(academicYearId) || !Number.isSafeInteger(levelId) || !Number.isSafeInteger(gradeId)) return jsonError(c, 'Academic year, level and grade are required.', 422)
  if (!await validateStreamScope(client, access.schoolId!, academicYearId, levelId, gradeId)) {
    return jsonError(c, 'Selected academic year or grade is not available for this school.', 422)
  }
  const rows = items.map((item: Record<string, unknown>) => ({
    school_id: access.schoolId!, academic_year_id: academicYearId, level_id: levelId,
    grade_id: gradeId, name: String(item.name ?? '').trim(),
    code: typeof item.code === 'string' ? item.code.trim() || null : null,
    status: item.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  }))
  if (rows.some((row: {name:string}) => !row.name)) return jsonError(c, 'Every stream must have a name.', 422)
  const { data, error: insertError } = await client.from('streams').insert(rows).select()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json({ streams: data ?? [], created_count: data?.length ?? 0 }, 201)
})

academicsRoutes.patch('/streams/:streamId', async (c) => {
  const access = await requireAcademicSchoolAccess(c)
  if (access.error) return access.error
  const body = await c.req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (typeof body.code === 'string' || body.code === null) updates.code = typeof body.code === 'string' ? body.code.trim() || null : null
  if (body.status === 'ACTIVE' || body.status === 'INACTIVE') updates.status = body.status
  if (body.class_teacher_id === null || Number.isSafeInteger(Number(body.class_teacher_id))) updates.class_teacher_id = body.class_teacher_id === null ? null : Number(body.class_teacher_id)
  if (!Object.keys(updates).length) return jsonError(c, 'At least one valid stream field is required.', 422)
  const { data, error: updateError } = await db().from('streams').update(updates)
    .eq('school_id', access.schoolId!).eq('id', c.req.param('streamId')).select().maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  if (!data) return c.json({ detail: 'Stream not found.' }, 404)
  return c.json(data)
})

academicsRoutes.delete('/streams/:streamId', async (c) => {
  const access = await requireAcademicSchoolAccess(c)
  if (access.error) return access.error
  const { data, error: deleteError } = await db().from('streams').delete()
    .eq('school_id', access.schoolId!).eq('id', c.req.param('streamId')).select('id').maybeSingle()
  if (deleteError) return jsonError(c, deleteError.message, 400)
  if (!data) return c.json({ detail: 'Stream not found.' }, 404)
  return c.body(null, 204)
})

academicsRoutes.get('/streams/:streamId/students', async (c) => {
  const access = await requireAcademicSchoolAccess(c)
  if (access.error) return access.error
  const client = db()
  const { data: stream } = await client.from('streams').select('id')
    .eq('school_id', access.schoolId!).eq('id', c.req.param('streamId')).maybeSingle()
  if (!stream) return c.json({ detail: 'Stream not found.' }, 404)
  const { data: enrollments, error: enrollmentError } = await client.from('student_enrollments')
    .select('student_id,stream_id,level_id,class_id')
    .eq('school_id', access.schoolId!).eq('stream_id', stream.id).eq('status', 'enrolled')
  if (enrollmentError) return jsonError(c, enrollmentError.message, 400)
  const ids = (enrollments ?? []).map((enrollment: {student_id:number}) => enrollment.student_id)
  if (!ids.length) return c.json([])
  const { data: rows, error: studentError } = await client.from('students_v2')
    .select('id,admission_number,first_name,middle_name,last_name,status')
    .eq('school_id', access.schoolId!).in('id', ids).order('id')
  if (studentError) return jsonError(c, studentError.message, 400)
  return c.json((rows ?? []).map((student: Record<string, unknown>) => {
    const enrollment = (enrollments ?? []).find((item: {student_id:number}) => item.student_id === student.id)
    return { ...student, stream_id: enrollment?.stream_id ?? null, level_id: enrollment?.level_id ?? null, current_class_id: enrollment?.class_id ?? null }
  }))
})

academicsRoutes.post('/streams/:streamId/students', async (c) => {
  const access = await requireAcademicSchoolAccess(c)
  if (access.error) return access.error
  const body = await c.req.json().catch(() => ({}))
  const studentId = Number(body.student_id)
  if (!Number.isSafeInteger(studentId) || studentId <= 0) return jsonError(c, 'Student is required.', 422)
  const client = db()
  const { data: stream } = await client.from('streams').select('id,academic_year_id,level_id,grade_id,status')
    .eq('school_id', access.schoolId!).eq('id', c.req.param('streamId')).maybeSingle()
  if (!stream || stream.status !== 'ACTIVE') return jsonError(c, 'Stream is not active.', 422)
  const { data: enrollment } = await client.from('student_enrollments').select('id')
    .eq('school_id', access.schoolId!).eq('student_id', studentId).eq('academic_year_id', stream.academic_year_id).maybeSingle()
  if (!enrollment) return jsonError(c, 'Student is not enrolled in this academic year at this school.', 422)
  const { error: updateError } = await client.from('student_enrollments').update({ stream_id: stream.id, level_id: stream.level_id, grade_id: stream.grade_id })
    .eq('school_id', access.schoolId!).eq('id', enrollment.id)
  if (updateError) return jsonError(c, updateError.message, 400)
  const { data: rows } = await client.from('student_enrollments').select('student_id,stream_id,level_id,class_id')
    .eq('school_id', access.schoolId!).eq('stream_id', stream.id).eq('status', 'enrolled')
  const ids = (rows ?? []).map((item: {student_id:number}) => item.student_id)
  if (!ids.length) return c.json([])
  const { data: students } = await client.from('students_v2').select('id,admission_number,first_name,middle_name,last_name,status')
    .eq('school_id', access.schoolId!).in('id', ids).order('id')
  return c.json((students ?? []).map((student: Record<string, unknown>) => ({ ...student, ...(rows ?? []).find((item: {student_id:number}) => item.student_id === student.id) })))
})
