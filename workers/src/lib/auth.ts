import { createMiddleware } from 'hono/factory'
import { anonDb, db } from './db'

export type AuthUser = {
  id: string
  email: string | null
  user_metadata: Record<string, unknown>
  app_metadata: Record<string, unknown>
}

declare module 'hono' {
  interface ContextVariableMap {
    authUser: AuthUser | null
    financeSchoolId: number
  }
}

/**
 * Verifies the caller's Supabase Auth bearer token and exposes the verified
 * identity as `c.get('authUser')`. Unauthenticated requests pass through with
 * `authUser === null`; individual routes decide whether that is acceptable.
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    c.set('authUser', null)
    return next()
  }
  try {
    const { data, error } = await anonDb().auth.getUser(token)
    c.set('authUser', error || !data.user ? null : (data.user as unknown as AuthUser))
  } catch {
    c.set('authUser', null)
  }
  return next()
})

type AuthResult = { error: Response | null; user: AuthUser | null }

/** Requires a verified identity; returns a 401 Response otherwise. */
export function requireAuth(c: { get: (k: 'authUser') => AuthUser | null }): AuthResult {
  const user = c.get('authUser')
  if (!user) {
    return {
      error: new Response(JSON.stringify({ detail: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
      user: null,
    }
  }
  return { error: null, user }
}

/**
 * Resolve school context from an explicit X-School-Id header or a single
 * active membership. The worker uses a service-role client, so membership and
 * role checks must be performed here before any finance route can execute.
 */
export async function requireFinanceSchoolAccess(
  c: {
    get: (k: 'authUser') => AuthUser | null
    set: (k: 'financeSchoolId', value: number) => void
    req: { header: (name: string) => string | undefined }
    json: (body: unknown, status?: number) => Response
  },
): Promise<{ error: Response | null; schoolId: number | null; user: AuthUser | null }> {
  const { error, user } = requireAuth(c)
  if (error || !user) return { error, schoolId: null, user: null }

  const client = db()
  const requestedSchool = c.req.header('X-School-Id')
  const membershipsQuery = client
    .from('tt_memberships')
    .select('school_id, role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const { data: memberships, error: membershipError } = await membershipsQuery
  if (membershipError) {
    return { error: c.json({ detail: 'School finance access could not be verified.' }, 503), schoolId: null, user }
  }

  const eligibleRoles = ['admin', 'super_admin', 'finance', 'accountant', 'bursar']
  const eligible = (memberships ?? []).filter((m) =>
    eligibleRoles.includes(String(m.role ?? '').toLowerCase()),
  )
  let membership = null as (typeof eligible)[number] | null

  if (requestedSchool) {
    const parsed = Number(requestedSchool)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return { error: c.json({ detail: 'Invalid X-School-Id header.' }, 400), schoolId: null, user }
    }
    membership = eligible.find((m) => Number(m.school_id) === parsed) ?? null
    if (!membership) {
      return { error: c.json({ detail: 'Active school finance membership required.' }, 403), schoolId: null, user }
    }
  } else {
    const schoolIds = [...new Set(eligible.map((m) => Number(m.school_id)))]
    if (schoolIds.length > 1) {
      return { error: c.json({ detail: 'X-School-Id is required for users with multiple school memberships.' }, 400), schoolId: null, user }
    }
    membership = eligible[0] ?? null
  }

  if (!membership) {
    return { error: c.json({ detail: 'Active school finance membership required.' }, 403), schoolId: null, user }
  }

  const schoolId = Number(membership.school_id)
  const { data: school, error: schoolError } = await client
    .from('school_info')
    .select('id, is_active')
    .eq('id', schoolId)
    .maybeSingle()

  if (schoolError || !school) {
    return { error: c.json({ detail: 'School finance access could not be verified.' }, 503), schoolId: null, user }
  }
  if (school.is_active === false) {
    return { error: c.json({ detail: 'Finance access is disabled for this school.' }, 403), schoolId: null, user }
  }

  c.set('financeSchoolId', schoolId)
  return { error: null, schoolId, user }
}
