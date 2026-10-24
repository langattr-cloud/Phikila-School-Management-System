import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const teachersRoutes = new Hono()

const shape = (teacher: Record<string, any>, settings: Record<string, any> = {}) => ({
  ...teacher,
  name: teacher.name || [teacher.first_name, teacher.last_name].filter(Boolean).join(' '),
  code: teacher.code || teacher.staff_number || '',
  subject: teacher.subject || teacher.subject_specialization || teacher.department || '',
  unavailable: Array.isArray(settings.unavailable) ? settings.unavailable : [],
  color: typeof settings.color === 'string' ? settings.color : '#176b4d',
  count: Number.isFinite(settings.count) ? settings.count : 0,
})

function teacherPayload(body: Record<string, any>) {
  const name = String(body.name ?? [body.first_name, body.last_name].filter(Boolean).join(' ')).trim()
  const parts = name.split(/\s+/).filter(Boolean)
  return {
    first_name: String(body.first_name ?? parts.shift() ?? '').trim(),
    last_name: String(body.last_name ?? parts.join(' ')).trim(),
    name: name || null,
    staff_number: String(body.staff_number ?? body.code ?? '').trim() || null,
    email: String(body.email ?? '').trim() || null,
    subject_specialization: String(body.subject_specialization ?? body.subject ?? '').trim() || null,
    department: String(body.department ?? '').trim() || null,
    employment_status: body.employment_status ?? 'Permanent',
    updated_at: new Date().toISOString(),
  }
}

teachersRoutes.get('/', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const client = db()
  const [{ data, error: queryError }, { data: settings, error: settingsError }] = await Promise.all([
    client.from('teachers').select('*').order('id'),
    client.from('teacher_management_settings').select('teacher_id,settings'),
  ])
  if (queryError) return jsonError(c, queryError.message, 400)
  if (settingsError) return jsonError(c, settingsError.message, 400)
  const settingsById = new Map((settings ?? []).map((row: any) => [String(row.teacher_id), row.settings ?? {}]))
  return c.json((data ?? []).map((teacher: any) => shape(teacher, settingsById.get(String(teacher.id)) ?? {})))
})

teachersRoutes.post('/', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const payload = teacherPayload(body)
  if (!payload.first_name || !payload.last_name || !payload.staff_number) {
    return jsonError(c, 'Teacher name and short code are required.', 422)
  }
  const { data, error: insertError } = await db().from('teachers').insert(payload).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  const settings = { unavailable: Array.isArray(body.unavailable) ? body.unavailable : [], color: body.color ?? '#176b4d', count: Number(body.count) || 0 }
  const { error: settingsError } = await db().from('teacher_management_settings').upsert({ teacher_id: data.id, settings })
  if (settingsError) return jsonError(c, settingsError.message, 400)
  return c.json(shape(data, settings), 201)
})

teachersRoutes.get('/:teacherId/management-settings', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const { data, error: queryError } = await db().from('teacher_management_settings').select('settings').eq('teacher_id', c.req.param('teacherId')).maybeSingle()
  if (queryError) return jsonError(c, queryError.message, 400)
  return c.json(data?.settings ?? { unavailable: [], color: '#176b4d', count: 0 })
})

teachersRoutes.put('/:teacherId/management-settings', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const teacherId = c.req.param('teacherId')
  const body = await c.req.json().catch(() => ({}))
  const unavailable = Array.isArray(body.unavailable) ? body.unavailable.filter((slot: unknown) => typeof slot === 'string' && /^(Mon|Tue|Wed|Thu|Fri)-P[1-8]$/.test(slot)) : []
  const settings = { unavailable: [...new Set(unavailable)], color: typeof body.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : '#176b4d', count: Number.isInteger(body.count) && body.count >= 0 ? body.count : 0 }
  const { data: teacher, error: teacherError } = await db().from('teachers').select('id').eq('id', teacherId).maybeSingle()
  if (teacherError) return jsonError(c, teacherError.message, 400)
  if (!teacher) return c.json({ detail: 'Teacher not found.' }, 404)
  const { error: saveError } = await db().from('teacher_management_settings').upsert({ teacher_id: teacherId, settings })
  if (saveError) return jsonError(c, saveError.message, 400)
  return c.json(settings)
})

teachersRoutes.get('/:teacherId', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const client = db(); const teacherId = c.req.param('teacherId')
  const [{ data }, { data: settings }] = await Promise.all([
    client.from('teachers').select('*').eq('id', teacherId).maybeSingle(),
    client.from('teacher_management_settings').select('settings').eq('teacher_id', teacherId).maybeSingle(),
  ])
  if (!data) return c.json({ detail: 'Teacher not found.' }, 404)
  const [qualifications, availabilities] = await Promise.all([client.from('qualifications').select('*').eq('teacher_id', teacherId),client.from('availabilities').select('*').eq('teacher_id', teacherId)])
  return c.json({ ...shape(data, settings?.settings ?? {}), qualifications: qualifications.data ?? [], availabilities: availabilities.data ?? [] })
})

teachersRoutes.patch('/:teacherId', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const payload = teacherPayload(body)
  if (!payload.first_name || !payload.last_name || !payload.staff_number) {
    return jsonError(c, 'Teacher name and short code are required.', 422)
  }
  const { data, error: updateError } = await db().from('teachers').update(payload).eq('id', c.req.param('teacherId')).select().maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  if (!data) return c.json({ detail: 'Teacher not found.' }, 404)
  if (Array.isArray(body.unavailable) || body.color || Number.isInteger(body.count)) {
    const settings = { unavailable: Array.isArray(body.unavailable) ? body.unavailable : [], color: body.color ?? '#176b4d', count: Number(body.count) || 0 }
    const { error: settingsError } = await db().from('teacher_management_settings').upsert({ teacher_id: data.id, settings })
    if (settingsError) return jsonError(c, settingsError.message, 400)
    return c.json(shape(data, settings))
  }
  return c.json(shape(data))
})

teachersRoutes.delete('/:teacherId', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const { error: deleteError } = await db().from('teachers').delete().eq('id', c.req.param('teacherId'))
  if (deleteError) return jsonError(c, deleteError.message, 400)
  return c.body(null, 204)
})
