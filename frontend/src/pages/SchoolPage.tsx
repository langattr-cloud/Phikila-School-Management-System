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
  { key: 'name', label: 'School name' }, { key: 'code', label: 'School code' }, { key: 'county', label: 'County' },
  { key: 'sub_county', label: 'Sub-county' }, { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone' },
  { key: 'principal_name', label: 'Principal' }, { key: 'motto', label: 'Motto' },
]
type SchoolForm = Record<string, string>
function emptyForm(): SchoolForm { return Object.fromEntries(EDIT_FIELDS.map(({ key }) => [key, ''])) }
function toForm(data: SchoolProfile): SchoolForm { return Object.fromEntries(EDIT_FIELDS.map(({ key }) => [key, data[key] == null ? '' : String(data[key])])) }

export function SchoolPage() {
  const { notify } = useToast()
  const toMessage = useCallback((error: unknown) => error instanceof ApiError && error.status === 404 ? 'NOT_FOUND' : friendlyApiError(error, 'load the school profile'), [])
  const { data, loading, error, reload } = useAsync<SchoolProfile>(api.school, toMessage)
  const [editing, setEditing] = useState(false); const [creating, setCreating] = useState(false); const [form, setForm] = useState<SchoolForm>(emptyForm)
  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState<string | null>(null); const [confirmRemove, setConfirmRemove] = useState(false)
  useEffect(() => { if (data && !editing && !creating) setForm(toForm(data)) }, [data, editing, creating])
  function startCreating() { setForm(emptyForm()); setFormError(null); setCreating(true) }
  function startEditing() { if (!data) return; setForm(toForm(data)); setFormError(null); setEditing(true) }
  function cancelForm() { setFormError(null); setEditing(false); setCreating(false); if (data) setForm(toForm(data)) }
  async function save() {
    if (saving) return; const name = form.name?.trim() ?? ''; const code = form.code?.trim() ?? ''
    if (name.length < 3 || !code) { setFormError('School name and school code are required.'); return }
    setSaving(true); setFormError(null)
    try { const payload: Record<string, unknown> = {}; for (const { key } of EDIT_FIELDS) payload[key as string] = form[key as string]?.trim() || null; payload.name = name; payload.code = code
      await apiFetch<SchoolProfile>('/api/v1/school', { method: creating ? 'POST' : 'PATCH', body: JSON.stringify(payload) })
      notify(creating ? 'School profile created.' : 'School profile saved.', 'success'); setEditing(false); setCreating(false); await reload()
    } catch (err) {
      if (creating && err instanceof ApiError && err.status === 409) {
        try {
          const existing = await api.school()
          setForm(toForm(existing))
          setCreating(false)
          setEditing(true)
          setFormError('This school profile already exists. Review the saved details below and select Save changes to update it.')
          return
        } catch {
          // Fall back to the original error if the existing profile cannot load.
        }
      }
      setFormError(friendlyApiError(err, creating ? 'create the school profile' : 'save the school profile'))
    } finally { setSaving(false) }
  }
  async function saveCurrentProfile() {
    if (!data || saving) return; setSaving(true)
    try { const payload = Object.fromEntries(EDIT_FIELDS.map(({ key }) => [key, data[key] ?? null])); await apiFetch<SchoolProfile>('/api/v1/school', { method: 'PATCH', body: JSON.stringify(payload) }); notify('School profile saved.', 'success'); await reload() }
    catch (err) { notify(friendlyApiError(err, 'save the school profile'), 'error') } finally { setSaving(false) }
  }
  async function removeSchool() { if (!data || saving) return; setSaving(true); try { await apiFetch<SchoolProfile>('/api/v1/school', { method: 'PATCH', body: JSON.stringify({ is_active: false }) }); notify('School profile removed from active use.', 'success'); setConfirmRemove(false); await reload() } catch (err) { notify(friendlyApiError(err, 'remove the school profile'), 'error') } finally { setSaving(false) } }

  const formView = <div className="school-profile-form">
    <div className="school-profile-form__intro">
      <div className="school-profile-mark"><SchoolIcon width={25} height={25} /></div>
      <div><span className="eyebrow">{creating ? 'Initial setup' : 'School details'}</span><h2 className="section__title">{creating ? 'Create school profile' : 'Edit school profile'}</h2><p className="section__description">Update the registration and contact information for this school.</p></div>
    </div>
    {formError && <Alert tone="error">{formError}</Alert>}
    <div className="form form--grid school-profile-fields">{EDIT_FIELDS.map(({ key, label, type }) => <div className="field" key={String(key)}><label className="field__label" htmlFor={`school-${String(key)}`}>{label}{(key === 'name' || key === 'code') && <span className="school-profile-required"> *</span>}</label><input id={`school-${String(key)}`} className="input" type={type ?? 'text'} value={form[String(key)] ?? ''} onChange={event => setForm(current => ({ ...current, [String(key)]: event.target.value }))} required={key === 'name' || key === 'code'} placeholder={key === 'name' ? 'Enter the school’s official name' : key === 'code' ? 'Enter the school code' : key === 'county' ? 'Enter county' : key === 'sub_county' ? 'Enter sub-county' : key === 'email' ? 'name@school.org' : key === 'phone' ? 'Enter contact number' : key === 'principal_name' ? 'Enter principal’s name' : 'Add the school motto'} /></div>)}</div>
    <div className="school-profile-form__footer"><p><span className="school-profile-required">*</span> Required fields</p><div className="form__row"><button type="button" className="button button--secondary" disabled={saving} onClick={cancelForm}>Cancel</button><button type="button" className="button button--primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : creating ? 'Create school profile' : 'Save changes'}</button></div></div>
  </div>

  return <>
    <style>{`
      .school-profile-page { --sp-border: var(--border, #e2e8f0); }
      .school-profile-page .school-profile-card { padding:0; overflow:hidden; }
      .school-profile-banner { display:flex; align-items:center; gap:18px; padding:24px 26px; border-bottom:1px solid var(--sp-border); background:linear-gradient(115deg, rgba(37,99,235,.07), rgba(14,165,233,.025) 62%, transparent); }
      .school-profile-mark { width:54px; height:54px; flex:0 0 54px; display:grid; place-items:center; border-radius:16px; color:var(--primary, #2563eb); background:rgba(37,99,235,.10); }
      .school-profile-banner__main { min-width:0; flex:1; }
      .school-profile-eyebrow { margin:0 0 5px; color:var(--text-muted, #64748b); font-size:11px; font-weight:750; letter-spacing:.11em; text-transform:uppercase; }
      .school-profile-name { margin:0; font-size:clamp(19px, 2.2vw, 25px); font-weight:750; letter-spacing:-.035em; line-height:1.25; overflow-wrap:anywhere; }
      .school-profile-code { margin:6px 0 0; color:var(--text-muted, #64748b); font-size:13px; }
      .school-profile-banner__status { align-self:flex-start; }
      .school-profile-content { padding:24px 26px 28px; }
      .school-profile-section-title { margin:0 0 5px; font-size:14px; font-weight:750; letter-spacing:-.01em; }
      .school-profile-section-copy { margin:0 0 18px; color:var(--text-muted, #64748b); font-size:13px; line-height:1.55; }
      .school-profile-details { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:0; }
      .school-profile-detail { min-width:0; padding:15px 16px; border:1px solid var(--sp-border); border-radius:12px; background:var(--surface, #fff); }
      .school-profile-detail dt { margin:0 0 7px; color:var(--text-muted, #64748b); font-size:11px; font-weight:700; letter-spacing:.055em; text-transform:uppercase; }
      .school-profile-detail dd { margin:0; font-size:14px; line-height:1.5; font-weight:550; overflow-wrap:anywhere; }
      .school-profile-detail--wide { grid-column:1 / -1; }
      .school-profile-form { padding:24px 26px 26px; }
      .school-profile-form__intro { display:flex; align-items:center; gap:15px; margin-bottom:22px; }
      .school-profile-form__intro .section__title { margin:3px 0 5px; }
      .school-profile-form__intro .section__description { margin:0; }
      .school-profile-fields { gap:20px 18px; }
      .school-profile-fields .input { min-height:44px; border-radius:9px; }
      .school-profile-fields .field__label { margin-bottom:7px; }
      .school-profile-required { color:#dc2626; }
      .school-profile-form__footer { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-top:20px; margin-top:24px; border-top:1px solid var(--sp-border); }
      .school-profile-form__footer p { margin:0; color:var(--text-muted, #64748b); font-size:12px; }
      .school-profile-form__footer .form__row { justify-content:flex-end; }
      .school-profile-page .section__header { margin-bottom:20px; }
      @media (max-width:680px) {
        .school-profile-banner { align-items:flex-start; padding:20px 18px; gap:13px; }
        .school-profile-mark { width:46px; height:46px; flex-basis:46px; border-radius:13px; }
        .school-profile-content,.school-profile-form { padding:20px 17px; }
        .school-profile-details { grid-template-columns:minmax(0,1fr); gap:9px; }
        .school-profile-detail--wide { grid-column:auto; }
        .school-profile-form__footer { align-items:stretch; flex-direction:column; }
        .school-profile-form__footer .form__row { width:100%; }
        .school-profile-form__footer .button { flex:1; }
      }
    `}</style>
    <div className="school-profile-page">
      <PageHeader title="School profile" description="Registration and contact details held for this school." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'School profile' }]} actions={data && !editing && !creating ? <div className="form__row"><button type="button" className="button button--primary button--sm" disabled={saving} onClick={() => void saveCurrentProfile()}>Save</button><button type="button" className="button button--secondary button--sm" onClick={startEditing}>Edit profile</button><button type="button" className="button button--danger button--sm" onClick={() => setConfirmRemove(true)}>Remove</button></div> : undefined} />
      <section className="card section school-profile-card">
        {loading ? <div className="school-profile-content"><LoadingBlock label="Loading the school profile" rows={5} /></div>
          : creating || editing ? formView
          : error === 'NOT_FOUND' ? <div className="school-profile-content"><EmptyState title="No school profile yet" description="Create the school profile to keep this school's registration and contact details in one place." icon={<SchoolIcon width={22} height={22} />} action={<button type="button" className="button button--primary" onClick={startCreating}>Create school profile</button>} /></div>
          : error ? <div className="school-profile-content"><ErrorState title="School profile could not load" message={error} onRetry={reload} /></div>
          : data ? <>
            <div className="school-profile-banner">
              <div className="school-profile-mark"><SchoolIcon width={28} height={28} /></div>
              <div className="school-profile-banner__main"><p className="school-profile-eyebrow">School identity</p><h2 className="school-profile-name">{data.name}</h2><p className="school-profile-code">School code: <strong>{data.code || 'Not recorded'}</strong></p></div>
              <div className="school-profile-banner__status">{data.is_active === false ? <Badge tone="warning">Inactive</Badge> : <Badge tone="success">Active</Badge>}</div>
            </div>
            <div className="school-profile-content">
              <h3 className="school-profile-section-title">Registration and contact</h3>
              <p className="school-profile-section-copy">The core details currently recorded for this school.</p>
              <dl className="school-profile-details">
                <div className="school-profile-detail"><dt>County</dt><dd>{data.county || 'Not recorded'}</dd></div>
                <div className="school-profile-detail"><dt>Sub-county</dt><dd>{data.sub_county || 'Not recorded'}</dd></div>
                <div className="school-profile-detail"><dt>Email address</dt><dd>{data.email || 'Not recorded'}</dd></div>
                <div className="school-profile-detail"><dt>Phone number</dt><dd>{data.phone || 'Not recorded'}</dd></div>
                <div className="school-profile-detail"><dt>Principal</dt><dd>{data.principal_name || 'Not recorded'}</dd></div>
                <div className="school-profile-detail"><dt>Profile status</dt><dd>{data.is_active === false ? 'Inactive' : 'Active'}</dd></div>
                <div className="school-profile-detail school-profile-detail--wide"><dt>School motto</dt><dd>{data.motto || 'Not recorded'}</dd></div>
              </dl>
            </div>
          </> : !data && !creating ? <div className="school-profile-content"><ErrorState title="School profile returned no details" message="The school profile request completed without returning a school record. Retry loading it instead of creating another profile." onRetry={reload} /></div> : null}
      </section>
    </div>
    <ConfirmDialog open={confirmRemove} title="Remove this school profile?" description="This does not delete the school's records. It marks the profile inactive so it is no longer treated as an active school." confirmLabel="Remove school" destructive onCancel={() => setConfirmRemove(false)} onConfirm={() => void removeSchool()} />
  </>
}
