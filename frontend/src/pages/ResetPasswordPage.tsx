import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { Alert } from '../components/Alert'
import { PasswordField } from '../components/Field'
import { Spinner } from '../components/States'
import { useAuth } from '../lib/auth'
import { Link, useNavigate } from '../lib/router'
import { assessPassword, MINIMUM_PASSWORD_LENGTH } from '../lib/password'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

export function ResetPasswordPage() {
  const { session, initialising, updatePassword } = useAuth()
  const navigate = useNavigate()
  const { notify } = useToast()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const strength = useMemo(() => assessPassword(password), [password])

  useEffect(() => {
    document.title = 'Choose a new password · Phikila School System'
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const next: typeof errors = {}
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      next.password = `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`
    }
    if (confirmPassword !== password) next.confirmPassword = 'Both passwords must match.'
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    const result = await updatePassword(password)

    if (!result.ok) {
      setSubmitting(false)
      setFormError(result.message)
      return
    }

    // Force a fresh sign-in with the new password.
    await supabase?.auth.signOut()
    setSubmitting(false)
    notify('Password updated. Sign in with your new password.', 'success')
    navigate('/login?notice=password-updated', { replace: true })
  }

  if (initialising) {
    return (
      <AuthLayout title="Choose a new password" subtitle="Checking your reset link…">
        <div className="form" aria-busy="true">
          <Spinner label="Checking your reset link" />
        </div>
      </AuthLayout>
    )
  }

  // Supabase exchanges the emailed link for a temporary session. No session
  // means the link is missing, already used, or expired.
  if (!session) {
    return (
      <AuthLayout
        title="Reset link not valid"
        subtitle="This password reset link cannot be used."
        footer={
          <p className="auth-shell__footer-text">
            Need help? <Link to="/login">Back to sign in</Link>
          </p>
        }
      >
        <Alert tone="error" title="Link expired or already used">
          Password reset links can only be used once and expire after a short time. Request a new
          one to continue.
        </Alert>
        <Link className="button button--primary button--block" to="/forgot-password">
          Request a new link
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Set a new password for your account.">
      {formError && (
        <Alert tone="error" title="We could not update your password">
          {formError}
        </Alert>
      )}
      <form className="form" onSubmit={handleSubmit} noValidate>
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          value={password}
          required
          hint={`At least ${MINIMUM_PASSWORD_LENGTH} characters.`}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          footer={
            password ? (
              <p className="strength__text" role="status">
                Password strength: <strong>{strength.label}</strong>
              </p>
            ) : null
          }
        />
        <PasswordField
          label="Confirm new password"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          required
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
        />
        <button className="button button--primary button--block" type="submit" disabled={submitting}>
          {submitting && <Spinner label="Updating password" />}
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  )
}
