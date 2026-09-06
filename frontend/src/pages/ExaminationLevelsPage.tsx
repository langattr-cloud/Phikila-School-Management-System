import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { api, friendlyApiError, type AcademicYear, type Level } from '../lib/api'
import { scheduling, type SchoolClass } from '../lib/scheduling'

const allowedLevels = ['Pre Primary', 'Pre-Primary School', 'Primary', 'Primary School', 'Junior School', 'Senior School']

function levelRank(level: Level) {
  if (Number.isFinite(Number(level.display_order))) return Number(level.display_order)
  const index = allowedLevels.findIndex(name => name.toLowerCase() === level.name.trim().toLowerCase())
  return index >= 0 ? index + 1 : 999
}

function isActive(status?: Level['status'] | null) {
  return status !== false && status !== 'INACTIVE' && status !== 'ARCHIVED'
}

export function ExaminationLevelsPage() {
  const [levels, setLevels] = useState<Level[]>([])
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [levelRows, classRows, yearRows] = await Promise.all([
          api.levels(),
          scheduling.classes(),
          api.academicYears(),
        ])
        const ordered = levelRows
          .filter(level => allowedLevels.includes(level.name) || levelRows.length <= allowedLevels.length)
          .sort((a, b) => levelRank(a) - levelRank(b) || a.name.localeCompare(b.name))
        setLevels(ordered)
        setClasses(classRows)
        setAcademicYears(yearRows)
        setSelectedId(current => current && ordered.some(level => level.id === current) ? current : ordered[0]?.id ?? null)
      } catch (err) {
        setError(friendlyApiError(err, 'load examination levels'))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const selected = useMemo(() => levels.find(level => level.id === selectedId) ?? null, [levels, selectedId])
  const yearsById = useMemo(() => new Map(academicYears.map(year => [year.id, year.name])), [academicYears])
  const classesByLevel = useMemo(() => {
    const map = new Map<number, SchoolClass[]>()
    for (const item of classes) {
      if (item.level_id == null) continue
      const current = map.get(item.level_id) ?? []
      current.push(item)
      map.set(item.level_id, current)
    }
    for (const items of map.values()) items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    return map
  }, [classes])

  const selectedClasses = selected ? classesByLevel.get(selected.id) ?? [] : []

  return (
    <div>
      <PageHeader
        title="Examination Levels"
        description="View the academic levels and classes already defined in Academic Setup. Examination does not duplicate or edit academic structure."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="card" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div>
          <strong>Academic structure is managed centrally</strong>
          <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>
            Levels, grades/classes and academic years come from Academic Setup. Use this page only to confirm what is available for examinations.
          </p>
        </div>
        <a className="button button--ghost" href="/academic-setup">Open Academic Setup</a>
      </div>

      {loading ? <LoadingBlock label="Loading academic levels" rows={4} /> : !levels.length ? (
        <EmptyState title="No academic levels" description="Create the academic structure in Academic Setup before configuring examinations." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(15rem, .75fr) minmax(0, 2fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
          <section className="card" aria-label="Academic levels">
            <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
              <strong>Levels</strong>
              <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>Existing academic levels only.</p>
            </div>
            <div style={{ padding: 'var(--space-2)' }}>
              {levels.map(level => {
                const active = level.id === selectedId
                const count = classesByLevel.get(level.id)?.length ?? 0
                return (
                  <button
                    key={level.id}
                    type="button"
                    className={`button button--block ${active ? 'button--primary' : 'button--ghost'}`}
                    style={{ justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}
                    onClick={() => setSelectedId(level.id)}
                  >
                    <span style={{ textAlign: 'left' }}><strong>{level.name}</strong><small style={{ display: 'block', opacity: .75 }}>{level.code}</small></span>
                    <span>{count}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {selected && (
            <section className="card" style={{ overflowX: 'auto' }}>
              <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'start', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Academic level</p>
                  <h2 style={{ margin: 'var(--space-1) 0' }}>{selected.name}</h2>
                  <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>{selectedClasses.length} existing class{selectedClasses.length === 1 ? '' : 'es'} available to examination setup.</p>
                </div>
                <Badge tone={isActive(selected.status) ? 'success' : 'warning'}>{isActive(selected.status) ? 'Active' : 'Inactive'}</Badge>
              </div>

              {!selectedClasses.length ? (
                <EmptyState title="No classes in this level" description="Add the class in Academic Setup. It will automatically become available here." />
              ) : (
                <table style={{ width: '100%' }}>
                  <thead><tr><th>Class</th><th>Code</th><th>Academic year</th><th>Examination availability</th></tr></thead>
                  <tbody>
                    {selectedClasses.map(item => (
                      <tr key={item.id}>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.code || '—'}</td>
                        <td>{item.academic_year_id != null ? yearsById.get(item.academic_year_id) ?? `Year ${item.academic_year_id}` : 'Not set'}</td>
                        <td><Badge tone={item.status?.toLowerCase() === 'active' ? 'success' : 'warning'}>{item.status?.toLowerCase() === 'active' ? 'Available' : 'Check class status'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export default ExaminationLevelsPage
