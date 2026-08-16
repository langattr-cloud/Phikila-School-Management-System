import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const schedulingRoutes = new Hono()

schedulingRoutes.get('/timetable', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('timetables').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

schedulingRoutes.post('/timetable', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('timetables').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

schedulingRoutes.get('/timetable/:timetableId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const timetableId = c.req.param('timetableId')
  const { data } = await client.from('timetables').select('*').eq('id', timetableId).maybeSingle()
  if (!data) return c.json({ detail: 'Timetable not found.' }, 404)
  const { data: entries } = await client.from('timetable_entries').select('*').eq('timetable_id', timetableId)
  return c.json({ ...data, entries: entries ?? [] })
})

schedulingRoutes.get('/entries', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('timetable_entries').select('*').order('day_of_week').order('period')
  return c.json(data ?? [])
})

schedulingRoutes.post('/entries', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('timetable_entries').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

schedulingRoutes.patch('/entries/:entryId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('timetable_entries')
    .update(body)
    .eq('id', c.req.param('entryId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

schedulingRoutes.delete('/entries/:entryId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('timetable_entries').delete().eq('id', c.req.param('entryId'))
  return c.body(null, 204)
})

// ── Generic CRUD for tt_* scheduling resources ────────────────────────────
for (const resource of ['teachers', 'classes', 'subjects', 'rooms', 'periods', 'days']) {
  const table = `tt_${resource}`
  schedulingRoutes.get(`/${resource}`, async (c) => {
    const { error } = requireAuth(c as never)
    if (error) return error
    const { data } = await db().from(table).select('*').order('id')
    return c.json(data ?? [])
  })
  schedulingRoutes.post(`/${resource}`, async (c) => {
    const { error } = requireAuth(c as never)
    if (error) return error
    const body = await c.req.json().catch(() => ({}))
    const { data, error: insertError } = await db().from(table).insert(body).select().single()
    if (insertError) return jsonError(c, insertError.message, 400)
    return c.json(data, 201)
  })
  schedulingRoutes.patch(`/${resource}/:id`, async (c) => {
    const { error } = requireAuth(c as never)
    if (error) return error
    const body = await c.req.json().catch(() => ({}))
    const { data, error: updateError } = await db()
      .from(table)
      .update(body)
      .eq('id', c.req.param('id'))
      .select()
      .maybeSingle()
    if (updateError) return jsonError(c, updateError.message, 400)
    return c.json(data)
  })
  schedulingRoutes.delete(`/${resource}/:id`, async (c) => {
    const { error } = requireAuth(c as never)
    if (error) return error
    await db().from(table).delete().eq('id', c.req.param('id'))
    return c.body(null, 204)
  })
}

schedulingRoutes.get('/versions', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('tt_versions').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

schedulingRoutes.post('/solve', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('tt_solver_jobs').insert({ status: 'queued', ...body }).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 202)
})