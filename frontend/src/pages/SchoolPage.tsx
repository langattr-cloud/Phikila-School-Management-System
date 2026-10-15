import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { SchoolIcon } from '../components/icons'
import { api, ApiError, apiFetch, friendlyApiError, type SchoolProfile } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useToast } from '../components/Toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabase'

const EDIT_FIELDS: Array<{ key: keyof SchoolProfile; label: string; type?: string }> = [
  { key: 'name', label: 'School name' }, { key: 'code', label: 'School code' }, { key: 'county', label: 'County' },
  { key: 'sub_county', label: 'Sub-county' }, { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone' },
  { key: 'principal_name', label: 'Principal' }, { key: 'motto', label: 'Motto' },
]
type SchoolForm = Record<string, string>
function emptyForm(): SchoolForm { return Object.fromEntries(EDIT_FIELDS.map(({ key }) => [key, ''])) }
function toForm(data: SchoolProfile): SchoolForm { return Object.fromEntries(EDIT_FIELDS.map(({ key }) => [key, data[key] == null ? '' : String(data[key])])) }
function schoolLogoObjectPath(publicUrl: string | null | undefined): string | null {
  const marker = '/storage/v1/object/public/school-logos/'
  if (!publicUrl) return null
  const markerIndex = publicUrl.indexOf(marker)
  if (markerIndex < 0) return null
  const path = publicUrl.slice(markerIndex + marker.length).split('?')[0]
  return path || null
}

export function SchoolPage() {
  const { notify } = useToast()
  const toMessage = useCallback((error: unknown) => error instanceof ApiError && error.status === 404 ? 'NOT_FOUND' : friendlyApiError(error, 'load the school profile'), [])
  const { data, loading, error, reload } = useAsync<SchoolProfile>(api.school, toMessage)
  const [editing, setEditing] = useState(false); const [creating, setCreating] = useState(false); const [form, setForm] = useState<SchoolForm>(emptyForm)
  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState<string | null>(null); const [confirmRemove, setConfirmRemove] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false); const [logoError, setLogoError] = useState<string | null>(null); const [logoInputKey, setLogoInputKey] = useState(0)
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
  async function removeStoredLogoIfOwned(publicUrl: string | null | undefined) {
    if (!supabase || !publicUrl) return
    try {
      const { data: authData } = await supabase.auth.getUser()
      const path = schoolLogoObjectPath(publicUrl)
      if (!authData.user || !path || !path.startsWith(`${authData.user.id}/`)) return
      await supabase.storage.from('school-logos').remove([path])
    } catch {
      // The profile URL is authoritative; stale object cleanup is best-effort.
    }
  }

  async function saveLogo(file: File | null) {
    if (!data || logoBusy) return
    if (!file) return
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) { setLogoError('Choose a PNG, JPG/JPEG, or WebP image.'); setLogoInputKey(value => value + 1); return }
    if (file.size > 2 * 1024 * 1024) { setLogoError('The logo must be 2 MB or smaller.'); setLogoInputKey(value => value + 1); return }
    if (!supabase) { setLogoError('Logo uploads require the configured Supabase Storage connection.'); setLogoInputKey(value => value + 1); return }
    setLogoBusy(true); setLogoError(null)
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData.user) throw new Error('Your sign-in could not be verified. Please sign in again.')
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
      const path = `${authData.user.id}/school-${data.id}.${extension}`
      const { error: uploadError } = await supabase.storage.from('school-logos').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' })
      if (uploadError) throw new Error(uploadError.message.includes('Bucket not found') ? 'School logo storage is not configured yet. Please contact the system administrator.' : uploadError.message)
      const { data: publicData } = supabase.storage.from('school-logos').getPublicUrl(path)
      await apiFetch<SchoolProfile>('/api/v1/school/', { method: 'PATCH', body: JSON.stringify({ logo: publicData.publicUrl }) })
      if (data.logo && data.logo !== publicData.publicUrl) await removeStoredLogoIfOwned(data.logo)
      notify('School logo updated.', 'success')
      await reload()
    } catch (err) {
      setLogoError(friendlyApiError(err, 'upload the school logo'))
    } finally { setLogoBusy(false); setLogoInputKey(value => value + 1) }
  }
  async function removeLogo() {
    if (!data || logoBusy) return
    setLogoBusy(true); setLogoError(null)
    try {
      await apiFetch<SchoolProfile>('/api/v1/school/', { method: 'PATCH', body: JSON.stringify({ logo: null }) })
      await removeStoredLogoIfOwned(data.logo)
      notify('School logo removed.', 'success')
      await reload()
    } catch (err) { setLogoError(friendlyApiError(err, 'remove the school logo')) }
    finally { setLogoBusy(false) }
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
      .school-profile-page {
        --sp-border: #e2e8f0;
        --sp-ink: #172554;
        --sp-muted: #64748b;
        --sp-blue: #2563eb;
        --sp-violet: #7c3aed;
        --sp-teal: #0f9f91;
        --sp-amber: #d97706;
      }
      .school-profile-page .school-profile-card {
        padding:0; overflow:hidden; border:1px solid #dbe5f4;
        border-radius:20px; box-shadow:0 12px 34px rgba(30,64,175,.075);
      }
      .school-profile-banner {
        position:relative; display:flex; align-items:center; gap:18px; padding:30px 28px;
        color:#fff; border-bottom:0; overflow:hidden;
        background:linear-gradient(118deg,#123b86 0%,#2858c8 46%,#6d42c5 100%);
      }
      .school-profile-banner:after {
        content:""; position:absolute; width:260px; height:260px; border-radius:50%;
        right:-72px; top:-155px; border:1px solid rgba(255,255,255,.22);
        box-shadow:0 0 0 24px rgba(255,255,255,.055),0 0 0 52px rgba(255,255,255,.04);
        pointer-events:none;
      }
      .school-profile-mark {
        width:58px; height:58px; flex:0 0 58px; display:grid; place-items:center;
        border-radius:17px; color:#fff; background:rgba(255,255,255,.17);
        border:1px solid rgba(255,255,255,.25); box-shadow:0 8px 22px rgba(10,25,70,.15);
      }
      .school-profile-banner__main { min-width:0; flex:1; position:relative; z-index:1; }
      .school-profile-eyebrow { margin:0 0 7px; color:#dbeafe; font-size:11px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
      .school-profile-name { margin:0; color:#fff; font-size:clamp(21px, 2.5vw, 29px); font-weight:780; letter-spacing:-.04em; line-height:1.22; overflow-wrap:anywhere; }
      .school-profile-code { margin:8px 0 0; color:#e0e7ff; font-size:13px; }
      .school-profile-code strong { color:#fff; font-weight:750; }
      .school-profile-banner__status { align-self:flex-start; position:relative; z-index:1; padding:5px 9px; border-radius:999px; background:rgba(255,255,255,.94); }
      .school-profile-logo-panel { display:flex; align-items:center; gap:18px; padding:18px; margin-bottom:22px; border:1px solid #e3eaf5; border-radius:14px; background:#fff; }
      .school-profile-logo-preview { width:104px; height:104px; flex:0 0 104px; display:grid; place-items:center; overflow:hidden; border:1px dashed #cbd5e1; border-radius:12px; background:#f8fafc; color:#64748b; }
      .school-profile-logo-preview img { width:100%; height:100%; object-fit:contain; padding:8px; }
      .school-profile-logo-actions { display:flex; flex-wrap:wrap; align-items:center; gap:9px; }
      .school-profile-logo-help { margin:7px 0 0; color:#64748b; font-size:12px; line-height:1.5; }
      .school-profile-logo-error { margin:8px 0 0; color:#b91c1c; font-size:13px; }
      .school-profile-content { padding:28px; background:linear-gradient(180deg,#fff 0%,#fbfdff 100%); }
      .school-profile-section-title { margin:0 0 6px; color:var(--sp-ink); font-size:16px; font-weight:800; letter-spacing:-.02em; }
      .school-profile-section-copy { margin:0 0 20px; color:var(--sp-muted); font-size:13px; line-height:1.6; }
      .school-profile-details { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin:0; }
      .school-profile-detail {
        min-width:0; position:relative; padding:17px 18px 18px; border:1px solid #e3eaf5;
        border-radius:14px; background:#fff; box-shadow:0 3px 10px rgba(15,23,42,.025);
        transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;
      }
      .school-profile-detail:before { content:""; position:absolute; left:0; top:13px; bottom:13px; width:3px; border-radius:0 4px 4px 0; background:#3b82f6; }
      .school-profile-detail:nth-child(4n + 2):before { background:#8b5cf6; }
      .school-profile-detail:nth-child(4n + 3):before { background:#14b8a6; }
      .school-profile-detail:nth-child(4n):before { background:#f59e0b; }
      .school-profile-detail:hover { transform:translateY(-2px); border-color:#c7d7f5; box-shadow:0 9px 22px rgba(37,99,235,.08); }
      .school-profile-detail dt { margin:0 0 8px; color:#64748b; font-size:10px; font-weight:800; letter-spacing:.09em; text-transform:uppercase; }
      .school-profile-detail dd { margin:0; color:#172554; font-size:14px; line-height:1.55; font-weight:600; overflow-wrap:anywhere; }
      .school-profile-detail--wide { grid-column:1 / -1; background:linear-gradient(110deg,#f5f3ff,#f0f9ff); }
      .school-profile-form { padding:28px; background:linear-gradient(180deg,#fff 0%,#fbfdff 100%); }
      .school-profile-form__intro { display:flex; align-items:center; gap:16px; margin-bottom:25px; }
      .school-profile-form__intro .school-profile-mark { color:#fff; background:linear-gradient(135deg,#2563eb,#7c3aed); border:0; }
      .school-profile-form__intro .section__title { margin:3px 0 5px; color:var(--sp-ink); font-weight:800; letter-spacing:-.025em; }
      .school-profile-form__intro .section__description { margin:0; color:var(--sp-muted); line-height:1.55; }
      .school-profile-fields { gap:21px 18px; }
      .school-profile-fields .input {
        min-height:46px; border:1px solid #d7e1ef; border-radius:10px; background:#fff;
        box-shadow:0 1px 2px rgba(15,23,42,.025); transition:border-color .16s ease,box-shadow .16s ease;
      }
      .school-profile-fields .input:focus { border-color:#6366f1; outline:none; box-shadow:0 0 0 4px rgba(99,102,241,.13); }
      .school-profile-fields .field__label { margin-bottom:8px; color:#334155; font-weight:700; }
      .school-profile-required { color:#e11d48; }
      .school-profile-form__footer { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-top:22px; margin-top:27px; border-top:1px solid #e2e8f0; }
      .school-profile-form__footer p { margin:0; color:var(--sp-muted); font-size:12px; }
      .school-profile-form__footer .form__row { justify-content:flex-end; }
      .school-profile-page .button--primary { box-shadow:0 5px 12px rgba(37,99,235,.18); }
      .school-profile-page .section__header { margin-bottom:20px; }
      @media (prefers-reduced-motion:reduce) {
        .school-profile-detail,.school-profile-fields .input { transition:none; }
      }
      @media (max-width:680px) {
        .school-profile-banner { align-items:flex-start; padding:23px 18px; gap:13px; }
        .school-profile-mark { width:47px; height:47px; flex-basis:47px; border-radius:14px; }
        .school-profile-content,.school-profile-form { padding:21px 17px; }
        .school-profile-logo-panel { align-items:flex-start; flex-direction:column; }
        .school-profile-logo-preview { width:88px; height:88px; flex-basis:88px; }
        .school-profile-details { grid-template-columns:minmax(0,1fr); gap:10px; }
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
              <div className="school-profile-mark">{data.logo ? <img src={data.logo} alt="" style={{ width: 42, height: 42, objectFit: "contain", borderRadius: 8 }} /> : <SchoolIcon width={28} height={28} />}</div>
              <div className="school-profile-banner__main"><p className="school-profile-eyebrow">School identity</p><h2 className="school-profile-name">{data.name}</h2><p className="school-profile-code">School code: <strong>{data.code || 'Not recorded'}</strong></p></div>
              <div className="school-profile-banner__status">{data.is_active === false ? <Badge tone="warning">Inactive</Badge> : <Badge tone="success">Active</Badge>}</div>
            </div>
            <div className="school-profile-content">
              <section className="school-profile-logo-panel" aria-labelledby="school-logo-title">
                <div className="school-profile-logo-preview">{data.logo ? <img src={data.logo} alt="Current school logo" /> : <SchoolIcon width={34} height={34} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 id="school-logo-title" className="school-profile-section-title">School logo</h3>
                  <p className="school-profile-section-copy" style={{ marginBottom: 10 }}>Upload your school crest once. It will be used on supported printouts.</p>
                  <div className="school-profile-logo-actions">
                    <label className="button button--primary button--sm" htmlFor="school-logo-upload">{logoBusy ? 'Uploading…' : data.logo ? 'Replace logo' : 'Upload logo'}</label>
                    <input key={logoInputKey} id="school-logo-upload" type="file" accept="image/png,image/jpeg,image/webp" disabled={logoBusy} onChange={event => void saveLogo(event.target.files?.[0] ?? null)} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }} />
                    {data.logo && <button type="button" className="button button--secondary button--sm" disabled={logoBusy} onClick={() => void removeLogo()}>Remove logo</button>}
                  </div>
                  <p className="school-profile-logo-help">PNG, JPG/JPEG or WebP · Maximum 2 MB</p>
                  {logoError && <p className="school-profile-logo-error" role="alert">{logoError}</p>}
                </div>
              </section>
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
