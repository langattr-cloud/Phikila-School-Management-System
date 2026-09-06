import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { api, type AcademicYear, type Level, type LevelStatus, type SchoolClassSetup } from '../lib/api'
import { friendlyApiError } from '../lib/api'

type LevelWithClasses = Level & { classes: SchoolClassSetup[] }

function formatClassStatus(status?: string | null) {
  if (!status) return 'Not set'
  return status.replace(/_/g, ' ').replace(/\b\w/g, value => value.toUpperCase())
}

function classStatusTone(status?: string | null): 'success' | 'warning' {
  return status?.toLowerCase() === 'active' ? 'success' : 'warning'
}

function isLevelActive(status?: LevelStatus | null) {
  return status !== false && status !== 'INACTIVE' && status !== 'ARCHIVED'
}

export function ExaminationLevelsPage() {
  const [levels, setLevels] = useState<LevelWithClasses[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', display_order: 1, status: 'ACTIVE' as LevelStatus })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (preferredId?: number | null) => {
    setLoading(true)
    setError(null)
    try {
      const [levelRows, classRows, yearRows] = await Promise.all([
        api.levels(),
        api.schoolClasses(),
        api.academicYears(),
      ])
      const next = levelRows.map(level => ({
        ...level,
        classes: classRows.filter(item => item.level_id === level.id),
      }))
      setLevels(next)
      setAcademicYears(yearRows)
      setSelectedId(current => {
        const requested = preferredId != null && next.some(level => level.id === preferredId) ? preferredId : null
        return requested ?? (current && next.some(level => level.id === current) ? current : next[0]?.id ?? null)
      })
    } catch (err) {
      setError(friendlyApiError(err, 'load examination levels'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('level_id')
    const requestedId = raw ? Number(raw) : null
    void load(Number.isFinite(requestedId) ? requestedId : null)
  }, [load])

  const selected = useMemo(() => levels.find(level => level.id === selectedId) ?? null, [levels, selectedId])
  const academicYearById = useMemo(() => new Map(academicYears.map(year => [year.id, year])), [academicYears])

  useEffect(() => {
    if (!selected || editing) return
    setForm({
      name: selected.name,
      code: selected.code,
      display_order: selected.display_order,
      status: selected.status ?? 'ACTIVE',
    })
  }, [selected, editing])

  const selectLevel = (id: number) => {
    setSelectedId(id)
    setEditing(false)
    setNotice(null)
    const url = new URL(window.location.href)
    url.searchParams.set('level_id', String(id))
    window.history.replaceState({}, '', url)
  }

  const save = async () => {
    if (!selected || !form.name.trim() || !form.code.trim()) {
      setError('Level name and code are required.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await api.updateLevel(selected.id, {
        name: form.name.trim(),
        code: form.code.trim(),
        display_order: Math.max(1, Number(form.display_order) || 1),
        status: form.status,
      })
      setEditing(false)
      setNotice(`${form.name.trim()} examination level configuration was saved.`)
      await load(selected.id)
    } catch (err) {
      setError(friendlyApiError(err, 'save examination level configuration'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Examination Levels"
        description="Configure the education level used by examinations. Classes remain connected to the existing academic setup."
      />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {loading ? <LoadingBlock label="Loading examination levels" rows={4} /> : !levels.length ? (
        <EmptyState title="No academic levels" description="Create levels in Academic Setup before configuring examination levels." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(15rem, .8fr) minmax(0, 2fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
          <section className="card" aria-label="Examination levels">
            <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
              <strong>Levels</strong>
              <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>Select a level to configure it and see its classes.</p>
            </div>
            <div style={{ padding: 'var(--space-2)' }}>
              {levels.map(level => {
                const active = level.id === selectedId
                return (
                  <button
                    key={level.id}
                    type="button"
                    className={`button button--block ${active ? 'button--primary' : 'button--ghost'}`}
                    style={{ justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}
                    onClick={() => selectLevel(level.id)}
                  >
                    <span style={{ textAlign: 'left' }}><strong>{level.name}</strong><small style={{ display: 'block', opacity: .75 }}>{level.code}</small></span>
                    <span>{level.classes.length}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {selected && (
            <section>
              <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'start' }}>
                  <div>
                    <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Examination level configuration</p>
                    {editing ? <h2 style={{ margin: 'var(--space-1) 0' }}>Edit {selected.name}</h2> : <h2 style={{ margin: 'var(--space-1) 0' }}>{selected.name}</h2>}
                    <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>{selected.classes.length} classes are connected to this level and remain available for examination setup and mark entry.</p>
                  </div>
                  <Badge tone={isLevelActive(selected.status) ? 'success' : 'warning'}>{isLevelActive(selected.status) ? 'Active' : 'Inactive'}</Badge>
                </div>

                {editing ? (
                  <div style={{ marginTop: 'var(--space-4)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))', gap: 'var(--space-3)' }}>
                    <label className="field"><span>Name</span><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
                    <label className="field"><span>Code</span><input value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} /></label>
                    <label className="field"><span>Display order</span><input type="number" min={1} value={form.display_order} onChange={event => setForm(current => ({ ...current, display_order: Number(event.target.value) }))} /></label>
                    <label className="field"><span>Status</span><select value={String(form.status)} onChange={event => setForm(current => ({ ...current, status: event.target.value as LevelStatus }))}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select></label>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                      <button type="button" className="button button--ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                      <button type="button" className="button button--primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save configuration'}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
                    <button type="button" className="button button--primary" onClick={() => { setNotice(null); setError(null); setEditing(true) }}>Configure level</button>
                  </div>
                )}
              </div>

              <div className="card" style={{ overflowX: 'auto' }}>
                <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
                  <strong>Classes in {selected.name}</strong>
                </div>
                {!selected.classes.length ? <EmptyState title="No classes in this level" description="Add classes under the existing Classes module to make them available for examinations." /> : (
                  <table style={{ width: '100%' }}>
                    <thead><tr><th>Class</th><th>Code</th><th>Academic year</th><th>Status</th><th>Examination use</th></tr></thead>
                    <tbody>
                      {selected.classes.map(item => {
                        const academicYear = item.academic_year_id != null ? academicYearById.get(item.academic_year_id) : undefined
                        return (
                          <tr key={item.id}>
                            <td><strong>{item.name}</strong></td>
                            <td>{item.code || '—'}</td>
                            <td>{academicYear?.name ?? (item.academic_year_id != null ? `Year ${item.academic_year_id}` : 'Not set')}</td>
                            <td><Badge tone={classStatusTone(item.status)}>{formatClassStatus(item.status)}</Badge></td>
                            <td>Available through the existing class and enrollment context</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export default ExaminationLevelsPage
