import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const teachersRoutes = new Hono()
const shape = (t:any) => ({ ...t, name: t.name || [t.first_name,t.last_name].filter(Boolean).join(' '), code: t.code || t.staff_number })

teachersRoutes.get('/', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const { data, error: queryError } = await db().from('teachers').select('*').order('id')
  if (queryError) return jsonError(c, queryError.message, 400)
  return c.json((data ?? []).map(shape))
})

teachersRoutes.post('/', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const payload = { ...body, staff_number: body.staff_number || body.code || null, role: body.role || 'Teacher', role_assignment: body.role_assignment || {} }
  const { data, error: insertError } = await db().from('teachers').insert(payload).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(shape(data), 201)
})

teachersRoutes.get('/:teacherId', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const client = db(); const teacherId = c.req.param('teacherId')
  const { data } = await client.from('teachers').select('*').eq('id', teacherId).maybeSingle()
  if (!data) return c.json({ detail: 'Teacher not found.' }, 404)
  const [qualifications, availabilities] = await Promise.all([client.from('qualifications').select('*').eq('teacher_id', teacherId),client.from('availabilities').select('*').eq('teacher_id', teacherId)])
  return c.json({ ...shape(data), qualifications: qualifications.data ?? [], availabilities: availabilities.data ?? [] })
})

teachersRoutes.patch('/:teacherId', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db().from('teachers').update(body).eq('id', c.req.param('teacherId')).select().maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  if (!data) return c.json({ detail: 'Teacher not found.' }, 404)
  return c.json(shape(data))
})

teachersRoutes.delete('/:teacherId', async (c) => {
  const { error } = requireAuth(c as never); if (error) return error
  const { error: deleteError } = await db().from('teachers').delete().eq('id', c.req.param('teacherId'))
  if (deleteError) return jsonError(c, deleteError.message, 400)
  return c.body(null, 204)
})
