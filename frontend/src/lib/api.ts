import { clearLocalSession, getLocalSession } from './localAuth'
import { supabase } from './supabase'

// Same-origin by default: the backend serves this frontend, so a relative URL
// reaches the API on the same domain (no CORS). Set VITE_API_URL only if the
// frontend is ever hosted on a different origin than the API.
const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Structured detail, e.g. conflict reasons and suggested alternatives. */
    public readonly detail?: unknown,
  ) {
    super(message)
  }
}

/** User-facing copy for an API failure. Never surfaces backend internals. */
export function friendlyApiError(error: unknown, action: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Please sign in again.'
    if (error.status === 403) return `You do not have permission to ${action}.`
    if (error.status === 404) return 'That information has not been set up yet.'
    if (error.status === 422 || error.status === 400) {
      return `Some details were not accepted. Check the form and try again.`
    }
    if (error.status >= 500) return `The server had a problem and could not ${action}.`
    return `We could not ${action}. Please try again.`
  }
  return `We could not ${action}. Check your connection and try again.`
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
    if (supabase) {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session) {
        throw new ApiError('Please sign in again.', 401)
      }
      headers.set('Authorization', `Bearer ${data.session.access_token}`)
    } else {
      const session = getLocalSession()
      if (!session) {
        throw new ApiError('Please sign in again.', 401)
      }
      headers.set('Authorization', `Bearer ${session.access_token}`)
    }
  }

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers })
  if (!response.ok) {
    if (response.status === 401 && authenticated) {
      // Clear stale session on 401 Unauthorized so user is cleanly taken to sign in
      if (supabase) {
        void supabase.auth.signOut().catch(() => {})
      } else {
        clearLocalSession()
      }
    }

    const payload = await response.json().catch(() => null)
    const raw = payload?.detail
    const message =
      typeof raw === 'string'
        ? raw
        : typeof raw?.message === 'string'
          ? raw.message
          : `Request failed (${response.status})`
    throw new ApiError(message, response.status, typeof raw === 'object' ? raw : undefined)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export type Identity = {
  id: string
  email: string | null
  role: string | null
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
}

export type SchoolProfile = {
  id: number
  name: string
  code?: string | null
  county?: string | null
  sub_county?: string | null
  email?: string | null
  phone?: string | null
  motto?: string | null
  principal_name?: string | null
  established_year?: number | null
  is_active?: boolean | null
}

export type AcademicYear = {
  id: number
  name: string
  start_date: string
  end_date: string
  is_current?: boolean | null
  status?: string | null
  school_id: number
}

export type Term = {
  id: number
  name: string
  start_date?: string | null
  end_date?: string | null
  is_current: boolean
  academic_year_id: number
  school_id: number
}

export type Level = {
  id: number
  name: string
  code: string
  display_order: number
  status?: boolean | null
  school_id: number
}

export const api = {
  health: () => apiFetch<{ status: string; environment: string }>('/health', {}, false),
  me: () => apiFetch<Identity>('/api/v1/auth/me'),
  school: () => apiFetch<SchoolProfile>('/api/v1/school/'),
  academicYears: () => apiFetch<AcademicYear[]>('/api/v1/academics/years'),
  terms: () => apiFetch<Term[]>('/api/v1/academics/terms'),
  levels: () => apiFetch<Level[]>('/api/v1/academics/levels'),
}
