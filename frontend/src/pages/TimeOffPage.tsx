import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from '../lib/router'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type SchoolClass, type Slots, type Teacher } from '../lib/scheduling'

const EMPTY: Slots = {}
type Kind = 'teachers' | 'classes'
type Resource = Teacher | SchoolClass

export function TimeOffPage() {
  const { notify } = useToast()
  const [kind, setKind] = useState<Kind>('teachers')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [calendar, setCalendar] = useState<Calendar | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Slots>(EMPTY)
  const [saved, setSaved] = useState<Slots>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resources = useMemo<Resource[]>(() => (kind === 'teachers' ? teachers : classes), [kind, teachers, classes])
  const selected = resources.find((resource) => resource.id === selectedId) ?? null
  const days = calendar?.days.filter((day) => day.is_active) ?? []
  const periods = calendar?.periods.filter((period) => period.is_teaching) ?? []
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const blockedCount = Object.values(draft).flat().length

  useEffect(() => {
    let active = true
    setLoading(true); setError(null)
    Promise.all([scheduling.calendar(), scheduling.teachers(), scheduling.classes()])
      .then(([nextCalendar, nextTeachers, nextClasses]) => { if (!active) return; setCalendar(nextCalendar); setTeachers(nextTeachers); setClasses(nextClasses); setSelectedId(nextTeachers[0]?.id ?? nextClasses[0]?.id ?? null) })
      .catch((err) => { if (active) setError(friendlyApiError(err, 'load the time-off grid')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selected) { setDraft(EMPTY); setSaved(EMPTY); return }
    const next = selected.unavailable ?? EMPTY; setDraft(next); setSaved(next)
  }, [selected])

  useEffect(() => {
    if (resources.length === 0) { setSelectedId(null); return }
    if (!resources.some((resource) => resource.id === selectedId)) setSelectedId(resources[0].id)
  }, [resources, selectedId])

  function switchKind(nextKind: Kind) {
    if (dirty && !window.confirm('You have unsaved time-off changes. Discard them?')) return
    setKind(nextKind); setSelectedId(null)
  }
  function toggle(dayIndex: number, periodIndex: number) {
    const key = String(dayIndex); const current = new Set(draft[key] ?? [])
    if (current.has(periodIndex)) current.delete(periodIndex); else current.add(periodIndex)
    const next = { ...draft }; if (current.size === 0) delete next[key]; else next[key] = [...current].sort((a, b) => a - b); setDraft(next)
  }
  async function save() {
    if (!selected || saving || !dirty) return
    setSaving(true); setError(null)
    try {
      if (kind === 'teachers') {
        const updated = await scheduling.updateTeacher(selected.id, { ...selected, unavailable: draft })
        setTeachers((current) => current.map((item) => item.id === updated.id ? updated : item))
      } else {
        const updated = await scheduling.updateClass(selected.id, { ...selected, unavailable: draft })
        setClasses((current) => current.map((item) => item.id === updated.id ? updated : item))
      }
      setSaved(draft); notify(`${selected.name} time off saved.`, 'success')
    } catch (err) { setError(friendlyApiError(err, 'save time-off changes')) }
    finally { setSaving(false) }
  }
  function clearAll() { setDraft(EMPTY) }

  return <><PageHeader title="Time off" description="Mark when teachers or classes are unavailable for lessons. Click any cell to switch between available and time off." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Time off' }]} actions={<button type="button" className="button button--primary button--sm" onClick={save} disabled={!dirty || saving || !selected}>{saving ? 'Saving…' : 'Save changes'}</button>} />{error && <Alert tone="error">{error}</Alert>}<section className="card section"><div className="form--grid" style={{ marginBottom: '1.25rem' }}><label className="field"><span className="field__label">Resource type</span><select className="input" value={kind} onChange={(event) => switchKind(event.target.value as Kind)}><option value="teachers">Teachers</option><option value="classes">Classes</option></select></label><label className="field"><span className="field__label">{kind === 'teachers' ? 'Teacher' : 'Class'}</span><select className="input" value={selectedId ?? ''} onChange={(event) => setSelectedId(Number(event.target.value))} disabled={loading || resources.length === 0}>{resources.length === 0 && <option value="">No {kind} available</option>}{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} ({resource.code})</option>)}</select></label></div>{loading ? <p className="form__note">Loading days, periods and resources…</p> : !selected ? <div><p className="form__note">Add a {kind === 'teachers' ? 'teacher' : 'class'} first.</p><Link className="button button--secondary button--sm" to={kind === 'teachers' ? '/setup/teachers' : '/setup/classes'}>Configure {kind === 'teachers' ? 'teachers' : 'classes'}</Link></div> : calendar && days.length && periods.length ? <><div className="form__row form__row--between" style={{ marginBottom: '1rem' }}><div><h2 className="section__title" style={{ marginBottom: '0.25rem' }}>{selected.name}</h2><p className="field__hint">Click cells to mark time off. Changes are local until you save.</p></div><div className="form__row" aria-label="Time-off legend"><Badge tone="success">✓ Available</Badge><Badge tone="danger">X Time off</Badge><Badge tone="warning">{blockedCount} blocked</Badge></div></div><div style={{ overflowX: 'auto', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)' }}><table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', tableLayout: 'fixed' }}><thead><tr><th scope="col" style={headerCell}>Day</th>{periods.map((period) => <th key={period.index} scope="col" style={headerCell} title={`${period.start_time}–${period.end_time}`}>{period.name}</th>)}</tr></thead><tbody>{days.map((day) => <tr key={day.index}><th scope="row" style={dayCell}>{day.name}</th>{periods.map((period) => { const unavailable = (draft[String(day.index)] ?? []).includes(period.index); return <td key={period.index} style={{ padding: 0, borderTop: '1px solid var(--color-line)', borderLeft: '1px solid var(--color-line)' }}><button type="button" onClick={() => toggle(day.index, period.index)} aria-pressed={unavailable} aria-label={`${day.name}, ${period.name}: ${unavailable ? 'time off' : 'available'}`} style={cellButton(unavailable)}><span aria-hidden="true" style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1 }}>{unavailable ? 'X' : '✓'}</span><span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{unavailable ? 'Time off' : 'Available'}</span></button></td> })}</tr>)}</tbody></table></div><div className="form__row" style={{ marginTop: '1rem' }}><button type="button" className="button button--ghost button--sm" onClick={clearAll} disabled={blockedCount === 0}>Clear all time off</button><button type="button" className="button button--primary button--sm" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</button>{dirty && <span className="form__note" role="status">Unsaved changes</span>}</div></> : <div><p className="form__note">Set up at least one active working day and one teaching period first.</p><Link className="button button--secondary button--sm" to="/setup/periods">Configure days &amp; periods</Link></div>}</section></>
}

const headerCell: CSSProperties = { padding: '0.85rem 0.6rem', background: 'var(--color-surface-muted)', borderBottom: '1px solid var(--color-line)', color: 'var(--color-ink)', fontSize: '0.8rem', fontWeight: 800, textAlign: 'center' }
const dayCell: CSSProperties = { width: '7rem', padding: '0.85rem 0.75rem', borderTop: '1px solid var(--color-line)', background: 'var(--color-surface-muted)', fontWeight: 700, textAlign: 'left' }
function cellButton(unavailable: boolean): CSSProperties { return { width: '100%', minHeight: '5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', border: 0, borderRadius: 0, background: unavailable ? 'var(--color-danger-soft)' : 'var(--color-success-soft)', color: unavailable ? 'var(--color-danger)' : 'var(--color-success)', cursor: 'pointer' } }
