import { useEffect, useMemo, useState } from 'react'
import './timetable-appearance.css'

type CellType = 'lesson' | 'period' | 'day'
type Align = 'left' | 'center' | 'right'
type Vertical = 'top' | 'middle' | 'bottom'
type CellStyle = { font: string; size: number; bold: boolean; italic: boolean; color: string; background: string; horizontal: Align; vertical: Vertical; wrap: boolean }
type Appearance = Record<CellType, CellStyle>
export type SelectedCell = { type: CellType; label: string; day?: number; period?: number; lessonId?: number }

const KEY = 'phikila:timetable-appearance:v2'
export const BEST_DEFAULT: Appearance = {
  lesson: { font: 'Arial', size: 12, bold: true, italic: false, color: '#ffffff', background: '#2563eb', horizontal: 'center', vertical: 'middle', wrap: true },
  period: { font: 'Arial', size: 10, bold: true, italic: false, color: '#334155', background: '#f8fafc', horizontal: 'center', vertical: 'middle', wrap: false },
  day: { font: 'Arial', size: 10, bold: true, italic: false, color: '#334155', background: '#f1f5f9', horizontal: 'center', vertical: 'middle', wrap: true },
}

const PRESETS: Record<string, Partial<Appearance>> = {
  'Clean school': { lesson: { ...BEST_DEFAULT.lesson }, period: { ...BEST_DEFAULT.period }, day: { ...BEST_DEFAULT.day } },
  'High contrast': { lesson: { ...BEST_DEFAULT.lesson, background: '#0f172a', color: '#ffffff', size: 13 }, period: { ...BEST_DEFAULT.period, background: '#e2e8f0', color: '#0f172a', size: 11 }, day: { ...BEST_DEFAULT.day, background: '#cbd5e1', color: '#0f172a', size: 11 } },
  'Soft print': { lesson: { ...BEST_DEFAULT.lesson, background: '#ffffff', color: '#0f172a', size: 11 }, period: { ...BEST_DEFAULT.period, background: '#ffffff', color: '#475569', size: 9 }, day: { ...BEST_DEFAULT.day, background: '#f8fafc', color: '#475569', size: 9 } },
}

function load(): Appearance {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { ...BEST_DEFAULT, ...parsed, lesson: { ...BEST_DEFAULT.lesson, ...(parsed.lesson || {}) }, period: { ...BEST_DEFAULT.period, ...(parsed.period || {}) }, day: { ...BEST_DEFAULT.day, ...(parsed.day || {}) } }
  } catch { return BEST_DEFAULT }
}

function applyCss(appearance: Appearance) {
  const root = document.documentElement
  for (const type of Object.keys(BEST_DEFAULT) as CellType[]) {
    const s = appearance[type]
    root.style.setProperty(`--tt-${type}-font`, s.font)
    root.style.setProperty(`--tt-${type}-size`, `${s.size}px`)
    root.style.setProperty(`--tt-${type}-color`, s.color)
    root.style.setProperty(`--tt-${type}-background`, s.background)
    root.style.setProperty(`--tt-${type}-align`, s.horizontal)
    root.style.setProperty(`--tt-${type}-vertical`, s.vertical === 'middle' ? 'center' : s.vertical)
    root.style.setProperty(`--tt-${type}-weight`, s.bold ? '700' : '400')
    root.style.setProperty(`--tt-${type}-style`, s.italic ? 'italic' : 'normal')
    root.style.setProperty(`--tt-${type}-wrap`, s.wrap ? 'normal' : 'nowrap')
  }
}

