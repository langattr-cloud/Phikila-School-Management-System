import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth, type AuthUser } from '../lib/auth'
import { jsonError } from '../lib/http'

export const platformRoutes = new Hono()

const uid = (c: { get: (k: 'authUser') => AuthUser | null }) => c.get('authUser')?.id ?? null

/** Current caller's platform authority + access state. */
platformRoutes.get('/session', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const client = db()

  const [adminRow, accessRow, schoolRows] = await Promise.all([
    client.from('tt_platform_admins').select('role').eq('user_id', user!.id).maybeSingle(),
    client
      .from('tt_access_requests')
      .select('status, requested_role, requested_school_name, decision_note')
      .eq('user_id', user!.id)
      .maybeSingle(),
    client.from('school_info').select('id, name, slug'),
  ])

  const isSuperAdmin = Boolean(adminRow.data)
  const schools =
    schoolRows.data?.map((s) => ({
      id: s.id,
      name: s.name,
      role: isSuperAdmin ? 'super_admin' : accessRow.data?.requested_role ?? 'viewer',
    })) ?? []

  let accessRequest: SessionInfo['access_request'] | null = null
  const requestData = accessRow.data
  if (requestData) {
    accessRequest = {
      status: requestData.status as 'pending' | 'approved' | 'rejected',
      requested_role: requestData.requested_role ?? '',
      requested_school_name: requestData.requested_school_name ?? null,
      decision_note: requestData.decision_note ?? null,
    }
  }

  const hasAccess = isSuperAdmin || (accessRow.data?.status === 'approved' && schools.length > 0)

  return c.json({
    user_id: user!.id,
    email: user!.email,
    is_super_admin: isSuperAdmin,
    schools,
    has_access: hasAccess,
    access_request: accessRequest,
  })
})

type SessionInfo = {
  access_request: {
    status: 'pending' | 'approved' | 'rejected'
    requested_role: string
    requested_school_name: string | null
    decision_note: string | null
  } | null
}

platformRoutes.get('/access-requests/options', async (c) => {
  const { data: schools } = await db().from('school_info').select('id, name')
  return c.json({
    roles: ['admin', 'academics', 'finance', 'teacher', 'student'],
    schools: schools?.map((s) => ({ id: s.id, name: s.name })) ?? [],
  })
})

platformRoutes.post('/access-requests', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { requested_role, school_id, school_name } = body

  const client = db()
  const existing = await client
    .from('tt_access_requests')
    .select('id')
    .eq('user_id', user!.id)
    .maybeSingle()
  if (existing.data) {
    return c.json({ detail: 'A request is already pending.' }, 409)
  }
  const { error: insertError } = await client.from('tt_access_requests').insert({
    user_id: user!.id,
    requested_role: requested_role ?? null,
    requested_school_id: school_id ?? null,
    requested_school_name: school_name ?? null,
    status: 'pending',
  })
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json({ ok: true }, 201)
})

platformRoutes.get('/access-requests', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const isAdmin = await client
    .from('tt_platform_admins')
    .select('id')
    .eq('user_id', user!.id)
    .maybeSingle()
  if (!isAdmin.data) return c.json({ detail: 'Forbidden' }, 403)

  const { data } = await client
    .from('tt_access_requests')
    .select('*')
    .order('created_at', { ascending: false })
  return c.json(data ?? [])
})

