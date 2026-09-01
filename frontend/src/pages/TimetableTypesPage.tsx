import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type TimetableType } from '../lib/scheduling'

export function TimetableTypesPage() {
  const { notify } = useToast()
  const [calendar, setCalendar] = useState<Calendar | null>(null)
  const [types, setTypes] = useState<TimetableType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<TimetableType | null | false>(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [mode, setMode] = useState<'day' | 'date'>('day')
  const [days, setDays] = useState<number[]>([])

  async function load() {
    setLoading(true); setError(null)
    try { const [cal, tt] = await Promise.all([scheduling.calendar(), scheduling.timetableTypes()]); setCalendar(cal); setTypes(tt) }
    catch (e) { setError(friendlyApiError(e, 'load timetable types')) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  function openNew() { setName(''); setCode(''); setMode('day'); setDays(calendar?.days.map(d => d.index) ?? []); setEditor(null) }
  function openEdit(type: TimetableType) { setName(type.name); setCode(type.code); setMode(type.display_mode); setDays(type.day_indexes); setEditor(type) }
  function toggleDay(index: number) { setDays(v => v.includes(index) ? v.filter(x => x !== index) : [...v, index].sort((a, b) => a - b)) }
  async function save() {
    if (!name.trim() || !code.trim() || !days.length) return
    try {
      const payload = { name: name.trim(), code: code.trim(), display_mode: mode, day_indexes: days, is_active: true, is_system: editor !== null }
      const saved = editor ? await scheduling.updateTimetableType(editor.id, payload) : await scheduling.createTimetableType(payload)
      setTypes(v => editor ? v.map(t => t.id === saved.id ? saved : t) : [...v, saved]); setEditor(false)
      notify(editor ? 'Timetable type updated.' : 'Timetable type created.', 'success')
    } catch (e) { notify(friendlyApiError(e, 'save timetable type'), 'error') }
  }

  if (loading) return <><PageHeader title="Timetable types" description="Manage reusable timetable type definitions." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Timetable types' }]} /><div className="card section"><LoadingBlock label="Loading timetable types" rows={5} /></div></>
  if (error) return <><PageHeader title="Timetable types" description="Manage reusable timetable type definitions." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable types' }]} /><Alert tone="error" title="Types unavailable">{error}</Alert></>

  return <>
    <PageHeader title="Timetable types" description="Manage reusable timetable type definitions." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable types' }]} />
    <section className="card section">
      <div className="panel__head"><div><p className="form__note">CONFIGURATION</p><h2 className="section__title">Timetable types</h2><p className="form__note">Define the schedule and display rules available when building a timetable.</p></div><button className="button button--primary" type="button" onClick={openNew}>+ New timetable type</button></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Type</th><th>Schedule</th><th>Status</th><th>Actions</th></tr></thead><tbody>{types.map(t => <tr key={t.id}><td><strong>{t.name}</strong></td><td>{t.day_indexes.map(i => calendar?.days.find(d => d.index === i)?.name).filter(Boolean).join('–')}</td><td>{t.is_active ? 'Active' : 'Inactive'}</td><td><button className="button button--secondary button--sm" type="button" onClick={() => openEdit(t)}>Edit</button></td></tr>)}</tbody></table></div>
    </section>
    {editor !== false && <section className="card section"><div className="panel__head"><div><h2 className="section__title">{editor ? 'Edit timetable type' : 'New timetable type'}</h2><p className="form__note">Configure a reusable timetable type. The internal code is not shown in the timetable-building workflow.</p></div></div>
      <div className="form form--grid"><div className="field"><label className="field__label">Name</label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div><div className="field"><label className="field__label">Internal code</label><input className="input" value={code} onChange={e => setCode(e.target.value)} /></div><div className="field"><label className="field__label">Display basis</label><select className="input input--select" value={mode} onChange={e => setMode(e.target.value as 'day' | 'date')}><option value="day">Day based</option><option value="date">Date based</option></select></div><div className="field form--grid__full"><label className="field__label">Schedule days</label><div className="chip-toggles">{(calendar?.days ?? []).map(d => <label key={d.index} className={`chip-toggle ${days.includes(d.index) ? 'chip-toggle--on' : ''}`}><input type="checkbox" checked={days.includes(d.index)} onChange={() => toggleDay(d.index)} /><span>{d.name}</span></label>)}</div></div></div>
      <div className="form__row" style={{ marginTop: 16 }}><button className="button button--primary" type="button" disabled={!name.trim() || !code.trim() || !days.length} onClick={() => void save()}>{editor ? 'Save changes' : 'Save'}</button><button className="button button--secondary" type="button" onClick={() => setEditor(false)}>Cancel</button></div>
    </section>}
  </>
}
