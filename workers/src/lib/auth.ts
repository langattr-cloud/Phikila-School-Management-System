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
 * Finance worker routes use a service-role database client and legacy finance
 * tables that do not consistently carry school_id. Until those tables have
 * tenant keys and every query is scoped, fail closed when more than one school
 * exists. An authenticated identity or platform-admin status alone is not
 * permission to view school financial records.
 */
export async function requireFinanceSchoolAccess(
  c: {
    get: (k: 'authUser') => AuthUser | null
    set: (k: 'financeSchoolId', value: number) => void
    json: (body: unknown, status?: number) => Response
  },
): Promise<{ error: Response | null; schoolId: number | null; user: AuthUser | null }> {
  const { error, user } = requireAuth(c)
  if (error || !user) return { error, schoolId: null, user: null }

  const client = db()
  const { data: schools, error: schoolError } = await client
    .from('school_info')
    .select('id')
    .order('id')
    .limit(2)

  if (schoolError || !schools) {
    return { error: c.json({ detail: 'Finance access could not be verified.' }, 503), schoolId: null, user }
  }
  if (schools.length !== 1) {
    return {
      error: c.json(
        { detail: 'Finance worker is disabled until finance data is tenant-scoped for every school.' },
        503,
      ),
      schoolId: null,
      user,
    }
  }

  const schoolId = Number(schools[0].id)
  const { data: access, error: accessError } = await client
    .from('tt_access_requests')
    .select('requested_school_id, requested_role, status')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .maybeSingle()

  if (accessError) {
    return { error: c.json({ detail: 'Finance access could not be verified.' }, 503), schoolId: null, user }
  }
  const role = String(access?.requested_role ?? '').toLowerCase()
  if (
    !access ||
    Number(access.requested_school_id) !== schoolId ||
    !['admin', 'finance'].includes(role)
  ) {
    return { error: c.json({ detail: 'School finance access required.' }, 403), schoolId: null, user }
  }

  c.set('financeSchoolId', schoolId)
  return { error: null, schoolId, user }
}
