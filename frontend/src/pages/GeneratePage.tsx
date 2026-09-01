import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type Day, type Job, type Period, type TimetableType } from '../lib/scheduling'

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const RUNNING = ['queued', 'running', 'optimizing', 'validating']

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
  const [typeEditor, setTypeEditor] = useState<'closed' | 'new' | 'edit'>('closed')
  const [typeName, setTypeName] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [typeDays, setTypeDays] = useState<number[]>([])

  async function load() {
    setLoading(true); setError(null)
    try {
      const [cal, timetableTypes] = await Promise.all([scheduling.calendar(), scheduling.timetableTypes()])
      setCalendar(cal); setTypes(timetableTypes); setPeriods(cal.periods)
      const labels = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index, cal.days.find(d => d.index === index)?.name ?? WEEKDAY_NAMES[index]]))
      setDayLabels(labels)
      const first = timetableTypes[0]
      if (first) { setTypeId(first.id); setLabel(first.name); setDayIndexes(first.day_indexes); setTypeDays(first.day_indexes); setPeriodIndexes(cal.periods.filter(p => p.is_teaching).map(p => p.index)) }
    } catch (e) { setError(friendlyApiError(e, 'load timetable generation setup')) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const allDays = useMemo(() => Array.from({ length: 7 }, (_, index) => calendar?.days.find(d => d.index === index) ?? ({ id: index, index, name: WEEKDAY_NAMES[index], is_active: true } as Day)), [calendar])
  const teachingPeriods = periods.filter(p => p.is_teaching)
  const selectedPeriods = periodIndexes.length ? periodIndexes : teachingPeriods.map(p => p.index)
  const running = !!job && RUNNING.includes(job.status)
  const selectedDayCount = dayIndexes.length
  const selectedPeriodCount = selectedPeriods.length

  function toggle(list: number[], value: number, setter: (v: number[]) => void) { setter(list.includes(value) ? list.filter(x => x !== value) : [...list, value].sort((a, b) => a - b)) }
  function selectAllDays() { setDayIndexes(allDays.map(d => d.index)) }
  function selectWeekdays() { setDayIndexes([0, 1, 2, 3, 4]) }
  function selectNoDays() { setDayIndexes([]) }
  function selectAllPeriods() { setPeriodIndexes(teachingPeriods.map(p => p.index)) }
  function selectType(id: number) {
    const type = types.find(t => t.id === id); if (!type) return
    setTypeId(id); setLabel(type.name); setDayIndexes(type.day_indexes); setTypeDays(type.day_indexes); setPeriodIndexes(teachingPeriods.map(p => p.index))
  }
  function openNewType() { setTypeName(''); setTypeCode(''); setTypeDays(dayIndexes.length ? dayIndexes : [0, 1, 2, 3, 4]); setTypeEditor('new') }
  function openEditType() { const type = types.find(t => t.id === typeId); if (!type) return; setTypeName(type.name); setTypeCode(type.code); setTypeDays(type.day_indexes); setTypeEditor('edit') }
  function updateDayLabel(index: number, value: string) { setDayLabels(current => ({ ...current, [index]: value })) }

  async function saveType() {
    const current = types.find(t => t.id === typeId); if (!current || !typeName.trim() || !typeCode.trim() || !typeDays.length) return
    try {
      const updated = await scheduling.updateTimetableType(current.id, { ...current, name: typeName.trim(), code: typeCode.trim(), day_indexes: typeDays })
      setTypes(v => v.map(t => t.id === updated.id ? updated : t)); selectType(updated.id); setTypeEditor('closed'); notify('Timetable type updated.', 'success')
    } catch (e) { notify(friendlyApiError(e, 'update timetable type'), 'error') }
  }
  async function createType() {
    if (!typeName.trim() || !typeCode.trim() || !typeDays.length) return
    try {
      const created = await scheduling.createTimetableType({ name: typeName.trim(), code: typeCode.trim(), day_indexes: typeDays, is_active: true, is_system: false })
      setTypes(v => [...v, created]); selectType(created.id); setTypeEditor('closed'); notify('Timetable type created.', 'success')
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

  if (loading) return <><PageHeader title="Generate timetable" description="Build a timetable from the school's existing teaching data." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Generate' }]} /><div className="card section"><LoadingBlock label="Loading timetable setup" rows={6} /></div></>
  if (error) return <><PageHeader title="Generate timetable" description="Build a timetable from the school's existing teaching data." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Generate' }]} /><Alert tone="error" title="Setup could not load">{error}</Alert></>

  return <>
    <PageHeader title="Generate timetable" description="Configure the schedule, review the inputs, then generate a draft for review." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Generate' }]} />

    {job && <section className="card section" aria-live="polite" style={{ marginBottom: 18 }}>
      <div className="panel__head"><div><h2 className="section__title">Generation {running ? 'in progress' : 'result'}</h2><p className="form__note">{job.message || job.stage || 'The timetable generator has completed.'}</p></div><Badge tone={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'neutral'}>{job.status}</Badge></div>
      <div className="progress" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><div className="progress__bar" style={{ width: `${job.progress}%` }} /></div>
      {job.status === 'completed' && <Alert tone="success" title="Draft timetable generated">Review the result before putting it into force. Members will continue using the current official timetable until you publish the new one.</Alert>}
      {job.status === 'failed' && <Alert tone="error" title="Generation failed">{job.message || 'The timetable could not be generated.'}</Alert>}
    </section>}

    <section className="card section" style={{ overflow: 'hidden' }}>
      <div className="panel__head" style={{ alignItems: 'flex-start' }}>
        <div><p className="form__note" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Timetable configuration</p><h2 className="section__title">Build a new timetable</h2><p className="form__note">Classes and teachers remain independent management areas. The generator uses the school's existing teaching allocations automatically.</p></div>
        <Badge tone="neutral">Draft until Put Into Force</Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, .34fr)', gap: 24, alignItems: 'start' }}>
        <div>
          <section style={{ padding: '18px 0', borderTop: '1px solid var(--border, #e5e7eb)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}><div><h3 style={{ margin: 0 }}>1. Timetable type</h3><p className="form__note">Choose a reusable configuration or create your own.</p></div><button className="button button--secondary button--sm" type="button" onClick={openNewType}>New type</button></div>
            <div className="form__row" style={{ alignItems: 'stretch' }}><select id="tt-type" aria-label="Timetable type" className="input input--select" value={typeId ?? ''} onChange={e => selectType(Number(e.target.value))}><option value="">Choose type…</option>{types.map(t => <option key={t.id} value={t.id}>{t.name} · {t.code}</option>)}</select><button className="button button--secondary" type="button" disabled={!typeId} onClick={openEditType}>Edit</button></div>
          </section>

          <section style={{ padding: '18px 0', borderTop: '1px solid var(--border, #e5e7eb)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}><div><h3 style={{ margin: 0 }}>2. Schedule days</h3><p className="form__note">All seven days are available. The label can be a weekday, date, or custom text.</p></div><div className="form__row"><button className="button button--ghost button--sm" type="button" onClick={selectWeekdays}>Weekdays</button><button className="button button--ghost button--sm" type="button" onClick={selectAllDays}>All 7</button><button className="button button--ghost button--sm" type="button" onClick={selectNoDays}>Clear</button></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(90px, 1fr))', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {allDays.map(d => { const selected = dayIndexes.includes(d.index); return <button key={d.index} type="button" onClick={() => toggle(dayIndexes, d.index, setDayIndexes)} aria-pressed={selected} style={{ textAlign: 'left', padding: 12, minHeight: 76, borderRadius: 10, border: `1px solid ${selected ? 'var(--accent, #1d4ed8)' : 'var(--border, #e5e7eb)'}`, background: selected ? 'var(--surface-selected, #eff6ff)' : 'var(--surface, #fff)', cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 12 }}>{WEEKDAY_NAMES[d.index]}</strong><span style={{ display: 'block', marginTop: 7, fontSize: 13, fontWeight: selected ? 700 : 500 }}>{dayLabels[d.index] || WEEKDAY_NAMES[d.index]}</span></button> })}
            </div>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>{allDays.map(d => <div className="field" key={d.index}><label className="field__label" htmlFor={`day-label-${d.index}`}>{WEEKDAY_NAMES[d.index]} label</label><input id={`day-label-${d.index}`} className="input" value={dayLabels[d.index] ?? WEEKDAY_NAMES[d.index]} onChange={e => updateDayLabel(d.index, e.target.value)} placeholder={WEEKDAY_NAMES[d.index]} /></div>)}</div>
          </section>

          <section style={{ padding: '18px 0', borderTop: '1px solid var(--border, #e5e7eb)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}><div><h3 style={{ margin: 0 }}>3. Teaching periods</h3><p className="form__note">Choose the teaching periods the solver may use. Non-teaching periods are excluded.</p></div><button className="button button--ghost button--sm" type="button" onClick={selectAllPeriods}>All teaching periods</button></div>
            <select multiple className="input" style={{ minHeight: 170 }} aria-label="Teaching periods" value={selectedPeriods.map(String)} onChange={e => setPeriodIndexes(Array.from(e.target.selectedOptions).map(o => Number(o.value)))}>{teachingPeriods.map(p => <option key={p.index} value={p.index}>{p.name} — {p.start_time}–{p.end_time}</option>)}</select>
          </section>
        </div>

        <aside style={{ position: 'sticky', top: 18, border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: 18, background: 'var(--surface-subtle, #f8fafc)' }}>
          <p className="form__note" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Review</p><h3 style={{ margin: '0 0 14px' }}>Generation summary</h3>
          <dl style={{ margin: 0, display: 'grid', gap: 12 }}><div><dt className="form__note">Timetable type</dt><dd style={{ margin: 2, fontWeight: 700 }}>{types.find(t => t.id === typeId)?.name || 'Not selected'}</dd></div><div><dt className="form__note">Days</dt><dd style={{ margin: 2, fontWeight: 700 }}>{selectedDayCount} of 7 selected</dd></div><div><dt className="form__note">Periods</dt><dd style={{ margin: 2, fontWeight: 700 }}>{selectedPeriodCount} teaching periods</dd></div><div><dt className="form__note">Output</dt><dd style={{ margin: 2, fontWeight: 700 }}>Draft timetable</dd></div></dl>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border, #e5e7eb)' }}><p className="form__note">After generation, review conflicts and quality before putting the timetable into force.</p><button className="button button--primary button--block" type="button" disabled={!typeId || !dayIndexes.length || !selectedPeriods.length || running || starting} onClick={() => void generate()}>{starting ? 'Starting…' : running ? `Generating… ${job?.progress ?? 0}%` : 'Generate Timetable'}</button></div>
        </aside>
      </div>
    </section>

    {typeEditor !== 'closed' && <section className="card section" style={{ marginTop: 18 }}><div className="panel__head"><div><h2 className="section__title">{typeEditor === 'new' ? 'Create timetable type' : 'Edit timetable type'}</h2><p className="form__note">Reusable defaults only. Changing a type does not alter existing generated timetables.</p></div><button className="button button--ghost button--sm" type="button" onClick={() => setTypeEditor('closed')}>Close</button></div><div className="form form--grid"><div className="field"><label className="field__label">Name</label><input className="input" value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="Weekend" /></div><div className="field"><label className="field__label">Code</label><input className="input" value={typeCode} onChange={e => setTypeCode(e.target.value.toUpperCase())} placeholder="WEEKEND" /></div><div className="field form--grid__full"><label className="field__label">Default days</label><div className="chip-toggles">{allDays.map(d => <label key={d.index} className={`chip-toggle ${typeDays.includes(d.index) ? 'chip-toggle--on' : ''}`}><input type="checkbox" checked={typeDays.includes(d.index)} onChange={() => toggle(typeDays, d.index, setTypeDays)} />{WEEKDAY_NAMES[d.index]}</label>)}</div></div></div><div className="form__row" style={{ marginTop: 16 }}><button className="button button--primary" type="button" disabled={!typeName.trim() || !typeCode.trim() || !typeDays.length} onClick={() => void (typeEditor === 'new' ? createType() : saveType())}>{typeEditor === 'new' ? 'Create type' : 'Save changes'}</button></div></section>}
  </>
}
