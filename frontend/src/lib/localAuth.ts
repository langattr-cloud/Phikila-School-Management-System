/**
 * Local (self-hosted / development) authentication.
 *
 * Active only when no Supabase project is configured. The backend's legacy
 * login endpoint verifies the username and password against its own user
 * table and returns a signed access token that the rest of the API accepts.
 * The token is kept in localStorage exactly like any other session.
 */

const STORAGE_KEY = 'phikila.local.session'

export type LocalAuthSession = {
  access_token: string
  user: {
    id: string
    email: string
    user_metadata: { full_name?: string }
  }
}

function prettyName(email: string): string {
  const local = email.split('@')[0] || 'user'
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getLocalSession(): LocalAuthSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { token: string; email: string }
    if (!parsed.token || !parsed.email) return null
    return {
      access_token: parsed.token,
      user: {
        id: parsed.email,
        email: parsed.email,
        user_metadata: { full_name: prettyName(parsed.email) },
      },
    }
  } catch {
    return null
  }
}

export function setLocalSession(email: string, accessToken: string): LocalAuthSession {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: accessToken, email }))
  return getLocalSession()!
}

export function clearLocalSession(): void {
  window.localStorage.removeItem(STORAGE_KEY)
}

/** Sign in against the backend's own OAuth2 token endpoint. */
export async function localSignIn(
  email: string,
  password: string,
): Promise<LocalAuthSession> {
  const body = new URLSearchParams({ username: email, password })
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const detail = payload?.detail
    const message =
      typeof detail === 'string' ? detail : 'We could not sign you in. Please try again.'
    throw new Error(message)
  }
  const data = (await response.json()) as { access_token: string }
  return setLocalSession(email, data.access_token)
}
