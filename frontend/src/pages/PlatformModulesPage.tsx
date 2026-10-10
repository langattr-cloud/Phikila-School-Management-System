import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { ErrorState, LoadingBlock } from '../components/States'
import { Field } from '../components/Field'
import { friendlyApiError } from '../lib/api'
import { platform, type School, type SchoolModuleAccess } from '../lib/platform'
import { useToast } from '../components/Toast'

export function PlatformModulesPage() {
  const { notify } = useToast()
  const [schools, setSchools] = useState<School[]>([])
  const [schoolId, setSchoolId] = useState('')
  const [access, setAccess] = useState<SchoolModuleAccess | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSchools = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await platform.schools()
      setSchools(rows)
      if (rows.length && !schoolId) setSchoolId(String(rows[0].id))
    } catch (err) {
      setError(friendlyApiError(err, 'load schools'))
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => { void loadSchools() }, [loadSchools])

  const loadAccess = useCallback(async () => {
    if (!schoolId) { setAccess(null); return }
    setLoading(true)
    setError(null)
    try {
      const result = await platform.schoolModules(Number(schoolId))
      setAccess(result)
      setSelected(result.modules.filter(item => item.enabled).map(item => item.key))
    } catch (err) {
      setError(friendlyApiError(err, 'load module access'))
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => { void loadAccess() }, [loadAccess])

  function toggle(key: string, checked: boolean) {
    setSelected(current => checked ? [...new Set([...current, key])] : current.filter(item => item !== key))
  }

  async function save() {
    if (!schoolId || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await platform.setSchoolModules(Number(schoolId), selected)
      setAccess(result)
      setSelected(result.modules.filter(item => item.enabled).map(item => item.key))
      notify('School module access saved.', 'success')
    } catch (err) {
      const message = friendlyApiError(err, 'save school module access')
      setError(message)
      notify(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return <div className="dashboard-page">
    <PageHeader title="School module access" description="Choose which features each school is entitled to use. Changes are enforced by the API as well as the navigation." breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Module access' }]} />
    {error && <Alert tone="error" title="Module access could not be loaded or saved">{error}</Alert>}
    <section className="card section">
      <div className="form form--grid">
        <div className="field"><label className="field__label" htmlFor="module-school">School</label><select id="module-school" className="input input--select" value={schoolId} onChange={event => setSchoolId(event.target.value)}><option value="">Choose a school</option>{schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}</select></div>
      </div>
      {loading ? <LoadingBlock label="Loading school module access" rows={5} /> : access && <>
        <div className="dashboard-section__head">
          <div><p>Entitlements</p><h2 className="section__title">{access.school_name}</h2></div>
          <span>{selected.length} of {access.modules.length} enabled</span>
        </div>
        <div className="form">
          {access.modules.map(module => <label key={module.key} className="card section" style={{display:'flex',alignItems:'flex-start',gap:'0.8rem',marginBottom:'0.75rem'}}>
            <input type="checkbox" checked={selected.includes(module.key)} onChange={event => toggle(module.key, event.target.checked)} />
            <span><strong>{module.label}</strong><br /><span className="text-muted">{module.description}</span></span>
          </label>)}
        </div>
        <div className="form__actions">
          <button type="button" className="button button--primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save module access'}</button>
          <button type="button" className="button button--secondary" onClick={() => { setSelected(access.modules.filter(item => item.enabled).map(item => item.key)) }} disabled={saving}>Discard changes</button>
        </div>
      </>}
      {!loading && schools.length === 0 && <ErrorState title="No schools found" message="Create a school before assigning modules." onRetry={() => void loadSchools()} />}
    </section>
  </div>
}
