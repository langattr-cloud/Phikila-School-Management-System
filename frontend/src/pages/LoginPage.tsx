import { useEffect, useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { Alert } from '../components/Alert'
import { Field, PasswordField } from '../components/Field'
import { Spinner } from '../components/States'
import { useAuth } from '../lib/auth'
import { Link, useNavigate, useSearchParams } from '../lib/router'
import { isValidEmail } from '../lib/password'
import { useToast } from '../components/Toast'

type Errors = { email?: string; password?: string }

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const params = useSearchParams()
  const { notify } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const notice = params.get('notice')
  const nextPath = params.get('next') || '/dashboard'

  useEffect(() => {
    document.title = 'Sign in · Phikila School System'
  }, [])

  function validate(): Errors {
    const next: Errors = {}
    if (!email.trim()) next.email = 'Enter your email address.'
    else if (!isValidEmail(email)) next.email = 'Enter a valid email address, for example name@school.org.'
    if (!password) next.password = 'Enter your password.'
    return next
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const nextErrors = validate()
    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    const result = await signIn(email, password)
    setSubmitting(false)

    if (!result.ok) {
      setFormError(result.message)
      return
    }
    navigate(nextPath.startsWith('/') ? nextPath : '/dashboard', { replace: true })
    notify('Signed in successfully.', 'success')
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use your school staff account to continue."
      footer={
        <p className="auth-shell__footer-text">
          New to Phikila? <Link to="/signup">Create an account</Link>
        </p>
      }
    >
      {notice === 'signed-out' && <Alert tone="info">You have been signed out. Sign in again to continue.</Alert>}
      {notice === 'session-expired' && <Alert tone="info">Your session expired for security. Please sign in again.</Alert>}
      {notice === 'password-updated' && <Alert tone="success">Your password was updated. Sign in with your new password.</Alert>}
      {notice === 'check-email' && <Alert tone="info" title="Confirm your email">We sent you a confirmation link. Open it, then sign in here.</Alert>}
      {formError && <Alert tone="error" title="We could not sign you in">{formError}</Alert>}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <Field label="Email address" type="email" name="email" inputMode="email" autoComplete="email" placeholder="name@school.org" value={email} required onChange={(event) => setEmail(event.target.value)} onBlur={() => setErrors((current) => ({ ...current, email: validate().email }))} error={errors.email} />
        <PasswordField label="Password" name="password" autoComplete="current-password" placeholder="Your password" value={password} required onChange={(event) => setPassword(event.target.value)} error={errors.password} />
        <div className="form__row form__row--between"><Link className="link" to="/forgot-password">Forgot your password?</Link></div>
        <button className="button button--primary button--block" type="submit" disabled={submitting}>
          {submitting && <Spinner label="Signing in" />}
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}