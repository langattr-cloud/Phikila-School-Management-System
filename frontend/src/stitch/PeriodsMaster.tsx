import { useMemo, useState } from 'react'
import './periods-master.css'

export type PeriodEntry = {
  name: string
  start: string
  end: string
  type?: 'lesson' | 'break'
  short?: string
  len?: number
  position?: number
  textForPrintouts?: string
  printSummary?: boolean
  printTeacher?: boolean
  printClass?: boolean
  printClassroom?: boolean
  printInBells?: string
  doubleCannotSpan?: boolean
}
type Row = PeriodEntry & { key: string; sourceIndex: number | null }
type EditForm = {
  name: string; short: string; startH: string; startM: string; endH: string; endM: string
  printSummary: boolean; printTeacher: boolean; printClass: boolean; printClassroom: boolean; printInBells: string
}

const timeMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0
}
const duration = (start: string, end: string) => timeMinutes(end) - timeMinutes(start)
const formatTime = (h: string, m: string) => h.padStart(2, '0') + ':' + m.padStart(2, '0')
const toEditForm = (p: PeriodEntry): EditForm => {
  const [sh = '08', sm = '00'] = (p.start || '08:00').split(':')
  const [eh = '08', em = '40'] = (p.end || '08:40').split(':')
  return {
    name: p.name, short: p.short || p.name, startH: sh.padStart(2, '0'), startM: sm.padStart(2, '0'),
    endH: eh.padStart(2, '0'), endM: em.padStart(2, '0'), printSummary: p.printSummary ?? true,
    printTeacher: p.printTeacher ?? true, printClass: p.printClass ?? true, printClassroom: p.printClassroom ?? true,
    printInBells: p.printInBells || 'All classes',
  }
}
const defaultPeriod = (name: string, short: string, start: string, end: string, type: 'lesson' | 'break' = 'lesson'): PeriodEntry => ({
  name, short, start, end, len: duration(start, end), type, printInBells: 'All classes',
  printSummary: true, printTeacher: true, printClass: true, printClassroom: true,
})

