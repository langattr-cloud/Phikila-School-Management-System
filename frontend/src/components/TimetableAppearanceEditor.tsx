import { useEffect, useMemo, useState } from 'react'
import './timetable-appearance.css'

type CellType = 'subject' | 'time' | 'period'
type Align = 'left' | 'center' | 'right'
type Vertical = 'top' | 'middle' | 'bottom'

type CellStyle = {
  font: string
  size: number
  bold: boolean
  italic: boolean
  color: string
  background: string
  horizontal: Align
  vertical: Vertical
  wrap: boolean
}

type Appearance = Record<CellType, CellStyle>

const KEY = 'phikila:timetable-appearance:v1'

export const BEST_DEFAULT: Appearance = {
  subject: { font: 'Arial', size: 12, bold: true, italic: false, color: '#ffffff', background: '#2563eb', horizontal: 'center', vertical: 'middle', wrap: true },
  time: { font: 'Arial', size: 10, bold: true, italic: false, color: '#334155', background: '#f8fafc', horizontal: 'center', vertical: 'middle', wrap: false },
  period: { font: 'Arial', size: 10, bold: true, italic: false, color: '#334155', background: '#f8fafc', horizontal: 'center', vertical: 'middle', wrap: false },
}

function load(): Appearance {
  try {
    const saved = localStorage.getItem(KEY)
    return saved ? { ...BEST_DEFAULT, ...JSON.parse(saved), subject: { ...BEST_DEFAULT.subject, ...JSON.parse(saved).subject }, time: { ...BEST_DEFAULT.time, ...JSON.parse(saved).time }, period: { ...BEST_DEFAULT.period, ...JSON.parse(saved).period } } : BEST_DEFAULT
  } catch { return BEST_DEFAULT }
}

function applyCss(appearance: Appearance) {
  const root = document.documentElement
  for (const type of ['subject', 'time', 'period'] as CellType[]) {
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
  const [cellType, setCellType] = useState<CellType>('subject')
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => { applyCss(appearance) }, [appearance])

  const current = appearance[cellType]
  const update = (patch: Partial<CellStyle>) => setAppearance(value => ({ ...value, [cellType]: { ...value[cellType], ...patch } }))
  const previewSubject = useMemo(() => appearance.subject, [appearance.subject])

  if (!open) return null

  function restoreDefault() {
    setAppearance(value => ({ ...value, [cellType]: { ...BEST_DEFAULT[cellType] } }))
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(appearance)) } catch {}
    applyCss(appearance)
    window.dispatchEvent(new CustomEvent('phikila:timetable-appearance-changed'))
    onClose()
  }

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <div className="card modal timetable-appearance-modal" role="dialog" aria-modal="true" aria-labelledby="timetable-appearance-title" onClick={event => event.stopPropagation()}>
      <div className="timetable-appearance-head">
        <div><h2 id="timetable-appearance-title">Cell Appearance</h2><p>Make the timetable easier to read. Changes are saved for all timetables on this device.</p></div>
        <button type="button" className="button button--ghost" onClick={onClose} aria-label="Close">×</button>
      </div>

      <label className="form__label" htmlFor="appearance-cell-type">Format</label>
      <select id="appearance-cell-type" className="input" value={cellType} onChange={event => setCellType(event.target.value as CellType)}>
        <option value="subject">Subject Cell</option><option value="time">Time Cell</option><option value="period">Period Cell</option>
      </select>

      <div className="timetable-appearance-layout">
        <div className="timetable-appearance-controls">
          <div className="timetable-appearance-row"><label>Font</label><select className="input" value={current.font} onChange={event => update({ font: event.target.value })}><option>Arial</option><option>Calibri</option><option>Verdana</option><option>Georgia</option><option>Times New Roman</option></select><input className="input timetable-appearance-size" type="number" min="8" max="28" value={current.size} onChange={event => update({ size: Number(event.target.value) || 12 })} aria-label="Font size" /></div>
          <div className="timetable-appearance-row"><label>Style</label><button type="button" className={`button ${current.bold ? 'button--primary' : 'button--ghost'}`} onClick={() => update({ bold: !current.bold })}><strong>B</strong></button><button type="button" className={`button ${current.italic ? 'button--primary' : 'button--ghost'}`} onClick={() => update({ italic: !current.italic })}><em>I</em></button></div>
          <div className="timetable-appearance-row"><label>Text</label><input type="color" value={current.color} onChange={event => update({ color: event.target.value })} /><label className="timetable-appearance-sub-label">Background</label><input type="color" value={current.background} onChange={event => update({ background: event.target.value })} /></div>
          <div className="timetable-appearance-group"><span>Horizontal</span><div className="timetable-appearance-segment">{(['left', 'center', 'right'] as Align[]).map(value => <button key={value} type="button" className={current.horizontal === value ? 'active' : ''} onClick={() => update({ horizontal: value })}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>
          <div className="timetable-appearance-group"><span>Vertical</span><div className="timetable-appearance-segment">{(['top', 'middle', 'bottom'] as Vertical[]).map(value => <button key={value} type="button" className={current.vertical === value ? 'active' : ''} onClick={() => update({ vertical: value })}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>
          {cellType === 'subject' && <label className="timetable-appearance-check"><input type="checkbox" checked={current.wrap} onChange={event => update({ wrap: event.target.checked })} /> Wrap long subject names</label>}
          <button type="button" className="button button--ghost timetable-appearance-advanced" onClick={() => setAdvanced(value => !value)}>{advanced ? 'Hide more settings' : 'More settings'} ▾</button>
          {advanced && <div className="timetable-appearance-more"><span>Current cell type: <strong>{cellType}</strong></span><span>Use the preview to check spacing and readability before saving.</span></div>}
        </div>

        <div className="timetable-appearance-preview-wrap"><span className="timetable-appearance-preview-label">Preview</span><div className="timetable-appearance-preview"><div className="preview-time">08:00<br /><small>Period 1</small></div><div className="preview-subject" style={{ fontFamily: previewSubject.font, fontSize: `${previewSubject.size}px`, fontWeight: previewSubject.bold ? 700 : 400, fontStyle: previewSubject.italic ? 'italic' : 'normal', color: previewSubject.color, background: previewSubject.background, textAlign: previewSubject.horizontal, justifyContent: previewSubject.vertical === 'top' ? 'flex-start' : previewSubject.vertical === 'bottom' ? 'flex-end' : 'center', whiteSpace: previewSubject.wrap ? 'normal' : 'nowrap' }}>MATHEMATICS<br /><small>Mr. Smith</small></div></div></div>
      </div>

      <div className="timetable-appearance-footer"><button type="button" className="button button--ghost" onClick={restoreDefault}>Best Default</button><span className="timetable-appearance-scope">Save for all timetables</span><div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" onClick={save}>Save Appearance</button></div></div>
    </div>
  </div>
}
