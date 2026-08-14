import { supabase } from './supabase'

// Same-origin by default: the backend serves this frontend, so a relative URL
// reaches the API on the same domain (no CORS). Set VITE_API_URL only if the
// frontend is ever hosted on a different origin than the API.
const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (authenticated) {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session) {
      throw new ApiError('Please sign in again.', 401)
    }
    headers.set('Authorization', `Bearer ${data.session.access_token}`)
  }

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(payload?.detail || `Request failed (${response.status})`, response.status)
  }

  return response.json() as Promise<T>
}

export const api = {
  health: () => apiFetch<{ status: string; environment: string }>('/health', {}, false),
  me: () =>
    apiFetch<{
      id: string
      email: string | null
      role: string | null
    }>('/api/v1/auth/me'),
}
