import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth, type AuthUser } from '../lib/auth'
import { jsonError } from '../lib/http'

export const platformRoutes = new Hono()

const GRANTABLE_ROLES = ['viewer', 'student', 'librarian', 'teacher', 'scheduler', 'admin']
const REQUESTABLE_ROLES = ['teacher', 'librarian', 'scheduler', 'admin', 'student', 'viewer']

/**
 * Platform-wide mutations and data must be restricted to platform admins.
 * Only session discovery and submitting/viewing public access-request options
 * are intentionally available to any authenticated user.
 */
platformRoutes.use('*', async (c, next) => {
  const path = c.req.path.replace(/\/+$/, '')
  const method = c.req.method.toUpperCase()
  const isPublicRoute =
    (method === 'GET' && path.endsWith('/session')) ||
    (method === 'GET' && path.endsWith('/access-requests/options')) ||
    (method === 'POST' && path.endsWith('/access-requests'))

  if (isPublicRoute) return next()

  const { error, user } = requireAuth(c as never)
  if (error) return error

  const { data: admin } = await db()
    .from('tt_platform_admins')
    .select('id')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!admin) return c.json({ detail: 'Forbidden' }, 403)
  return next()
})

const uid = (c: { get: (k: 'authUser') => AuthUser | null }) => c.get('authUser')?.id ?? null

/** Current caller's platform authority + access state. */
platformRoutes.get('/session', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const client = db()

  const [adminRow, accessRow, membershipRows] = await Promise.all([
    client.from('tt_platform_admins').select('role').eq('user_id', user!.id).eq('is_active', true).maybeSingle(),
    client
      .from('tt_access_requests')
      .select('status, requested_role, requested_school_name, decision_note')
      .eq('user_id', user!.id)
      .maybeSingle(),
    client.from('tt_memberships').select('school_id,role').eq('user_id', user!.id).eq('is_active', true),
  ])

  const isSuperAdmin = Boolean(adminRow.data)
  const schoolIds = [...new Set((membershipRows.data ?? []).map((row: any) => Number(row.school_id)).filter(Number.isSafeInteger))]
  const { data: schoolRows } = schoolIds.length
    ? await client.from('tt_schools').select('id,name').in('id', schoolIds)
    : { data: [] }
  const schools = (schoolRows ?? []).map((school: any) => ({
    id: Number(school.id),
    name: school.name,
    role: (membershipRows.data ?? []).find((row: any) => Number(row.school_id) === Number(school.id))?.role ?? 'viewer',
  }))

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

  const hasAccess = isSuperAdmin || schools.length > 0

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
  const { data: schools, error } = await db().from('tt_schools').select('id,name,status').eq('status', 'active').order('name')
  if (error) return jsonError(c, 'School access options could not be loaded.', 503)
  return c.json({
    roles: REQUESTABLE_ROLES,
    schools: (schools ?? []).map((school) => ({ id: school.id, name: school.name })),
  })
})

