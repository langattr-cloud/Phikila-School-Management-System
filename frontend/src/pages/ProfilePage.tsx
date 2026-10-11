import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, ErrorState, LoadingBlock, Spinner } from '../components/States'
import { PasswordField } from '../components/Field'
import { api, friendlyApiError, type Identity } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { displayName, useAuth } from '../lib/auth'
import { assessPassword, MINIMUM_PASSWORD_LENGTH } from '../lib/password'
import { useToast } from '../components/Toast'

export function ProfilePage() {
  const { user, updatePassword } = useAuth()
  const { notify } = useToast()
  const toMessage = useCallback((error: unknown) => friendlyApiError(error, 'load your profile'), [])
  const { data, loading, error, reload } = useAsync<Identity>(api.me, toMessage)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const strength = useMemo(() => assessPassword(password), [password])

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingPassword) return
    const nextPasswordError = password.length < MINIMUM_PASSWORD_LENGTH
      ? `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`
      : null
    const nextConfirmError = confirmPassword !== password ? 'Both passwords must match.' : null
    setPasswordError(nextPasswordError)
    setConfirmError(nextConfirmError)
    if (nextPasswordError || nextConfirmError) return

    setSavingPassword(true)
    const result = await updatePassword(password)
    setSavingPassword(false)
    if (!result.ok) {
      setPasswordError(result.message)
      return
    }
    setPassword('')
    setConfirmPassword('')
    setPasswordError(null)
    setConfirmError(null)
    notify('Password changed. Use the new password next time you sign in.', 'success')
  }

  return (
    <>
      <PageHeader
        title="My profile"
        description="Manage your account details and password."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'My profile' }]}
      />

      <section className="card section">
        <h2 className="section__title">Account</h2>
        <dl className="detail-list detail-list--two">
          <div>
            <dt>Name</dt>
            <dd>{displayName(user)}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email ?? 'Not available'}</dd>
          </div>
        </dl>
      </section>

      <section className="card section">
        <h2 className="section__title">Change password</h2>
        <p className="form__hint">
          Set a password you choose. No email link is needed while you are signed in.
        </p>
        {passwordError && <Alert tone="error" title="Password not changed">{passwordError}</Alert>}
        <form className="form form--grid" onSubmit={changePassword} noValidate>
          <PasswordField
            label="New password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            required
            hint={`At least ${MINIMUM_PASSWORD_LENGTH} characters.`}
            onChange={event => setPassword(event.target.value)}
            error={passwordError}
            footer={password ? <p className="strength__text" role="status">Password strength: <strong>{strength.label}</strong></p> : null}
          />
          <PasswordField
            label="Confirm new password"
            name="confirm-new-password"
            autoComplete="new-password"
            value={confirmPassword}
            required
            onChange={event => setConfirmPassword(event.target.value)}
            error={confirmError}
          />
          <div className="form__row form--grid__full">
            <button className="button button--primary" type="submit" disabled={savingPassword}>
              {savingPassword && <Spinner label="Changing password" />}
              {savingPassword ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>

      <section className="card section">
        <h2 className="section__title">Backend verification</h2>
        {loading ? (
          <LoadingBlock label="Verifying your account with the API" rows={2} />
        ) : error ? (
          <ErrorState title="Could not verify your account" message={error} onRetry={reload} />
        ) : data ? (
          <dl className="detail-list detail-list--two">
            <div>
              <dt>Verified email</dt>
              <dd>{data.email ?? 'Not available'}</dd>
            </div>
            <div>
              <dt>Access level</dt>
              <dd>
                <Badge tone="success">{data.role || 'authenticated'}</Badge>
              </dd>
            </div>
            <div className="detail-list__full">
              <dt>Permissions</dt>
              <dd>
                School permissions are assigned by an administrator and enforced by the backend on
                every request.
              </dd>
            </div>
          </dl>
        ) : null}
      </section>
    </>
  )
}
