import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { SchoolIcon } from '../components/icons'
import { api, ApiError, apiFetch, friendlyApiError, type SchoolProfile } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useToast } from '../components/Toast'
import { ConfirmDialog } from '../components/ConfirmDialog'

const EDIT_FIELDS: Array<{ key: keyof SchoolProfile; label: string; type?: string }> = [
  { key: 'name', label: 'School name' },
  { key: 'code', label: 'School code' },
  { key: 'county', label: 'County' },
  { key: 'sub_county', label: 'Sub-county' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone' },
  { key: 'principal_name', label: 'Principal' },
  { key: 'motto', label: 'Motto' },
]

type SchoolForm = Record<string, string>

function toForm(data: SchoolProfile): SchoolForm {
  return Object.fromEntries(EDIT_FIELDS.map(({ key }) => [key, data[key] == null ? '' : String(data[key])]))
}

export function SchoolPage() {
  const { notify } = useToast()
  const toMessage = useCallback(
    (error: unknown) =>
      error instanceof ApiError && error.status === 404
        ? 'NOT_FOUND'
        : friendlyApiError(error, 'load the school profile'),
    [],
  )
  const { data, loading, error, reload } = useAsync<SchoolProfile>(api.school, toMessage)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<SchoolForm>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (data && !editing) setForm(toForm(data))
  }, [data, editing])

  function startEditing() {
    if (!data) return
    setForm(toForm(data))
    setFormError(null)
    setEditing(true)
  }

  function cancelEditing() {
    if (data) setForm(toForm(data))
    setFormError(null)
    setEditing(false)
  }

  async function save() {
    if (!data || saving) return
    const name = form.name?.trim() ?? ''
    const code = form.code?.trim() ?? ''
    if (name.length < 3 || !code) {
      setFormError('School name and school code are required.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const { key } of EDIT_FIELDS) {
        const value = form[key as string]?.trim() ?? ''
        payload[key as string] = value || null
      }
      payload.name = name
      payload.code = code
      await apiFetch<SchoolProfile>('/api/v1/school/', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      notify('School profile saved.', 'success')
      setEditing(false)
      await reload()
    } catch (err) {
      setFormError(friendlyApiError(err, 'save the school profile'))
    } finally {
      setSaving(false)
    }
  }

  async function removeSchool() {
    if (!data || saving) return
    setSaving(true)
    try {
      await apiFetch<SchoolProfile>('/api/v1/school/', {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      })
      notify('School profile removed from active use.', 'success')
      setConfirmRemove(false)
      await reload()
    } catch (err) {
      notify(friendlyApiError(err, 'remove the school profile'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="School profile"
        description="Registration and contact details held for this school."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'School profile' }]}
        actions={
          data && !editing ? (
            <div className="form__row">
              <button type="button" className="button button--primary button--sm" onClick={startEditing}>
                Edit
              </button>
              <button type="button" className="button button--danger button--sm" onClick={() => setConfirmRemove(true)}>
                Remove
              </button>
            </div>
          ) : undefined
        }
      />

      <section className="card section">
        {loading ? (
          <LoadingBlock label="Loading the school profile" rows={5} />
        ) : error === 'NOT_FOUND' ? (
          <EmptyState
            title="No school profile yet"
            description="A school profile has not been created for this system."
            icon={<SchoolIcon width={22} height={22} />}
          />
        ) : error ? (
          <ErrorState title="School profile could not load" message={error} onRetry={reload} />
        ) : data && editing ? (
          <div>
            <h2 className="section__title">Edit school profile</h2>
            {formError && <Alert tone="error">{formError}</Alert>}
            <div className="form form--grid">
              {EDIT_FIELDS.map(({ key, label, type }) => (
                <div className="field" key={String(key)}>
                  <label className="field__label" htmlFor={`school-${String(key)}`}>{label}</label>
                  <input
                    id={`school-${String(key)}`}
                    className="input"
                    type={type ?? 'text'}
                    value={form[String(key)] ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, [String(key)]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="form__row" style={{ marginTop: '1rem' }}>
              <button type="button" className="button button--primary" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="button button--secondary" disabled={saving} onClick={cancelEditing}>
                Cancel
              </button>
            </div>
          </div>
        ) : data ? (
          <>
            <dl className="detail-list detail-list--two">
              <div><dt>Name</dt><dd>{data.name}</dd></div>
              <div><dt>Code</dt><dd>{data.code || 'Not recorded'}</dd></div>
              <div><dt>County</dt><dd>{data.county || 'Not recorded'}</dd></div>
              <div><dt>Sub-county</dt><dd>{data.sub_county || 'Not recorded'}</dd></div>
              <div><dt>Email</dt><dd>{data.email || 'Not recorded'}</dd></div>
              <div><dt>Phone</dt><dd>{data.phone || 'Not recorded'}</dd></div>
              <div><dt>Principal</dt><dd>{data.principal_name || 'Not recorded'}</dd></div>
              <div>
                <dt>Status</dt>
                <dd>{data.is_active === false ? <Badge tone="warning">Inactive</Badge> : <Badge tone="success">Active</Badge>}</dd>
              </div>
              {data.motto && <div className="detail-list__full"><dt>Motto</dt><dd>{data.motto}</dd></div>}
            </dl>
          </>
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this school profile?"
        description="This does not delete the school's records. It marks the profile inactive so it is no longer treated as an active school."
        confirmLabel="Remove school"
        destructive
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => void removeSchool()}
      />
    </>
  )
}

// Production deployment trigger: school profile actions are intentionally enabled above.
