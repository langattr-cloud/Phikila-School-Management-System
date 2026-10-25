import { useState } from 'react'

export type DayEntry = { id: string; originalName?: string; name: string; short: string; desc: string; combinedDays: string[] }
type Props = {
  initialDays: string[]
  initialDetails?: Record<string, { short?: string; desc?: string; combinedDays?: string[] }>
  onSave: (days: DayEntry[]) => void | Promise<void>
  onClose: () => void
}

const SHORTS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const makeEntry = (name: string, index: number, details?: Props['initialDetails']) => ({
  id: name + '-' + index,
  originalName: name,
  name,
  short: details?.[name]?.short || SHORTS[index] || name.slice(0, 2).toUpperCase(),
  desc: details?.[name]?.desc || '',
  combinedDays: details?.[name]?.combinedDays || [],
})

export default function DaysDialog({ initialDays, initialDetails, onSave, onClose }: Props) {
  const [days, setDays] = useState<DayEntry[]>(() => initialDays.map((name, index) => makeEntry(name, index, initialDetails)))
  const [numDays, setNumDays] = useState(Math.min(7, Math.max(4, initialDays.length)))
  const [selectedId, setSelectedId] = useState(days[0]?.id || '')
  const [editForm, setEditForm] = useState({ name: '', short: '', desc: '' })
  const [showEdit, setShowEdit] = useState(false)
  const [showCombine, setShowCombine] = useState(false)
  const [combineForm, setCombineForm] = useState({ name: '', short: '', selectedDays: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const selected = days.find(day => day.id === selectedId) || days[0]

  function changeNumDays(value: string) {
    const count = Number(value)
    if (count < days.length && !window.confirm(`Reduce to ${count} days? Removed days may also remove lessons assigned to them.`)) return
    setNumDays(count)
    setDays(current => {
      if (count <= current.length) {
        const next = current.slice(0, count)
        if (!next.some(day => day.id === selectedId)) setSelectedId(next[0]?.id || '')
        return next
      }
      return [...current, ...Array.from({ length: count - current.length }, (_, offset) => {
        const index = current.length + offset
        const name = NAMES[index] || `Day ${index + 1}`
        return makeEntry(name, index)
      })]
    })
  }

  function openEdit() {
    if (!selected) return
    setEditForm({ name: selected.name, short: selected.short, desc: selected.desc })
    setShowEdit(true)
  }
  function saveEdit() {
    const name = editForm.name.trim()
    if (!name) { setMessage('Name required.'); return }
    if (days.some(day => day.id !== selected?.id && day.name.toLowerCase() === name.toLowerCase())) { setMessage('Day names must be unique.'); return }
    setDays(current => current.map(day => day.id === selected?.id ? { ...day, name, short: editForm.short.trim().toUpperCase(), desc: editForm.desc.trim() } : day))
    setShowEdit(false); setMessage('')
  }
  function combineDays() {
    const name = combineForm.name.trim()
    if (!name) { setMessage('Enter a name for the combined day.'); return }
    if (combineForm.selectedDays.length < 2) { setMessage('Select at least two days.'); return }
    if (days.some(day => day.name.toLowerCase() === name.toLowerCase())) { setMessage('Day names must be unique.'); return }
    const entry: DayEntry = { id: `combined-${Date.now()}`, name, short: combineForm.short.trim().toUpperCase() || name.slice(0, 2).toUpperCase(), desc: 'Combined: ' + combineForm.selectedDays.join(', '), combinedDays: combineForm.selectedDays }
    setDays(current => [...current, entry]); setSelectedId(entry.id); setShowCombine(false)
    setCombineForm({ name: '', short: '', selectedDays: [] }); setMessage('')
  }
  async function save() {
    const names = days.map(day => day.name.trim())
    if (names.some(name => !name)) { setMessage('Every day must have a name.'); return }
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) { setMessage('Day names must be unique.'); return }
    setSaving(true)
    try { await onSave(days) } finally { setSaving(false) }
  }

  const buttonStyle = { border: '1px solid #999', background: '#f5f5f5', borderRadius: 4, padding: '7px 12px', cursor: 'pointer', color: '#202938' }
  const inputStyle = { width: '100%', minWidth: 0, padding: '7px 9px', border: '1px solid #aab2bf', borderRadius: 4, background: '#fff', color: '#172033', boxSizing: 'border-box' as const }
  const subOverlay = { position: 'fixed' as const, inset: 0, background: 'rgba(10,18,32,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10022, padding: 12 }
  return <div className="phikila-tt-modal-backdrop" style={{ zIndex: 10010 }} role="dialog" aria-modal="true" aria-label="Rename school days" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="phikila-tt-modal" style={{ width: 'min(820px, calc(100vw - 24px))', maxHeight: '88vh', overflowY: 'auto', color: '#202938' }}>
      <header className="phikila-tt-school-titlebar"><strong>Days — Rename days</strong><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
      <div style={{ padding: 16 }}>
        <p className="phikila-tt-help">Select the number of regular school days. Rename individual days, or create a combined day for lessons that share the same period across multiple days.</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 18px' }}>Days:
          <select value={numDays} onChange={event => changeNumDays(event.target.value)} style={{ ...inputStyle, width: 220 }}>
            {[4, 5, 6, 7].map(count => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <p className="phikila-tt-help">Select a day, then choose Edit. Use Combine to add a custom day such as MWF.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 112px', gap: 12, minHeight: 260 }}>
          <div style={{ border: '1px solid #aab2bf', borderRadius: 4, background: '#fff', overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) 70px minmax(100px, 1.2fr)', gap: 8, padding: 10, background: '#edf1f6', fontWeight: 650, fontSize: 12, position: 'sticky', top: 0 }}> <span>Name</span><span>Short</span><span>Description</span></div>
            {days.map(day => <button key={day.id} type="button" onClick={() => setSelectedId(day.id)} onDoubleClick={openEdit} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) 70px minmax(100px, 1.2fr)', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left', padding: 10, border: 0, borderBottom: '1px solid #e5e7eb', cursor: 'pointer', background: day.id === selected?.id ? '#d9f0d6' : '#fff', color: '#202938', fontSize: 13 }}>
              <span>{day.name}</span><span>{day.short}</span><span>{day.desc || '—'}</span>
            </button>)}
            {!days.length && <p style={{ padding: 12 }}>No days configured.</p>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" style={buttonStyle} onClick={openEdit} disabled={!selected}>Edit</button>
            <div style={{ height: 44 }} />
            <button type="button" style={buttonStyle} onClick={() => { setMessage(''); setShowCombine(true) }}>Combine</button>
            <div style={{ flex: 1 }} />
            <button type="button" style={buttonStyle} disabled={!selected || days.length <= 1} onClick={() => { if (selected && window.confirm(`Delete ${selected.name}?`)) { setDays(current => current.filter(day => day.id !== selected.id)); setSelectedId(days.find(day => day.id !== selected.id)?.id || '') } }}>Delete</button>
          </div>
        </div>
        {message && <p role="alert" style={{ color: '#b42318', fontSize: 13, marginTop: 12 }}>{message}</p>}
        <footer className="phikila-tt-teacher-form-actions" style={{ marginTop: 18 }}><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="is-primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'OK'}</button></footer>
      </div>
    </section>
    {showEdit && <div style={subOverlay} role="dialog" aria-modal="true" aria-label="Edit day"><section style={{ width: 'min(440px, 100%)', padding: 18, background: '#f8fafc', border: '1px solid #aab2bf', borderRadius: 8, boxShadow: '0 18px 60px #0003' }}>
      <h3 style={{ margin: '0 0 14px' }}>Edit day</h3>
      <label style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', gap: 8, marginBottom: 10 }}>Name<input style={inputStyle} value={editForm.name} onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))} autoFocus /></label>
      <label style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', gap: 8, marginBottom: 10 }}>Short<input style={inputStyle} value={editForm.short} onChange={event => setEditForm(current => ({ ...current, short: event.target.value }))} maxLength={8} /></label>
      <label style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', gap: 8 }}>Description<input style={inputStyle} value={editForm.desc} onChange={event => setEditForm(current => ({ ...current, desc: event.target.value }))} /></label>
      <footer style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}><button type="button" style={buttonStyle} onClick={saveEdit}>OK</button><button type="button" style={buttonStyle} onClick={() => setShowEdit(false)}>Cancel</button></footer>
    </section></div>}
    {showCombine && <div style={subOverlay} role="dialog" aria-modal="true" aria-label="Combine days"><section style={{ width: 'min(440px, 100%)', padding: 18, background: '#f8fafc', border: '1px solid #aab2bf', borderRadius: 8, boxShadow: '0 18px 60px #0003' }}>
      <h3 style={{ margin: '0 0 14px' }}>Combine days</h3><p style={{ fontSize: 13 }}>Create a custom day for lessons shared across selected days.</p>
      <label style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', gap: 8, marginBottom: 10 }}>Name<input style={inputStyle} placeholder="MWF" value={combineForm.name} onChange={event => setCombineForm(current => ({ ...current, name: event.target.value }))} /></label>
      <label style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', gap: 8, marginBottom: 10 }}>Short<input style={inputStyle} value={combineForm.short} onChange={event => setCombineForm(current => ({ ...current, short: event.target.value }))} maxLength={8} /></label>
      <div style={{ fontSize: 13, marginTop: 8 }}>Select at least two days:</div>
      <div style={{ display: 'grid', gap: 6, marginTop: 8, padding: 10, background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, maxHeight: 150, overflowY: 'auto' }}>
        {days.map(day => <label key={day.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={combineForm.selectedDays.includes(day.name)} onChange={event => setCombineForm(current => ({ ...current, selectedDays: event.target.checked ? [...current.selectedDays, day.name] : current.selectedDays.filter(name => name !== day.name) }))} />{day.name}</label>)}
      </div>
      <footer style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}><button type="button" style={buttonStyle} onClick={combineDays}>Create</button><button type="button" style={buttonStyle} onClick={() => setShowCombine(false)}>Cancel</button></footer>
    </section></div>}
  </div>
}
