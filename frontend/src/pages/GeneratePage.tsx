import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type Job, type Period, type TimetableType } from '../lib/scheduling'

export function GeneratePage() {
  const { notify } = useToast()
  const [calendar, setCalendar] = useState<Calendar | null>(null)
  const [types, setTypes] = useState<TimetableType[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [typeId, setTypeId] = useState<number | null>(null)
  const [dayIndexes, setDayIndexes] = useState<number[]>([])
  const [periodIndexes, setPeriodIndexes] = useState<number[]>([])
  const [label, setLabel] = useState('Weekdays Timetable')
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newType, setNewType] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newDays, setNewDays] = useState<number[]>([])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [cal, tt] = await Promise.all([scheduling.calendar(), scheduling.timetableTypes()])
      setCalendar(cal)
      setTypes(tt)
      setPeriods(cal.periods)
      const first = tt[0]
      if (first) {
        setTypeId(first.id)
        setLabel(first.name)
        setDayIndexes(first.day_indexes)
        setNewDays(first.day_indexes)
        setPeriodIndexes(cal.periods.filter((p) => p.is_teaching).map((p) => p.index))
      }
    } catch (e) {
      setError(friendlyApiError(e, 'load timetable generation setup'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const activeDays = calendar?.days.filter((d) => d.is_active) ?? []
  const teachingPeriods = periods.filter((p) => p.is_teaching)
  const selectedPeriods = periodIndexes.length ? periodIndexes : teachingPeriods.map((p) => p.index)
  const running = !!job && ['queued', 'running', 'optimizing', 'validating'].includes(job.status)

  function selectType(id: number) {
    const type = types.find((t) => t.id === id)
    if (!type) return
    setTypeId(id)
    setLabel(type.name)
    setDayIndexes(type.day_indexes)
    setNewDays(type.day_indexes)
    setPeriodIndexes(teachingPeriods.map((p) => p.index))
  }

  function toggle(list: number[], value: number, setter: (v: number[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value].sort((a, b) => a - b))
  }

  async function createType() {
    if (!newName.trim() || !newCode.trim() || !newDays.length) return
    try {
      const created = await scheduling.createTimetableType({ name: newName.trim(), code: newCode.trim(), day_indexes: newDays, is_active: true, is_system: false })
      setTypes((v) => [...v, created])
      selectType(created.id)
      setNewType(false)
      setNewName('')
      setNewCode('')
      setNewDays([])
      notify('Timetable type created.', 'success')
    } catch (e) {
      notify(friendlyApiError(e, 'create timetable type'), 'error')
    }
  }

  async function generate() {
    if (!typeId || running || starting || !dayIndexes.length || !selectedPeriods.length) return
    setStarting(true)
    try {
      const next = await scheduling.generateProfile({
        label: label.trim() || types.find((t) => t.id === typeId)?.name || 'Timetable',
        timetable_type_id: typeId,
        period_indexes: selectedPeriods,
        day_indexes: dayIndexes,
        max_seconds: 30,
      })
      setJob(next)
      notify('Timetable generation started.', 'success')
    } catch (e) {
      notify(friendlyApiError(e, 'generate the timetable'), 'error')
    } finally {
      setStarting(false)
    }
  }

  useEffect(() => {
    if (!job || !running) return
    const timer = window.setInterval(() => void scheduling.job(job.id).then(setJob).catch(() => undefined), 900)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status, running])

  return <>
    <PageHeader title="Generate timetable" description="Choose the timetable type, working days, and periods used for generation." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Generate' }]} />
    {loading ? <div className="card section"><LoadingBlock label="Loading timetable setup" rows={4} /></div> : error ? <Alert tone="error" title="Setup could not load">{error}</Alert> : <>
      <section className="card section">
        <div className="panel__head"><div><h2 className="section__title">Create timetable</h2><p className="form__note">Configure the schedule that will be generated. Classes and teachers remain independent school records and are used automatically.</p></div><Badge tone="neutral">Draft until Put Into Force</Badge></div>
        <div className="form form--grid">
          <div className="field form--grid__full">
            <label className="field__label" htmlFor="tt-type">Timetable Type</label>
            <select id="tt-type" className="input input--select" value={typeId ?? ''} onChange={(e) => selectType(Number(e.target.value))}>
              <option value="">Choose type…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field form--grid__full">
            <label className="field__label">Days</label>
            <div className="chip-toggles">
              {activeDays.map((d) => <label key={d.index} className={`chip-toggle ${dayIndexes.includes(d.index) ? 'chip-toggle--on' : ''}`}>
                <input type="checkbox" checked={dayIndexes.includes(d.index)} onChange={() => toggle(dayIndexes, d.index, setDayIndexes)} />
                {d.name}
              </label>)}
            </div>
            <span className="form__note">Select the days this generated timetable should cover.</span>
          </div>
          <div className="field form--grid__full">
            <label className="field__label">Periods</label>
            <select multiple className="input" value={selectedPeriods.map(String)} onChange={(e) => setPeriodIndexes(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}>
              {teachingPeriods.map((p) => <option key={p.index} value={p.index}>{p.name} — {p.start_time}–{p.end_time}</option>)}
            </select>
            <span className="form__note">Select the teaching periods available to the generated timetable.</span>
          </div>
        </div>
        <div className="form__row" style={{ marginTop: 18 }}>
          <button className="button button--primary" type="button" disabled={!typeId || !dayIndexes.length || !selectedPeriods.length || running || starting} onClick={() => void generate()}>{starting ? 'Starting…' : running ? 'Generating…' : 'Generate Timetable'}</button>
          <button className="button button--secondary" type="button" onClick={() => setNewType((v) => !v)}>New timetable type</button>
        </div>
      </section>

      {newType && <section className="card section">
        <div className="panel__head"><div><h2 className="section__title">Create timetable type</h2><p className="form__note">Create a reusable Weekdays, Weekend, or custom timetable type.</p></div></div>
        <div className="form form--grid">
          <div className="field"><label className="field__label">Name</label><input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Weekend" /></div>
          <div className="field"><label className="field__label">Code</label><input className="input" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="WEEKEND" /></div>
          <div className="field form--grid__full"><label className="field__label">Days</label><div className="chip-toggles">{activeDays.map((d) => <label key={d.index} className={`chip-toggle ${newDays.includes(d.index) ? 'chip-toggle--on' : ''}`}><input type="checkbox" checked={newDays.includes(d.index)} onChange={() => toggle(newDays, d.index, setNewDays)} />{d.name}</label>)}</div></div>
        </div>
        <div className="form__row" style={{ marginTop: 16 }}><button className="button button--primary" type="button" disabled={!newName.trim() || !newCode.trim() || !newDays.length} onClick={() => void createType()}>Create Type</button></div>
      </section>}

      {job && <section className="card section" aria-live="polite">
        <div className="panel__head"><div><h2 className="section__title">Generation monitor</h2><p className="form__note">{job.message || job.stage}</p></div><Badge tone={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'neutral'}>{job.status}</Badge></div>
        <div className="progress" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><div className="progress__bar" style={{ width: `${job.progress}%` }} /></div>
        {job.status === 'completed' && <Alert tone="success" title="Timetable generated">The timetable is saved as a draft. A timetabler must put it into force before members use it.</Alert>}
        {job.status === 'failed' && <Alert tone="error" title="Generation failed">{job.message || 'The timetable could not be generated.'}</Alert>}
      </section>}
    </>}
  </>
}