export default function PeriodsMaster({
  initialPeriods, onSaveAll, onClose,
}: {
  initialPeriods: PeriodEntry[]
  onSaveAll: (periods: PeriodEntry[], oldIndexToNewIndex: Record<number, number>) => void | Promise<void>
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[]>(() => initialPeriods.map((p, i) => ({ ...p, key: 'existing-' + i, sourceIndex: i })))
  const [selectedKey, setSelectedKey] = useState(rows[0]?.key || '')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [error, setError] = useState('')
  const [diffClasses, setDiffClasses] = useState(false)
  const [diffDays, setDiffDays] = useState(false)
  const [saving, setSaving] = useState(false)
  const selectedIndex = rows.findIndex(row => row.key === selectedKey)
  const selected = rows[selectedIndex]
  const editRow = rows.find(row => row.key === editingKey) || null
  const selectedDuration = useMemo(() => selected ? duration(selected.start, selected.end) : 0, [selected])
  const openEdit = (row: Row) => { setEditingKey(row.key); setEditForm(toEditForm(row)); setError('') }
  const updateForm = <K extends keyof EditForm>(key: K, value: EditForm[K]) => setEditForm(current => current ? { ...current, [key]: value } : current)

  const saveEdit = () => {
    if (!editForm || !editRow) return
    const start = formatTime(editForm.startH, editForm.startM)
    const end = formatTime(editForm.endH, editForm.endM)
    if (!editForm.name.trim()) { setError('Enter a period name.'); return }
    if (duration(start, end) <= 0) { setError('The end time must be later than the start time.'); return }
    setRows(current => current.map(row => row.key === editingKey ? {
      ...row, name: editForm.name.trim(), short: editForm.short.trim() || editForm.name.trim(),
      start, end, len: duration(start, end), printSummary: editForm.printSummary, printTeacher: editForm.printTeacher,
      printClass: editForm.printClass, printClassroom: editForm.printClassroom, printInBells: editForm.printInBells,
    } : row))
    setEditingKey(null); setEditForm(null); setError('')
  }
  const addPeriod = (type: 'lesson' | 'break') => {
    const lessonCount = rows.filter(row => row.type !== 'break').length
    const item = type === 'break'
      ? defaultPeriod('BREAK', 'BREAK', '10:20', '10:40', 'break')
      : defaultPeriod('Period ' + (lessonCount + 1), 'P' + (lessonCount + 1), '13:00', '13:40')
    const row: Row = { ...item, key: 'new-' + Date.now() + '-' + Math.random().toString(36).slice(2), sourceIndex: null, position: lessonCount }
    const next = [...rows, row]
    setRows(next); setSelectedKey(row.key)
    if (type === 'break') openEdit(row)
  }
  const move = (direction: -1 | 1) => {
    if (selectedIndex < 0) return
    const nextIndex = selectedIndex + direction
    if (nextIndex < 0 || nextIndex >= rows.length) return
    setRows(current => {
      const next = [...current]
      const [item] = next.splice(selectedIndex, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }
  const removeSelected = () => {
    if (!selected) return
    if (!window.confirm('Delete "' + selected.name + '"? Lessons assigned to this period will be removed when you save.')) return
    const next = rows.filter(row => row.key !== selected.key)
    setRows(next); setSelectedKey(next[Math.min(selectedIndex, next.length - 1)]?.key || '')
  }
  const saveAll = async () => {
    setError('')
    const invalid = rows.find(row => !row.name.trim() || duration(row.start, row.end) <= 0)
    if (invalid) { setError('Each period needs a name and an end time later than its start time.'); return }
    const map: Record<number, number> = {}
    rows.forEach((row, index) => { if (row.sourceIndex !== null) map[row.sourceIndex] = index })
    setSaving(true)
    try {
      await onSaveAll(rows.map(({ key: _key, sourceIndex: _sourceIndex, ...period }) => ({
        ...period, len: duration(period.start, period.end),
      })), map)
      onClose()
    } catch {
      setError('Periods could not be saved. Check the connection and try again.')
    } finally { setSaving(false) }
  }

  return <div className="phikila-periods-overlay" role="presentation">
    <section className="phikila-periods-window" role="dialog" aria-modal="true" aria-label="Periods and bell times">
      <header className="phikila-periods-title"><strong>Periods · Bell times and rename periods</strong><button type="button" aria-label="Close periods" onClick={onClose}>×</button></header>
      <div className="phikila-periods-body">
        <div className="phikila-periods-main">
          <div className="phikila-periods-table-wrap">
            <div className="phikila-periods-table-scroll"><table className="phikila-periods-table">
              <thead><tr><th></th><th>Name</th><th>Short</th><th>Start</th><th>The End</th><th>Len.</th><th>Print</th><th>Bell</th></tr></thead>
              <tbody>{rows.map((p, i) => <tr key={p.key} onClick={() => setSelectedKey(p.key)} onDoubleClick={() => openEdit(p)} className={(selectedKey === p.key ? 'is-selected ' : '') + (p.type === 'break' ? 'is-break' : '')}>
                <td>{selectedKey === p.key ? '●' : '○'}</td><td>{p.name}</td><td>{p.short || p.name}</td><td>{p.start}</td><td>{p.end}</td><td>{duration(p.start, p.end)}</td><td>{p.printSummary === false && p.printTeacher === false && p.printClass === false && p.printClassroom === false ? 'No' : 'Yes'}</td><td>{p.printInBells || 'All classes'}</td>
              </tr>)}</tbody>
            </table>{rows.length === 0 && <p className="phikila-periods-empty">No periods yet. Add a period or a break to begin.</p>}</div>
          </div>
          <aside className="phikila-periods-actions">
            <button type="button" onClick={() => selected && openEdit(selected)} disabled={!selected}>Edit / Rename</button>
            <button type="button" onClick={removeSelected} disabled={!selected}>Delete</button>
            <div className="phikila-periods-action-spacer" />
            <div className="phikila-periods-move"><button type="button" aria-label="Move period up" onClick={() => move(-1)} disabled={selectedIndex <= 0}>↑</button><button type="button" aria-label="Move period down" onClick={() => move(1)} disabled={selectedIndex < 0 || selectedIndex >= rows.length - 1}>↓</button><span>Change the order of periods and breaks.</span></div>
            <button type="button" onClick={() => addPeriod('lesson')}>＋ Add period</button>
            <button type="button" onClick={() => addPeriod('break')}>＋ Add break</button>
          </aside>
        </div>
        <div className="phikila-periods-options">
          <label><input type="checkbox" checked={diffClasses} onChange={event => setDiffClasses(event.target.checked)} /> Different bell times in different classes</label>
          {diffClasses && <p>Per-class bell overrides are not yet available in the shared timetable workspace.</p>}
          <label><input type="checkbox" checked={diffDays} onChange={event => setDiffDays(event.target.checked)} /> Different bells for this period on some days</label>
          {diffDays && <p>Per-day bell overrides are not yet available in the shared timetable workspace.</p>}
        </div>
        <footer className="phikila-periods-footer"><span>{rows.length} periods · {rows.filter(p => p.type === 'break').length} breaks</span><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="is-primary" onClick={() => void saveAll()} disabled={saving}>{saving ? 'Saving…' : 'Save periods'}</button></footer>
      </div>
    </section>
    {editForm && editRow && <div className="phikila-period-edit-overlay">
      <section className="phikila-period-edit-window" role="dialog" aria-modal="true" aria-label="Edit period">
        <header className="phikila-periods-title"><strong>Edit period</strong><button type="button" aria-label="Close period editor" onClick={() => { setEditingKey(null); setEditForm(null); }}>×</button></header>
        <div className="phikila-period-edit-body">
          <label>Name of the period<input autoFocus value={editForm.name} onChange={event => updateForm('name', event.target.value)} /></label>
          <label>Short name<input value={editForm.short} onChange={event => updateForm('short', event.target.value)} /></label>
          <fieldset><legend>Start / The End</legend><div className="phikila-period-time-grid">
            <label>Start hour<select value={editForm.startH} onChange={event => updateForm('startH', event.target.value)}>{Array.from({length:24}, (_,i) => String(i).padStart(2,'0')).map(v => <option key={v}>{v}</option>)}</select></label>
            <label>Start minute<select value={editForm.startM} onChange={event => updateForm('startM', event.target.value)}>{Array.from({length:60}, (_,i) => String(i).padStart(2,'0')).map(v => <option key={v}>{v}</option>)}</select></label>
            <label>End hour<select value={editForm.endH} onChange={event => updateForm('endH', event.target.value)}>{Array.from({length:24}, (_,i) => String(i).padStart(2,'0')).map(v => <option key={v}>{v}</option>)}</select></label>
            <label>End minute<select value={editForm.endM} onChange={event => updateForm('endM', event.target.value)}>{Array.from({length:60}, (_,i) => String(i).padStart(2,'0')).map(v => <option key={v}>{v}</option>)}</select></label>
          </div></fieldset>
          <fieldset><legend>Printouts</legend>
            <label><input type="checkbox" checked={editForm.printSummary} onChange={event => updateForm('printSummary', event.target.checked)} /> Print in summary timetables</label>
            <label><input type="checkbox" checked={editForm.printTeacher} onChange={event => updateForm('printTeacher', event.target.checked)} /> Print in individual teacher timetables</label>
            <label><input type="checkbox" checked={editForm.printClass} onChange={event => updateForm('printClass', event.target.checked)} /> Print in individual class timetables</label>
            <label><input type="checkbox" checked={editForm.printClassroom} onChange={event => updateForm('printClassroom', event.target.checked)} /> Print in individual classroom timetables</label>
          </fieldset>
          <label>Print in bells<select value={editForm.printInBells} onChange={event => updateForm('printInBells', event.target.value)}><option>All classes</option><option>Selected classes</option><option>Do not print</option></select></label>
          {error && <p className="phikila-periods-error" role="alert">{error}</p>}
          <footer><button type="button" onClick={() => { setEditingKey(null); setEditForm(null); }}>Cancel</button><button type="button" className="is-primary" onClick={saveEdit}>OK</button></footer>
        </div>
      </section>
    </div>}
      </div>
  </div>
}
