import { getLocalSession } from './localAuth'
import { supabase } from './supabase'

// Same-origin by default: the backend serves this frontend, so a relative URL
// reaches the API on the same domain (no CORS). Set VITE_API_URL only if the
// frontend is ever hosted on a different origin than the API.
const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly detail?: unknown) { super(message) }
}

export function friendlyApiError(error: unknown, action: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Please sign in again.'
    if (error.status === 403) return `You do not have permission to ${action}.`
    if (error.status === 404) return 'That information has not been set up yet.'
    if (error.status === 422 || error.status === 400) return 'Some details were not accepted. Check the form and try again.'
    if (error.status >= 500) return `The server had a problem and could not ${action}.`
    return `We could not ${action}. Please try again.`
  }
  return `We could not ${action}. Check your connection and try again.`
}

async function refreshSessionToken(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  const { data: session } = await supabase.auth.getSession()
  return session?.session?.access_token ?? null
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  // Browser-generated multipart boundaries must not be replaced with application/json.
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (authenticated) {
    if (supabase) {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session) throw new ApiError('Please sign in again.', 401)
      headers.set('Authorization', `Bearer ${data.session.access_token}`)
    } else {
      const session = getLocalSession()
      if (!session) throw new ApiError('Please sign in again.', 401)
      headers.set('Authorization', `Bearer ${session.access_token}`)
    }
  }
  const doFetch = async (h: Headers) => {
    const response = await fetch(`${apiUrl}${path}`, { ...init, headers: h })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const raw = payload?.detail
      const message = typeof raw === 'string' ? raw : typeof raw?.message === 'string' ? raw.message : `Request failed (${response.status})`
      throw new ApiError(message, response.status, typeof raw === 'object' ? raw : undefined)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
  try { return await doFetch(headers) }
  catch (error) {
    if (authenticated && error instanceof ApiError && error.status === 401) {
      const newToken = await refreshSessionToken()
      if (newToken) { const retryHeaders = new Headers(headers); retryHeaders.set('Authorization', `Bearer ${newToken}`); return await doFetch(retryHeaders) }
    }
    throw error
  }
}

export type Identity = { id: string; email: string | null; role: string | null; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }
export type SchoolProfile = { id: number; name: string; code?: string | null; county?: string | null }