platformRoutes.post('/access-requests', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const requestedRole = String(body.requested_role ?? '')
  const schoolId = Number(body.school_id)
  if (!REQUESTABLE_ROLES.includes(requestedRole)) return jsonError(c, 'Choose a valid school role.', 422)
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return jsonError(c, 'Choose a school.', 422)

  const client = db()
  const { data: school, error: schoolError } = await client.from('tt_schools')
    .select('id,name,status').eq('id', schoolId).maybeSingle()
  if (schoolError) return jsonError(c, 'School access could not be verified.', 503)
  if (!school || school.status !== 'active') return jsonError(c, 'The selected school is not active.', 422)

  const { data: membership, error: membershipError } = await client.from('tt_memberships')
    .select('id').eq('user_id', user!.id).eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  if (membershipError) return jsonError(c, 'Existing school access could not be checked.', 503)
  if (membership) return c.json({ detail: 'Your account already has active access to this school.' }, 409)

  const { data: existing, error: existingError } = await client.from('tt_access_requests')
    .select('id,status').eq('user_id', user!.id).maybeSingle()
  if (existingError) return jsonError(c, 'Existing access request could not be checked.', 503)
  const payload = {
    user_id: user!.id,
    email: user!.email ?? '',
    requested_role: requestedRole,
    requested_school_id: schoolId,
    requested_school_name: school.name,
    note: typeof body.note === 'string' ? body.note.trim() || null : null,
    status: 'pending',
    decision_note: null,
    decided_by: null,
    decided_at: null,
    granted_role: null,
    granted_school_id: null,
  }
  const write = existing
    ? await client.from('tt_access_requests').update(payload).eq('id', existing.id)
    : await client.from('tt_access_requests').insert(payload)
  if (write.error) return jsonError(c, write.error.message, 400)
  return c.json({ ok: true, status: 'pending' }, existing ? 200 : 201)
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
  const approve = body.approve === true
  const note = typeof body.note === 'string' ? body.note.trim() || null : null

  const { data: request, error: requestError } = await client
    .from('tt_access_requests').select('*').eq('id', requestId).maybeSingle()
  if (requestError) return jsonError(c, 'Access request could not be loaded.', 503)
  if (!request) return c.json({ detail: 'Request not found.' }, 404)
  if (request.status !== 'pending') return c.json({ detail: 'This access request has already been decided.' }, 409)

  if (!approve) {
    const { error: rejectError } = await client.from('tt_access_requests').update({
      status: 'rejected', decision_note: note, decided_by: user!.id, decided_at: new Date().toISOString(),
    }).eq('id', requestId).eq('status', 'pending')
    if (rejectError) return jsonError(c, rejectError.message, 400)
    return c.json({ ok: true, status: 'rejected' })
  }

  const role = String(body.role ?? request.requested_role ?? '')
  const schoolId = Number(body.school_id ?? request.requested_school_id)
  const teacherId = body.teacher_id == null || body.teacher_id === '' ? null : Number(body.teacher_id)
  if (!GRANTABLE_ROLES.includes(role)) return jsonError(c, 'Choose a valid school role to grant.', 422)
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return jsonError(c, 'Choose a school.', 422)
  const { data: school, error: schoolError } = await client.from('tt_schools')
    .select('id,name,status').eq('id', schoolId).maybeSingle()
  if (schoolError) return jsonError(c, 'School access could not be verified.', 503)
  if (!school || school.status !== 'active') return jsonError(c, 'The selected school is not active.', 422)

  if (role === 'teacher') {
    if (teacherId === null || !Number.isSafeInteger(teacherId) || teacherId <= 0) return jsonError(c, 'Link this account to an existing saved teacher record.', 422)
    const { data: teacher, error: teacherError } = await client.from('teachers').select('id').eq('id', teacherId).maybeSingle()
    if (teacherError) return jsonError(c, 'Teacher record could not be verified.', 503)
    if (!teacher) return jsonError(c, 'The selected teacher record does not exist.', 422)
  } else if (teacherId !== null) {
    return jsonError(c, 'A teacher record can only be linked to a teacher role.', 422)
  }

  const { error: membershipError } = await client.from('tt_memberships').upsert({
    user_id: request.user_id, school_id: schoolId, role, email: request.email ?? null,
    teacher_id: role === 'teacher' ? teacherId : null, is_active: true,
  }, { onConflict: 'user_id,school_id' })
  if (membershipError) return jsonError(c, 'School membership could not be granted: ' + membershipError.message, 400)

  const { error: updateError } = await client.from('tt_access_requests').update({
    status: 'approved', granted_role: role, granted_school_id: schoolId,
    decision_note: note, decided_by: user!.id, decided_at: new Date().toISOString(),
  }).eq('id', requestId).eq('status', 'pending')
  if (updateError) return jsonError(c, 'Membership was saved, but the request status could not be updated. Re-open and verify the membership before retrying.', 500)
  return c.json({ ok: true, status: 'approved', role, school_id: schoolId })

})

