import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { api, type Level, type SchoolClassSetup } from '../lib/api'
import { friendlyApiError } from '../lib/api'

type LevelWithClasses = Level & { classes: SchoolClassSetup[] }

export function ExaminationLevelsPage() {
  const [levels, setLevels] = useState<LevelWithClasses[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [levelRows, classRows] = await Promise.all([api.levels(), api.schoolClasses()])
      const next = levelRows.map(level => ({
        ...level,
        classes: classRows.filter(item => item.level_id === level.id),
      }))
      setLevels(next)
      setSelectedId(current => current && next.some(level => level.id === current) ? current : next[0]?.id ?? null)
    } catch (err) {
      setError(friendlyApiError(err, 'load examination levels'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const selected = useMemo(() => levels.find(level => level.id === selectedId) ?? null, [levels, selectedId])

  return (
    <div>
      <PageHeader
        title="Examination Levels"
        description="Choose the education level and class scope before assigning mark-entry duties."
      />
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <LoadingBlock label="Loading examination levels" rows={4} /> : !levels.length ? (
        <EmptyState title="No academic levels" description="Create levels in Academic Setup before configuring examination mark entry." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(15rem, .8fr) minmax(0, 2fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
          <section className="card" aria-label="Examination levels">
            <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
              <strong>Levels</strong>
              <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>Select a level to see its classes.</p>
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
                    onClick={() => setSelectedId(level.id)}
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
                    <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Selected examination scope</p>
                    <h2 style={{ margin: 'var(--space-1) 0' }}>{selected.name}</h2>
                    <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>{selected.classes.length} classes available for examination setup and mark-entry assignments.</p>
                  </div>
                  <Badge tone={selected.status === false ? 'warning' : 'success'}>{selected.status === false ? 'Inactive' : 'Active'}</Badge>
                </div>
              </div>

              <div className="card" style={{ overflowX: 'auto' }}>
                <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
                  <strong>Classes in {selected.name}</strong>
                </div>
                {!selected.classes.length ? <EmptyState title="No classes in this level" description="Add classes under the existing Classes module to make them available for examinations." /> : (
                  <table style={{ width: '100%' }}>
                    <thead><tr><th>Class</th><th>Code</th><th>Academic year</th><th>Status</th><th>Examination use</th></tr></thead>
                    <tbody>
                      {selected.classes.map(item => (
                        <tr key={item.id}>
                          <td><strong>{item.name}</strong></td>
                          <td>{item.code}</td>
                          <td>{item.academic_year_id ?? '—'}</td>
                          <td><Badge tone={item.status === 'active' ? 'success' : 'warning'}>{item.status ?? 'Unknown'}</Badge></td>
                          <td>Available through the existing class and enrollment context</td>
                        </tr>
                      ))}
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
