import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const healthRoutes = new Hono()

// ── Health records ────────────────────────────────────────────────────────
healthRoutes.get('/records', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('health_records').select('*').order('recorded_at', { ascending: false })
  return c.json(data ?? [])
})

healthRoutes.post('/records', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('health_records').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

healthRoutes.get('/records/:recordId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('health_records').select('*').eq('id', c.req.param('recordId')).maybeSingle()
  if (!data) return c.json({ detail: 'Record not found.' }, 404)
  return c.json(data)
})

healthRoutes.patch('/records/:recordId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('health_records')
    .update(body)
    .eq('id', c.req.param('recordId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

healthRoutes.get('/students/:studentId/records', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db()
    .from('health_records')
    .select('*')
    .eq('student_id', c.req.param('studentId'))
    .order('recorded_at', { ascending: false })
  return c.json(data ?? [])
})

// ── Welfare cases ─────────────────────────────────────────────────────────
healthRoutes.get('/welfare', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('welfare_cases').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

healthRoutes.get('/welfare/stats', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('welfare_cases').select('status')
  const counts: Record<string, number> = {}
  for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1
  return c.json({ counts, total: data?.length ?? 0 })
})

healthRoutes.post('/welfare', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('welfare_cases').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

healthRoutes.patch('/welfare/:caseId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('welfare_cases')
    .update(body)
    .eq('id', c.req.param('caseId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})