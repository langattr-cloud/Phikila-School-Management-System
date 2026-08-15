import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from './supabase'
import { friendlyAuthError } from './authErrors'
import { apiFetch } from './api'
import { clearLocalSession, getLocalSession, localSignIn } from './localAuth'

export type AuthResult = { ok: true; message?: string } | { ok: false; message: string }

/**
 * What a new user *asks* for at signup. It is only ever a request: the server
 * records it for review and grants nothing until a super admin approves it.
 */
export type AccessRequestDraft = {
  requested_role: string
  school_id: number | null
  school_name: string | null
}

/** Structural view of the signed-in user used across the app. */
export type AuthUser = {
  id: string
  email: string | null
  user_metadata?: Record<string, unknown> | null
}

export type AuthSession = {
  access_token: string
  user: AuthUser
}

type AuthContextValue = {
  session: AuthSession | null
  user: AuthUser | null
  /** True until the persisted session has been restored. */
  initialising: boolean
  /** True while the user is inside a password-recovery link flow. */
  recoveryMode: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (
    fullName: string,
    email: string,
    password: string,
    request?: AccessRequestDraft,
  ) => Promise<AuthResult & { needsEmailConfirmation?: boolean }>
  signOut: () => Promise<AuthResult>
  requestPasswordReset: (email: string) => Promise<AuthResult>
  updatePassword: (password: string) => Promise<AuthResult>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function displayName(user: AuthUser | null): string {
  if (!user) return ''
  const metadata = user.user_metadata as { full_name?: string; name?: string } | undefined
  return metadata?.full_name?.trim() || metadata?.name?.trim() || user.email || 'Signed-in user'
}

/**
 * Local (self-hosted) sign-in against the backend's own token endpoint.
 * Used only when no Supabase project is configured.
 */
function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => getLocalSession())

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    try {
      const local = await localSignIn(email.trim(), password)
      setSession(local)
      return { ok: true, message: 'Signed in.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'We could not sign you in.'
      return { ok: false, message }
    }
  }, [])

  const signUp = useCallback<AuthContextValue['signUp']>(async () => {
    return {
      ok: false,
      message:
        'Account creation is disabled in this local preview. Use one of the demo accounts shown on the sign-in screen.',
    }
  }, [])

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    clearLocalSession()
    setSession(null)
    return { ok: true, message: 'You have been signed out.' }
  }, [])

  const requestPasswordReset = useCallback<AuthContextValue['requestPasswordReset']>(async () => {
    return {
      ok: false,
      message: 'Password reset is not available in this local preview.',
    }
  }, [])

  const updatePassword = useCallback<AuthContextValue['updatePassword']>(async () => {
    return {
      ok: false,
      message: 'Password changes are not available in this local preview.',
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initialising: false,
      recoveryMode: false,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
    }),
    [session, signIn, signUp, signOut, requestPasswordReset, updatePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Supabase Auth provider — the production path. Signs the browser in
 * directly with the public anon key and sends the access token to the API.
 */
function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [initialising, setInitialising] = useState(true)
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    let active = true
    if (!supabase) return

    const toAuthSession = (s: { access_token: string; user: AuthUser } | null): AuthSession | null =>
      s ? { access_token: s.access_token, user: s.user } : null

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(toAuthSession(data.session as { access_token: string; user: AuthUser } | null))
      })
      .finally(() => {
        if (active) setInitialising(false)
      })

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (event === 'SIGNED_OUT') setRecoveryMode(false)
      setSession(toAuthSession(nextSession as { access_token: string; user: AuthUser } | null))
      setInitialising(false)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const { error } = await supabase!.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      return { ok: false, message: friendlyAuthError(error, 'We could not sign you in. Please try again.') }
    }
    return { ok: true }
  }, [])

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (fullName, email, password, request) => {
      // The requested role and school are stored as user metadata purely so the
      // request survives email confirmation. They confer nothing: the server
      // records them as a pending request that a super admin must approve, and
      // it re-derives every permission from its own tables.
      const { data, error } = await supabase!.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            requested_role: request?.requested_role ?? null,
            requested_school_id: request?.school_id ?? null,
            requested_school_name: request?.school_name ?? null,
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })

      if (error) {
        return {
          ok: false,
          message: friendlyAuthError(error, 'We could not create your account. Please try again.'),
        }
      }

      // Supabase returns a user without a session when email confirmation is on.
      const needsEmailConfirmation = Boolean(data.user) && !data.session
      // If Supabase signed the user straight in, register the pending request
      // now. Otherwise it is submitted on first sign-in (see AccessGate).
      if (data.session && request) {
        try {
          await apiFetch('/api/v1/platform/access-requests', {
            method: 'POST',
            body: JSON.stringify({
              requested_role: request.requested_role,
              school_id: request.school_id,
              school_name: request.school_name,
            }),
          })
        } catch {
          // A failed request submission must not block account creation; the
          // AccessGate retries it the next time the user opens the app.
        }
      }

      return {
        ok: true,
        needsEmailConfirmation,
        message: needsEmailConfirmation
          ? 'Check your inbox and open the confirmation link to activate your account.'
          : 'Your account is ready.',
      }
    },
    [],
  )

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    const { error } = await supabase!.auth.signOut()
    if (error) {
      return { ok: false, message: friendlyAuthError(error, 'We could not sign you out. Please try again.') }
    }
    setRecoveryMode(false)
    return { ok: true, message: 'You have been signed out.' }
  }, [])

  const requestPasswordReset = useCallback<AuthContextValue['requestPasswordReset']>(
    async (email) => {
      const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      // Account existence is never revealed: rate limiting and transport
      // problems are the only failures surfaced to the user.
      if (error && /rate limit|too many requests|over_email_send/i.test(error.message)) {
        return { ok: false, message: friendlyAuthError(error, 'Too many attempts. Try again shortly.') }
      }
      return {
        ok: true,
        message: 'If an account exists for that address, a password reset email is on its way.',
      }
    },
    [],
  )

  const updatePassword = useCallback<AuthContextValue['updatePassword']>(async (password) => {
    const { error } = await supabase!.auth.updateUser({ password })
    if (error) {
      return {
        ok: false,
        message: friendlyAuthError(error, 'We could not update your password. Please try again.'),
      }
    }
    setRecoveryMode(false)
    return { ok: true, message: 'Your password has been updated.' }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: (session?.user as AuthUser | undefined) ?? null,
      initialising,
      recoveryMode,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
    }),
    [session, initialising, recoveryMode, signIn, signUp, signOut, requestPasswordReset, updatePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return supabase ? (
    <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
  ) : (
    <LocalAuthProvider>{children}</LocalAuthProvider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
