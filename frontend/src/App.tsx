import { type FormEvent, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './lib/api'
import { supabase } from './lib/supabase'

type ApiStatus = 'checking' | 'online' | 'offline'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const queryClient = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
      if (!nextSession) {
        queryClient.clear()
      }
    })

    return () => data.subscription.unsubscribe()
  }, [queryClient])

  // Health check via TanStack Query — refetches on focus, caches for 30s
  const { data: healthData, error: healthError } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.health(),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: 1,
  })

  useEffect(() => {
    if (healthData) setApiStatus('online')
    if (healthError) setApiStatus('offline')
  }, [healthData, healthError])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setSubmitting(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) setMessage(error.message)
  }

  async function verifyApiIdentity() {
    setMessage('Contacting the API…')
    try {
      const identity = await api.me()
      setMessage(`API verified ${identity.email ?? identity.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not verify your session')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setMessage('')
  }

  return (
    <main className="page-shell">
      <section className="brand-panel">
        <div className="brand-mark" aria-hidden="true">
          P
        </div>
        <p className="eyebrow">School administration, made clear</p>
        <h1>
          Phikila
          <br />
          School System
        </h1>
        <p className="intro">
          One secure place for your school profile, academic years, terms, levels, and
          streams.
        </p>
        <div className="connection-card">
          <span className={`status-dot ${apiStatus}`} />
          <div>
            <strong>System connection</strong>
            <span>
              {apiStatus === 'checking' ? 'Checking API…' : `API ${apiStatus}`}
            </span>
            {healthData && healthData.database && (
              <span className="db-status">DB: {healthData.database}</span>
            )}
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          {authLoading ? (
            <p className="loading">Restoring your session…</p>
          ) : session ? (
            <div className="signed-in">
              <p className="eyebrow">Welcome back</p>
              <h2>You’re signed in</h2>
              <p className="muted">{session.user.email}</p>
              <button className="primary" type="button" onClick={verifyApiIdentity}>
                Verify backend connection
              </button>
              <button className="text-button" type="button" onClick={signOut}>
                Sign out
              </button>
              {message && <p className="message" role="status">{message}</p>}
            </div>
          ) : (
            <form onSubmit={signIn}>
              <p className="eyebrow">Staff portal</p>
              <h2>Sign in to continue</h2>
              <p className="muted">
                Use the account created in Supabase Authentication.
              </p>

              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@school.org"
                autoComplete="email"
                required
              />

              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                minLength={6}
                required
              />

              <button className="primary" type="submit" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
              {message && <p className="message error" role="alert">{message}</p>}
            </form>
          )}
        </div>
        <p className="security-note">
          Protected by Supabase Auth and encrypted connections.
        </p>
      </section>
    </main>
  )
}

export default App
