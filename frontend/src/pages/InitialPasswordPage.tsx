import { useMemo, useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { Alert } from '../components/Alert'
import { PasswordField } from '../components/Field'
import { Spinner } from '../components/States'
import { useAuth } from '../lib/auth'
import { apiFetch } from '../lib/api'
import { useNavigate } from '../lib/router'
import { assessPassword, MINIMUM_PASSWORD_LENGTH } from '../lib/password'

export function InitialPasswordPage() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const strength = useMemo(() => assessPassword(password), [password])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setError(`Use at least ${MINIMUM_PASSWORD_LENGTH} characters for your personal password.`)
      return
    }
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/v1/auth/complete-initial-password', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      await signOut()
      navigate('/login?notice=password-updated', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Password setup failed. Try again.')
      setSaving(false)
    }
  }

  return (
    <AuthLayout title="Set your personal password" subtitle="Your initial phone-number password is temporary. Create a personal password to unlock your school account.">
      <Alert tone="info" title="One-time setup required">School features remain locked until you finish this step. Your school access has already been granted.</Alert>
      {error && <Alert tone="error" title="Password not updated">{error}</Alert>}
      <form className="form" onSubmit={submit} noValidate>
        <PasswordField label="New personal password" name="password" autoComplete="new-password" value={password} required hint={`At least ${MINIMUM_PASSWORD_LENGTH} characters.`} onChange={event => setPassword(event.target.value)} footer={password ? <p className="strength__text" role="status">Password strength: <strong>{strength.label}</strong></p> : null} />
        <PasswordField label="Confirm personal password" name="confirmation" autoComplete="new-password" value={confirmation} required onChange={event => setConfirmation(event.target.value)} />
        <button className="button button--primary button--block" type="submit" disabled={saving}>
          {saving && <Spinner label="Saving password" />}
          {saving ? 'Saving…' : 'Save password and continue'}
        </button>
      </form>
    </AuthLayout>
  )
}
