import { useEffect, useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { Alert } from '../components/Alert'
import { Field } from '../components/Field'
import { Spinner } from '../components/States'
import { useAuth, displayName } from '../lib/auth'
import { usePlatformSession } from '../lib/session'
import { platform } from '../lib/platform'
import { friendlyApiError } from '../lib/api'
import { useToast } from '../components/Toast'

const ROLE_LABELS: Record<string, string> = {
  admin: 'School administrator',
  scheduler: 'Timetable scheduler',
  teacher: 'Teacher',
  student: 'Student',
  viewer: 'Viewer (read only)',
}

/**
 * Shown to a signed-in account that has not yet been granted access.
 *
 * The form only *records a request*. Nothing here grants a permission — a
 * platform administrator reviews and decides, and the backend refuses every
 * school endpoint until they do.
 */
export function AwaitingApprovalPage() {
  const { user, signOut } = useAuth()
  const { session, reload } = usePlatformSession()
  const { notify } = useToast()

  const [options, setOptions] = useState<{
    schools: { id: number; name: string }[]
    roles: string[]
  } | null>(null)
  const [role, setRole] = useState('teacher')
  const [schoolId, setSchoolId] = useState<string>('')
  const [schoolName, setSchoolName] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Access pending · Phikila School System'
    platform
      .requestOptions()
      .then((data) => {
        setOptions(data)
        // Prefill from the metadata captured at signup, if present.
        const meta = user?.user_metadata as Record<string, unknown> | undefined
        if (typeof meta?.requested_role === 'string') setRole(meta.requested_role)
        if (typeof meta?.requested_school_id === 'number') {
          setSchoolId(String(meta.requested_school_id))
        }
        if (typeof meta?.requested_school_name === 'string') {
          setSchoolName(meta.requested_school_name)
        }
      })
      .catch(() => setOptions({ schools: [], roles: ['teacher'] }))
  }, [user])

  const request = session?.access_request

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return

    const next: Record<string, string> = {}
    if (!schoolId && !schoolName.trim()) {
      next.school = 'Choose your school, or type its name if it is not listed.'
    }
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return

    setSubmitting(true)
    try {
      await platform.submitRequest({
        requested_role: role,
        school_id: schoolId ? Number(schoolId) : null,
        school_name: schoolId ? null : schoolName.trim(),
        note: note.trim() || null,
      })
      notify('Request sent for approval.', 'success')
      reload()
    } catch (err) {
      setFormError(friendlyApiError(err, 'send your access request'))
    } finally {
      setSubmitting(false)
    }
  }

  // Already submitted — show status instead of the form.
  if (request && request.status === 'pending') {
    return (
      <AuthLayout
        title="Awaiting approval"
        subtitle={`Signed in as ${displayName(user)}.`}
        footer={
          <button type="button" className="link" onClick={() => signOut()}>
            Sign out
          </button>
        }
      >
        <Alert tone="info" title="Your request is with an administrator">
          You asked to join <strong>{request.requested_school_name ?? 'a school'}</strong> as{' '}
          <strong>{ROLE_LABELS[request.requested_role] ?? request.requested_role}</strong>. A
          platform administrator will review it. You will get access as soon as it is approved.
        </Alert>
        <button type="button" className="button button--secondary button--block" onClick={reload}>
          Check again
        </button>
      </AuthLayout>
    )
  }

  if (request && request.status === 'rejected') {
    return (
      <AuthLayout
        title="Request not approved"
        subtitle={`Signed in as ${displayName(user)}.`}
        footer={
          <button type="button" className="link" onClick={() => signOut()}>
            Sign out
          </button>
        }
      >
        <Alert tone="error" title="Your access request was declined">
          {request.decision_note ||
            'An administrator declined this request. Contact your school if you think this is a mistake.'}
        </Alert>
        <p className="form__note">You can submit a corrected request below.</p>
        <RequestForm />
      </AuthLayout>
    )
  }

  function RequestForm() {
    return (
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="req-role">
            What is your role? <span className="field__required">(required)</span>
          </label>
          <p className="field__hint" id="req-role-hint">
            This is a request. An administrator confirms what access you actually receive.
          </p>
          <select
            id="req-role"
            className="input input--select"
            value={role}
            aria-describedby="req-role-hint"
            onChange={(event) => setRole(event.target.value)}
          >
            {(options?.roles ?? ['teacher']).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="req-school">
            Your school <span className="field__required">(required)</span>
          </label>
          <select
            id="req-school"
            className="input input--select"
            value={schoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            aria-invalid={errors.school ? true : undefined}
          >
            <option value="">Not listed — I will type the name</option>
            {(options?.schools ?? []).map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>

        {!schoolId && (
          <Field
            label="School name"
            required
            placeholder="e.g. Phikila Academy"
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            error={errors.school}
          />
        )}

        <Field
          label="Anything else the administrator should know"
          placeholder="e.g. I teach Form 3 Mathematics"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        <button className="button button--primary button--block" type="submit" disabled={submitting}>
          {submitting && <Spinner label="Sending request" />}
          {submitting ? 'Sending…' : 'Request access'}
        </button>
      </form>
    )
  }

  return (
    <AuthLayout
      title="Request access"
      subtitle={`Signed in as ${displayName(user)}. Your account needs approval before you can continue.`}
      footer={
        <button type="button" className="link" onClick={() => signOut()}>
          Sign out
        </button>
      }
    >
      {formError && (
        <Alert tone="error" title="We could not send your request">
          {formError}
        </Alert>
      )}
      <Alert tone="info" title="Accounts start with no access">
        Tell us which school you belong to and what you do there. A platform administrator
        reviews every request before any access is granted.
      </Alert>
      <RequestForm />
    </AuthLayout>
  )
}
