import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const studentsRoutes = new Hono()

studentsRoutes.get('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('students').select('*').order('id')
  return c.json(data ?? [])
})

studentsRoutes.post('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()

  // Auto-generate an admission number if none provided.
  let admissionNumber = body.admission_number
  if (!admissionNumber) {
    const { count } = await client.from('students').select('id', { count: 'exact' })
    const next = (count ?? 0) + 1
    admissionNumber = `ADM-${String(next).padStart(4, '0')}`
  }

  const { data, error: insertError } = await client
    .from('students')
    .insert({ ...body, admission_number: admissionNumber })
    .select()
    .single()
  if (insertError) return jsonError(c, insertError.message, 400)

  // Insert guardians (children of the student).
  const guardians = Array.isArray(body.guardians) ? body.guardians : []
  if (guardians.length > 0) {
    const rows = guardians.map((g: Record<string, unknown>) => ({ student_id: data.id, ...g }))
    const { error: guardianError } = await client.from('guardians').insert(rows)
    if (guardianError) return jsonError(c, guardianError.message, 400)
  }
  return c.json({ ...data, guardians }, 201)
})

studentsRoutes.get('/:studentId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const studentId = c.req.param('studentId')
  const { data } = await client.from('students').select('*').eq('id', studentId).maybeSingle()
  if (!data) return c.json({ detail: 'Student not found.' }, 404)
  const { data: guardians } = await client.from('guardians').select('*').eq('student_id', studentId)
  return c.json({ ...data, guardians: guardians ?? [] })
})

studentsRoutes.patch('/:studentId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('students')
    .update(body)
    .eq('id', c.req.param('studentId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

studentsRoutes.delete('/:studentId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('students').delete().eq('id', c.req.param('studentId'))
  return c.body(null, 204)
})