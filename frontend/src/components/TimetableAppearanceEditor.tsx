import { useEffect, useState } from 'react'
import './timetable-appearance.css'

type CellType = 'lesson' | 'period' | 'day'
type Align = 'left' | 'center' | 'right'
type Vertical = 'top' | 'middle' | 'bottom'
type CellStyle = { font: string; size: number; bold: boolean; italic: boolean; color: string; background: string; horizontal: Align; vertical: Vertical; wrap: boolean }
type Appearance = Record<CellType, CellStyle>
type SelectedCell = { type: CellType; label: string; day?: number; period?: number; lessonId?: number }

const KEY = 'phikila:timetable-appearance:v2'
export const BEST_DEFAULT: Appearance = {
  lesson: { font: 'Arial', size: 12, bold: true, italic: false, color: '#ffffff', background: '#2563eb', horizontal: 'center', vertical: 'middle', wrap: true },
  period: { font: 'Arial', size: 10, bold: true, italic: false, color: '#334155', background: '#f8fafc', horizontal: 'center', vertical: 'middle', wrap: false },
  day: { font: 'Arial', size: 10, bold: true, italic: false, color: '#334155', background: '#f1f5f9', horizontal: 'center', vertical: 'middle', wrap: true },
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

export function TimetableAppearanceEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [appearance, setAppearance] = useState<Appearance>(() => load())
  const [cellType, setCellType] = useState<CellType>('lesson')
  const [selected, setSelected] = useState<SelectedCell | null>(null)
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => { applyCss(appearance) }, [appearance])
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<SelectedCell>).detail
      if (!detail) return
      setSelected(detail)
      setCellType(detail.type)
    }
    window.addEventListener('phikila:timetable-cell-selected', handle)
    return () => window.removeEventListener('phikila:timetable-cell-selected', handle)
  }, [])

  const current = appearance[cellType]
  const update = (patch: Partial<CellStyle>) => setAppearance(value => ({ ...value, [cellType]: { ...value[cellType], ...patch } }))
  const previewStyle = (type: CellType) => { const s = appearance[type]; return { fontFamily: s.font, fontSize: `${s.size}px`, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', color: s.color, background: s.background, textAlign: s.horizontal, justifyContent: s.vertical === 'top' ? 'flex-start' : s.vertical === 'bottom' ? 'flex-end' : 'center', whiteSpace: s.wrap ? 'normal' : 'nowrap' } as const }

  if (!open) return null
  function restoreDefault() { setAppearance(value => ({ ...value, [cellType]: { ...BEST_DEFAULT[cellType] } })) }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(appearance)) } catch {}; applyCss(appearance); window.dispatchEvent(new CustomEvent('phikila:timetable-appearance-changed')); onClose() }

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <div className="card modal timetable-appearance-modal" role="dialog" aria-modal="true" aria-labelledby="timetable-appearance-title" onClick={event => event.stopPropagation()}>
      <div className="timetable-appearance-head"><div><h2 id="timetable-appearance-title">Timetable Appearance</h2><p>Choose a cell, fine-tune its appearance, preview all three cell types, then save.</p></div><button type="button" className="button button--ghost" onClick={onClose} aria-label="Close">×</button></div>
      <label className="form__label" htmlFor="appearance-cell-type">Cell to format</label>
      <select id="appearance-cell-type" className="input" value={cellType} onChange={event => setCellType(event.target.value as CellType)}><option value="lesson">Lesson / Subject</option><option value="period">Period / Time</option><option value="day">Day / Date</option></select>
      {selected && <div className="timetable-appearance-selected">Selected cell: <strong>{selected.label}</strong>. Your changes apply to this cell type everywhere.</div>}
      <div className="timetable-appearance-layout">
        <div className="timetable-appearance-controls">
          <div className="timetable-appearance-row"><label>Font</label><select className="input" value={current.font} onChange={event => update({ font: event.target.value })}><option>Arial</option><option>Calibri</option><option>Verdana</option><option>Georgia</option><option>Times New Roman</option></select><input className="input timetable-appearance-size" type="number" min="8" max="28" value={current.size} onChange={event => update({ size: Math.max(8, Math.min(28, Number(event.target.value) || 12)) })} aria-label="Font size" /></div>
          <div className="timetable-appearance-row"><label>Style</label><button type="button" className={`button ${current.bold ? 'button--primary' : 'button--ghost'}`} onClick={() => update({ bold: !current.bold })}><strong>B</strong></button><button type="button" className={`button ${current.italic ? 'button--primary' : 'button--ghost'}`} onClick={() => update({ italic: !current.italic })}><em>I</em></button></div>
          <div className="timetable-appearance-row"><label>Text</label><input type="color" value={current.color} onChange={event => update({ color: event.target.value })} /><label className="timetable-appearance-sub-label">Background</label><input type="color" value={current.background} onChange={event => update({ background: event.target.value })} /></div>
          <div className="timetable-appearance-group"><span>Horizontal</span><div className="timetable-appearance-segment">{(['left', 'center', 'right'] as Align[]).map(value => <button key={value} type="button" className={current.horizontal === value ? 'active' : ''} onClick={() => update({ horizontal: value })}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>
          <div className="timetable-appearance-group"><span>Vertical</span><div className="timetable-appearance-segment">{(['top', 'middle', 'bottom'] as Vertical[]).map(value => <button key={value} type="button" className={current.vertical === value ? 'active' : ''} onClick={() => update({ vertical: value })}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>
          {cellType === 'lesson' && <label className="timetable-appearance-check"><input type="checkbox" checked={current.wrap} onChange={event => update({ wrap: event.target.checked })} /> Wrap long subject names</label>}
          <button type="button" className="button button--ghost timetable-appearance-advanced" onClick={() => setAdvanced(value => !value)}>{advanced ? 'Hide more settings' : 'More settings'} ▾</button>
          {advanced && <div className="timetable-appearance-more"><span>Selected type: <strong>{cellType}</strong></span><span>Use Best Default any time to restore the recommended design.</span></div>}
        </div>
        <div className="timetable-appearance-preview-wrap"><span className="timetable-appearance-preview-label">Preview — separate cells</span><div className="timetable-appearance-preview-grid"><div className="timetable-appearance-preview-box"><span>DAY / DATE</span><div className="preview-day" style={previewStyle('day')}>Monday<br /><small>31 Aug</small></div></div><div className="timetable-appearance-preview-box"><span>PERIOD / TIME</span><div className="preview-period" style={previewStyle('period')}>Period 1<br /><small>08:00–09:00</small></div></div><div className="timetable-appearance-preview-box"><span>LESSON / SUBJECT</span><div className="preview-lesson" style={previewStyle('lesson')}>MATHEMATICS<br /><small>Mr. Smith</small></div></div></div></div>
      </div>
      <div className="timetable-appearance-footer"><button type="button" className="button button--ghost" onClick={restoreDefault}>Best Default</button><span className="timetable-appearance-scope">Applies to all teachers, views and printouts</span><div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" onClick={save}>Save Appearance</button></div></div>
    </div>
  </div>
}
