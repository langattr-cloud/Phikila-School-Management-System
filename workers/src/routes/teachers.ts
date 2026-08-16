import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const teachersRoutes = new Hono()

teachersRoutes.get('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const { data } = await client.from('teachers').select('*').order('id')
  const teachers = data ?? []
  return c.json(teachers)
})

teachersRoutes.post('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('teachers').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

teachersRoutes.get('/:teacherId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const teacherId = c.req.param('teacherId')
  const { data } = await client.from('teachers').select('*').eq('id', teacherId).maybeSingle()
  if (!data) return c.json({ detail: 'Teacher not found.' }, 404)
  const [qualifications, availabilities] = await Promise.all([
    client.from('qualifications').select('*').eq('teacher_id', teacherId),
    client.from('availabilities').select('*').eq('teacher_id', teacherId),
  ])
  return c.json({
    ...data,
    qualifications: qualifications.data ?? [],
    availabilities: availabilities.data ?? [],
  })
})

teachersRoutes.patch('/:teacherId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('teachers')
    .update(body)
    .eq('id', c.req.param('teacherId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})