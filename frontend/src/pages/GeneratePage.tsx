import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type Day, type Job, type Period, type TimetableType } from '../lib/scheduling'
import { useNavigate } from '../lib/router'
import './GeneratePage.css'

const RUNNING = new Set(['queued', 'running', 'optimizing', 'validating'])
type DraftDay = Day

export function GeneratePage() {
  const { notify } = useToast()
  const navigate = useNavigate()
  const [calendar, setCalendar] = useState<Calendar | null>(null)
  const [types, setTypes] = useState<TimetableType[]>([])
  const [typeId, setTypeId] = useState<number | null>(null)
  const [days, setDays] = useState<number[]>([])
  const [periods, setPeriods] = useState<number[]>([])
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [typeEditor, setTypeEditor] = useState(false)
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null)
  const [typeName, setTypeName] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [typeDays, setTypeDays] = useState<number[]>([])
  const [structureEditor, setStructureEditor] = useState(false)
  const [draftDays, setDraftDays] = useState<DraftDay[]>([])
  const [draftPeriods, setDraftPeriods] = useState<Period[]>([])
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [cal, tt, active] = await Promise.all([
        scheduling.calendar(),
        scheduling.timetableTypes(),
        scheduling.activeJob().catch(() => null),
      ])
      setCalendar(cal)
      setTypes(tt)
      setJob(active)
      setLabels(Object.fromEntries(cal.days.map(d => [d.index, d.name])))
      const first = tt.find(t => t.is_active && t.display_mode === 'day')
      if (first) {
        setTypeId(first.id)
        setDays(first.day_indexes)
        setPeriods(cal.periods.filter(p => p.is_teaching).map(p => p.index))
      }
    } catch (e) {
      setError(friendlyApiError(e, 'load timetable configuration'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const configuredDays = useMemo(
    () => calendar?.days.filter(d => d.is_active).slice().sort((a, b) => a.index - b.index) ?? [],
    [calendar],
  )
  const allDays = useMemo(
    () => calendar?.days.slice().sort((a, b) => a.index - b.index) ?? [],
    [calendar],
  )
  const teachingPeriods = useMemo(
    () => calendar?.periods.filter(p => p.is_teaching).slice().sort((a, b) => a.index - b.index) ?? [],
    [calendar],
  )
  const selectedType = types.find(t => t.id === typeId)
  const editingType = types.find(t => t.id === editingTypeId)
  const running = !!job && RUNNING.has(job.status)

  function toggle(list: number[], value: number, setter: (value: number[]) => void) {
    setter(list.includes(value) ? list.filter(v => v !== value) : [...list, value].sort((a, b) => a - b))
  }

  function selectType(id: number) {
    const type = types.find(t => t.id === id)
    if (!type || type.display_mode !== 'day') return
    setTypeId(id)
    setDays(type.day_indexes)
    setPeriods(teachingPeriods.map(p => p.index))
    setLabels(Object.fromEntries(allDays.map(d => [d.index, d.name])))
  }

  function openNewType() {
    setEditingTypeId(null)
    setTypeName('')
    setTypeCode('')
    setTypeDays(configuredDays.map(d => d.index))
    setTypeEditor(true)
  }

  function openEditType() {
    if (!selectedType || selectedType.is_system || selectedType.display_mode !== 'day') return
    setEditingTypeId(selectedType.id)
    setTypeName(selectedType.name)
    setTypeCode(selectedType.code)
    setTypeDays(selectedType.day_indexes)
    setTypeEditor(true)
  }

  async function saveType() {
    if (!typeName.trim() || !typeCode.trim() || !typeDays.length) return
    try {
      const payload = {
        name: typeName.trim(), code: typeCode.trim(), display_mode: 'day' as const,
        day_indexes: typeDays, is_active: true, is_system: false,
      }
      const saved = editingTypeId === null
        ? await scheduling.createTimetableType(payload)
        : await scheduling.updateTimetableType(editingTypeId, payload)
      setTypes(value => editingTypeId === null ? [...value, saved] : value.map(t => t.id === saved.id ? saved : t))
      setTypeId(saved.id)
      setDays(saved.day_indexes)
      setTypeEditor(false)
      setEditingTypeId(null)
      notify(editingType ? 'Timetable type updated.' : 'Timetable type created.', 'success')
    } catch (e) {
      notify(friendlyApiError(e, 'save timetable type'), 'error')
    }
  }

  function openStructureEditor() {
    if (!calendar) return
    setDraftDays(calendar.days.map(d => ({ ...d })))
    setDraftPeriods(calendar.periods.map(p => ({ ...p })))
    setStructureEditor(true)
  }

  function updateDay(index: number, patch: Partial<Day>) {
    setDraftDays(value => value.map(d => d.index === index ? { ...d, ...patch } : d))
  }

  function updatePeriod(index: number, patch: Partial<Period>) {
    setDraftPeriods(value => value.map(p => p.index === index ? { ...p, ...patch } : p))
  }

  function addDay() {
    const index = Math.max(-1, ...draftDays.map(d => d.index)) + 1
    const name = `Day ${index + 1}`
    setDraftDays(value => [...value, { id: -Date.now(), index, name, short_form: `D${index + 1}`, date_value: null, is_active: true }])
  }

  function addPeriod() {
    const index = Math.max(0, ...draftPeriods.map(p => p.index)) + 1
    const name = `P${index}`
    setDraftPeriods(value => [...value, { id: -Date.now(), index, name, short_form: name, start_time: '15:20', end_time: '16:00', is_teaching: true }])
  }

  async function saveStructure() {
    if (!calendar) return
    setSaving(true)
    try {
      const payload = {
        days: draftDays.map(d => ({ index: d.index, name: d.name.trim() || `Day ${d.index + 1}`, short_form: d.short_form.trim() || `D${d.index + 1}`, date_value: d.date_value ?? null, is_active: d.is_active })),
        periods: draftPeriods.map(p => ({ index: p.index, name: p.name.trim() || `P${p.index}`, short_form: p.short_form.trim() || `P${p.index}`, start_time: p.start_time, end_time: p.end_time, is_teaching: p.is_teaching })),
        display_mode: calendar.display_mode === 'date' ? 'date' as const : 'day' as const,
      }
      const saved = await scheduling.saveCalendar(payload)
      setCalendar(saved)
      setLabels(Object.fromEntries(saved.days.map(d => [d.index, d.name])))
      setDays(value => value.filter(i => saved.days.some(d => d.index === i && d.is_active)))
      setPeriods(value => value.filter(i => saved.periods.some(p => p.index === i && p.is_teaching)))
      setStructureEditor(false)
      notify('Days and periods saved.', 'success')
    } catch (e) {
      notify(friendlyApiError(e, 'save days and periods'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function generate() {
    if (!typeId || !days.length || !periods.length || running || starting) return
    setStarting(true)
    try {
      const selected = periods.filter(i => teachingPeriods.some(p => p.index === i))
      const next = await scheduling.generateProfile({
        timetable_type_id: typeId,
        period_indexes: selected,
        day_indexes: days,
        day_names: Object.fromEntries(days.map(i => [i, (labels[i] ?? String(i)).trim()])),
        max_seconds: 30,
      })
      setJob(next)
      notify('Timetable generation started.', 'success')
    } catch (e) {
      notify(friendlyApiError(e, 'generate timetable'), 'error')
    } finally {
      setStarting(false)
    }
  }

  useEffect(() => {
    if (!job || !RUNNING.has(job.status)) return
    const timer = window.setInterval(async () => {
      if (document.visibilityState === 'hidden') return
      try { setJob(await scheduling.job(job.id)) } catch { /* keep polling */ }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  if (loading) return <>
    <PageHeader title="Generate timetable" description="Create a timetable from your configured days and periods." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Generate' }]} />
    <div className="card section"><LoadingBlock label="Loading timetable configuration" rows={5} /></div>
  </>

  if (error) return <>
    <PageHeader title="Generate timetable" description="Create a timetable from your configured days and periods." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Generate' }]} />
    <Alert tone="error" title="Configuration unavailable">{error}</Alert>
  </>

  return <>
    <PageHeader title="Generate timetable" description="Choose a type, days and periods, then generate." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Generate' }]} />

    {job && <section className="card section generation-status">
      <div className="panel__head"><div><h2 className="section__title">{running ? 'Generating timetable' : 'Generation complete'}</h2><p className="form__note">{job.message || job.stage || 'Timetable generation'}</p></div><Badge tone={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'neutral'}>{job.status}</Badge></div>
      <div className="progress" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><div className="progress__bar" style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} /></div>
      {job.result_version_id && job.status === 'completed' && <div className="form__row" style={{ marginTop: 10 }}><p className="form__note">Draft version #{job.result_version_id}</p><button className="button button--secondary" type="button" onClick={() => navigate(`/timetable?version=${job.result_version_id}`)}>Review draft</button></div>}
    </section>}

    <section className="card section generate-card">
      <div className="generate-hero"><div><div className="eyebrow">TIMETABLE</div><h2 className="section__title">Build your timetable</h2></div><Badge tone="neutral">Draft</Badge></div>

      <div className="generate-section">
        <label className="field__label">Timetable type</label>
        <div className="type-picker">
          <select className="input input--select" value={typeId ?? ''} onChange={e => selectType(Number(e.target.value))}>
            <option value="">Choose a timetable type</option>
            {types.filter(t => t.is_active && t.display_mode === 'day').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="button button--secondary" type="button" disabled={!selectedType || selectedType.is_system} onClick={openEditType}>Edit</button>
          <button className="button button--secondary" type="button" onClick={openNewType}>New</button>
        </div>
      </div>

      {selectedType && <>
        <div className="generate-section">
          <div className="section-line"><div><h3>Days</h3><p>Select the days to generate.</p></div><span className="count-pill">{days.length} selected</span></div>
          <div className="day-list">
            {configuredDays.filter(d => selectedType.day_indexes.includes(d.index)).map(d => <div className={`day-row ${days.includes(d.index) ? 'day-row--selected' : ''}`} key={d.index}>
              <input className="day-check" type="checkbox" checked={days.includes(d.index)} onChange={() => toggle(days, d.index, setDays)} aria-label={`Use ${d.name}`} />
              <span className="day-original">{d.name}</span><span className="arrow">→</span>
              <input className="day-name-input" type="text" value={labels[d.index] ?? d.name} onChange={e => setLabels(value => ({ ...value, [d.index]: e.target.value }))} aria-label={`Generated label for ${d.name}`} />
            </div>)}
          </div>
        </div>

        <div className="generate-section">
          <div className="section-line"><div><h3>Periods</h3><p>Select teaching periods to use.</p></div><span className="count-pill">{periods.length} selected</span></div>
          <div className="period-list">
            {teachingPeriods.map(p => <div className={`period-row ${periods.includes(p.index) ? 'period-row--selected' : ''}`} key={p.index}>
              <input type="checkbox" checked={periods.includes(p.index)} onChange={() => toggle(periods, p.index, setPeriods)} aria-label={`Use ${p.name}`} />
              <span className="period-name">{p.name}</span><span className="period-time">{p.start_time}–{p.end_time}</span>
            </div>)}
          </div>
        </div>

        <button className="button button--secondary" type="button" onClick={openStructureEditor}>Edit schedule</button>
      </>}

      <div className="generate-footer"><button className="button button--secondary" type="button" onClick={() => navigate('/timetable')}>Cancel</button><button className="button button--primary generate-action" type="button" disabled={!typeId || !days.length || !periods.length || running || starting} onClick={() => void generate()}>{starting ? 'Starting…' : running ? `Generating… ${job?.progress ?? 0}%` : 'Generate timetable →'}</button></div>
    </section>

    {typeEditor && <section className="card section type-editor">
      <div className="panel__head"><h2 className="section__title">{editingType ? 'Edit timetable type' : 'New timetable type'}</h2></div>
      <div className="form form--grid">
        <div className="field"><label className="field__label">Name</label><input className="input" value={typeName} onChange={e => setTypeName(e.target.value)} /></div>
        <div className="field"><label className="field__label">Code</label><input className="input" value={typeCode} onChange={e => setTypeCode(e.target.value)} /></div>
        <div className="field form--grid__full"><label className="field__label">Days</label><div className="chip-toggles">{configuredDays.map(d => <label key={d.index} className={`chip-toggle ${typeDays.includes(d.index) ? 'chip-toggle--on' : ''}`}><input type="checkbox" checked={typeDays.includes(d.index)} onChange={() => toggle(typeDays, d.index, setTypeDays)} /><span>{d.name}</span></label>)}</div></div>
      </div>
      <div className="form__row" style={{ marginTop: 16 }}><button className="button button--primary" type="button" disabled={!typeName.trim() || !typeCode.trim() || !typeDays.length} onClick={() => void saveType()}>Save</button><button className="button button--secondary" type="button" onClick={() => setTypeEditor(false)}>Cancel</button></div>
    </section>}

    {structureEditor && <section className="card section type-editor structure-editor">
      <div className="panel__head"><div><h2 className="section__title">Edit schedule</h2><p className="form__note">Rename, add, or change days and periods. Save applies the changes.</p></div></div>
      <div className="structure-group">
        <div className="section-line"><h3>Days</h3><button className="link-button" type="button" onClick={addDay}>+ Add day</button></div>
        <div className="structure-list">{draftDays.map(d => <div className="structure-row" key={`${d.id}-${d.index}`}><input type="checkbox" checked={d.is_active} onChange={e => updateDay(d.index, { is_active: e.target.checked })} aria-label={`Active ${d.name}`} /><input className="input" value={d.name} onChange={e => updateDay(d.index, { name: e.target.value })} aria-label="Day name" /><input className="input input--short" value={d.short_form} onChange={e => updateDay(d.index, { short_form: e.target.value })} aria-label="Day short form" /></div>)}</div>
      </div>
      <div className="structure-group">
        <div className="section-line"><h3>Periods</h3><button className="link-button" type="button" onClick={addPeriod}>+ Add period</button></div>
        <div className="structure-list">{draftPeriods.map(p => <div className="structure-row period-structure-row" key={`${p.id}-${p.index}`}><input type="checkbox" checked={p.is_teaching} onChange={e => updatePeriod(p.index, { is_teaching: e.target.checked })} aria-label={`Teaching ${p.name}`} /><input className="input" value={p.name} onChange={e => updatePeriod(p.index, { name: e.target.value })} aria-label="Period name" /><input className="input input--time" type="time" value={p.start_time} onChange={e => updatePeriod(p.index, { start_time: e.target.value })} aria-label="Start time" /><input className="input input--time" type="time" value={p.end_time} onChange={e => updatePeriod(p.index, { end_time: e.target.value })} aria-label="End time" /></div>)}</div>
      </div>
      <div className="form__row" style={{ marginTop: 16 }}><button className="button button--primary" type="button" disabled={saving} onClick={() => void saveStructure()}>{saving ? 'Saving…' : 'Save'}</button><button className="button button--secondary" type="button" onClick={() => setStructureEditor(false)}>Cancel</button></div>
    </section>}
  </>
}
