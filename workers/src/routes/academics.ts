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

// ── Streams ───────────────────────────────────────────────────────────────
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
  const { data, error: insertError } = await db().from('streams').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})