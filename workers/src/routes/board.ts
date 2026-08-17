import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const boardRoutes = new Hono()

// ── Members ───────────────────────────────────────────────────────────────
boardRoutes.get('/members', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('board_members').select('*').order('joined_at')
  return c.json(data ?? [])
})

boardRoutes.post('/members', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('board_members').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

boardRoutes.patch('/members/:memberId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('board_members')
    .update(body)
    .eq('id', c.req.param('memberId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

boardRoutes.delete('/members/:memberId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('board_members').delete().eq('id', c.req.param('memberId'))
  return c.body(null, 204)
})

// ── Meetings ──────────────────────────────────────────────────────────────
boardRoutes.get('/meetings', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('board_meetings').select('*').order('scheduled_at', { ascending: false })
  return c.json(data ?? [])
})

boardRoutes.post('/meetings', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('board_meetings').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

boardRoutes.get('/meetings/:meetingId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const meetingId = c.req.param('meetingId')
  const { data } = await client.from('board_meetings').select('*').eq('id', meetingId).maybeSingle()
  if (!data) return c.json({ detail: 'Meeting not found.' }, 404)
  const { data: resolutions } = await client.from('board_resolutions').select('*').eq('meeting_id', meetingId)
  return c.json({ ...data, resolutions: resolutions ?? [] })
})

boardRoutes.patch('/meetings/:meetingId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('board_meetings')
    .update(body)
    .eq('id', c.req.param('meetingId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

// ── Resolutions ───────────────────────────────────────────────────────────
boardRoutes.get('/resolutions', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('board_resolutions').select('*').order('passed_at', { ascending: false })
  return c.json(data ?? [])
})

boardRoutes.post('/resolutions', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('board_resolutions').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

boardRoutes.patch('/resolutions/:resolutionId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('board_resolutions')
    .update(body)
    .eq('id', c.req.param('resolutionId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})