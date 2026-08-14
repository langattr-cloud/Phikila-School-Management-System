import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { Alert } from '../components/Alert'
import { Field, PasswordField } from '../components/Field'
import { Spinner } from '../components/States'
import { useAuth } from '../lib/auth'
import { Link, useNavigate } from '../lib/router'
import { assessPassword, isValidEmail, MINIMUM_PASSWORD_LENGTH } from '../lib/password'

type Errors = {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

function StrengthMeter({ password, describedById }: { password: string; describedById: string }) {
  const strength = useMemo(() => assessPassword(password), [password])
  if (!password) return null

  return (
    <div className="strength" id={describedById}>
      <div className="strength__track" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`strength__segment ${step <= strength.score ? `strength__segment--${strength.score}` : ''}`}
          />
        ))}
      </div>
      <p className="strength__text" role="status">
        Password strength: <strong>{strength.label}</strong>
        {strength.suggestions.length > 0 && ` — to improve it, ${strength.suggestions.join(', ')}.`}
      </p>
    </div>
  )
}

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ needsEmailConfirmation: boolean } | null>(null)

  useEffect(() => {
    document.title = 'Create an account · Phikila School System'
  }, [])

  function validate(): Errors {
    const next: Errors = {}
    if (!fullName.trim()) next.fullName = 'Enter your full name.'
    else if (fullName.trim().length < 2) next.fullName = 'Your name must be at least 2 characters.'

    if (!email.trim()) next.email = 'Enter your email address.'
    else if (!isValidEmail(email)) next.email = 'Enter a valid email address, for example name@school.org.'

    if (!password) next.password = 'Choose a password.'
    else if (password.length < MINIMUM_PASSWORD_LENGTH) {
      next.password = `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`
    }

    if (!confirmPassword) next.confirmPassword = 'Re-enter your password.'
    else if (confirmPassword !== password) next.confirmPassword = 'Both passwords must match.'

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
    const result = await signUp(fullName, email, password)
    setSubmitting(false)

    if (!result.ok) {
      setFormError(result.message)
      return
    }

    if (result.needsEmailConfirmation) {
      setSuccess({ needsEmailConfirmation: true })
      return
    }
    // Session already active: Supabase created and signed in the user.
    navigate('/', { replace: true })
  }

  if (success) {
    return (
      <AuthLayout
        title="Account created"
        subtitle="One more step before you can sign in."
        footer={
          <p className="auth-shell__footer-text">
            Already confirmed? <Link to="/login">Go to sign in</Link>
          </p>
        }
      >
        <Alert tone="success" title="Check your email">
          We sent a confirmation link to <strong>{email.trim()}</strong>. Open it to activate your
          account, then sign in.
        </Alert>
        <Alert tone="info" title="Access to school records">
          New accounts start with no school permissions. A school administrator assigns your role
          before you can view or change school data.
        </Alert>
        <Link className="button button--primary button--block" to="/login">
          Go to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Register with your school email address."
      footer={
        <p className="auth-shell__footer-text">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      {formError && (
        <Alert tone="error" title="We could not create your account">
          {formError}
        </Alert>
      )}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <Field
          label="Full name"
          name="fullName"
          autoComplete="name"
          placeholder="Jane Wanjiru"
          value={fullName}
          required
          onChange={(event) => setFullName(event.target.value)}
          onBlur={() => setErrors((current) => ({ ...current, fullName: validate().fullName }))}
          error={errors.fullName}
        />

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
          onBlur={() => setErrors((current) => ({ ...current, email: validate().email }))}
          error={errors.email}
        />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          value={password}
          required
          hint={`At least ${MINIMUM_PASSWORD_LENGTH} characters. A longer passphrase is stronger than a short complex one.`}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          footer={<StrengthMeter password={password} describedById="signup-password-strength" />}
        />

        <PasswordField
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          required
          onChange={(event) => setConfirmPassword(event.target.value)}
          onBlur={() =>
            setErrors((current) => ({ ...current, confirmPassword: validate().confirmPassword }))
          }
          error={errors.confirmPassword}
        />

        <p className="form__note">
          Accounts are created without school permissions. An administrator assigns your role after
          you register.
        </p>

        <button className="button button--primary button--block" type="submit" disabled={submitting}>
          {submitting && <Spinner label="Creating your account" />}
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
