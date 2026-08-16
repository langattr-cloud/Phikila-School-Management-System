import { supabase } from './supabase'
import { healthSchema, userMeSchema, type HealthResponse, type UserMeResponse } from './schemas'

/**
 * Centralised API client. Same-origin by default — the backend serves this
 * frontend on the same domain, so a relative URL suffices. Set VITE_API_URL
 * only when the frontend is hosted on a different origin.
 */

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

  const data = (await response.json()) as unknown
  // Validate response payload against the provided Zod schema
  if (init.method && init.method.toUpperCase() !== 'GET') {
    return data as T  // Skip validation for mutations (schema not provided)
  }
  return data as T
}

/**
 * Typed API methods with Zod-validated responses.
 */
export const api = {
  health: async (): Promise<HealthResponse> => {
    const data = await apiFetch<unknown>('/health', {}, false)
    return healthSchema.parse(data)
  },
  me: async (): Promise<UserMeResponse> => {
    const data = await apiFetch<unknown>('/api/v1/auth/me')
    return userMeSchema.parse(data)
  },
}
