import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type Day, type Period, type TimetableType } from '../lib/scheduling'
import { useNavigate } from '../lib/router'
import './GeneratePage.css'

const RUNNING = new Set(['queued', 'running', 'optimizing', 'validating'])
const MAX_ROWS = 31
const statusOf = (value: unknown) => String(value ?? '').trim().toLowerCase()

export function GeneratePage() {
  const { notify } = useToast()
  const navigate = useNavigate()
  const [calendar, setCalendar] = useState<Calendar | null>(null)
  const [types, setTypes] = useState<TimetableType[]>([])
  const [typeId, setTypeId] = useState<number | null>(null)
  const [name, setName] = useState('Academic timetable')
  const [code, setCode] = useState('ACADEMIC')
  const [days, setDays] = useState<number[]>([])
  const [periods, setPeriods] = useState<number[]>([])
  const [draftDays, setDraftDays] = useState<Day[]>([])
  const [draftPeriods, setDraftPeriods] = useState<Period[]>([])
  const [job, setJob] = useState<any>(null)
  const [editing, setEditing] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [savingCalendar, setSavingCalendar] = useState(false)
  const [savingGenerated, setSavingGenerated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [cal, timetableTypes, activeJob] = await Promise.all([
        scheduling.calendar(),
        scheduling.timetableTypes(),
        scheduling.activeJob().catch(() => null),
      ])
      const safeDays = Array.isArray(cal?.days) ? cal.days : []
      const safePeriods = Array.isArray(cal?.periods) ? cal.periods : []
      const safeTypes = Array.isArray(timetableTypes) ? timetableTypes : []
      setCalendar({ ...cal, days: safeDays, periods: safePeriods })
      setTypes(safeTypes)
      setJob(activeJob)
      setDraftDays(safeDays.map((day) => ({ ...day })))
      setDraftPeriods(safePeriods.map((period) => ({ ...period })))

      const current = safeTypes.find((type) => type.is_active) ?? safeTypes[0]
      if (current) {
        setTypeId(current.id)
        setName(current.name)
        setCode(current.code)
        setDays(current.day_indexes ?? [])
        setPeriods(current.period_indexes ?? [])
      } else {
        setDays(safeDays.filter((day) => day.is_active).map((day) => day.index))
        setPeriods(safePeriods.filter((period) => period.is_teaching).map((period) => period.index))
      }
    } catch (err) {
      setError(friendlyApiError(err, 'load timetable configuration'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const status = statusOf(job?.status)
  const running = RUNNING.has(status)
  const teachingPeriods = useMemo(
    () => periods.filter((index) => draftPeriods.some((period) => period.index === index && period.is_teaching)),
    [periods, draftPeriods],
  )
  const invalidTimes = draftPeriods.some((period) => !period.start_time || !period.end_time || period.end_time <= period.start_time)
  const readyToSave = !!name.trim() && days.length > 0 && teachingPeriods.length > 0
  const generated = status === 'completed' && !!job?.result_version_id

  function chooseType(id: number) {
    const type = types.find((item) => item.id === id)
    if (!type) return
    setTypeId(type.id)
    setName(type.name)
    setCode(type.code)
    setDays(type.day_indexes ?? [])
    setPeriods(type.period_indexes ?? [])
  }

  function newType() {
    setTypeId(null)
    setName('Academic timetable')
    setCode('ACADEMIC')
    setDays(draftDays.filter((day) => day.is_active).map((day) => day.index))
    setPeriods(draftPeriods.filter((period) => period.is_teaching).map((period) => period.index))
  }

  function toggleDay(index: number, enabled: boolean) {
    setDays((current) => enabled ? [...new Set([...current, index])].sort((a, b) => a - b) : current.filter((item) => item !== index))
    setDraftDays((current) => current.map((day) => day.index === index ? { ...day, is_active: enabled } : day))
  }

  function addDay() {
    if (draftDays.length >= MAX_ROWS) return
    const index = draftDays.length ? Math.max(...draftDays.map((day) => day.index)) + 1 : 0
    const day: Day = { id: 0, index, name: `Day ${index + 1}`, short_form: `D${index + 1}`, date_value: null, is_active: true }
    setDraftDays((current) => [...current, day])
    setDays((current) => [...new Set([...current, index])])
  }

  function removeDay(index: number) {
    if (draftDays.length <= 1) return notify('At least one day is required.', 'error')
    const next = draftDays.filter((day) => day.index !== index).map((day, position) => ({ ...day, index: position }))
    setDraftDays(next)
    setDays(next.filter((day) => day.is_active).map((day) => day.index))
  }

  function addRow(isTeaching: boolean) {
    if (draftPeriods.length >= MAX_ROWS) return
    const index = draftPeriods.length ? Math.max(...draftPeriods.map((period) => period.index)) + 1 : 0
    const previous = [...draftPeriods].sort((a, b) => a.index - b.index).at(-1)
    const start = previous?.end_time || '08:00'
    const [hour, minute] = start.split(':').map(Number)
    const endMinutes = Math.min(hour * 60 + minute + (isTeaching ? 45 : 15), 23 * 60 + 59)
    const end = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
    const count = draftPeriods.filter((period) => period.is_teaching).length
    const row: Period = { id: 0, index, name: isTeaching ? `Period ${count + 1}` : 'Break', short_form: isTeaching ? `P${count + 1}` : 'B', start_time: start, end_time: end, is_teaching: isTeaching }
    setDraftPeriods((current) => [...current, row])
    if (isTeaching) setPeriods((current) => [...new Set([...current, index])])
  }

  function removePeriod(index: number) {
    if (draftPeriods.length <= 1) return notify('At least one period or break is required.', 'error')
    const next = draftPeriods.filter((period) => period.index !== index).map((period, position) => ({ ...period, index: position }))
    setDraftPeriods(next)
    setPeriods(next.filter((period) => period.is_teaching).map((period) => period.index))
  }

  function calendarPayload() {
    return {
      days: draftDays.map((day) => ({ index: day.index, name: day.name.trim() || `Day ${day.index + 1}`, short_form: day.short_form.trim() || `D${day.index + 1}`, date_value: day.date_value ?? null, is_active: days.includes(day.index) })),
      periods: draftPeriods.map((period, index) => ({ index, name: period.name.trim() || (period.is_teaching ? `Period ${index + 1}` : 'Break'), short_form: period.short_form.trim() || (period.is_teaching ? `P${index + 1}` : 'B'), start_time: period.start_time, end_time: period.end_time, is_teaching: period.is_teaching })),
      display_mode: 'day' as const,
    }
  }

  async function saveCalendar() {
    if (!calendar || invalidTimes) {
      notify('Every schedule row needs a valid start and end time.', 'error')
      return false
    }
    setSavingCalendar(true)
    try {
      const saved = await scheduling.saveCalendar(calendarPayload())
      setCalendar(saved)
      setDraftDays(saved.days.map((day) => ({ ...day })))
      setDraftPeriods(saved.periods.map((period) => ({ ...period })))
      notify('Days and periods saved.', 'success')
      return true
    } catch (err) {
      notify(friendlyApiError(err, 'save the calendar'), 'error')
      return false
    } finally {
      setSavingCalendar(false)
    }
  }

  async function saveType() {
    if (!readyToSave) {
      notify('Choose at least one day and one teaching period.', 'error')
      return null
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24),
        display_mode: 'day' as const,
        day_indexes: days,
        period_indexes: teachingPeriods,
        is_active: true,
        is_system: types.find((type) => type.id === typeId)?.is_system ?? false,
      }
      const saved = typeId
        ? await scheduling.updateTimetableType(typeId, payload)
        : await scheduling.createTimetableType(payload)
      setTypeId(saved.id)
      setName(saved.name)
      setCode(saved.code)
      setDays(saved.day_indexes ?? [])
      setPeriods(saved.period_indexes ?? [])
      setTypes((current) => [...current.filter((type) => type.id !== saved.id), saved])
      return saved
    } catch (err) {
      notify(friendlyApiError(err, 'save timetable type'), 'error')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function generate() {
    if (!readyToSave || running || starting || invalidTimes) return
    setStarting(true)
    try {
      const calendarSaved = await saveCalendar()
      if (!calendarSaved) return
      const savedType = await saveType()
      if (!savedType) return
      const next = await scheduling.generateProfile({
        timetable_type_id: savedType.id,
        period_indexes: savedType.period_indexes,
        day_indexes: savedType.day_indexes,
        day_names: Object.fromEntries(savedType.day_indexes.map((index) => [index, draftDays.find((day) => day.index === index)?.name ?? `Day ${index + 1}`])),
        max_seconds: 180,
      })
      setJob(next)
      notify('Timetable generation started.', 'success')
    } catch (err) {
      notify(friendlyApiError(err, 'generate timetable'), 'error')
    } finally {
      setStarting(false)
    }
  }

  async function saveGenerated() {
    if (!job?.result_version_id || savingGenerated) return
    setSavingGenerated(true)
    try {
      await scheduling.publish(job.result_version_id)
      notify('Generated timetable saved.', 'success')
      navigate('/timetable')
    } catch (err) {
      notify(friendlyApiError(err, 'save generated timetable'), 'error')
    } finally {
      setSavingGenerated(false)
    }
  }

  useEffect(() => {
    if (!job || !running) return
    const timer = window.setInterval(async () => {
      try { setJob(await scheduling.job(job.id)) } catch { /* polling can retry */ }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [job?.id, running])

  if (loading) return <><PageHeader title="Build timetable" description="Configure and generate the school timetable." /><div className="card section"><LoadingBlock label="Loading timetable configuration" rows={6} /></div></>
  if (error) return <><PageHeader title="Build timetable" /><Alert tone="error" title="Configuration unavailable">{error}</Alert></>

  return <>
    <PageHeader title="Build timetable" description="Choose the school days and teaching periods, then generate a conflict-aware timetable." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Build' }]} />
    <section className="card section builder-page">
      <div className="builder-header">
        <div><div className="eyebrow">TIMETABLE GENERATOR</div><h2 className="section__title">{name || 'New timetable'}</h2><p className="section__description">The generator uses the configured teachers, classes, subjects, rooms and scheduling constraints.</p></div>
        <div className="builder-actions">
          {types.length > 0 && <select className="input input--select" value={typeId ?? ''} onChange={(event) => chooseType(Number(event.target.value))}><option value="">Select timetable type</option>{types.filter((type) => type.is_active).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>}
          <button className="button button--secondary" type="button" onClick={() => setEditing((value) => !value)}>{editing ? 'Lock editing' : 'Edit days & periods'}</button>
          <button className="button button--secondary" type="button" onClick={newType}>New</button>
        </div>
      </div>
      <div className="builder-setup-grid">
        <div className="field"><label className="field__label">Timetable name</label><input className="input" disabled={!editing} value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="field"><label className="field__label">Days selected</label><strong>{days.length}</strong></div>
        <div className="field"><label className="field__label">Teaching periods selected</label><strong>{teachingPeriods.length}</strong></div>
      </div>
      <div className="builder-section">
        <div className="builder-section-heading"><div><div className="eyebrow">SCHEDULE</div><h3>Days</h3><p className="form__note">Select the days that should be used by this timetable.</p></div><span className="count-pill">{draftDays.length} configured</span></div>
        <div className="builder-editor"><div className="section-line"><h4>School days</h4><div className="builder-actions"><button className="button button--secondary" disabled={!editing || draftDays.length >= MAX_ROWS} type="button" onClick={addDay}>Add day</button></div></div>
          <div className="builder-table-wrap"><table className="builder-table"><thead><tr><th>#</th><th>Use</th><th>Name</th><th>Short form</th><th>Remove</th></tr></thead><tbody>{draftDays.map((day) => <tr key={day.index}><td>{day.index + 1}</td><td><input type="checkbox" checked={days.includes(day.index)} disabled={!editing} onChange={(event) => toggleDay(day.index, event.target.checked)} /></td><td><input className="input" disabled={!editing} value={day.name} onChange={(event) => setDraftDays((current) => current.map((item) => item.index === day.index ? { ...item, name: event.target.value } : item))} /></td><td><input className="input builder-short" disabled={!editing} value={day.short_form} onChange={(event) => setDraftDays((current) => current.map((item) => item.index === day.index ? { ...item, short_form: event.target.value } : item))} /></td><td><button className="button button--secondary" disabled={!editing || draftDays.length <= 1} type="button" onClick={() => removeDay(day.index)}>Remove</button></td></tr>)}</tbody></table></div>
        </div>
      </div>
      <div className="builder-section">
        <div className="builder-section-heading"><div><h3>Periods and breaks</h3><p className="form__note">Teaching periods are available to the solver. Break rows are kept out of lesson slots.</p></div><span className="count-pill">{draftPeriods.length} rows</span></div>
        <div className="builder-editor"><div className="section-line"><h4>Schedule rows</h4><div className="builder-actions"><button className="button button--secondary" disabled={!editing || draftPeriods.length >= MAX_ROWS} type="button" onClick={() => addRow(true)}>Add lesson</button><button className="button button--secondary" disabled={!editing || draftPeriods.length >= MAX_ROWS} type="button" onClick={() => addRow(false)}>Add break</button></div></div>
          {invalidTimes && <Alert tone="warning" title="Check schedule times">Each row needs a start time and an end time, and the end must be after the start.</Alert>}
          <div className="builder-table-wrap"><table className="builder-table builder-period-table"><thead><tr><th>#</th><th>Name</th><th>Short</th><th>Start</th><th>End</th><th>Type</th><th>Remove</th></tr></thead><tbody>{draftPeriods.map((period) => <tr key={period.index}><td>{period.index + 1}</td><td><input className="input" disabled={!editing} value={period.name} onChange={(event) => setDraftPeriods((current) => current.map((item) => item.index === period.index ? { ...item, name: event.target.value } : item))} /></td><td><input className="input builder-short" disabled={!editing} value={period.short_form} onChange={(event) => setDraftPeriods((current) => current.map((item) => item.index === period.index ? { ...item, short_form: event.target.value } : item))} /></td><td><input className="input input--time" disabled={!editing} type="time" value={period.start_time} onChange={(event) => setDraftPeriods((current) => current.map((item) => item.index === period.index ? { ...item, start_time: event.target.value } : item))} /></td><td><input className="input input--time" disabled={!editing} type="time" value={period.end_time} onChange={(event) => setDraftPeriods((current) => current.map((item) => item.index === period.index ? { ...item, end_time: event.target.value } : item))} /></td><td><button className="button button--ghost button--sm" disabled={!editing} type="button" onClick={() => { setDraftPeriods((current) => current.map((item) => item.index === period.index ? { ...item, is_teaching: !item.is_teaching } : item)); setPeriods((current) => period.is_teaching ? current.filter((index) => index !== period.index) : [...new Set([...current, period.index])]) }}>{period.is_teaching ? 'Lesson' : 'Break'}</button></td><td><button className="button button--secondary" disabled={!editing || draftPeriods.length <= 1} type="button" onClick={() => removePeriod(period.index)}>Remove</button></td></tr>)}</tbody></table></div>
        </div>
      </div>
      <div className="builder-footer"><button className="button button--secondary" disabled={saving || savingCalendar || !readyToSave || invalidTimes} type="button" onClick={async () => { if (await saveCalendar()) await saveType() }}>{saving || savingCalendar ? 'Saving…' : 'Save timetable setup'}</button><button className="button button--primary" disabled={!readyToSave || invalidTimes || running || starting || savingCalendar} type="button" onClick={() => void generate()}>{starting ? 'Starting…' : running ? `Generating… ${job?.progress ?? 0}%` : 'Generate timetable'}</button></div>
    </section>
    {job && <section className="card section builder-status"><div className="panel__head"><div><h2 className="section__title">{generated ? 'Timetable ready' : 'Generation status'}</h2><p className="form__note">{job.message ?? job.stage ?? status}</p></div><Badge tone={running ? 'warning' : generated ? 'success' : status === 'failed' ? 'danger' : 'neutral'}>{status}</Badge></div>{generated && <div className="builder-footer"><button className="button button--primary" disabled={savingGenerated} type="button" onClick={() => void saveGenerated()}>{savingGenerated ? 'Saving…' : 'Save & View / Print'}</button></div>}</section>}
  </>
}