platformRoutes.post('/access-requests/:requestId/decide', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const isAdmin = await client
    .from('tt_platform_admins')
    .select('id')
    .eq('user_id', user!.id)
    .maybeSingle()
  if (!isAdmin.data) return c.json({ detail: 'Forbidden' }, 403)

  const requestId = c.req.param('requestId')
  const body = await c.req.json().catch(() => ({}))
  const { approve, role, note } = body
  const status = approve ? 'approved' : 'rejected'

  const { data: request } = await client
    .from('tt_access_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  if (!request) return c.json({ detail: 'Request not found.' }, 404)

  const { error: updateError } = await client
    .from('tt_access_requests')
    .update({
      status,
      decision_note: note ?? null,
      decided_by: user!.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId)
  if (updateError) return jsonError(c, updateError.message, 400)

  // On approval, grant platform admin if the requested role is platform-level.
  if (approve && (role === 'super_admin' || role === 'admin')) {
    await client
      .from('tt_platform_admins')
      .upsert({ user_id: request.user_id, role: 'admin' }, { onConflict: 'user_id' })
  }
  return c.json({ ok: true })
})

platformRoutes.get('/overview', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const [schools, requests, admins] = await Promise.all([
    client.from('school_info').select('*', { count: 'exact' }),
    client.from('tt_access_requests').select('*', { count: 'exact' }),
    client.from('tt_platform_admins').select('*', { count: 'exact' }),
  ])
  return c.json({
    schools: schools.data ?? [],
    school_count: schools.count ?? 0,
    requests: requests.data ?? [],
    request_count: requests.count ?? 0,
    admins: admins.data ?? [],
    admin_count: admins.count ?? 0,
  })
})

platformRoutes.get('/schools', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const { data, count } = await client.from('school_info').select('*', { count: 'exact' }).order('id')
  return c.json({ schools: data ?? [], total: count ?? 0 })
})

platformRoutes.post('/schools', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const slug = (body.slug ?? String(body.name ?? 'school').toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim()
  const { data, error: insertError } = await db()
    .from('school_info')
    .insert({ name: body.name, slug, timezone: body.timezone ?? null, status: body.status ?? 'active' })
    .select()
    .single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

platformRoutes.get('/schools/:schoolId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('school_info').select('*').eq('id', c.req.param('schoolId')).maybeSingle()
  if (!data) return c.json({ detail: 'School not found.' }, 404)
  return c.json(data)
})

platformRoutes.patch('/schools/:schoolId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('school_info')
    .update(body)
    .eq('id', c.req.param('schoolId'))
    .select()
    .single()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

platformRoutes.post('/schools/:schoolId/status', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data } = await db()
    .from('school_info')
    .update({ status: body.status ?? 'active' })
    .eq('id', c.req.param('schoolId'))
    .select()
    .single()
  return c.json(data)
})

platformRoutes.get('/schools/:schoolId/users', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('users').select('*')
  return c.json(data ?? [])
})

platformRoutes.post('/schools/:schoolId/administrators', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  // Look up an existing user by email; if absent, no-op registration happens on
  // first sign-in. For now we store the intended mapping.
  const { data: existing } = await db().from('users').select('id').eq('email', body.email).maybeSingle()
  const userId = existing?.id ?? user!.id
  await db().from('tt_platform_admins').upsert({ user_id: userId, role: body.role ?? 'admin' }, { onConflict: 'user_id' })
  return c.json({ ok: true }, 201)
})

platformRoutes.delete('/schools/:schoolId/administrators/:userId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('tt_platform_admins').delete().eq('user_id', c.req.param('userId'))
  return c.body(null, 204)
})

platformRoutes.get('/administrators', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('tt_platform_admins').select('*')
  return c.json(data ?? [])
})

platformRoutes.post('/administrators', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data: existing } = await db().from('users').select('id').eq('email', body.email).maybeSingle()
  const userId = existing?.id ?? user!.id
  await db().from('tt_platform_admins').upsert({ user_id: userId, role: body.role ?? 'admin' }, { onConflict: 'user_id' })
  return c.json({ ok: true }, 201)
})

platformRoutes.delete('/administrators/:userId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('tt_platform_admins').delete().eq('user_id', c.req.param('userId'))
  return c.body(null, 204)
})

platformRoutes.get('/audit', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('tt_platform_audit').select('*').order('created_at', { ascending: false }).limit(200)
  return c.json(data ?? [])
})

export { uid }