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

// ── Streams ───────────────────────────────────────────────────────────────

academicsRoutes.get('/years/:yearId/grades/:gradeId/streams', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data, error: queryError } = await db().from('streams').select('*')
    .eq('academic_year_id', c.req.param('yearId'))
    .eq('grade_id', c.req.param('gradeId'))
    .eq('status', 'ACTIVE')
    .order('id')
  if (queryError) return jsonError(c, queryError.message, 400)
  return c.json(data ?? [])
})

academicsRoutes.get('/levels/:levelId/streams', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('streams').select('*').eq('level_id', c.req.param('levelId')).order('id')
  return c.json(data ?? [])
})

academicsRoutes.get('/streams/:streamId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('streams').select('*').eq('id', c.req.param('streamId')).maybeSingle()
  if (!data) return c.json({ detail: 'Stream not found.' }, 404)
  return c.json(data)
})

academicsRoutes.post('/streams', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  const { data: school } = await client.from('school_info').select('id').order('id').limit(1).maybeSingle()
  if (!school) return jsonError(c, 'School configuration is not available.', 422)
  const payload = { ...body, school_id: school.id, status: body.status || 'ACTIVE' }
  const { data, error: insertError } = await client.from('streams').insert(payload).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

academicsRoutes.post('/streams/bulk', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  const { data: school } = await client.from('school_info').select('id').order('id').limit(1).maybeSingle()
  if (!school) return jsonError(c, 'School configuration is not available.', 422)
  const items = Array.isArray(body.streams) ? body.streams : []
  if (!body.academic_year_id || !body.level_id || !body.grade_id || items.length === 0) return jsonError(c, 'Academic year, level, grade and at least one stream are required.', 422)
  const rows = items.map((item: Record<string, unknown>) => ({
    school_id: school.id, academic_year_id: Number(body.academic_year_id), level_id: Number(body.level_id),
    grade_id: Number(body.grade_id), name: String(item.name ?? '').trim(), code: item.code || null, status: item.status || 'ACTIVE'
  }))
  if (rows.some((r: {name:string}) => !r.name)) return jsonError(c, 'Every stream must have a name.', 422)
  const { data, error: insertError } = await client.from('streams').insert(rows).select()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json({ streams: data ?? [], created_count: data?.length ?? 0 }, 201)
})

academicsRoutes.patch('/streams/:streamId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db().from('streams').update(body).eq('id', c.req.param('streamId')).select().maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  if (!data) return c.json({ detail: 'Stream not found.' }, 404)
  return c.json(data)
})

academicsRoutes.delete('/streams/:streamId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { error: deleteError } = await db().from('streams').delete().eq('id', c.req.param('streamId'))
  if (deleteError) return jsonError(c, deleteError.message, 400)
  return c.body(null, 204)
})

academicsRoutes.get('/streams/:streamId/students', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data: enrollments, error: enrollmentError } = await db().from('student_enrollments')
    .select('student_id,stream_id,level_id,class_id')
    .eq('stream_id', c.req.param('streamId')).eq('status', 'enrolled')
  if (enrollmentError) return jsonError(c, enrollmentError.message, 400)
  const ids = (enrollments ?? []).map((e: {student_id:number}) => e.student_id)
  if (!ids.length) return c.json([])
  const { data: rows, error: studentError } = await db().from('students_v2')
    .select('id,admission_number,first_name,middle_name,last_name,status').in('id', ids).order('id')
  if (studentError) return jsonError(c, studentError.message, 400)
  return c.json((rows ?? []).map((s: Record<string, unknown>) => {
    const e = (enrollments ?? []).find((x: {student_id:number}) => x.student_id === s.id)
    return { ...s, stream_id: e?.stream_id ?? null, level_id: e?.level_id ?? null, current_class_id: e?.class_id ?? null }
  }))
})

academicsRoutes.post('/streams/:streamId/students', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const studentId = Number(body.student_id)
  if (!Number.isInteger(studentId)) return jsonError(c, 'Student is required.', 422)
  const { data: stream } = await db().from('streams').select('id,academic_year_id,level_id,grade_id,status').eq('id', c.req.param('streamId')).maybeSingle()
  if (!stream || stream.status !== 'ACTIVE') return jsonError(c, 'Stream is not active.', 422)
  const { data: enrollment } = await db().from('student_enrollments').select('id').eq('student_id', studentId).eq('academic_year_id', stream.academic_year_id).maybeSingle()
  if (!enrollment) return jsonError(c, 'Student is not enrolled in this academic year.', 422)
  const { error: updateError } = await db().from('student_enrollments').update({ stream_id: stream.id, level_id: stream.level_id, grade_id: stream.grade_id }).eq('id', enrollment.id)
  if (updateError) return jsonError(c, updateError.message, 400)
  const { data: rows } = await db().from('student_enrollments').select('student_id,stream_id,level_id,class_id').eq('stream_id', stream.id).eq('status', 'enrolled')
  const ids = (rows ?? []).map((e: {student_id:number}) => e.student_id)
  if (!ids.length) return c.json([])
  const { data: students } = await db().from('students_v2').select('id,admission_number,first_name,middle_name,last_name,status').in('id', ids).order('id')
  return c.json((students ?? []).map((s: Record<string, unknown>) => ({ ...s, ...(rows ?? []).find((e: {student_id:number}) => e.student_id === s.id) })))
})