async function getSchoolStats(client: ReturnType<typeof db>, schoolIds: number[]) {
  const [membershipsResult, classesResult] = await Promise.all([
    schoolIds.length ? client.from('tt_memberships').select('school_id,user_id,role,is_active').in('school_id', schoolIds) : Promise.resolve({ data: [] as any[], error: null }),
    schoolIds.length ? client.from('school_classes').select('school_id').in('school_id', schoolIds) : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (membershipsResult.error || classesResult.error) throw new Error('School membership or class counts could not be loaded.')
  const stats = new Map<number, { users: number; teachers: number; classes: number }>()
  for (const id of schoolIds) stats.set(id, { users: 0, teachers: 0, classes: 0 })
  const usersBySchool = new Map<number, Set<string>>()
  for (const membership of membershipsResult.data ?? []) {
    if (!membership.is_active) continue
    const id = Number(membership.school_id)
    if (!stats.has(id)) continue
    if (!usersBySchool.has(id)) usersBySchool.set(id, new Set())
    usersBySchool.get(id)!.add(String(membership.user_id))
    if (membership.role === 'teacher') stats.get(id)!.teachers += 1
  }
  for (const [id, users] of usersBySchool) stats.get(id)!.users = users.size
  for (const item of classesResult.data ?? []) {
    const id = Number(item.school_id)
    if (stats.has(id)) stats.get(id)!.classes += 1
  }
  return stats
}

platformRoutes.get('/overview', async (c) => {
  const client = db()
  const [schools, memberships, classes, requests, admins] = await Promise.all([
    client.from('tt_schools').select('id'),
    client.from('tt_memberships').select('user_id,role,is_active'),
    client.from('school_classes').select('id'),
    client.from('tt_access_requests').select('id,status'),
    client.from('tt_platform_admins').select('id,role,is_active'),
  ])
  if (schools.error || memberships.error || classes.error || requests.error || admins.error) {
    return jsonError(c, 'Platform overview could not be loaded.', 503)
  }
  const activeMemberships = (memberships.data ?? []).filter((item: any) => item.is_active)
  return c.json({
    schools: schools.data?.length ?? 0,
    users: new Set(activeMemberships.map((item: any) => String(item.user_id))).size,
    teachers: activeMemberships.filter((item: any) => item.role === 'teacher').length,
    classes: classes.data?.length ?? 0,
    pending_requests: (requests.data ?? []).filter((item: any) => item.status === 'pending').length,
    super_admins: (admins.data ?? []).filter((item: any) => item.is_active && item.role === 'super_admin').length,
    recent: [],
  })
})

platformRoutes.get('/schools', async (c) => {
  const client = db()
  const { data: schools, error } = await client.from('tt_schools').select('*').order('id')
  if (error) return jsonError(c, 'School list could not be loaded.', 503)
  const ids = (schools ?? []).map((school: any) => Number(school.id))
  let stats: Map<number, { users: number; teachers: number; classes: number }>
  try { stats = await getSchoolStats(client, ids) } catch { return jsonError(c, 'School membership and class counts could not be loaded.', 503) }
  return c.json({
    schools: (schools ?? []).map((school: any) => ({
      ...school, slug: school.slug ?? '', users: stats.get(Number(school.id))?.users ?? 0,
      teachers: stats.get(Number(school.id))?.teachers ?? 0, classes: stats.get(Number(school.id))?.classes ?? 0,
    })),
    total: schools?.length ?? 0,
  })
})

platformRoutes.post('/schools', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const slug = String(body.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim()
  if (!name || !slug) return jsonError(c, 'School name and code are required.', 422)
  const { data, error } = await db().from('tt_schools')
    .insert({ name, slug, timezone: body.timezone ?? 'Africa/Nairobi', academic_year: body.academic_year ?? null, status: 'active' })
    .select().single()
  if (error) return jsonError(c, error.message, 400)
  return c.json({ ...data, users: 0, teachers: 0, classes: 0 }, 201)
})

platformRoutes.get('/schools/:schoolId', async (c) => {
  const client = db()
  const schoolId = Number(c.req.param('schoolId'))
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return jsonError(c, 'Invalid school ID.', 422)
  const { data, error } = await client.from('tt_schools').select('*').eq('id', schoolId).maybeSingle()
  if (error) return jsonError(c, 'School could not be loaded.', 503)
  if (!data) return c.json({ detail: 'School not found.' }, 404)
  let stats: Map<number, { users: number; teachers: number; classes: number }>
  try { stats = await getSchoolStats(client, [schoolId]) } catch { return jsonError(c, 'School membership and class counts could not be loaded.', 503) }
  return c.json({ ...data, slug: data.slug ?? '', ...stats.get(schoolId) })
})

platformRoutes.patch('/schools/:schoolId', async (c) => {
  const schoolId = Number(c.req.param('schoolId'))
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return jsonError(c, 'Invalid school ID.', 422)
  const body = await c.req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (typeof body.slug === 'string' && body.slug.trim()) updates.slug = body.slug.trim()
  if (typeof body.timezone === 'string' || body.timezone === null) updates.timezone = body.timezone
  if (typeof body.academic_year === 'string' || body.academic_year === null) updates.academic_year = body.academic_year
  if (!Object.keys(updates).length) return jsonError(c, 'At least one valid school field is required.', 422)
  const { data, error } = await db().from('tt_schools').update(updates).eq('id', schoolId).select().maybeSingle()
  if (error) return jsonError(c, error.message, 400)
  if (!data) return c.json({ detail: 'School not found.' }, 404)
  return c.json(data)
})

platformRoutes.post('/schools/:schoolId/status', async (c) => {
  const schoolId = Number(c.req.param('schoolId'))
  const body = await c.req.json().catch(() => ({}))
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0 || !['active', 'inactive'].includes(String(body.status))) {
    return jsonError(c, 'A valid school and active/inactive status are required.', 422)
  }
  const { data, error } = await db().from('tt_schools').update({ status: body.status })
    .eq('id', schoolId).select().maybeSingle()
  if (error) return jsonError(c, error.message, 400)
  if (!data) return c.json({ detail: 'School not found.' }, 404)
  return c.json(data)
})

platformRoutes.get('/schools/:schoolId/users', async (c) => {
  const client = db()
  const schoolId = Number(c.req.param('schoolId'))
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return jsonError(c, 'Invalid school ID.', 422)
  const { data: memberships, error } = await client.from('tt_memberships')
    .select('user_id,email,phone,role,is_active,created_at').eq('school_id', schoolId).order('created_at')
  if (error) return jsonError(c, 'School members could not be loaded.', 503)
  return c.json((memberships ?? []).map((item: any) => ({
    user_id: String(item.user_id), email: item.email ?? null, phone: item.phone ?? null,
    role: item.role, is_active: item.is_active, created_at: item.created_at,
  })))
})

platformRoutes.post('/schools/:schoolId/administrators', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const schoolId = Number(c.req.param('schoolId'))
  const email = String(body.email ?? '').trim().toLowerCase()
  const role = String(body.role ?? 'admin')
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return jsonError(c, 'Choose a valid school.', 422)
  if (!GRANTABLE_ROLES.includes(role) || role === 'teacher') {
    return jsonError(c, 'Choose a school role. Teacher access must be approved through an access request and linked to a saved teacher record.', 422)
  }
  if (!email) return jsonError(c, 'An existing account email is required.', 422)

  const client = db()
  const { data: school, error: schoolError } = await client.from('tt_schools')
    .select('id,status').eq('id', schoolId).maybeSingle()
  if (schoolError) return jsonError(c, 'School access could not be verified.', 503)
  if (!school || school.status !== 'active') return jsonError(c, 'The selected school is not active.', 422)

  const { data: existing, error: userError } = await client.from('users')
    .select('id,email,is_active').ilike('email', email).maybeSingle()
  if (userError) return jsonError(c, 'Account lookup failed.', 503)
  if (!existing || existing.is_active === false) {
    return c.json({ detail: 'The account must already exist and be active. Ask the person to sign in and submit a school access request first.' }, 404)
  }

  const { error: membershipError } = await client.from('tt_memberships').upsert({
    user_id: existing.id, school_id: schoolId, role, email: existing.email ?? email,
    phone: typeof body.phone === 'string' ? body.phone.trim() || null : null,
    teacher_id: null, is_active: true,
  }, { onConflict: 'user_id,school_id' })
  if (membershipError) return jsonError(c, 'School membership could not be granted: ' + membershipError.message, 400)
  return c.json({
    user_id: existing.id, email: existing.email ?? email, phone: body.phone ?? null,
    role, is_active: true, invited: false, created_account: false,
    existing_account: true, password_reset: false, temporary_password: null,
  }, 200)
})

platformRoutes.delete('/schools/:schoolId/administrators/:userId', async (c) => {
  const schoolId = Number(c.req.param('schoolId'))
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return jsonError(c, 'Invalid school ID.', 422)
  const { data, error } = await db().from('tt_memberships').delete()
    .eq('school_id', schoolId).eq('user_id', c.req.param('userId')).select('id').maybeSingle()
  if (error) return jsonError(c, error.message, 400)
  if (!data) return c.json({ detail: 'School membership not found.' }, 404)
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