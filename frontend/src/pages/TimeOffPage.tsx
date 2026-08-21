import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from '../lib/router'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type Constraint, type SchoolClass, type Slots, type Subject, type Teacher } from '../lib/scheduling'

const EMPTY: Slots = {}
type Kind = 'teachers' | 'classes' | 'subjects'
type Resource = Teacher | SchoolClass | Subject

function constraintSlots(constraints: Constraint[], subjectId: number): Slots {
  const row = constraints.find((item) => item.kind === 'avoid_lessons' && item.scope === 'subject' && item.target_id === subjectId && item.enabled)
  const slots = row?.params?.slots
  return slots && typeof slots === 'object' ? slots as Slots : EMPTY
}

export function TimeOffPage() {
  const { notify } = useToast()
  const [kind, setKind] = useState<Kind>('teachers')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [constraints, setConstraints] = useState<Constraint[]>([])
  const [calendar, setCalendar] = useState<Calendar | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Slots>(EMPTY)
  const [saved, setSaved] = useState<Slots>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resources = useMemo<Resource[]>(
    () => kind === 'teachers' ? teachers : kind === 'classes' ? classes : subjects,
    [kind, teachers, classes, subjects]
  )
  const selected = resources.find((resource) => resource.id === selectedId) ?? null
  const days = calendar?.days.filter((day) => day.is_active) ?? []
  const periods = calendar?.periods.filter((period) => period.is_teaching) ?? []
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const blockedCount = Object.values(draft).flat().length

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([
      scheduling.calendar(),
      scheduling.teachers(),
      scheduling.classes(),
      scheduling.subjects(),
      scheduling.constraints(),
    ])
      .then(([nextCalendar, nextTeachers, nextClasses, nextSubjects, nextConstraints]) => {
        if (!active) return
        setCalendar(nextCalendar)
        setTeachers(nextTeachers)
        setClasses(nextClasses)
        setSubjects(nextSubjects)
        setConstraints(nextConstraints)
        setSelectedId(nextTeachers[0]?.id ?? nextClasses[0]?.id ?? nextSubjects[0]?.id ?? null)
      })
      .catch((err) => {
        if (active) setError(friendlyApiError(err, 'load the time-off grid'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selected) {
      setDraft(EMPTY)
      setSaved(EMPTY)
      return
    }
    const next = kind === 'subjects'
      ? constraintSlots(constraints, selected.id)
      : (selected as Teacher | SchoolClass).unavailable ?? EMPTY
    setDraft(next)
    setSaved(next)
  }, [selected, kind, constraints])

  useEffect(() => {
    if (resources.length === 0) {
      setSelectedId(null)
      return
    }
    if (!resources.some((resource) => resource.id === selectedId)) setSelectedId(resources[0].id)
  }, [resources, selectedId])

  function switchKind(nextKind: Kind) {
    if (dirty && !window.confirm('You have unsaved time-off changes. Discard them?')) return
    setKind(nextKind)
    setSelectedId(null)
  }

  function toggle(dayIndex: number, periodIndex: number) {
    const key = String(dayIndex)
    const current = new Set(draft[key] ?? [])
    if (current.has(periodIndex)) current.delete(periodIndex)
    else current.add(periodIndex)

    const next = { ...draft }
    if (current.size === 0) delete next[key]
    else next[key] = [...current].sort((a, b) => a - b)
    setDraft(next)
  }

  async function save() {
    if (!selected || saving || !dirty) return
    setSaving(true)
    setError(null)
    try {
      if (kind === 'teachers') {
        const updated = await scheduling.updateTeacher(selected.id, { ...selected, unavailable: draft })
        setTeachers((current) => current.map((item) => item.id === updated.id ? updated : item))
      } else if (kind === 'classes') {
        const updated = await scheduling.updateClass(selected.id, { ...selected, unavailable: draft })
        setClasses((current) => current.map((item) => item.id === updated.id ? updated : item))
      } else {
        const existing = constraints.filter(
          (item) => item.kind === 'avoid_lessons' && item.scope === 'subject' && item.target_id === selected.id
        )
        for (const row of existing) await scheduling.deleteConstraint(row.id)
        const withoutExisting = (current: Constraint[]) =>
          current.filter((item) => !existing.some((old) => old.id === item.id))
        if (blockedCount > 0) {
          const created = await scheduling.createConstraint({
            kind: 'avoid_lessons',
            scope: 'subject',
            target_id: selected.id,
            is_hard: true,
            weight: 100,
            params: { slots: draft },
            enabled: true,
            note: `${selected.name} time off`,
          })
          setConstraints((current) => [...withoutExisting(current), created])
        } else {
          setConstraints(withoutExisting)
        }
      }
      setSaved(draft)
      notify(`${selected.name} time off saved.`, 'success')
    } catch (err) {
      setError(friendlyApiError(err, 'save time-off changes'))
    } finally {
      setSaving(false)
    }
  }

  function clearAll() {
    setDraft(EMPTY)
  }

  return (
    <>
      <PageHeader
        title="Time off"
        description="Mark unavailable lesson periods using the timetable grid. Click a cell to switch between available and time off."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Time off' }]}
        actions={
          <button type="button" className="button button--primary button--sm" onClick={save} disabled={!dirty || saving || !selected}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <section className="card section">
        <div className="form--grid" style={{ marginBottom: '1rem' }}>
          <label className="field">
            <span className="field__label">Resource type</span>
            <select className="input" value={kind} onChange={(event) => switchKind(event.target.value as Kind)}>
              <option value="teachers">Teachers</option>
              <option value="classes">Classes</option>
              <option value="subjects">Subjects</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">{kind === 'teachers' ? 'Teacher' : kind === 'classes' ? 'Class' : 'Subject'}</span>
            <select
              className="input"
              value={selectedId ?? ''}
              onChange={(event) => setSelectedId(Number(event.target.value))}
              disabled={loading || resources.length === 0}
            >
              {resources.length === 0 && <option value="">No {kind} available</option>}
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name} ({resource.code})
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="form__note">Loading days, periods and resources…</p>
        ) : !selected ? (
          <div>
            <p className="form__note">Add a {kind === 'teachers' ? 'teacher' : kind === 'classes' ? 'class' : 'subject'} first.</p>
            <Link
              className="button button--secondary button--sm"
              to={kind === 'teachers' ? '/setup/teachers' : kind === 'classes' ? '/setup/classes' : '/setup/subjects'}
            >
              Configure {kind === 'teachers' ? 'teachers' : kind === 'classes' ? 'classes' : 'subjects'}
            </Link>
          </div>
        ) : calendar && days.length && periods.length ? (
          <>
            <div className="timeoff-toolbar">
              <div>
                <h2 className="section__title" style={{ marginBottom: '0.15rem' }}>{selected.name}</h2>
                <p className="field__hint">Click any period. <strong>✓</strong> means available; <strong>X</strong> means time off.</p>
              </div>
              <div className="timeoff-legend" aria-label="Time-off legend">
                <span className="timeoff-legend__item timeoff-legend__item--available"><strong>✓</strong> Available</span>
                <span className="timeoff-legend__item timeoff-legend__item--blocked"><strong>X</strong> Time off</span>
                <span className="timeoff-legend__count">{blockedCount} blocked</span>
              </div>
            </div>

            <div className="timeoff-grid-wrap">
              <table className="timeoff-grid">
                <thead>
                  <tr>
                    <th scope="col" className="timeoff-grid__corner">Day</th>
                    {periods.map((period, index) => (
                      <th key={period.index} scope="col" className="timeoff-grid__period" title={`${period.start_time}–${period.end_time}`}>
                        <span className="timeoff-grid__period-number">{index + 1}</span>
                        <span className="timeoff-grid__period-name">{period.name}</span>
                        <span className="timeoff-grid__period-time">{period.start_time}–{period.end_time}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <tr key={day.index}>
                      <th scope="row" className="timeoff-grid__day">{day.name}</th>
                      {periods.map((period) => {
                        const unavailable = (draft[String(day.index)] ?? []).includes(period.index)
                        return (
                          <td key={period.index} className="timeoff-grid__cell">
                            <button
                              type="button"
                              onClick={() => toggle(day.index, period.index)}
                              aria-pressed={unavailable}
                              aria-label={`${day.name}, ${period.name}: ${unavailable ? 'time off' : 'available'}`}
                              className={`timeoff-grid__button${unavailable ? ' timeoff-grid__button--blocked' : ''}`}
                            >
                              <span aria-hidden="true" className="timeoff-grid__mark">{unavailable ? 'X' : '✓'}</span>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="timeoff-actions">
              <button type="button" className="button button--ghost button--sm" onClick={clearAll} disabled={blockedCount === 0}>
                Clear all time off
              </button>
              <button type="button" className="button button--primary button--sm" onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {dirty && <span className="form__note" role="status">Unsaved changes</span>}
            </div>
          </>
        ) : (
          <div>
            <p className="form__note">Set up at least one active working day and one teaching period first.</p>
            <Link className="button button--secondary button--sm" to="/setup/periods">Configure days &amp; periods</Link>
          </div>
        )}
      </section>
    </>
  )
}

const gridBorder = '1px solid var(--color-line)'

const timeoffStyles = `
.timeoff-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
  flex-wrap: wrap;
}
.timeoff-legend {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  font-size: 0.78rem;
  font-weight: 700;
}
.timeoff-legend__item { display: inline-flex; align-items: center; gap: 0.3rem; }
.timeoff-legend__item strong { font-size: 1rem; }
.timeoff-legend__item--available { color: var(--color-success); }
.timeoff-legend__item--blocked { color: var(--color-danger); }
.timeoff-legend__count { color: var(--color-muted); }
.timeoff-grid-wrap {
  overflow-x: auto;
  border: ${gridBorder};
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.timeoff-grid {
  width: 100%;
  min-width: 760px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.timeoff-grid th,
.timeoff-grid td { border-right: ${gridBorder}; border-bottom: ${gridBorder}; }
.timeoff-grid tr > *:last-child { border-right: 0; }
.timeoff-grid tbody tr:last-child > * { border-bottom: 0; }
.timeoff-grid__corner,
.timeoff-grid__day {
  width: 7.5rem;
  background: var(--color-surface-muted);
  text-align: left;
}
.timeoff-grid__corner { padding: 0.65rem 0.7rem; font-size: 0.78rem; font-weight: 800; }
.timeoff-grid__day { padding: 0.65rem 0.7rem; font-size: 0.82rem; font-weight: 800; white-space: nowrap; }
.timeoff-grid__period {
  padding: 0.45rem 0.25rem 0.5rem;
  background: var(--color-surface-muted);
  text-align: center;
  vertical-align: middle;
}
.timeoff-grid__period-number { display: block; font-size: 0.95rem; font-weight: 850; line-height: 1.1; }
.timeoff-grid__period-name { display: block; margin-top: 0.15rem; font-size: 0.68rem; font-weight: 750; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.timeoff-grid__period-time { display: block; margin-top: 0.1rem; font-size: 0.6rem; color: var(--color-muted); white-space: nowrap; }
.timeoff-grid__cell { padding: 0; height: 3.65rem; }
.timeoff-grid__button {
  width: 100%;
  height: 100%;
  min-height: 3.65rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0;
  background: var(--color-success-soft);
  color: var(--color-success);
  cursor: pointer;
  transition: transform 80ms ease, filter 80ms ease;
}
.timeoff-grid__button:hover { filter: brightness(0.96); }
.timeoff-grid__button:active { transform: scale(0.96); }
.timeoff-grid__button:focus-visible { outline: 2px solid currentColor; outline-offset: -3px; }
.timeoff-grid__button--blocked { background: var(--color-danger-soft); color: var(--color-danger); }
.timeoff-grid__mark { font-size: 1.45rem; font-weight: 900; line-height: 1; }
.timeoff-actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.85rem; flex-wrap: wrap; }
@media (max-width: 720px) {
  .timeoff-grid__corner,
  .timeoff-grid__day { width: 6.5rem; }
  .timeoff-grid__period-time { display: none; }
}
`

if (typeof document !== 'undefined' && !document.getElementById('timeoff-grid-styles')) {
  const style = document.createElement('style')
  style.id = 'timeoff-grid-styles'
  style.textContent = timeoffStyles
  document.head.appendChild(style)
}
