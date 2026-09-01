import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type Day, type Period, type TimetableType, type Version } from '../lib/scheduling'
import { useNavigate } from '../lib/router'
import './GeneratePage.css'

const RUNNING = new Set(['queued', 'running', 'optimizing', 'validating'])
type ScheduleTab = 'days' | 'periods'

export function GeneratePage() {
  const { notify } = useToast()
  const navigate = useNavigate()

  const [calendar, setCalendar] = useState<Calendar | null>(null)
  const [types, setTypes] = useState<TimetableType[]>([])
  const [typeId, setTypeId] = useState<number | null>(null)
  const [typeName, setTypeName] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [days, setDays] = useState<number[]>([])
  const [periods, setPeriods] = useState<number[]>([])
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [draftDays, setDraftDays] = useState<Day[]>([])
  const [draftPeriods, setDraftPeriods] = useState<Period[]>([])
  const [job, setJob] = useState<any>(null)
  const [currentVersion, setCurrentVersion] = useState<Version | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingDays, setSavingDays] = useState(false)
  const [savingPeriods, setSavingPeriods] = useState(false)
  const [savingGenerated, setSavingGenerated] = useState(false)
  const [starting, setStarting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(true)
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>('days')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [cal, tt, active, current] = await Promise.all([
        scheduling.calendar(),
        scheduling.timetableTypes(),
        scheduling.activeJob().catch(() => null),
        scheduling.currentVersion().catch(() => null),
      ])
      setCalendar(cal)
      setTypes(tt)
      setJob(active)
      setCurrentVersion(current)

      const first = tt.find(t => t.is_active && t.display_mode === 'day')
      if (first) {
        setTypeId(first.id)
        setTypeName(first.name)
        setTypeCode(first.code)
        setDays(first.day_indexes)
      }

      setDraftDays(cal.days.map(d => ({ ...d })))
      setDraftPeriods(cal.periods.map(p => ({ ...p })))
      setLabels(Object.fromEntries(cal.days.map(d => [d.index, d.name])))
      setPeriods(cal.periods.filter(p => p.is_teaching).map(p => p.index))
    } catch (e) {
      setError(friendlyApiError(e, 'load timetable configuration'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const activeDays = useMemo(
    () => draftDays.filter(d => d.is_active).sort((a, b) => a.index - b.index),
    [draftDays],
  )
  const selectedType = types.find(t => t.id === typeId)
  const running = !!job && RUNNING.has(job.status)
  const generatedCandidate = !!job?.result_version_id && job.status === 'completed'
  const missingPeriodTimes = draftPeriods.some(p => !p.start_time || !p.end_time)
  const invalidPeriodTimes = draftPeriods.some(p => p.start_time && p.end_time && p.end_time <= p.start_time)
  const scheduleReady = draftDays.length > 0 && draftPeriods.length > 0 && !missingPeriodTimes && !invalidPeriodTimes
  const generationReady = !!typeId && days.length > 0 && periods.length > 0 && scheduleReady

  function selectSaved(id: number) {
    const type = types.find(t => t.id === id)
    if (!type) return
    setTypeId(type.id)
    setTypeName(type.name)
    setTypeCode(type.code)
    setDays(type.day_indexes)
    setEditing(false)
  }

  function newTimetable() {
    setTypeId(null)
    setTypeName('')
    setTypeCode('')
    setDays(activeDays.map(d => d.index))
    setEditing(true)
  }

  function resizeDays(count: number) {
    const current = [...draftDays].sort((a, b) => a.index - b.index)
    const next = Array.from({ length: count }, (_, index) => current[index] ?? {
      id: -Date.now() - index,
      index,
      name: `Day ${index + 1}`,
      short_form: `D${index + 1}`,
      date_value: null,
      is_active: true,
    })
    setDraftDays(next)
    setDays(next.map(d => d.index))
  }

  function resizePeriods(count: number) {
    if (!Number.isInteger(count) || count < 1) return
    const current = [...draftPeriods].sort((a, b) => a.index - b.index)
    const next = Array.from({ length: count }, (_, index) => current[index] ?? {
      id: -Date.now() - index,
      index,
      name: `Period ${index + 1}`,
      short_form: `P${index + 1}`,
      start_time: '',
      end_time: '',
      is_teaching: true,
    })
    setDraftPeriods(next)
    setPeriods(next.filter(p => p.is_teaching).map(p => p.index))
  }

  function updateDay(index: number, patch: Partial<Day>) {
    setDraftDays(value => value.map(d => d.index === index ? { ...d, ...patch } : d))
    if (patch.name !== undefined) {
      setLabels(value => ({ ...value, [index]: patch.name ?? '' }))
    }
  }

  function updatePeriod(index: number, patch: Partial<Period>) {
    setDraftPeriods(value => value.map(p => p.index === index ? { ...p, ...patch } : p))
    if (patch.is_teaching !== undefined) {
      setPeriods(value => patch.is_teaching
        ? [...new Set([...value, index])]
        : value.filter(i => i !== index))
    }
  }

  async function saveType(): Promise<boolean> {
    if (!typeName.trim() || saving) return false
    setSaving(true)
    try {
      const existing = types.find(t => t.id === typeId)
        ?? types.find(t => t.name.trim().toLowerCase() === typeName.trim().toLowerCase())
      const code = typeCode.trim() || typeName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
      const payload = {
        name: typeName.trim(),
        code,
        display_mode: 'day' as const,
        day_indexes: draftDays.map(d => d.index),
        is_active: true,
        is_system: existing?.is_system ?? false,
      }
      const saved = existing
        ? await scheduling.updateTimetableType(existing.id, payload)
        : await scheduling.createTimetableType(payload)
      setTypes(value => existing ? value.map(t => t.id === saved.id ? saved : t) : [...value, saved])
      setTypeId(saved.id)
      setTypeCode(saved.code)
      setDays(saved.day_indexes)
      notify('Timetable settings saved.', 'success')
      return true
    } catch (e) {
      notify(friendlyApiError(e, 'save timetable settings'), 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  function calendarPayload(nextDays: Day[], nextPeriods: Period[]) {
    return {
      days: nextDays.map(d => ({
        index: d.index,
        name: d.name.trim() || `Day ${d.index + 1}`,
        short_form: d.short_form.trim() || `D${d.index + 1}`,
        date_value: d.date_value ?? null,
        is_active: d.is_active,
      })),
      periods: nextPeriods.map(p => ({
        index: p.index,
        name: p.name.trim() || `${p.is_teaching ? 'Period' : 'Break'} ${p.index + 1}`,
        short_form: p.short_form.trim() || `${p.is_teaching ? 'P' : 'B'}${p.index + 1}`,
        start_time: p.start_time,
        end_time: p.end_time,
        is_teaching: p.is_teaching,
      })),
      display_mode: 'day' as const,
    }
  }

  async function persistCalendar(nextDays: Day[], nextPeriods: Period[], message: string): Promise<boolean> {
    if (!calendar || !nextDays.length || !nextPeriods.length) return false
    const saved = await scheduling.saveCalendar(calendarPayload(nextDays, nextPeriods))
    setCalendar(saved)
    setDraftDays(saved.days.map(d => ({ ...d })))
    setDraftPeriods(saved.periods.map(p => ({ ...p })))
    setLabels(Object.fromEntries(saved.days.map(d => [d.index, d.name])))
    setPeriods(saved.periods.filter(p => p.is_teaching).map(p => p.index))
    notify(message, 'success')
    return true
  }

  async function saveDays(): Promise<boolean> {
    if (!calendar || !draftDays.length || savingDays) return false
    setSavingDays(true)
    try {
      return await persistCalendar(draftDays, calendar.periods, 'Days saved.')
    } catch (e) {
      notify(friendlyApiError(e, 'save days'), 'error')
      return false
    } finally {
      setSavingDays(false)
    }
  }

  async function savePeriods(): Promise<boolean> {
    if (!calendar || !draftPeriods.length || savingPeriods) return false
    if (missingPeriodTimes || invalidPeriodTimes) {
      notify('Enter a start and end time for every row. End time must be after start time.', 'error')
      return false
    }
    setSavingPeriods(true)
    try {
      return await persistCalendar(calendar.days, draftPeriods, 'Periods and breaks saved.')
    } catch (e) {
      notify(friendlyApiError(e, 'save periods and breaks'), 'error')
      return false
    } finally {
      setSavingPeriods(false)
    }
  }

  async function saveTimetable() {
    if (!typeName.trim() || missingPeriodTimes || invalidPeriodTimes) {
      notify('Complete the timetable name and every period/break time before saving all changes.', 'error')
      return
    }
    const typeOk = await saveType()
    if (!typeOk) return
    try {
      const calendarOk = await persistCalendar(draftDays, draftPeriods, 'All timetable changes saved.')
      if (calendarOk) setEditing(false)
    } catch (e) {
      notify(friendlyApiError(e, 'save all timetable changes'), 'error')
    }
  }

  async function generate() {
    if (!generationReady || running || starting) return
    setStarting(true)
    try {
      const next = await scheduling.generateProfile({
        timetable_type_id: typeId,
        period_indexes: periods,
        day_indexes: days,
        day_names: Object.fromEntries(days.map(i => [i, (labels[i] ?? String(i)).trim()])),
        max_seconds: 30,
      })
      setJob(next)
      notify('New timetable generated. It is not in force until you save it.', 'success')
    } catch (e) {
      notify(friendlyApiError(e, 'generate timetable'), 'error')
    } finally {
      setStarting(false)
    }
  }

  async function saveGenerated() {
    const versionId = job?.result_version_id
    if (!versionId || savingGenerated) return
    setSavingGenerated(true)
    try {
      const saved = await scheduling.publish(versionId)
      setCurrentVersion(saved)
      notify('Generated timetable saved and is now in force.', 'success')
      setJob(value => value ? { ...value, message: 'This generated timetable is now in force.' } : value)
    } catch (e) {
      notify(friendlyApiError(e, 'save generated timetable'), 'error')
    } finally {
      setSavingGenerated(false)
    }
  }

  useEffect(() => {
    if (!job || !RUNNING.has(job.status)) return
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== 'hidden') {
        try { setJob(await scheduling.job(job.id)) } catch {}
      }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  if (loading) return <>
    <PageHeader title="Build timetable" description="Define the timetable structure in one place." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Build' }]} />
    <div className="card section builder-page"><LoadingBlock label="Loading timetable configuration" rows={5} /></div>
  </>

  if (error) return <>
    <PageHeader title="Build timetable" description="Define the timetable structure in one place." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Build' }]} />
    <Alert tone="error" title="Configuration unavailable">{error}</Alert>
  </>

  return <>
    <PageHeader
      title="Build timetable"
      description="Set up the structure, check it, generate a candidate, then publish it."
      breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Build' }]}
    />

    <div className="builder-steps" aria-label="Timetable workflow">
      <div className="builder-step builder-step--active"><span>1</span><div><strong>Setup</strong><small>Timetable details</small></div></div>
      <div className="builder-step"><span>2</span><div><strong>Schedule</strong><small>Days and periods</small></div></div>
      <div className="builder-step"><span>3</span><div><strong>Generate</strong><small>Create candidate</small></div></div>
      <div className="builder-step"><span>4</span><div><strong>Review & publish</strong><small>Put it in force</small></div></div>
    </div>

    <section className="card section builder-page">
      <div className="builder-header">
        <div>
          <div className="eyebrow">STEP 1 · SETUP</div>
          <h2 className="section__title">Timetable setup</h2>
          <p className="form__note">Choose an existing timetable or create a new one. These settings do not change the timetable generation engine.</p>
        </div>
        <div className="builder-actions">
          <select className="input input--select" value={typeId ?? ''} onChange={e => selectSaved(Number(e.target.value))} aria-label="Saved timetable">
            <option value="">New timetable</option>
            {types.filter(t => t.is_active && t.display_mode === 'day').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="button button--secondary" type="button" onClick={newTimetable}>New</button>
          {selectedType && <button className="button button--secondary" type="button" onClick={() => setEditing(true)}>Edit</button>}
        </div>
      </div>

      <div className="builder-setup-grid">
        <div className="field">
          <label className="field__label">Name</label>
          <input className="input" value={typeName} disabled={!editing} onChange={e => setTypeName(e.target.value)} placeholder="e.g. 2026 Academic Timetable" />
        </div>
        <div className="field">
          <label className="field__label">Schedule</label>
          <div className="builder-readonly"><strong>Weekly</strong><span>Day-based timetable</span></div>
        </div>
        <div className="field">
          <label className="field__label">Days</label>
          <select className="input input--select" disabled={!editing} value={draftDays.length} onChange={e => resizeDays(Number(e.target.value))}>
            {Array.from({ length: 7 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? 'day' : 'days'}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label">Schedule rows</label>
          <input className="input" type="number" min="1" step="1" disabled={!editing} value={draftPeriods.length || ''} onChange={e => resizePeriods(Number(e.target.value))} onBlur={e => { if (!Number.isInteger(Number(e.target.value)) || Number(e.target.value) < 1) e.currentTarget.value = String(Math.max(1, draftPeriods.length)) }} aria-label="Number of periods and breaks" />
          <div className="form__note">Enter the exact number of periods and breaks needed for this timetable.</div>
        </div>
      </div>

      <div className="builder-section builder-section--compact">
        <div className="section-line">
          <div><h3>Setup status</h3><p>{currentVersion ? 'A timetable is currently in force. Changes here remain drafts until published.' : 'No generated timetable has been published yet.'}</p></div>
          <Badge tone={scheduleReady && typeName.trim() ? 'success' : 'warning'}>{scheduleReady && typeName.trim() ? 'Ready to check' : 'Needs attention'}</Badge>
        </div>
        <div className="builder-checklist">
          <span className={typeName.trim() ? 'check-item check-item--done' : 'check-item'}>{typeName.trim() ? '✓' : '1'} Timetable name</span>
          <span className={draftDays.length ? 'check-item check-item--done' : 'check-item'}>{draftDays.length ? '✓' : '2'} Days defined</span>
          <span className={scheduleReady ? 'check-item check-item--done' : 'check-item'}>{scheduleReady ? '✓' : '3'} All schedule times valid</span>
        </div>
      </div>

      <div className="builder-section">
        <div className="builder-section-heading">
          <div><div className="eyebrow">STEP 2 · SCHEDULE</div><h3>Schedule structure</h3><p>Only one schedule editor is shown at a time so the page stays focused.</p></div>
          <span className="count-pill">{draftDays.length} days · {draftPeriods.length} rows</span>
        </div>

        <div className="builder-tabs" role="tablist" aria-label="Schedule sections">
          <button className={scheduleTab === 'days' ? 'builder-tab builder-tab--active' : 'builder-tab'} type="button" role="tab" aria-selected={scheduleTab === 'days'} onClick={() => setScheduleTab('days')}>Days <span>{draftDays.length}</span></button>
          <button className={scheduleTab === 'periods' ? 'builder-tab builder-tab--active' : 'builder-tab'} type="button" role="tab" aria-selected={scheduleTab === 'periods'} onClick={() => setScheduleTab('periods')}>Periods & breaks <span>{draftPeriods.length}</span></button>
        </div>

        {scheduleTab === 'days' ? <div className="builder-editor" role="tabpanel">
          <div className="section-line">
            <div><h4>Days</h4><p>Rename each day and set its short form. Active days remain part of the selected timetable.</p></div>
            <button className="button button--secondary" type="button" disabled={savingDays || !editing} onClick={() => void saveDays()}>{savingDays ? 'Saving…' : 'Save days'}</button>
          </div>
          <div className="builder-table-wrap">
            <table className="builder-table">
              <thead><tr><th>#</th><th>Name</th><th>Short form</th></tr></thead>
              <tbody>{draftDays.map(d => <tr key={d.index}><td>{d.index + 1}</td><td><input className="input" disabled={!editing} value={d.name} onChange={e => updateDay(d.index, { name: e.target.value })} /></td><td><input className="input builder-short" disabled={!editing} value={d.short_form} onChange={e => updateDay(d.index, { short_form: e.target.value })} /></td></tr>)}</tbody>
            </table>
          </div>
        </div> : <div className="builder-editor" role="tabpanel">
          <div className="section-line">
            <div><h4>Periods & breaks</h4><p>Every row has its own time. No default duration is imposed when a row is created.</p></div>
            <button className="button button--secondary" type="button" disabled={savingPeriods || !editing || !scheduleReady} onClick={() => void savePeriods()}>{savingPeriods ? 'Saving…' : 'Save periods & breaks'}</button>
          </div>
          {(missingPeriodTimes || invalidPeriodTimes) && <Alert tone="warning" title="Schedule times need attention">Every row must have a start and end time, and each end time must be after its start time. New rows intentionally have no preset times.</Alert>}
          <div className="builder-table-wrap">
            <table className="builder-table builder-period-table">
              <thead><tr><th>#</th><th>Type</th><th>Name</th><th>Short</th><th>Start</th><th>End</th></tr></thead>
              <tbody>{draftPeriods.map(p => <tr key={p.index} className={!p.start_time || !p.end_time ? 'builder-row--warning' : ''}>
                <td>{p.index + 1}</td>
                <td><select className="input input--select" disabled={!editing} value={p.is_teaching ? 'Period' : 'Break'} onChange={e => updatePeriod(p.index, { is_teaching: e.target.value === 'Period' })}><option>Period</option><option>Break</option></select></td>
                <td><input className="input" disabled={!editing} value={p.name} onChange={e => updatePeriod(p.index, { name: e.target.value })} /></td>
                <td><input className="input builder-short" disabled={!editing} value={p.short_form} onChange={e => updatePeriod(p.index, { short_form: e.target.value })} /></td>
                <td><input className="input input--time" disabled={!editing} type="time" value={p.start_time} onChange={e => updatePeriod(p.index, { start_time: e.target.value })} /></td>
                <td><input className="input input--time" disabled={!editing} type="time" value={p.end_time} onChange={e => updatePeriod(p.index, { end_time: e.target.value })} /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>}
      </div>

      <div className="builder-footer">
        {editing ? <button className="button button--secondary" type="button" disabled={saving || savingDays || savingPeriods || !typeName.trim() || !scheduleReady} onClick={() => void saveTimetable()}>{saving ? 'Saving all…' : 'Save all changes'}</button> : <button className="button button--secondary" type="button" onClick={() => setEditing(true)}>Edit timetable</button>}
        <button className="button button--primary builder-generate" type="button" disabled={!generationReady || running || starting} onClick={() => void generate()}>{starting ? 'Starting…' : running ? `Generating… ${job?.progress ?? 0}%` : 'Generate timetable'}</button>
      </div>
    </section>

    {job && <section className="card section builder-status">
      <div className="eyebrow">STEP 3 · GENERATE / STEP 4 · REVIEW & PUBLISH</div>
      <div className="panel__head">
        <div><h2 className="section__title">{running ? 'Generation in progress' : generatedCandidate ? 'Generated timetable ready' : 'Generation result'}</h2><p className="form__note">{job.message ?? 'Generation status'}</p></div>
        <Badge tone={running ? 'warning' : generatedCandidate ? 'success' : 'neutral'}>{job.status}</Badge>
      </div>
      {running && <div className="progress"><div className="progress__bar" style={{ width: `${Math.max(0, Math.min(100, job.progress ?? 0))}%` }} /></div>}
      {generatedCandidate && <div className="builder-publish-box"><div><strong>Candidate ready</strong><p>Review it before publishing. Saving it as current timetable is the action that puts it in force.</p></div><div className="builder-generated-actions"><button className="button button--secondary" type="button" onClick={() => navigate('/timetable')}>Review timetable</button><button className="button button--primary builder-save-generated" type="button" disabled={savingGenerated} onClick={() => void saveGenerated()}>{savingGenerated ? 'Publishing…' : 'Save as current timetable'}</button></div></div>}
      {!running && !generatedCandidate && job.status === 'failed' && <Alert tone="error" title="Generation failed">{job.message ?? 'The timetable could not be generated.'}</Alert>}
    </section>}
  </>
}
