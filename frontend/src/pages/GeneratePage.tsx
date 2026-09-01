import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type Day, type Job, type Period, type TimetableType } from '../lib/scheduling'

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type DayConfig = Day & { display: string }

export function GeneratePage() {
  const { notify } = useToast()
  const [calendar, setCalendar] = useState<Calendar | null>(null)
  const [types, setTypes] = useState<TimetableType[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [typeId, setTypeId] = useState<number | null>(null)
  const [dayIndexes, setDayIndexes] = useState<number[]>([])
  const [dayLabels, setDayLabels] = useState<Record<number, string>>({})
  const [periodIndexes, setPeriodIndexes] = useState<number[]>([])
  const [label, setLabel] = useState('Weekdays Timetable')
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newType, setNewType] = useState(false)
  const [editingType, setEditingType] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newDays, setNewDays] = useState<number[]>([])

  async function load() {
    setLoading(true); setError(null)
    try {
      const [cal, tt] = await Promise.all([scheduling.calendar(), scheduling.timetableTypes()])
      setCalendar(cal); setTypes(tt); setPeriods(cal.periods)
      const allDays = Array.from({ length: 7 }, (_, index) => cal.days.find(d => d.index === index) ?? ({ id: index, index, name: WEEKDAY_NAMES[index], is_active: true } as Day))
      const first = tt[0]
      const initialLabels = Object.fromEntries(allDays.map(d => [d.index, d.name]))
      setDayLabels(initialLabels)
      if (first) { setTypeId(first.id); setLabel(first.name); setDayIndexes(first.day_indexes); setNewDays(first.day_indexes); setPeriodIndexes(cal.periods.filter(p => p.is_teaching).map(p => p.index)) }
    } catch (e) { setError(friendlyApiError(e, 'load timetable generation setup')) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const allDays = Array.from({ length: 7 }, (_, index) => calendar?.days.find(d => d.index === index) ?? ({ id: index, index, name: WEEKDAY_NAMES[index], is_active: true } as Day))
  const teachingPeriods = periods.filter(p => p.is_teaching)
  const selectedPeriods = periodIndexes.length ? periodIndexes : teachingPeriods.map(p => p.index)
  const running = !!job && ['queued', 'running', 'optimizing', 'validating'].includes(job.status)
  const dayConfigs: DayConfig[] = allDays.map(d => ({ ...d, display: dayLabels[d.index] || d.name || WEEKDAY_NAMES[d.index] }))

  function selectType(id: number) {
    const type = types.find(t => t.id === id); if (!type) return
    setTypeId(id); setLabel(type.name); setDayIndexes(type.day_indexes); setNewDays(type.day_indexes); setPeriodIndexes(teachingPeriods.map(p => p.index))
  }
  function toggle(list: number[], value: number, setter: (v: number[]) => void) { setter(list.includes(value) ? list.filter(x => x !== value) : [...list, value].sort((a, b) => a - b)) }
  function updateDayLabel(index: number, value: string) { setDayLabels(current => ({ ...current, [index]: value })) }

  async function saveType() {
    const current = types.find(t => t.id === typeId); if (!current || !newName.trim() || !newCode.trim() || !newDays.length) return
    try {
      const updated = await scheduling.updateTimetableType(current.id, { ...current, name: newName.trim(), code: newCode.trim(), day_indexes: newDays })
      setTypes(v => v.map(t => t.id === updated.id ? updated : t)); selectType(updated.id); setEditingType(false); notify('Timetable type updated.', 'success')
    } catch (e) { notify(friendlyApiError(e, 'update timetable type'), 'error') }
  }
  async function createType() {
    if (!newName.trim() || !newCode.trim() || !newDays.length) return
    try {
      const created = await scheduling.createTimetableType({ name: newName.trim(), code: newCode.trim(), day_indexes: newDays, is_active: true, is_system: false })
      setTypes(v => [...v, created]); selectType(created.id); setNewType(false); setNewName(''); setNewCode(''); setNewDays([]); notify('Timetable type created.', 'success')
    } catch (e) { notify(friendlyApiError(e, 'create timetable type'), 'error') }
  }
  async function generate() {
    if (!typeId || running || starting || !dayIndexes.length || !selectedPeriods.length) return
    setStarting(true)
    try {
      const next = await scheduling.generateProfile({ label: label.trim() || types.find(t => t.id === typeId)?.name || 'Timetable', timetable_type_id: typeId, period_indexes: selectedPeriods, day_indexes: dayIndexes, day_names: Object.fromEntries(dayIndexes.map(index => [index, dayLabels[index] || WEEKDAY_NAMES[index]])), max_seconds: 30 })
      setJob(next); notify('Timetable generation started.', 'success')
    } catch (e) { notify(friendlyApiError(e, 'generate the timetable'), 'error') }
    finally { setStarting(false) }
  }
  useEffect(() => { if (!job || !running) return; const timer = window.setInterval(() => void scheduling.job(job.id).then(setJob).catch(() => undefined), 900); return () => window.clearInterval(timer) }, [job?.id, job?.status, running])

  return <>
    <PageHeader title="Generate timetable" description="Choose a timetable type, any days from Monday to Sunday, and the periods used for generation." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Generate' }]} />
    {loading ? <div className="card section"><LoadingBlock label="Loading timetable setup" rows={4} /></div> : error ? <Alert tone="error" title="Setup could not load">{error}</Alert> : <>
      <section className="card section">
        <div className="panel__head"><div><h2 className="section__title">Create timetable</h2><p className="form__note">Classes and teachers remain independent school records and are used automatically.</p></div><Badge tone="neutral">Draft until Put Into Force</Badge></div>
        <div className="form form--grid">
          <div className="field form--grid__full"><label className="field__label" htmlFor="tt-type">Timetable Type</label><div className="form__row"><select id="tt-type" className="input input--select" value={typeId ?? ''} onChange={e => selectType(Number(e.target.value))}><option value="">Choose type…</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><button className="button button--secondary" type="button" disabled={!typeId} onClick={() => { const t = types.find(x => x.id === typeId); if (t) { setNewName(t.name); setNewCode(t.code); setNewDays(t.day_indexes) }; setEditingType(v => !v) }}>Edit</button></div></div>
          <div className="field form--grid__full"><label className="field__label">Days</label><div className="chip-toggles">{dayConfigs.map(d => <label key={d.index} className={`chip-toggle ${dayIndexes.includes(d.index) ? 'chip-toggle--on' : ''}`}><input type="checkbox" checked={dayIndexes.includes(d.index)} onChange={() => toggle(dayIndexes, d.index, setDayIndexes)} /><span>{d.display}</span></label>)}</div><span className="form__note">All seven days are available. Select any combination for this timetable.</span></div>
          <div className="field form--grid__full"><label className="field__label">Day display labels</label><div className="form form--grid">{allDays.map(d => <div className="field" key={d.index}><label className="field__label" htmlFor={`day-label-${d.index}`}>{WEEKDAY_NAMES[d.index]}</label><input id={`day-label-${d.index}`} className="input" value={dayLabels[d.index] ?? d.name} onChange={e => updateDayLabel(d.index, e.target.value)} placeholder={WEEKDAY_NAMES[d.index]} /></div>)}</div><span className="form__note">Rename a day for this generated timetable, for example Monday → 31-08-2026. The internal Monday–Sunday index remains unchanged.</span></div>
          <div className="field form--grid__full"><label className="field__label">Periods</label><select multiple className="input" value={selectedPeriods.map(String)} onChange={e => setPeriodIndexes(Array.from(e.target.selectedOptions).map(o => Number(o.value)))}>{teachingPeriods.map(p => <option key={p.index} value={p.index}>{p.name} — {p.start_time}–{p.end_time}</option>)}</select><span className="form__note">Select the teaching periods available to the generated timetable.</span></div>
        </div>
        <div className="form__row" style={{ marginTop: 18 }}><button className="button button--primary" type="button" disabled={!typeId || !dayIndexes.length || !selectedPeriods.length || running || starting} onClick={() => void generate()}>{starting ? 'Starting…' : running ? 'Generating…' : 'Generate Timetable'}</button><button className="button button--secondary" type="button" onClick={() => setNewType(v => !v)}>New timetable type</button></div>
      </section>

      {editingType && <section className="card section"><div className="panel__head"><div><h2 className="section__title">Edit timetable type</h2><p className="form__note">Changes apply to this reusable timetable type. Existing generated timetables are not changed.</p></div></div><div className="form form--grid"><div className="field"><label className="field__label">Name</label><input className="input" value={newName} onChange={e => setNewName(e.target.value)} /></div><div className="field"><label className="field__label">Code</label><input className="input" value={newCode} onChange={e => setNewCode(e.target.value)} /></div><div className="field form--grid__full"><label className="field__label">Default days</label><div className="chip-toggles">{allDays.map(d => <label key={d.index} className={`chip-toggle ${newDays.includes(d.index) ? 'chip-toggle--on' : ''}`}><input type="checkbox" checked={newDays.includes(d.index)} onChange={() => toggle(newDays, d.index, setNewDays)} />{d.name}</label>)}</div></div></div><div className="form__row" style={{ marginTop: 16 }}><button className="button button--primary" type="button" disabled={!newName.trim() || !newCode.trim() || !newDays.length} onClick={() => void saveType()}>Save Type</button></div></section>}
      {newType && <section className="card section"><div className="panel__head"><div><h2 className="section__title">Create timetable type</h2><p className="form__note">Create a reusable Weekdays, Weekend, or custom timetable type.</p></div></div><div className="form form--grid"><div className="field"><label className="field__label">Name</label><input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Weekend" /></div><div className="field"><label className="field__label">Code</label><input className="input" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="WEEKEND" /></div><div className="field form--grid__full"><label className="field__label">Days</label><div className="chip-toggles">{allDays.map(d => <label key={d.index} className={`chip-toggle ${newDays.includes(d.index) ? 'chip-toggle--on' : ''}`}><input type="checkbox" checked={newDays.includes(d.index)} onChange={() => toggle(newDays, d.index, setNewDays)} />{d.name}</label>)}</div></div></div><div className="form__row" style={{ marginTop: 16 }}><button className="button button--primary" type="button" disabled={!newName.trim() || !newCode.trim() || !newDays.length} onClick={() => void createType()}>Create Type</button></div></section>}
      {job && <section className="card section" aria-live="polite"><div className="panel__head"><div><h2 className="section__title">Generation monitor</h2><p className="form__note">{job.message || job.stage}</p></div><Badge tone={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'neutral'}>{job.status}</Badge></div><div className="progress" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><div className="progress__bar" style={{ width: `${job.progress}%` }} /></div>{job.status === 'completed' && <Alert tone="success" title="Timetable generated">The timetable is saved as a draft. A timetabler must put it into force before members use it.</Alert>}{job.status === 'failed' && <Alert tone="error" title="Generation failed">{job.message || 'The timetable could not be generated.'}</Alert>}</section>}
    </>}
  </>
}
