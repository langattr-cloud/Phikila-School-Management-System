import { useMemo, useState } from 'react'

export type TimetableViewMode = 'grade' | 'teacher'

type Props = {
  mode: TimetableViewMode
  onModeChange: (mode: TimetableViewMode) => void
  grades: string[]
  teachers: string[]
  selected: string
  onSelectedChange: (value: string) => void
  timetableName?: string
  onPrintCurrent: () => void
  onPrintSelected: (values: string[]) => void
}

export function TimetableViewControls({ mode, onModeChange, grades, teachers, selected, onSelectedChange, timetableName, onPrintCurrent, onPrintSelected }: Props) {
  const options = mode === 'grade' ? grades : teachers
  const [printOpen, setPrintOpen] = useState(false)
  const [printAll, setPrintAll] = useState(false)
  const [checked, setChecked] = useState<string[]>([])
  const index = Math.max(0, options.indexOf(selected))
  const previous = () => options.length && onSelectedChange(options[(index - 1 + options.length) % options.length])
  const next = () => options.length && onSelectedChange(options[(index + 1) % options.length])
  const title = useMemo(() => timetableName ? `${timetableName} — ${selected || (mode === 'grade' ? 'Grade' : 'Teacher')}` : selected, [timetableName, selected, mode])

  function openPrint() {
    setChecked(options)
    setPrintAll(true)
    setPrintOpen(true)
  }

  function submitPrint() {
    if (printAll) onPrintSelected(options)
    else if (checked.length) onPrintSelected(checked)
    setPrintOpen(false)
  }

  return <section className="card section" aria-label="Timetable view controls">
    <div className="panel__head">
      <div>
        <h2 className="section__title">{title || 'Timetable'}</h2>
        <div className="form__row" style={{ alignItems: 'center', gap: '.75rem', marginTop: '.5rem' }}>
          <label className="form__label" htmlFor="timetable-view-filter">Filter by</label>
          <select id="timetable-view-filter" className="input" value={mode} onChange={e => onModeChange(e.target.value as TimetableViewMode)}>
            <option value="grade">Grade</option><option value="teacher">Teacher</option>
          </select>
        </div>
      </div>
      <button type="button" className="button button--secondary" onClick={openPrint}>Print</button>
    </div>
    <div className="timetable-view-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.75rem', marginTop: '1rem' }}>
      <button type="button" className="button button--ghost" onClick={previous} disabled={!options.length} aria-label="Previous">←</button>
      <select className="input" value={selected} onChange={e => onSelectedChange(e.target.value)} aria-label={mode === 'grade' ? 'Grade' : 'Teacher'}>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      <button type="button" className="button button--ghost" onClick={next} disabled={!options.length} aria-label="Next">→</button>
    </div>
    {printOpen && <div className="modal-backdrop" role="presentation" onClick={() => setPrintOpen(false)}><div className="card modal" role="dialog" aria-modal="true" aria-labelledby="print-timetables-title" onClick={e => e.stopPropagation()}>
      <h2 id="print-timetables-title">Print timetables</h2>
      <label><input type="radio" checked={!printAll} onChange={() => setPrintAll(false)} /> Select {mode === 'grade' ? 'grades' : 'teachers'}</label>
      <label style={{ display: 'block', marginTop: '.5rem' }}><input type="radio" checked={printAll} onChange={() => setPrintAll(true)} /> All {mode === 'grade' ? 'grades' : 'teachers'}</label>
      {!printAll && <div style={{ marginTop: '1rem' }}>{options.map(option => <label key={option} style={{ display: 'block', margin: '.35rem 0' }}><input type="checkbox" checked={checked.includes(option)} onChange={e => setChecked(v => e.target.checked ? [...v, option] : v.filter(x => x !== option))} /> {option}</label>)}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', marginTop: '1rem' }}><button type="button" className="button button--ghost" onClick={() => setPrintOpen(false)}>Cancel</button><button type="button" className="button button--primary" onClick={submitPrint}>Print</button></div>
    </div></div>}
  </section>
}
