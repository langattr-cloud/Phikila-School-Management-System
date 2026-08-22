import { useEffect, useMemo, useState } from 'react'
import { Link } from '../lib/router'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type Constraint, type SchoolClass, type Slots, type Subject, type Teacher } from '../lib/scheduling'

const EMPTY: Slots = {}
const FALLBACK_CALENDAR: Calendar = {
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((name, index) => ({ id: index + 1, index, name, is_active: true })),
  periods: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, index, name: `Period ${index + 1}`, start_time: '', end_time: '', is_teaching: true })),
}
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
  const [usingFallbackCalendar, setUsingFallbackCalendar] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Slots>(EMPTY)
  const [saved, setSaved] = useState<Slots>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resources = useMemo<Resource[]>(() => kind === 'teachers' ? teachers : kind === 'classes' ? classes : subjects, [kind, teachers, classes, subjects])
  const selected = resources.find((resource) => resource.id === selectedId) ?? null
  const days = calendar?.days.filter((day) => day.is_active) ?? []
  const periods = calendar?.periods.filter((period) => period.is_teaching) ?? []
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const blockedCount = Object.values(draft).flat().length

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    Promise.allSettled([scheduling.calendar(), scheduling.teachers(), scheduling.classes(), scheduling.subjects(), scheduling.constraints()])
      .then((results) => {
        if (!active) return
        const [calendarResult, teachersResult, classesResult, subjectsResult, constraintsResult] = results
        if (calendarResult.status === 'fulfilled') {
          setCalendar(calendarResult.value)
          setUsingFallbackCalendar(false)
        } else {
          setCalendar(FALLBACK_CALENDAR)
          setUsingFallbackCalendar(true)
        }
        if (teachersResult.status === 'fulfilled') setTeachers(teachersResult.value)
        if (classesResult.status === 'fulfilled') setClasses(classesResult.value)
        if (subjectsResult.status === 'fulfilled') setSubjects(subjectsResult.value)
        if (constraintsResult.status === 'fulfilled') setConstraints(constraintsResult.value)
        const firstTeacher = teachersResult.status === 'fulfilled' ? teachersResult.value[0] : undefined
        const firstClass = classesResult.status === 'fulfilled' ? classesResult.value[0] : undefined
        const firstSubject = subjectsResult.status === 'fulfilled' ? subjectsResult.value[0] : undefined
        setSelectedId(firstTeacher?.id ?? firstClass?.id ?? firstSubject?.id ?? null)
        const failed = results.find((result) => result.status === 'rejected')
        if (failed?.status === 'rejected') setError(friendlyApiError(failed.reason, 'load the time-off grid'))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selected) { setDraft(EMPTY); setSaved(EMPTY); return }
    const next = kind === 'subjects' ? constraintSlots(constraints, selected.id) : (selected as Teacher | SchoolClass).unavailable ?? EMPTY
    setDraft(next)
    setSaved(next)
  }, [selected, kind, constraints])

  useEffect(() => {
    if (resources.length === 0) { setSelectedId(null); return }
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
        const existing = constraints.filter((item) => item.kind === 'avoid_lessons' && item.scope === 'subject' && item.target_id === selected.id)
        for (const row of existing) await scheduling.deleteConstraint(row.id)
        const withoutExisting = (current: Constraint[]) => current.filter((item) => !existing.some((old) => old.id === item.id))
        if (blockedCount > 0) {
          const created = await scheduling.createConstraint({ kind: 'avoid_lessons', scope: 'subject', target_id: selected.id, is_hard: true, weight: 100, params: { slots: draft }, enabled: true, note: `${selected.name} time off` })
          setConstraints((current) => [...withoutExisting(current), created])
        } else setConstraints(withoutExisting)
      }
      setSaved(draft)
      notify(`${selected.name} time off saved.`, 'success')
    } catch (err) {
      setError(friendlyApiError(err, 'save time-off changes'))
    } finally { setSaving(false) }
  }

  function clearAll() { setDraft(EMPTY) }

  if (loading) return <><PageHeader title="Time off" description="Mark unavailable lesson periods using the timetable grid." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Time off' }]} /><section className="card section"><p className="form__note">Loading time-off grid…</p></section></>

  return <>
    <PageHeader title="Time off" description="Choose a teacher, class, or subject, then click the timetable cells to mark unavailable periods." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Time off' }]} actions={<button type="button" className="button button--primary button--sm" onClick={save} disabled={!dirty || saving || !selected}>{saving ? 'Saving…' : 'Save changes'}</button>} />
    {error && <Alert tone="error">{error}</Alert>}
    <section className="card section timeoff-panel">
      <div className="timeoff-picker">
        <div className="timeoff-picker__type">
          <span className="field__label">Mark time off for</span>
          <div className="timeoff-type-buttons" role="group" aria-label="Resource type">
            {([['teachers', 'Teachers'], ['classes', 'Classes'], ['subjects', 'Subjects']] as const).map(([value, label]) => <button key={value} type="button" className={`timeoff-type-button${kind === value ? ' timeoff-type-button--active' : ''}`} onClick={() => switchKind(value)}>{label}</button>)}
          </div>
        </div>
        <label className="field timeoff-resource"><span className="field__label">{kind === 'teachers' ? 'Teacher' : kind === 'classes' ? 'Class' : 'Subject / learning area'}</span><select className="input" value={selectedId ?? ''} onChange={(event) => setSelectedId(Number(event.target.value))} disabled={resources.length === 0}>{resources.length === 0 && <option value="">No {kind} available</option>}{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}{resource.code ? ` (${resource.code})` : ''}</option>)}</select></label>
      </div>

      <div className="timeoff-instruction"><div><strong>Click the boxes below</strong><span>✓ Available</span><span>✕ Time off</span></div><strong>{blockedCount} period{blockedCount === 1 ? '' : 's'} blocked</strong></div>

      {!selected ? <div className="timeoff-empty"><strong>No {kind.slice(0, -1)} selected</strong><p>Add and select a resource above to mark its unavailable periods.</p><Link className="button button--secondary button--sm" to={kind === 'teachers' ? '/setup/teachers' : kind === 'classes' ? '/setup/classes' : '/setup/subjects'}>Configure {kind}</Link></div> : calendar && days.length && periods.length ? <>
        {usingFallbackCalendar && <div className="timeoff-notice">The working-day calendar is unavailable, so a Monday–Friday, 8-period grid is shown. You can still mark cells; saving requires the API to be reachable.</div>}
        <div className="timeoff-grid-wrap"><table className="timeoff-grid"><thead><tr><th scope="col" className="timeoff-grid__corner">DAY</th>{periods.map((period, index) => <th key={period.index} scope="col" className="timeoff-grid__period"><span>{index + 1}</span><small>{period.name}</small>{period.start_time && <em>{period.start_time}</em>}</th>)}</tr></thead><tbody>{days.map((day) => <tr key={day.index}><th scope="row" className="timeoff-grid__day">{day.name}</th>{periods.map((period) => { const unavailable = (draft[String(day.index)] ?? []).includes(period.index); return <td key={period.index} className="timeoff-grid__cell"><button type="button" onClick={() => toggle(day.index, period.index)} aria-pressed={unavailable} aria-label={`${day.name}, ${period.name}: ${unavailable ? 'time off' : 'available'}`} className={`timeoff-grid__button${unavailable ? ' timeoff-grid__button--blocked' : ''}`}><span>{unavailable ? '✕' : '✓'}</span></button></td> })}</tr>)}</tbody></table></div>
        <div className="timeoff-actions"><button type="button" className="button button--ghost button--sm" onClick={clearAll} disabled={blockedCount === 0}>Clear all</button><button type="button" className="button button--primary button--sm" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save time off'}</button>{dirty && <span className="timeoff-unsaved">Unsaved changes</span>}</div>
      </> : <div className="timeoff-empty"><strong>No timetable periods available</strong><p>Set up working days and teaching periods first.</p><Link className="button button--secondary button--sm" to="/setup/periods">Configure days &amp; periods</Link></div>}
    </section>
    <style>{`
      .timeoff-panel{overflow:hidden}.timeoff-picker{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(220px,.8fr);gap:1rem;padding:1rem;border:1px solid #d8dee8;border-radius:12px;background:#f8fafc;margin-bottom:1rem}.timeoff-type-buttons{display:flex;gap:.5rem;margin-top:.45rem;flex-wrap:wrap}.timeoff-type-button{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:.55rem .85rem;font-weight:800;cursor:pointer}.timeoff-type-button--active{background:#172033;color:#fff;border-color:#172033}.timeoff-resource{min-width:0}.timeoff-instruction{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin:.5rem 0 .75rem;padding:.75rem 1rem;border-radius:10px;background:#eef2f7;color:#334155}.timeoff-instruction div{display:flex;gap:1rem;align-items:center;flex-wrap:wrap}.timeoff-instruction span{font-weight:800}.timeoff-instruction span:first-of-type{color:#15803d}.timeoff-instruction span:last-of-type{color:#b91c1c}.timeoff-grid-wrap{overflow:auto;border:2px solid #cbd5e1;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.06)}.timeoff-grid{width:100%;min-width:760px;border-collapse:separate;border-spacing:0;table-layout:fixed}.timeoff-grid th,.timeoff-grid td{border-right:1px solid #d7dee8;border-bottom:1px solid #d7dee8}.timeoff-grid tr>*:last-child{border-right:0}.timeoff-grid tbody tr:last-child>*{border-bottom:0}.timeoff-grid__corner,.timeoff-grid__day{width:8rem;background:#f1f5f9;text-align:left}.timeoff-grid__corner{padding:.8rem;font-size:.72rem;letter-spacing:.06em}.timeoff-grid__day{padding:.8rem;font-size:.85rem;font-weight:850}.timeoff-grid__period{height:4.2rem;padding:.35rem;text-align:center;background:#f8fafc}.timeoff-grid__period>span{display:block;font-size:1rem;font-weight:900}.timeoff-grid__period small{display:block;font-size:.66rem;font-weight:750;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timeoff-grid__period em{display:block;font-size:.6rem;color:#64748b;font-style:normal}.timeoff-grid__cell{height:4.25rem;padding:4px;background:#fff}.timeoff-grid__button{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:3.7rem;border:2px solid #86efac;border-radius:8px;background:#f0fdf4;color:#15803d;cursor:pointer;font-size:1.7rem;font-weight:950;transition:transform .08s ease,background .12s ease,border-color .12s ease}.timeoff-grid__button:hover{background:#dcfce7;border-color:#4ade80}.timeoff-grid__button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}.timeoff-grid__button--blocked{border-color:#f87171;background:#fef2f2;color:#b91c1c}.timeoff-grid__button--blocked:hover{background:#fee2e2;border-color:#ef4444}.timeoff-grid__button:active{transform:scale(.96)}.timeoff-notice{margin:.75rem 0;padding:.7rem .85rem;border:1px solid #f5c97a;border-radius:8px;background:#fff8e7;color:#7c4a03;font-size:.8rem}.timeoff-actions{display:flex;align-items:center;gap:.75rem;margin-top:.85rem;flex-wrap:wrap}.timeoff-unsaved{font-size:.8rem;font-weight:800;color:#b45309}.timeoff-empty{padding:2rem 1rem;text-align:center;border:2px dashed #cbd5e1;border-radius:12px;background:#f8fafc}.timeoff-empty p{margin:.35rem 0 1rem;color:#64748b}.timeoff-empty strong{font-size:1rem}@media(max-width:720px){.timeoff-picker{grid-template-columns:1fr}.timeoff-grid__corner,.timeoff-grid__day{width:6.5rem}.timeoff-instruction{align-items:flex-start;flex-direction:column}}
    `}</style>
  </>
}
