import { createMiddleware } from 'hono/factory'
import { anonDb } from './db'

export type AuthUser = {
  id: string
  email: string | null
  user_metadata: Record<string, unknown>
  app_metadata: Record<string, unknown>
}

declare module 'hono' {
  interface ContextVariableMap {
    authUser: AuthUser | null
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