import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const attendanceRoutes = new Hono()

attendanceRoutes.get('/classes', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('attendance_sessions').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

attendanceRoutes.get('/sessions', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('attendance_sessions').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

attendanceRoutes.post('/sessions', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('attendance_sessions').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

attendanceRoutes.get('/sessions/:sessionId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const sessionId = c.req.param('sessionId')
  const { data: session } = await client
    .from('attendance_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return c.json({ detail: 'Session not found.' }, 404)
  const { data: records } = await client.from('attendance_records').select('*').eq('session_id', sessionId)
  return c.json({ ...session, records: records ?? [] })
})

attendanceRoutes.patch('/sessions/:sessionId/records', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const records = Array.isArray(body.records) ? body.records : []
  const client = db()
  const sessionId = c.req.param('sessionId')
  for (const record of records) {
    if (record.id) {
      await client.from('attendance_records').update(record).eq('id', record.id)
    } else {
      await client.from('attendance_records').insert({ ...record, session_id: sessionId })
    }
  }
  return c.json({ ok: true })
})

attendanceRoutes.get('/students/:studentId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db()
    .from('attendance_records')
    .select('*')
    .eq('student_id', c.req.param('studentId'))
    .order('created_at', { ascending: false })
  return c.json(data ?? [])
})