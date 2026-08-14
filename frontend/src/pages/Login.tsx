import { type FormEvent, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export default function Login() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state?.from?.pathname as string) || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    if (session) navigate(from, { replace: true })
  }, [session, navigate, from])

  useEffect(() => {
    api.health()
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'))
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setSubmitting(true)
    const result = await signIn(email, password)
    setSubmitting(false)
    if (result.error) {
      setMessage(result.error)
    } else {
      navigate(from, { replace: true })
    }
  }

  return (
    <main className="page-shell">
      <section className="brand-panel">
        <div className="brand-mark" aria-hidden="true">P</div>
        <p className="eyebrow">School administration, made clear</p>
        <h1>Phikila<br />School System</h1>
        <p className="intro">
          One secure place for your school profile, academic years, terms, levels, and streams.
        </p>
        <div className="connection-card">
          <span className={`status-dot ${apiStatus}`} />
          <div>
            <strong>System connection</strong>
            <span>{apiStatus === 'checking' ? 'Checking API…' : `API ${apiStatus}`}</span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <form onSubmit={handleSubmit}>
            <p className="eyebrow">Staff portal</p>
            <h2>Sign in to continue</h2>
            <p className="muted">Use the account created in Supabase Authentication.</p>

            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@school.org"
              autoComplete="email"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
        </div>
        <p className="security-note">Protected by Supabase Auth and encrypted connections.</p>
      </section>
    </main>
  )
}
