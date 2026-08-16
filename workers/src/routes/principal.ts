import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const principalRoutes = new Hono()

// ── Announcements ─────────────────────────────────────────────────────────
principalRoutes.get('/announcements', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('announcements').select('*').order('published_at', { ascending: false })
  return c.json(data ?? [])
})

principalRoutes.post('/announcements', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('announcements').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

principalRoutes.patch('/announcements/:announcementId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('announcements')
    .update(body)
    .eq('id', c.req.param('announcementId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

principalRoutes.delete('/announcements/:announcementId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('announcements').delete().eq('id', c.req.param('announcementId'))
  return c.body(null, 204)
})

// ── Principal insights ────────────────────────────────────────────────────
principalRoutes.get('/insights', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('principal_insights').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

principalRoutes.post('/insights', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('principal_insights').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

principalRoutes.patch('/insights/:insightId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('principal_insights')
    .update(body)
    .eq('id', c.req.param('insightId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})