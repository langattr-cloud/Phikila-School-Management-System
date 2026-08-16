import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const schoolRoutes = new Hono()

schoolRoutes.get('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const { data } = await client.from('school_info').select('*').order('id').limit(1).maybeSingle()
  if (!data) return c.json(null)
  const [settings, branding, contact] = await Promise.all([
    client.from('school_settings').select('*'),
    client.from('school_branding').select('*').eq('school_id', data.id).maybeSingle(),
    client.from('school_contact').select('*').eq('school_id', data.id).maybeSingle(),
  ])
  const settingsMap = Object.fromEntries(
    (settings.data ?? []).map((s) => [s.key, s.value]),
  )
  return c.json({
    ...data,
    settings: settingsMap,
    branding: branding.data ?? null,
    contact: contact.data ?? null,
  })
})

schoolRoutes.post('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db()
    .from('school_info')
    .insert(body)
    .select()
    .single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

schoolRoutes.patch('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('school_info')
    .update(body)
    .order('id')
    .limit(1)
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

schoolRoutes.patch('/settings', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  for (const [key, value] of Object.entries(body)) {
    await client.from('school_settings').upsert({ key, value }, { onConflict: 'key' })
  }
  return c.json({ ok: true })
})

schoolRoutes.patch('/branding', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  const { data: school } = await client.from('school_info').select('id').order('id').limit(1).maybeSingle()
  const { data, error: updateError } = await client
    .from('school_branding')
    .upsert({ school_id: school?.id ?? null, ...body }, { onConflict: 'school_id' })
    .select()
    .single()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

schoolRoutes.patch('/contact', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  const { data: school } = await client.from('school_info').select('id').order('id').limit(1).maybeSingle()
  const { data, error: updateError } = await client
    .from('school_contact')
    .upsert({ school_id: school?.id ?? null, ...body }, { onConflict: 'school_id' })
    .select()
    .single()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})