import { useEffect, useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { Alert } from '../components/Alert'
import { Field } from '../components/Field'
import { Spinner } from '../components/States'
import { useAuth } from '../lib/auth'
import { Link } from '../lib/router'
import { isValidEmail } from '../lib/password'
import { useToast } from '../components/Toast'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const { notify } = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    document.title = 'Reset your password · Phikila School System'
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    if (!email.trim()) {
      setError('Enter your email address.')
      return
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid email address, for example name@school.org.')
      return
    }
    setError(null)
    setFormError(null)
    setSubmitting(true)
    const result = await requestPasswordReset(email)
    setSubmitting(false)

    if (!result.ok) {
      setFormError(result.message)
      return
    }
    setSent(true)
    notify('Password reset email requested.', 'success')
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a secure link to choose a new password."
      footer={
        <p className="auth-shell__footer-text">
          Remembered it? <Link to="/login">Back to sign in</Link>
        </p>
      }
    >
      {sent ? (
        <>
          <Alert tone="success" title="Check your email">
            If an account exists for <strong>{email.trim()}</strong>, a password reset link is on its
            way. The link expires after a short time, so use it soon.
          </Alert>
          <Link className="button button--primary button--block" to="/login">
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          {formError && (
            <Alert tone="error" title="We could not send the email">
              {formError}
            </Alert>
          )}
          <form className="form" onSubmit={handleSubmit} noValidate>
            <Field
              label="Email address"
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              placeholder="name@school.org"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
              error={error}
            />
            <button
              className="button button--primary button--block"
              type="submit"
              disabled={submitting}
            >
              {submitting && <Spinner label="Sending reset email" />}
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
