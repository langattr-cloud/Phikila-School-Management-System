import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState, LoadingBlock, Skeleton } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { Field } from '../components/Field'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DashboardIcon, InboxIcon, LayersIcon, SchoolIcon, SearchIcon, UserIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { Link, useNavigate, useSearchParams } from '../lib/router'
import { friendlyApiError } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import {
  platform,
  type AccessRequest,
  type PlatformAdmin,
  type PlatformOverview,
  type School,
  type SchoolUser,
} from '../lib/platform'

const ROLE_LABELS: Record<string, string> = {
  admin: 'School administrator',
  scheduler: 'Scheduler',
  teacher: 'Teacher',
  student: 'Student',
  viewer: 'Viewer',
}

/* ======================================================= platform dashboard */
export function PlatformDashboardPage() {
  const toMessage = useCallback(
    (error: unknown) => friendlyApiError(error, 'load the platform dashboard'),
    [],
  )
  const { data, loading, error, reload } = useAsync<PlatformOverview>(platform.overview, toMessage)

  const cards = [
    { label: 'Schools', value: data?.schools ?? 0, detail: 'Registered institutions', to: '/platform/schools', icon: <SchoolIcon /> },
    { label: 'Users with access', value: data?.users ?? 0, detail: 'Approved platform users', to: '/platform/schools', icon: <UserIcon /> },
    { label: 'Teachers', value: data?.teachers ?? 0, detail: 'Across all schools', to: '/platform/schools', icon: <UserIcon /> },
    { label: 'Classes', value: data?.classes ?? 0, detail: 'Active teaching groups', to: '/platform/schools', icon: <LayersIcon /> },
    {
      label: 'Pending requests',
      value: data?.pending_requests ?? 0,
      detail: 'Awaiting a decision',
      to: '/platform/requests',
      icon: <InboxIcon />,
      highlight: (data?.pending_requests ?? 0) > 0,
    },
    { label: 'Platform admins', value: data?.super_admins ?? 0, detail: 'Deployment administrators', to: '/platform/admins', icon: <DashboardIcon /> },
  ]

  return (
    <div className="dashboard-page platform-dashboard">
      <PageHeader
        title="Platform dashboard"
        description="A clear operational view across every school on this deployment."
        breadcrumbs={[{ label: 'Platform' }, { label: 'Dashboard' }]}
        actions={
          <Link className="button button--primary button--sm" to="/platform/schools">
            Manage schools
          </Link>
        }
      />

      {error ? (
        <ErrorState title="Dashboard could not load" message={error} onRetry={reload} />
      ) : (
        <>
          {(data?.pending_requests ?? 0) > 0 && (
            <Alert tone="info" title="Accounts are waiting for approval">
              {data!.pending_requests} {data!.pending_requests === 1 ? 'person has' : 'people have'}{' '}
              requested access. <Link to="/platform/requests">Review requests</Link>.
            </Alert>
          )}

          <ul className="summary-grid">
            {cards.map((card) => (
              <li className="summary-card" key={card.label}>
                <Link className="summary-card__link" to={card.to}>
                  <span className="summary-card__icon" aria-hidden="true">{card.icon}</span>
                  <span className="summary-card__label">{card.label}</span>
                  <span
                    className={`summary-card__value ${card.highlight ? 'summary-card__value--warning' : ''}`}
                  >
                    {loading ? <Skeleton width="3rem" height="1.6rem" /> : card.value}
                  </span>
                  <span className="summary-card__detail">{card.detail}</span>
                </Link>
              </li>
            ))}
          </ul>

          <section className="card section dashboard-panel platform-dashboard__activity">
            <div className="dashboard-section__head">
              <div><p>Deployment activity</p><h2 className="section__title">Recent platform activity</h2></div>
              <span>Latest changes</span>
            </div>
            {loading ? (
              <LoadingBlock label="Loading recent activity" rows={3} />
            ) : (data?.recent.length ?? 0) === 0 ? (
              <EmptyState
                title="Nothing yet"
                description="School and administrator changes will be recorded here."
              />
            ) : (
              <ul className="activity-list">
                {data!.recent.map((entry, index) => (
                  <li className="activity" key={index}>
                    <span className="activity__dot" aria-hidden="true" />
                    <div>
                      <p className="activity__summary">{entry.summary}</p>
                      <p className="activity__meta">
                        {entry.actor ?? 'system'}
                        {entry.at ? ` · ${new Date(entry.at).toLocaleString()}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/* ============================================================ schools list */
export function PlatformSchoolsPage() {
  const { notify } = useToast()
  const navigate = useNavigate()
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<School | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSchools(await platform.schools(search || undefined, status))
    } catch (err) {
      setError(friendlyApiError(err, 'load schools'))
    } finally {
      setLoading(false)
    }
  }, [search, status])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleStatus(school: School) {
    try {
      await platform.setSchoolStatus(school.id, school.status !== 'active')
      notify(
        school.status === 'active' ? 'School deactivated.' : 'School activated.',
        'success',
      )
      setConfirm(null)
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'change the school status'), 'error')
    }
  }

  const columns: Column<School>[] = [
    { key: 'name', header: 'School', render: (row) => row.name },
    { key: 'slug', header: 'Code', render: (row) => row.slug },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.status === 'active' ? 'success' : 'warning'}>
          {row.status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    { key: 'users', header: 'Users', render: (row) => row.users },
    { key: 'teachers', header: 'Teachers', render: (row) => row.teachers },
    { key: 'classes', header: 'Classes', render: (row) => row.classes },
  ]

  return (
    <>
      <PageHeader
        title="Schools"
        description="Every school on the platform."
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Schools' }]}
        actions={
          <button
            type="button"
            className="button button--primary button--sm"
            onClick={() => setCreating(true)}
          >
            Add school
          </button>
        }
      />

      {creating && (
        <CreateSchoolForm
          onCancel={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false)
            await load()
          }}
        />
      )}

      {error ? (
        <ErrorState title="Schools could not load" message={error} onRetry={load} />
      ) : (
        <section className="card section">
          <div className="toolbar">
            <div className="search">
              <SearchIcon className="search__icon" width={18} height={18} />
              <label className="visually-hidden" htmlFor="school-search">
                Search schools
              </label>
              <input
                id="school-search"
                className="input input--search"
                type="search"
                placeholder="Search schools"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="field field--inline">
              <label className="field__label" htmlFor="school-status">
                Status
              </label>
              <select
                id="school-status"
                className="input input--select"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <DataTable
            caption="Schools"
            columns={columns}
            rows={schools}
            rowKey={(row) => row.id}
            loading={loading}
            loadingLabel="Loading schools"
            empty={
              <EmptyState
                title={search ? 'No matching schools' : 'No schools yet'}
                description={
                  search
                    ? 'Nothing matches your search.'
                    : 'Create the first school to start using the platform.'
                }
                icon={<SchoolIcon width={22} height={22} />}
                action={
                  !search ? (
                    <button
                      type="button"
                      className="button button--primary button--sm"
                      onClick={() => setCreating(true)}
                    >
                      Add school
                    </button>
                  ) : undefined
                }
              />
            }
            rowActions={(row) => (
              <>
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  onClick={() => navigate(`/platform/schools/detail?id=${row.id}`)}
                >
                  View
                </button>
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  onClick={() =>
                    row.status === 'active' ? setConfirm(row) : toggleStatus(row)
                  }
                >
                  {row.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </>
            )}
          />
        </section>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={`Deactivate ${confirm?.name ?? 'this school'}?`}
        description="This prevents its users from accessing the application. All existing data is retained and the school can be reactivated at any time."
        confirmLabel="Deactivate school"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && toggleStatus(confirm)}
      />
    </>
  )
}

function CreateSchoolForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => void
}) {
  const { notify } = useToast()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const next: Record<string, string> = {}
    if (name.trim().length < 3) next.name = 'Enter the full school name (3 characters or more).'
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug.trim().toLowerCase())) {
      next.slug = 'Use lowercase letters, numbers and hyphens only.'
    }
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      await platform.createSchool({ name: name.trim(), slug: slug.trim().toLowerCase() })
      notify('School created.', 'success')
      onCreated()
    } catch (err) {
      setFormError(friendlyApiError(err, 'create the school'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card section">
      <h2 className="section__title">New school</h2>
      {formError && <Alert tone="error">{formError}</Alert>}
      <form className="form form--grid" onSubmit={submit} noValidate>
        <Field
          label="School name"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (!slug) {
              setSlug(
                event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
              )
            }
          }}
          error={errors.name}
        />
        <Field
          label="School code"
          required
          hint="A short unique identifier used in URLs, e.g. phikila-academy."
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          error={errors.slug}
        />
        <div className="form__row form--grid__full">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create school'}
          </button>
          <button className="button button--secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}

/* ========================================================== school details */
export function PlatformSchoolDetailPage() {
  const params = useSearchParams()
  const { notify } = useToast()
  const schoolId = Number(params.get('id') || 0)

  const [school, setSchool] = useState<School | null>(null)
  const [users, setUsers] = useState<SchoolUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('admin')
  const [adding, setAdding] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<SchoolUser | null>(null)

  const load = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    setError(null)
    try {
      const [detail, members] = await Promise.all([
        platform.school(schoolId),
        platform.schoolUsers(schoolId),
      ])
      setSchool(detail)
      setUsers(members)
    } catch (err) {
      setError(friendlyApiError(err, 'load this school'))
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => {
    void load()
  }, [load])

  async function addAdmin(event: FormEvent) {
    event.preventDefault()
    if (adding || !email.trim()) return
    setAdding(true)
    try {
      await platform.addAdministrator(schoolId, email.trim(), role)
      notify('Administrator assigned.', 'success')
      setEmail('')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'assign that administrator'), 'error')
    } finally {
      setAdding(false)
    }
  }

  async function remove(user: SchoolUser) {
    try {
      await platform.removeAdministrator(schoolId, user.user_id)
      notify('Access removed.', 'success')
      setConfirmRemove(null)
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'remove that user'), 'error')
    }
  }

  const columns: Column<SchoolUser>[] = [
    { key: 'email', header: 'Email', render: (row) => row.email || row.user_id },
    {
      key: 'role',
      header: 'Role',
      render: (row) => <Badge>{ROLE_LABELS[row.role] ?? row.role}</Badge>,
    },
    {
      key: 'active',
      header: 'Status',
      render: (row) =>
        row.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Inactive</Badge>,
    },
  ]

  return (
    <>
      <PageHeader
        title={school?.name ?? 'School'}
        description={school ? `Code ${school.slug}` : undefined}
        breadcrumbs={[
          { label: 'Platform', to: '/platform' },
          { label: 'Schools', to: '/platform/schools' },
          { label: school?.name ?? 'School' },
        ]}
      />

      {error ? (
        <ErrorState title="School could not load" message={error} onRetry={load} />
      ) : loading ? (
        <div className="card section">
          <LoadingBlock label="Loading school" rows={4} />
        </div>
      ) : !school ? (
        <EmptyState title="School not found" description="This school may have been removed." />
      ) : (
        <>
          <section className="card section">
            <h2 className="section__title">Overview</h2>
            <dl className="detail-list detail-list--two">
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge tone={school.status === 'active' ? 'success' : 'warning'}>
                    {school.status === 'active' ? 'Active' : 'Inactive'}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Users</dt>
                <dd>{school.users}</dd>
              </div>
              <div>
                <dt>Teachers</dt>
                <dd>{school.teachers}</dd>
              </div>
              <div>
                <dt>Classes</dt>
                <dd>{school.classes}</dd>
              </div>
            </dl>
          </section>

          <section className="card section">
            <h2 className="section__title">Administrators and members</h2>
            <form className="form form--grid" onSubmit={addAdmin}>
              <Field
                label="Email address"
                type="email"
                autoComplete="email"
                hint="The person must have signed in at least once."
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <div className="field">
                <label className="field__label" htmlFor="assign-role">
                  Role
                </label>
                <select
                  id="assign-role"
                  className="input input--select"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form__row form--grid__full">
                <button className="button button--primary" type="submit" disabled={adding}>
                  {adding ? 'Assigning…' : 'Assign role'}
                </button>
              </div>
            </form>

            <DataTable
              caption="School members"
              columns={columns}
              rows={users}
              rowKey={(row) => row.user_id}
              empty={
                <EmptyState
                  title="No members yet"
                  description="Assign an administrator so this school can be managed."
                  icon={<UserIcon width={22} height={22} />}
                />
              }
              rowActions={(row) => (
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  onClick={() => setConfirmRemove(row)}
                >
                  Remove
                </button>
              )}
            />
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        title="Remove this person's access?"
        description={`${confirmRemove?.email ?? 'This user'} will lose access to ${school?.name ?? 'this school'}. Their account and data are retained.`}
        confirmLabel="Remove access"
        destructive
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && remove(confirmRemove)}
      />
    </>
  )
}

/* ========================================================= access requests */
export function PlatformRequestsPage() {
  const { notify } = useToast()
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rows, allSchools] = await Promise.all([
        platform.accessRequests(filter),
        platform.schools(),
      ])
      setRequests(rows)
      setSchools(allSchools)
    } catch (err) {
      setError(friendlyApiError(err, 'load access requests'))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  async function decide(row: AccessRequest, approve: boolean, role: string, schoolId: number) {
    setBusy(row.id)
    try {
      await platform.decideRequest(row.id, {
        approve,
        role: approve ? role : undefined,
        school_id: approve ? schoolId : undefined,
      })
      notify(approve ? 'Access approved.' : 'Request declined.', 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'record that decision'), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Access requests"
        description="People who signed up and are waiting to be approved."
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Access requests' }]}
      />

      {error ? (
        <ErrorState title="Requests could not load" message={error} onRetry={load} />
      ) : (
        <section className="card section">
          <div className="toolbar">
            <div className="field field--inline">
              <label className="field__label" htmlFor="req-filter">
                Show
              </label>
              <select
                id="req-filter"
                className="input input--select"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>

          {loading ? (
            <LoadingBlock label="Loading access requests" rows={3} />
          ) : requests.length === 0 ? (
            <EmptyState
              title={filter === 'pending' ? 'No requests waiting' : 'Nothing to show'}
              description={
                filter === 'pending'
                  ? 'New signups appear here for approval.'
                  : 'No requests match this filter.'
              }
              icon={<UserIcon width={22} height={22} />}
            />
          ) : (
            <ul className="request-list">
              {requests.map((row) => (
                <RequestCard
                  key={row.id}
                  request={row}
                  schools={schools}
                  busy={busy === row.id}
                  onDecide={decide}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

function RequestCard({
  request,
  schools,
  busy,
  onDecide,
}: {
  request: AccessRequest
  schools: School[]
  busy: boolean
  onDecide: (row: AccessRequest, approve: boolean, role: string, schoolId: number) => void
}) {
  const [role, setRole] = useState(request.requested_role)
  const [schoolId, setSchoolId] = useState<string>(
    request.requested_school_id ? String(request.requested_school_id) : '',
  )
  const pending = request.status === 'pending'

  return (
    <li className="request-card">
      <div className="request-card__head">
        <div>
          <p className="request-card__email">{request.email}</p>
          <p className="request-card__meta">
            Asked to join <strong>{request.requested_school_name ?? 'an unnamed school'}</strong> as{' '}
            <strong>{ROLE_LABELS[request.requested_role] ?? request.requested_role}</strong>
          </p>
        </div>
        <Badge
          tone={
            request.status === 'approved'
              ? 'success'
              : request.status === 'rejected'
                ? 'danger'
                : 'warning'
          }
        >
          {request.status}
        </Badge>
      </div>

      {request.note && <p className="request-card__note">“{request.note}”</p>}

      {pending && (
        <>
          <p className="form__note">
            You decide the actual role and school. The request above is only what they asked for.
          </p>
          <div className="request-card__controls">
            <div className="field field--inline">
              <label className="field__label" htmlFor={`role-${request.id}`}>
                Grant role
              </label>
              <select
                id={`role-${request.id}`}
                className="input input--select"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field--inline">
              <label className="field__label" htmlFor={`school-${request.id}`}>
                At school
              </label>
              <select
                id={`school-${request.id}`}
                className="input input--select"
                value={schoolId}
                onChange={(event) => setSchoolId(event.target.value)}
              >
                <option value="">Choose…</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form__row">
            <button
              type="button"
              className="button button--primary button--sm"
              disabled={busy || !schoolId}
              onClick={() => onDecide(request, true, role, Number(schoolId))}
            >
              {busy ? 'Working…' : 'Approve'}
            </button>
            <button
              type="button"
              className="button button--secondary button--sm"
              disabled={busy}
              onClick={() => onDecide(request, false, role, 0)}
            >
              Decline
            </button>
          </div>
        </>
      )}
    </li>
  )
}

/* ==================================================== platform admin roster */
export function PlatformAdminsPage() {
  const { notify } = useToast()
  const [admins, setAdmins] = useState<PlatformAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<PlatformAdmin | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAdmins(await platform.admins())
    } catch (err) {
      setError(friendlyApiError(err, 'load platform administrators'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function grant(event: FormEvent) {
    event.preventDefault()
    if (saving || !email.trim()) return
    setSaving(true)
    try {
      await platform.grantAdmin(email.trim())
      notify('Platform access granted.', 'success')
      setEmail('')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'grant platform access'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function revoke(admin: PlatformAdmin) {
    try {
      await platform.revokeAdmin(admin.user_id)
      notify('Platform access revoked.', 'success')
      setConfirm(null)
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'revoke platform access'), 'error')
    }
  }

  const isLast = admins.length <= 1

  return (
    <>
      <PageHeader
        title="Platform administrators"
        description="Accounts with full access to every school."
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Administrators' }]}
      />

      <Alert tone="info" title="Platform access is powerful">
        A platform administrator can see and change every school. Grant it sparingly. It can only
        ever be granted by someone who already holds it.
      </Alert>

      {error ? (
        <ErrorState title="Administrators could not load" message={error} onRetry={load} />
      ) : (
        <>
          <section className="card section">
            <h2 className="section__title">Grant platform access</h2>
            <form className="form form--grid" onSubmit={grant}>
              <Field
                label="Email address"
                type="email"
                autoComplete="email"
                hint="The account must have signed in at least once."
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <div className="form__row form--grid__full">
                <button className="button button--primary" type="submit" disabled={saving}>
                  {saving ? 'Granting…' : 'Grant access'}
                </button>
              </div>
            </form>
          </section>

          <section className="card section">
            <h2 className="section__title">Current administrators</h2>
            {loading ? (
              <LoadingBlock label="Loading administrators" rows={2} />
            ) : (
              <ul className="admin-list">
                {admins.map((admin) => (
                  <li className="admin-row" key={admin.user_id}>
                    <div>
                      <p className="admin-row__email">
                        {admin.email ?? admin.user_id}
                        {admin.is_self && <Badge>You</Badge>}
                      </p>
                      <p className="admin-row__meta">
                        Granted by {admin.granted_by === 'bootstrap' ? 'server bootstrap' : admin.granted_by}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button button--ghost button--sm"
                      disabled={isLast}
                      title={isLast ? 'The last platform administrator cannot be removed' : undefined}
                      onClick={() => setConfirm(admin)}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {isLast && !loading && (
              <p className="form__note">
                This is the only platform administrator. Grant access to someone else before
                removing it, so the platform is never left without an administrator.
              </p>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title="Revoke platform access?"
        description={`${confirm?.email ?? 'This account'} will lose access to every school and to platform settings.${confirm?.is_self ? ' This is your own account — you will be locked out of platform administration immediately.' : ''}`}
        confirmLabel="Revoke access"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && revoke(confirm)}
      />
    </>
  )
}
