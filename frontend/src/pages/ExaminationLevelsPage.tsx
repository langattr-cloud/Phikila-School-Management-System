import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { api, type Grade, type Level } from '../lib/api'
import { friendlyApiError } from '../lib/api'

type LevelWithGrades = Level & { grades: Grade[] }

export function ExaminationLevelsPage() {
  const [levels, setLevels] = useState<LevelWithGrades[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const levelRows = await api.levels()
      const gradeRows = await Promise.all(levelRows.map(level => api.grades(level.id)))
      const next = levelRows.map((level, index) => ({ ...level, grades: gradeRows[index] ?? [] }))
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
        description="Choose the education level and grade scope before assigning mark-entry duties."
      />
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <LoadingBlock label="Loading examination levels" rows={4} /> : !levels.length ? (
        <EmptyState title="No academic levels" description="Create levels in Academic Setup before configuring examination mark entry." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(15rem, .8fr) minmax(0, 2fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
          <section className="card" aria-label="Examination levels">
            <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
              <strong>Levels</strong>
              <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>Select a level to see its grades.</p>
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
                    <span>{level.grades.length}</span>
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
                    <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>{selected.grades.length} grades available for examination setup and mark-entry assignments.</p>
                  </div>
                  <Badge tone={selected.status === false ? 'warning' : 'success'}>{selected.status === false ? 'Inactive' : 'Active'}</Badge>
                </div>
              </div>

              <div className="card" style={{ overflowX: 'auto' }}>
                <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
                  <strong>Grades in {selected.name}</strong>
                </div>
                {!selected.grades.length ? <EmptyState title="No grades in this level" description="Add grades under Academic Setup to make them available for examinations." /> : (
                  <table style={{ width: '100%' }}>
                    <thead><tr><th>Grade</th><th>Code</th><th>Status</th><th>Examination use</th></tr></thead>
                    <tbody>
                      {selected.grades.map(grade => (
                        <tr key={grade.id}>
                          <td><strong>{grade.name}</strong></td>
                          <td>{grade.code}</td>
                          <td><Badge tone={grade.status === false ? 'warning' : 'success'}>{grade.status === false ? 'Inactive' : 'Active'}</Badge></td>
                          <td>Available for papers, candidate lists and mark-entry assignments</td>
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
