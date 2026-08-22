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
  const totalSlots = days.length * periods.length
  const availableCount = Math.max(totalSlots - blockedCount, 0)
  const blockedPercent = totalSlots ? Math.round((blockedCount / totalSlots) * 100) : 0
  const resourceLabel = kind === 'teachers' ? 'Teacher' : kind === 'classes' ? 'Class' : 'Learning area'

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

  function toggleDay(dayIndex: number) {
    const key = String(dayIndex)
    const current = new Set(draft[key] ?? [])
    const allBlocked = periods.length > 0 && periods.every((period) => current.has(period.index))
    const next = { ...draft }
    if (allBlocked) delete next[key]
    else next[key] = periods.map((period) => period.index)
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
    <PageHeader title="Time off" description="Set precise availability for teachers, classes, and learning areas directly on the timetable grid." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Time off' }]} actions={<button type="button" className="button button--primary button--sm" onClick={save} disabled={!dirty || saving || !selected}>{saving ? 'Saving…' : 'Save changes'}</button>} />
    {error && <Alert tone="error">{error}</Alert>}
    <section className="card section timeoff-panel">
      <div className="timeoff-hero">
        <div className="timeoff-hero__copy">
          <div className="timeoff-eyebrow">AVAILABILITY PLANNER</div>
          <h2>Time off, made visual</h2>
          <p>Click any timetable cell to switch between available and unavailable. Changes stay local until you save.</p>
        </div>
        <div className="timeoff-hero__stats" aria-label="Time off summary">
          <div className="timeoff-stat"><strong>{blockedCount}</strong><span>Time off</span></div>
          <div className="timeoff-stat"><strong>{availableCount}</strong><span>Available</span></div>
          <div className="timeoff-stat"><strong>{blockedPercent}%</strong><span>Blocked</span></div>
        </div>
      </div>

      <div className="timeoff-picker">
        <div className="timeoff-picker__type">
          <span className="field__label">1. Choose what you are scheduling</span>
          <div className="timeoff-type-buttons" role="group" aria-label="Resource type">
            {([['teachers', 'Teachers', 'People'], ['classes', 'Classes', 'Groups'], ['subjects', 'Subjects', 'Learning areas']] as const).map(([value, label, hint]) => <button key={value} type="button" className={`timeoff-type-button${kind === value ? ' timeoff-type-button--active' : ''}`} onClick={() => switchKind(value)}><span>{label}</span><small>{hint}</small></button>)}
          </div>
        </div>
        <label className="field timeoff-resource"><span className="field__label">2. Select {resourceLabel.toLowerCase()}</span><select className="input" value={selectedId ?? ''} onChange={(event) => setSelectedId(Number(event.target.value))} disabled={resources.length === 0}>{resources.length === 0 && <option value="">No {kind} available</option>}{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}{resource.code ? ` (${resource.code})` : ''}</option>)}</select></label>
      </div>

      <div className="timeoff-toolbar">
        <div className="timeoff-toolbar__legend"><span className="timeoff-status timeoff-status--available"><i>✓</i> Available</span><span className="timeoff-status timeoff-status--blocked"><i>×</i> Time off</span></div>
        <div className={`timeoff-save-state${dirty ? ' timeoff-save-state--dirty' : ''}`}><span className="timeoff-save-dot" />{dirty ? 'Unsaved changes' : 'All changes saved'}</div>
      </div>

      {!selected ? <div className="timeoff-empty"><strong>No {kind.slice(0, -1)} selected</strong><p>Add and select a resource above to mark its unavailable periods.</p><Link className="button button--secondary button--sm" to={kind === 'teachers' ? '/setup/teachers' : kind === 'classes' ? '/setup/classes' : '/setup/subjects'}>Configure {kind}</Link></div> : calendar && days.length && periods.length ? <>
        {usingFallbackCalendar && <div className="timeoff-notice">The working-day calendar is unavailable, so a Monday–Friday, 8-period grid is shown. You can still mark cells; saving requires the API to be reachable.</div>}
        <div className="timeoff-grid-shell">
          <div className="timeoff-grid-caption"><div><strong>{selected.name}</strong><span>{resourceLabel} availability</span></div><span>{days.length} days · {periods.length} teaching periods</span></div>
          <div className="timeoff-grid-wrap"><table className="timeoff-grid"><thead><tr><th scope="col" className="timeoff-grid__corner"><span>WEEK</span><small>DAY</small></th>{periods.map((period, index) => <th key={period.index} scope="col" className="timeoff-grid__period"><span>P{index + 1}</span><small>{period.name}</small>{period.start_time && <em>{period.start_time}{period.end_time ? `–${period.end_time}` : ''}</em>}</th>)}</tr></thead><tbody>{days.map((day) => { const row = new Set(draft[String(day.index)] ?? []); const dayBlocked = periods.length > 0 && periods.every((period) => row.has(period.index)); return <tr key={day.index}><th scope="row" className="timeoff-grid__day"><span>{day.name.slice(0, 3)}</span><strong>{day.name}</strong><button type="button" onClick={() => toggleDay(day.index)} className="timeoff-day-toggle" aria-label={`${dayBlocked ? 'Clear' : 'Mark'} all ${day.name} periods as time off`}>{dayBlocked ? 'Clear day' : 'All day'}</button></th>{periods.map((period) => { const unavailable = row.has(period.index); return <td key={period.index} className="timeoff-grid__cell"><button type="button" onClick={() => toggle(day.index, period.index)} aria-pressed={unavailable} aria-label={`${day.name}, ${period.name}: ${unavailable ? 'time off' : 'available'}`} className={`timeoff-grid__button${unavailable ? ' timeoff-grid__button--blocked' : ''}`}><span className="timeoff-grid__icon">{unavailable ? '×' : '✓'}</span><small>{unavailable ? 'Time off' : 'Available'}</small></button></td> })}</tr> })}</tbody></table></div>
        </div>
        <div className="timeoff-actions"><button type="button" className="button button--ghost button--sm" onClick={clearAll} disabled={blockedCount === 0}>Clear all time off</button><div className="timeoff-actions__right">{dirty && <span className="timeoff-unsaved">Review your changes, then save.</span>}<button type="button" className="button button--primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save time off'}</button></div></div>
      </> : <div className="timeoff-empty"><strong>No timetable periods available</strong><p>Set up working days and teaching periods first.</p><Link className="button button--secondary button--sm" to="/setup/periods">Configure days &amp; periods</Link></div>}
    </section>
    <style>{`
      .timeoff-panel{overflow:hidden;padding:0;background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 10px 35px rgba(15,23,42,.07)}
      .timeoff-hero{display:flex;justify-content:space-between;gap:2rem;padding:1.45rem 1.5rem;background:linear-gradient(135deg,#111827 0%,#1e293b 58%,#263449 100%);color:#fff}
      .timeoff-hero__copy{min-width:0}.timeoff-eyebrow{font-size:.66rem;letter-spacing:.16em;font-weight:900;color:#93c5fd;margin-bottom:.35rem}.timeoff-hero h2{margin:0;font-size:1.35rem;letter-spacing:-.025em}.timeoff-hero p{margin:.4rem 0 0;max-width:650px;color:#cbd5e1;font-size:.83rem;line-height:1.5}
      .timeoff-hero__stats{display:flex;align-self:stretch;border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden;background:rgba(255,255,255,.06);flex-shrink:0}.timeoff-stat{min-width:82px;padding:.55rem .8rem;display:flex;flex-direction:column;justify-content:center;align-items:center;border-left:1px solid rgba(255,255,255,.1)}.timeoff-stat:first-child{border-left:0}.timeoff-stat strong{font-size:1.15rem;line-height:1}.timeoff-stat span{margin-top:.25rem;font-size:.62rem;color:#cbd5e1;font-weight:700}
      .timeoff-picker{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);gap:1.2rem;padding:1.2rem 1.5rem;background:#f8fafc;border-bottom:1px solid #e2e8f0}.timeoff-picker__type .field__label,.timeoff-resource .field__label{display:block;margin-bottom:.5rem}.timeoff-type-buttons{display:flex;gap:.55rem;flex-wrap:wrap}.timeoff-type-button{min-width:120px;border:1px solid #d7dee8;background:#fff;color:#334155;border-radius:11px;padding:.62rem .8rem;text-align:left;font-weight:850;cursor:pointer;transition:.15s ease;box-shadow:0 1px 2px rgba(15,23,42,.03)}.timeoff-type-button span,.timeoff-type-button small{display:block}.timeoff-type-button small{margin-top:.12rem;color:#64748b;font-size:.65rem;font-weight:650}.timeoff-type-button:hover{border-color:#94a3b8;transform:translateY(-1px)}.timeoff-type-button--active{background:#172033;color:#fff;border-color:#172033;box-shadow:0 5px 14px rgba(15,23,42,.14)}.timeoff-type-button--active small{color:#cbd5e1}.timeoff-resource{min-width:0;align-self:end}.timeoff-resource .input{height:2.75rem;border-radius:10px;background:#fff}
      .timeoff-toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.75rem 1.5rem;border-bottom:1px solid #e2e8f0}.timeoff-toolbar__legend{display:flex;gap:1rem;flex-wrap:wrap}.timeoff-status{display:inline-flex;align-items:center;gap:.4rem;font-size:.74rem;font-weight:800}.timeoff-status i{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;font-style:normal;font-size:.9rem}.timeoff-status--available{color:#166534}.timeoff-status--available i{background:#dcfce7;border:1px solid #86efac}.timeoff-status--blocked{color:#991b1b}.timeoff-status--blocked i{background:#fee2e2;border:1px solid #fca5a5}.timeoff-save-state{display:flex;align-items:center;gap:.4rem;color:#64748b;font-size:.72rem;font-weight:750}.timeoff-save-dot{width:7px;height:7px;border-radius:50%;background:#22c55e}.timeoff-save-state--dirty{color:#92400e}.timeoff-save-state--dirty .timeoff-save-dot{background:#f59e0b}
      .timeoff-grid-shell{margin:1rem 1.5rem 0;border:1px solid #dbe3ec;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 3px 14px rgba(15,23,42,.045)}.timeoff-grid-caption{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.8rem 1rem;background:#f8fafc;border-bottom:1px solid #e2e8f0}.timeoff-grid-caption div{display:flex;align-items:baseline;gap:.55rem;min-width:0}.timeoff-grid-caption strong{font-size:.88rem;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timeoff-grid-caption span{font-size:.68rem;color:#64748b}.timeoff-grid-caption>span{white-space:nowrap}
      .timeoff-grid-wrap{overflow:auto;background:#fff}.timeoff-grid{width:100%;min-width:820px;border-collapse:separate;border-spacing:0;table-layout:fixed}.timeoff-grid th,.timeoff-grid td{border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0}.timeoff-grid tr>*:last-child{border-right:0}.timeoff-grid tbody tr:last-child>*{border-bottom:0}.timeoff-grid__corner,.timeoff-grid__day{width:145px;text-align:left}.timeoff-grid__corner{padding:.7rem .9rem;background:#eef2f7;color:#64748b;font-size:.62rem;letter-spacing:.12em}.timeoff-grid__corner span,.timeoff-grid__corner small{display:block}.timeoff-grid__corner small{margin-top:.1rem;font-size:.58rem;letter-spacing:.08em;color:#94a3b8}.timeoff-grid__period{height:4.25rem;padding:.45rem .25rem;text-align:center;background:#f8fafc}.timeoff-grid__period>span{display:block;color:#0f172a;font-size:.78rem;font-weight:900}.timeoff-grid__period small{display:block;margin-top:.1rem;color:#475569;font-size:.61rem;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timeoff-grid__period em{display:block;margin-top:.1rem;color:#94a3b8;font-size:.57rem;font-style:normal;font-weight:650}.timeoff-grid__day{position:relative;padding:.55rem .75rem;background:#fff}.timeoff-grid__day>span{display:none}.timeoff-grid__day strong{display:block;color:#1e293b;font-size:.78rem;font-weight:900}.timeoff-day-toggle{margin-top:.28rem;padding:0;border:0;background:transparent;color:#64748b;font-size:.59rem;font-weight:800;cursor:pointer}.timeoff-day-toggle:hover{color:#2563eb;text-decoration:underline}.timeoff-grid__cell{height:4.65rem;padding:4px;background:#fff}.timeoff-grid__button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.12rem;width:100%;height:100%;min-height:4rem;border:1px solid #bbf7d0;border-radius:9px;background:#f0fdf4;color:#15803d;cursor:pointer;transition:transform .1s ease,box-shadow .12s ease,background .12s ease,border-color .12s ease}.timeoff-grid__button:hover{background:#dcfce7;border-color:#4ade80;box-shadow:0 4px 10px rgba(22,101,52,.1);transform:translateY(-1px)}.timeoff-grid__button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}.timeoff-grid__icon{font-size:1.25rem;line-height:1;font-weight:950}.timeoff-grid__button small{font-size:.57rem;font-weight:800;opacity:.8}.timeoff-grid__button--blocked{border-color:#fecaca;background:#fff1f2;color:#b91c1c}.timeoff-grid__button--blocked:hover{background:#ffe4e6;border-color:#f87171;box-shadow:0 4px 10px rgba(185,28,28,.1)}.timeoff-grid__button:active{transform:scale(.97)}
      .timeoff-notice{margin:1rem 1.5rem 0;padding:.7rem .85rem;border:1px solid #f5c97a;border-radius:9px;background:#fff8e7;color:#7c4a03;font-size:.75rem}.timeoff-actions{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:1rem 1.5rem 1.35rem;flex-wrap:wrap}.timeoff-actions__right{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap}.timeoff-unsaved{font-size:.72rem;font-weight:800;color:#a16207}.timeoff-empty{margin:1rem 1.5rem 1.5rem;padding:2rem 1rem;text-align:center;border:2px dashed #cbd5e1;border-radius:12px;background:#f8fafc}.timeoff-empty p{margin:.35rem 0 1rem;color:#64748b}.timeoff-empty strong{font-size:1rem}
      @media(max-width:820px){.timeoff-hero{flex-direction:column;padding:1.2rem}.timeoff-hero__stats{align-self:stretch}.timeoff-stat{flex:1}.timeoff-picker{grid-template-columns:1fr;padding:1rem}.timeoff-toolbar{padding:.7rem 1rem}.timeoff-grid-shell{margin:1rem 1rem 0}.timeoff-actions{padding:1rem}.timeoff-notice{margin:1rem}.timeoff-grid__corner,.timeoff-grid__day{width:125px}}
      @media(max-width:560px){.timeoff-hero__stats{width:100%}.timeoff-stat{min-width:0;padding:.5rem}.timeoff-type-button{flex:1;min-width:0}.timeoff-toolbar{align-items:flex-start;flex-direction:column}.timeoff-grid-caption{align-items:flex-start;flex-direction:column;gap:.25rem}.timeoff-grid__day>span{display:inline-block;margin-right:.3rem;color:#94a3b8;font-size:.65rem;font-weight:900}.timeoff-grid__day strong{display:inline;font-size:.72rem}}
    `}</style>
  </>
}