export function TimetableAppearanceEditor({ open, onClose, selectedCell }: { open: boolean; onClose: () => void; selectedCell?: SelectedCell | null }) {
  const [appearance, setAppearance] = useState<Appearance>(() => load())
  const [cellType, setCellType] = useState<CellType>('lesson')
  const [selected, setSelected] = useState<SelectedCell | null>(selectedCell ?? null)
  const [advanced, setAdvanced] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { applyCss(appearance) }, [appearance])
  useEffect(() => { if (selectedCell) { setSelected(selectedCell); setCellType(selectedCell.type); setSaved(false) } }, [selectedCell])
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<SelectedCell>).detail
      if (!detail) return
      setSelected(detail)
      setCellType(detail.type)
      setSaved(false)
    }
    window.addEventListener('phikila:timetable-cell-selected', handle)
    return () => window.removeEventListener('phikila:timetable-cell-selected', handle)
  }, [])

  const current = appearance[cellType]
  const update = (patch: Partial<CellStyle>) => { setSaved(false); setAppearance(value => ({ ...value, [cellType]: { ...value[cellType], ...patch } })) }
  const previewStyle = (type: CellType) => { const s = appearance[type]; return { fontFamily: s.font, fontSize: `${s.size}px`, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', color: s.color, background: s.background, textAlign: s.horizontal, justifyContent: s.vertical === 'top' ? 'flex-start' : s.vertical === 'bottom' ? 'flex-end' : 'center', whiteSpace: s.wrap ? 'normal' : 'nowrap' } as const }
  const selectionText = useMemo(() => {
    if (!selected) return 'Select a timetable cell.'
    const location = [selected.day != null ? `day ${selected.day}` : '', selected.period != null ? `period ${selected.period}` : ''].filter(Boolean).join(' · ')
    return `${selected.label}${location ? ` · ${location}` : ''}`
  }, [selected])

  if (!open) return null
  function restoreDefault() { setSaved(false); setAppearance(value => ({ ...value, [cellType]: { ...BEST_DEFAULT[cellType] } })) }
  function applyPreset(name: string) { const preset = PRESETS[name]; if (!preset) return; setSaved(false); setAppearance(value => ({ lesson: { ...value.lesson, ...(preset.lesson || {}) }, period: { ...value.period, ...(preset.period || {}) }, day: { ...value.day, ...(preset.day || {}) } })) }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(appearance))
      localStorage.setItem('phikila:timetable-appearance:saved-at', new Date().toISOString())
    } catch {}
    applyCss(appearance)
    window.dispatchEvent(new CustomEvent('phikila:timetable-appearance-changed', { detail: { appearance, selectedCell: selected } }))
    setSaved(true)
  }

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <div className="card modal timetable-appearance-modal" role="dialog" aria-modal="true" aria-labelledby="timetable-appearance-title" onClick={event => event.stopPropagation()}>
      <div className="timetable-appearance-head">
        <div><div className="timetable-appearance-eyebrow">CELL FORMAT</div><h2 id="timetable-appearance-title">{selected?.label || 'Timetable cell'}</h2><p>Edit the selected cell. Changes are saved in this browser and applied to the timetable immediately.</p></div>
        <button type="button" className="button button--ghost" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="timetable-appearance-selection"><div><span className="timetable-appearance-selection-label">Selected cell</span><strong>{selectionText}</strong></div><label><span>Format</span><select className="input" value={cellType} onChange={event => { setSaved(false); setCellType(event.target.value as CellType) }}><option value="lesson">Lesson</option><option value="period">Period</option><option value="day">Day</option></select></label></div>
      <div className="timetable-appearance-presets" aria-label="Design presets"><span>Quick design</span>{Object.keys(PRESETS).map(name => <button key={name} type="button" className="button button--ghost" onClick={() => applyPreset(name)}>{name}</button>)}</div>
      <div className="timetable-appearance-layout">
        <div className="timetable-appearance-controls">
          <div className="timetable-appearance-panel-title">Cell properties</div>
          <div className="timetable-appearance-row"><label>Font</label><select className="input" value={current.font} onChange={event => update({ font: event.target.value })}><option>Arial</option><option>Calibri</option><option>Verdana</option><option>Georgia</option><option>Times New Roman</option></select><input className="input timetable-appearance-size" type="number" min="8" max="28" value={current.size} onChange={event => update({ size: Math.max(8, Math.min(28, Number(event.target.value) || 12)) })} aria-label="Font size" /></div>
          <div className="timetable-appearance-row"><label>Style</label><button type="button" className={`button ${current.bold ? 'button--primary' : 'button--ghost'}`} onClick={() => update({ bold: !current.bold })}><strong>B</strong></button><button type="button" className={`button ${current.italic ? 'button--primary' : 'button--ghost'}`} onClick={() => update({ italic: !current.italic })}><em>I</em></button></div>
          <div className="timetable-appearance-row"><label>Colors</label><input type="color" value={current.color} onChange={event => update({ color: event.target.value })} aria-label="Text color" /><label className="timetable-appearance-sub-label">Fill</label><input type="color" value={current.background} onChange={event => update({ background: event.target.value })} aria-label="Background color" /></div>
          <div className="timetable-appearance-group"><span>Horizontal</span><div className="timetable-appearance-segment">{(['left', 'center', 'right'] as Align[]).map(value => <button key={value} type="button" className={current.horizontal === value ? 'active' : ''} onClick={() => update({ horizontal: value })}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>
          <div className="timetable-appearance-group"><span>Vertical</span><div className="timetable-appearance-segment">{(['top', 'middle', 'bottom'] as Vertical[]).map(value => <button key={value} type="button" className={current.vertical === value ? 'active' : ''} onClick={() => update({ vertical: value })}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>
          {cellType === 'lesson' && <label className="timetable-appearance-check"><input type="checkbox" checked={current.wrap} onChange={event => update({ wrap: event.target.checked })} /> Wrap long subject names</label>}
          <button type="button" className="button button--ghost timetable-appearance-advanced" onClick={() => setAdvanced(value => !value)}>{advanced ? 'Hide more settings' : 'More settings'} ▾</button>
          {advanced && <div className="timetable-appearance-more"><span>Selected type: <strong>{cellType}</strong></span><span>Saved settings persist after reload.</span></div>}
        </div>
        <div className="timetable-appearance-preview-wrap"><div className="timetable-appearance-preview-heading"><span>Preview</span><small>{selected?.label || 'Selected cell'}</small></div><div className="timetable-appearance-preview-grid"><button type="button" className={`timetable-appearance-preview-box ${cellType === 'day' ? 'is-selected' : ''}`} onClick={() => setCellType('day')}><span>DAY</span><div className="preview-day" style={previewStyle('day')}>Monday</div></button><button type="button" className={`timetable-appearance-preview-box ${cellType === 'period' ? 'is-selected' : ''}`} onClick={() => setCellType('period')}><span>PERIOD</span><div className="preview-period" style={previewStyle('period')}>Period 1<br /><small>08:00–09:00</small></div></button><button type="button" className={`timetable-appearance-preview-box ${cellType === 'lesson' ? 'is-selected' : ''}`} onClick={() => setCellType('lesson')}><span>LESSON</span><div className="preview-lesson" style={previewStyle('lesson')}>MATHEMATICS<br /><small>Lesson</small></div></button></div></div>
      </div>
      <div className="timetable-appearance-footer"><button type="button" className="button button--ghost" onClick={restoreDefault}>Best Default</button><span className="timetable-appearance-scope">{saved ? 'Saved and applied.' : 'Unsaved changes'}</span><div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" onClick={save}>{saved ? 'Saved' : 'Save Appearance'}</button></div></div>
    </div>
  </div>
}
