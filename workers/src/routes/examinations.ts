import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const examinationsRoutes = new Hono()

examinationsRoutes.get('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('examinations').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

examinationsRoutes.post('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('examinations').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

examinationsRoutes.get('/:examId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const examId = c.req.param('examId')
  const { data } = await client.from('examinations').select('*').eq('id', examId).maybeSingle()
  if (!data) return c.json({ detail: 'Examination not found.' }, 404)
  const { data: subjects } = await client.from('exam_subjects').select('*').eq('exam_id', examId)
  const { data: entries } = await client.from('exam_entries').select('*').eq('exam_id', examId)
  return c.json({ ...data, subjects: subjects ?? [], entries: entries ?? [] })
})

examinationsRoutes.patch('/:examId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('examinations')
    .update(body)
    .eq('id', c.req.param('examId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

examinationsRoutes.delete('/:examId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('examinations').delete().eq('id', c.req.param('examId'))
  return c.body(null, 204)
})