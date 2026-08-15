import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { Alert } from '../components/Alert'
import { Field, PasswordField } from '../components/Field'
import { Spinner } from '../components/States'
import { useAuth } from '../lib/auth'
import { Link, useNavigate } from '../lib/router'
import { assessPassword, isValidEmail, MINIMUM_PASSWORD_LENGTH } from '../lib/password'
import { platform } from '../lib/platform'

const ROLE_LABELS: Record<string, string> = {
  admin: 'School administrator',
  scheduler: 'Timetable scheduler',
  teacher: 'Teacher',
  student: 'Student',
  viewer: 'Viewer (read only)',
}

type Errors = {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
  school?: string
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

  // What the applicant asks for. The server treats it as a request only.
  const [role, setRole] = useState('teacher')
  const [schoolId, setSchoolId] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [options, setOptions] = useState<{
    schools: { id: number; name: string }[]
    roles: string[]
  }>({ schools: [], roles: ['teacher'] })

  useEffect(() => {
    // Public list of school names so an applicant can pick theirs. It exposes
    // no school data beyond the name.
    platform
      .requestOptions()
      .then(setOptions)
      .catch(() => setOptions({ schools: [], roles: Object.keys(ROLE_LABELS) }))
  }, [])

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

    if (!schoolId && !schoolName.trim()) {
      next.school = 'Choose your school, or type its name if it is not listed.'
    }

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
    const result = await signUp(fullName, email, password, {
      requested_role: role,
      school_id: schoolId ? Number(schoolId) : null,
      school_name: schoolId ? null : schoolName.trim(),
    })
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
        <Alert tone="info" title="Your request is awaiting approval">
          You asked to join{' '}
          <strong>
            {schoolId
              ? (options.schools.find((s) => String(s.id) === schoolId)?.name ?? 'your school')
              : schoolName.trim()}
          </strong>{' '}
          as <strong>{ROLE_LABELS[role] ?? role}</strong>. A platform administrator will review it
          before any access is granted.
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
      subtitle="Set up your secure account, then request access to your school workspace."
      wide
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

      <form className="form auth-signup-form" onSubmit={handleSubmit} noValidate>
        <section className="auth-form-section" aria-labelledby="account-details-heading">
          <header className="auth-form-section__header">
            <span>01</span>
            <div><h3 id="account-details-heading">Account details</h3><p>Tell us who will use this account.</p></div>
          </header>
          <div className="auth-form-grid auth-form-grid--two">
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

          </div>
        </section>

        <section className="auth-form-section" aria-labelledby="account-security-heading">
          <header className="auth-form-section__header">
            <span>02</span>
            <div><h3 id="account-security-heading">Secure your account</h3><p>Choose a strong password only you know.</p></div>
          </header>
          <div className="auth-form-grid auth-form-grid--two">
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

          </div>
        </section>

        <section className="auth-form-section" aria-labelledby="access-request-heading">
          <header className="auth-form-section__header">
            <span>03</span>
            <div><h3 id="access-request-heading">Access request</h3><p>Choose the school and role you need.</p></div>
          </header>
          <div className="auth-form-grid auth-form-grid--two">
            <div className="field">
          <label className="field__label" htmlFor="signup-role">
            Your role <span className="field__required">(required)</span>
          </label>
          <p className="field__hint" id="signup-role-hint">
            This is what you are requesting. An administrator confirms your actual access.
          </p>
          <select
            id="signup-role"
            className="input input--select"
            value={role}
            aria-describedby="signup-role-hint"
            onChange={(event) => setRole(event.target.value)}
          >
            {(options.roles.length ? options.roles : Object.keys(ROLE_LABELS)).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="signup-school">
            Your school <span className="field__required">(required)</span>
          </label>
          <select
            id="signup-school"
            className="input input--select"
            value={schoolId}
            onChange={(event) => {
              setSchoolId(event.target.value)
              setErrors((current) => ({ ...current, school: undefined }))
            }}
          >
            <option value="">Not listed — I will type the name</option>
            {options.schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
            </div>
          </div>

          {!schoolId && (
            <Field
            className="auth-form-section__school-name"
            label="School name"
            required
            placeholder="e.g. Phikila Academy"
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            error={errors.school}
          />
        )}

          <p className="form__note auth-form-section__note">
            Accounts start with no access. A platform administrator reviews every request and
            decides what access you receive.
          </p>
        </section>

        <button className="button button--primary button--block" type="submit" disabled={submitting}>
          {submitting && <Spinner label="Creating your account" />}
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
