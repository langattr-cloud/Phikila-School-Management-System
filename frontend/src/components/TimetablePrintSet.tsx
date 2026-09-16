import { useMemo, useState } from 'react'

type PrintEntity = { id: number; name: string }
type PrintLesson = { day_index: number; period_index: number; subject_id: number; class_id: number; teacher_id?: number | null; room_id?: string | number | null; duration: number }
type PrintPeriod = { index: number; name: string; start_time: string; end_time: string; is_teaching?: boolean }
type PrintDay = { index: number; name: string; is_active: boolean }

type Props = {
  open: boolean
  onClose: () => void
  lessons: PrintLesson[]
  periods: PrintPeriod[]
  days: PrintDay[]
  classes: PrintEntity[]
  teachers: PrintEntity[]
  rooms: PrintEntity[]
  subjects: PrintEntity[]
  schoolName?: string
  defaultScope?: 'class' | 'teacher' | 'room' | 'subject' | 'all'
}

type Report = 'class' | 'teacher' | 'room' | 'subject'
type Layout = 'portrait' | 'landscape'

export function TimetablePrintSet({ open, onClose, lessons, periods, days, classes, teachers, rooms, subjects, schoolName = 'School', defaultScope = 'class' }: Props) {
  const [report, setReport] = useState<Report>(defaultScope === 'all' ? 'class' : defaultScope)
  const [selection, setSelection] = useState<'all' | 'selected'>('all')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [perPage, setPerPage] = useState<1 | 2 | 4>(1)
  const [layout, setLayout] = useState<Layout>('landscape')
  const [colour, setColour] = useState(true)
  const [showTeacher, setShowTeacher] = useState(true)
  const [showClass, setShowClass] = useState(true)
  const [showRoom, setShowRoom] = useState(true)
  const [showTimes, setShowTimes] = useState(true)
  const [includeBreaks, setIncludeBreaks] = useState(true)

  const entities = useMemo(() => ({ class: classes, teacher: teachers, room: rooms, subject: subjects }[report]), [classes, teachers, rooms, subjects, report])
  const entityIds = useMemo(() => selection === 'all' ? entities.map((item) => item.id) : selectedIds, [entities, selection, selectedIds])

  if (!open) return null

  function entityForLesson(lesson: PrintLesson): number {
    if (report === 'class') return lesson.class_id
    if (report === 'teacher') return lesson.teacher_id ?? -1
    if (report === 'room') return Number(lesson.room_id ?? -1)
    return lesson.subject_id
  }

  function escapeHtml(value: unknown) {
    return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char] ?? char))
  }

  function buildPrintHtml() {
    const activeDays = days.filter((day) => day.is_active)
    const teachingPeriods = periods.filter((period) => period.is_teaching !== false)
    const selectedEntities = entities.filter((entity) => entityIds.includes(entity.id))
    const pageClass = perPage === 1 ? 'sheet-single' : perPage === 2 ? 'sheet-double' : 'sheet-quad'
    const pages: string[] = []

    for (let start = 0; start < selectedEntities.length; start += perPage) {
      const chunk = selectedEntities.slice(start, start + perPage)
      const sheets = chunk.map((entity) => {
        const relevant = lessons.filter((lesson) => entityForLesson(lesson) === entity.id)
        const cell = (dayIndex: number, periodIndex: number) => {
          const matching = relevant.filter((lesson) => lesson.day_index === dayIndex && lesson.period_index === periodIndex)
          if (!matching.length) return '<div class="empty">&nbsp;</div>'
          return matching.map((lesson) => {
            const subject = subjects.find((item) => item.id === lesson.subject_id)?.name ?? 'Lesson'
            const klass = classes.find((item) => item.id === lesson.class_id)?.name ?? ''
            const teacher = teachers.find((item) => item.id === lesson.teacher_id)?.name ?? ''
            const room = rooms.find((item) => item.id === Number(lesson.room_id))?.name ?? String(lesson.room_id ?? '')
            const colourValue = subjects.find((item) => item.id === lesson.subject_id) as PrintEntity & { colour?: string } | undefined
            const background = colour && colourValue?.colour ? ` style="--lesson-colour:${escapeHtml(colourValue.colour)}"` : ''
            const details = [showClass ? klass : '', showTeacher ? teacher : '', showRoom ? room : ''].filter(Boolean).join(' · ')
            return `<div class="lesson"${background}><strong>${escapeHtml(subject)}</strong>${details ? `<span>${escapeHtml(details)}</span>` : ''}${lesson.duration > 1 ? `<small>${lesson.duration} periods</small>` : ''}</div>`
          }).join('')
        }
        const rows = teachingPeriods.map((period) => `<tr><th class="period">${escapeHtml(period.name)}${showTimes ? `<small>${escapeHtml(period.start_time)}–${escapeHtml(period.end_time)}</small>` : ''}</th>${activeDays.map((day) => `<td>${cell(day.index, period.index)}</td>`).join('')}</tr>`).join('')
        return `<section class="sheet"><header><div><div class="school">${escapeHtml(schoolName)}</div><h1>${escapeHtml(entity.name)}</h1><p>${report === 'class' ? 'Class timetable' : report === 'teacher' ? 'Teacher timetable' : report === 'room' ? 'Room timetable' : 'Subject timetable'}</p></div><div class="meta">${selection === 'all' ? 'Print set' : 'Selected'} · ${start + 1} of ${selectedEntities.length}</div></header><table><thead><tr><th class="period">Period</th>${activeDays.map((day) => `<th>${escapeHtml(day.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></section>`
      }).join('')
      pages.push(`<div class="page ${pageClass}">${sheets}</div>`)
    }

    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(schoolName)} – Timetable print set</title><style>
      @page{size:${layout};margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}.page{display:grid;gap:8mm;break-after:page}.sheet{break-inside:avoid;border:1px solid #bbb;padding:5mm;background:#fff}.sheet-single{grid-template-columns:1fr}.sheet-double{grid-template-columns:1fr}.sheet-quad{grid-template-columns:1fr 1fr}.sheet-quad .sheet{font-size:8px;padding:3mm}.sheet header{display:flex;justify-content:space-between;gap:8mm;align-items:flex-end;margin-bottom:4mm}.school{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#555}.sheet h1{margin:1mm 0 0;font-size:20px}.sheet p{margin:1mm 0 0;color:#555;font-size:11px}.meta{font-size:9px;color:#666;white-space:nowrap}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #999;padding:2.5mm;vertical-align:top;height:16mm}thead th{background:#eee;text-align:center;font-size:10px}.period{width:18mm;text-align:center;background:#f5f5f5}.period small{display:block;margin-top:1mm;font-weight:400;color:#666}.lesson{min-height:11mm;margin:-1mm;padding:1.5mm;border-left:3px solid var(--lesson-colour,#315a86);background:${colour ? 'color-mix(in srgb,var(--lesson-colour,#315a86) 12%,white)' : '#fff'};display:flex;flex-direction:column;gap:1px}.lesson strong{font-size:10px}.lesson span{font-size:8px;color:#444}.lesson small{font-size:7px;color:#666}.empty{min-height:11mm}.sheet-quad th,.sheet-quad td{padding:1.5mm;height:12mm}.sheet-quad .lesson strong{font-size:8px}.sheet-quad .lesson span{font-size:6.5px}@media screen{body{background:#f3f4f6;padding:16px}.page{max-width:1100px;margin:auto}.sheet{box-shadow:0 2px 12px #0001}.page+.page{margin-top:16px}}
    </style></head><body>${pages.join('')}</body></html>`
  }

  function printSet() {
    if (!entityIds.length) return
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900')
    if (!printWindow) return
    printWindow.document.open()
    printWindow.document.write(buildPrintHtml())
    printWindow.document.close()
    printWindow.focus()
    window.setTimeout(() => printWindow.print(), 300)
  }

  const toggleId = (id: number) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="print-set-title" style={{ maxWidth: 760 }}>
      <div className="modal__head"><div><h2 id="print-set-title">Print set</h2><p className="form__note">Batch-print timetables like aSc: choose a report, select the entities, then print the set.</p></div><button type="button" className="icon-button icon-button--subtle" onClick={onClose} aria-label="Close">×</button></div>
      <div className="modal__body" style={{ display: 'grid', gap: 18 }}>
        <div className="timetable-printset-tabs" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {(['class', 'teacher', 'room', 'subject'] as Report[]).map((item) => <button key={item} type="button" className={`button button--${report === item ? 'primary' : 'secondary'} button--sm`} onClick={() => { setReport(item); setSelectedIds([]) }}>{item === 'class' ? 'Classes' : item === 'teacher' ? 'Teachers' : item === 'room' ? 'Rooms' : 'Subjects'}</button>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><label className="field__label">Print area</label><div style={{ display: 'grid', gap: 8, marginTop: 6 }}><label><input type="radio" checked={selection === 'all'} onChange={() => setSelection('all')} /> All {report}s ({entities.length})</label><label><input type="radio" checked={selection === 'selected'} onChange={() => setSelection('selected')} /> Selected only ({selectedIds.length})</label></div></div>
          <div><label className="field__label">Timetables per page</label><select className="input input--select" value={perPage} onChange={(event) => setPerPage(Number(event.target.value) as 1 | 2 | 4)}><option value={1}>1 per page</option><option value={2}>2 per page</option><option value={4}>4 per page</option></select></div>
        </div>
        {selection === 'selected' && <div style={{ border: '1px solid var(--color-line,#ddd)', borderRadius: 8, padding: 10, maxHeight: 180, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>{entities.map((entity) => <label key={entity.id}><input type="checkbox" checked={selectedIds.includes(entity.id)} onChange={() => toggleId(entity.id)} /> {entity.name}</label>)}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><label className="field__label">Page</label><select className="input input--select" value={layout} onChange={(event) => setLayout(event.target.value as Layout)}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></div>
          <div><label className="field__label">Colour</label><label style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={colour} onChange={(event) => setColour(event.target.checked)} /> Print lesson colours</label></div>
        </div>
        <fieldset style={{ border: '1px solid var(--color-line,#ddd)', borderRadius: 8, padding: 12 }}><legend>Lesson details</legend><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><label><input type="checkbox" checked={showTeacher} onChange={(event) => setShowTeacher(event.target.checked)} /> Teacher</label><label><input type="checkbox" checked={showClass} onChange={(event) => setShowClass(event.target.checked)} /> Class</label><label><input type="checkbox" checked={showRoom} onChange={(event) => setShowRoom(event.target.checked)} /> Room</label><label><input type="checkbox" checked={showTimes} onChange={(event) => setShowTimes(event.target.checked)} /> Bell times</label><label><input type="checkbox" checked={includeBreaks} onChange={(event) => setIncludeBreaks(event.target.checked)} /> Breaks</label></div></fieldset>
        <div className="alert alert--info"><strong>{entityIds.length} timetable{entityIds.length === 1 ? '' : 's'}</strong> will be sent to the browser print dialog. Each report starts on its own print block.</div>
      </div>
      <div className="modal__foot"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" disabled={!entityIds.length || (selection === 'selected' && !selectedIds.length)} onClick={printSet}>Print set</button></div>
    </div>
  </div>
}
