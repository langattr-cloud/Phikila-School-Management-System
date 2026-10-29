import React, { useMemo, useState } from 'react'

type Lesson = { id: string; day: string; period: number; className: string; subject: string; teacher: string; room: string; locked: boolean }
type Period = { name: string; start: string; end: string; type?: 'lesson' | 'break'; short?: string; textForPrintouts?: string; printClass?: boolean; printTeacher?: boolean; printClassroom?: boolean }
type ClassDetail = { classTeacher?: string; short?: string; color?: string }
type TeacherDetail = { short?: string; number?: string; classTeacher?: string }
type SubjectDetail = { short?: string; color?: string }
type Props = {
  schoolName: string; academicYear: string; days: string[]; periods: Period[]; lessons: Lesson[]
  classes: string[]; teachers: string[]; classrooms: string[]
  classDetails: Record<string, ClassDetail>; teacherDetails: Record<string, TeacherDetail>; subjectDetails: Record<string, SubjectDetail>
  onClose: () => void
}
type Report = 'Classes' | 'Teachers' | 'Classrooms'
const isBreak = (period: Period) => period.type === 'break' || /break|lunch|recess|games/i.test(period.name)
const displayName = (value: string, short?: string) => short?.trim() || value
const titleFor = (report: Report) => report === 'Classes' ? 'Timetable for each class' : report === 'Teachers' ? 'Timetable for each teacher' : 'Timetable for each classroom'

export default function PrintPreviewTimetableForEachClass(props: Props) {
  const [report, setReport] = useState<Report>('Classes')
  const [page, setPage] = useState(0)
  const [showCodes, setShowCodes] = useState(true)
  const [compact, setCompact] = useState(false)
  const entries = report === 'Classes' ? props.classes : report === 'Teachers' ? props.teachers : props.classrooms
  const safePage = Math.max(0, Math.min(page, Math.max(0, entries.length - 1)))
  const current = entries[safePage] || ''
  const lessonsForEntry = useMemo(() => props.lessons.filter(lesson => report === 'Classes' ? lesson.className === current : report === 'Teachers' ? lesson.teacher === current : lesson.room === current), [props.lessons, report, current])
  const getLessons = (day: string, periodIndex: number) => lessonsForEntry.filter(lesson => lesson.day === day && lesson.period === periodIndex)
  const teacher = report === 'Classes' ? props.classDetails[current]?.classTeacher : ''
  const changeReport = (next: Report) => { setReport(next); setPage(0) }
  const goPage = (next: number) => setPage(Math.max(0, Math.min(next, entries.length - 1)))
  const subjectLabel = (subject: string) => showCodes ? displayName(subject, props.subjectDetails[subject]?.short) : subject
  const teacherLabel = (name: string) => displayName(name, props.teacherDetails[name]?.short || props.teacherDetails[name]?.number)
  const generated = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

  return <div className="phikila-tt-modal-backdrop phikila-print-preview-backdrop" role="presentation">
    <section className="phikila-print-preview" role="dialog" aria-modal="true" aria-labelledby="phikila-print-title">
      <header className="phikila-print-menu" aria-label="Print preview menu">
        {['Main', 'File', 'Specification', 'View', 'Timetable', 'Options', 'Help'].map(item => <button key={item} type="button" onClick={() => item === 'File' ? window.print() : undefined}>{item}</button>)}
        <strong>Print preview</strong>
      </header>
      <div className="phikila-print-toolbar">
        <button type="button" onClick={() => goPage(safePage - 1)} disabled={safePage <= 0}>‹ Previous page</button>
        <button type="button" onClick={() => goPage(safePage + 1)} disabled={safePage >= entries.length - 1}>Next page ›</button>
        <button type="button" className="phikila-print-primary" onClick={() => window.print()}>Print</button>
        <label className="phikila-print-select-label">Report
          <select value={report} onChange={event => changeReport(event.target.value as Report)}>
            <option value="Classes">Timetable for each class</option><option value="Teachers">Timetable for each teacher</option><option value="Classrooms">Timetable for each classroom</option>
          </select>
        </label>
        <span className="phikila-print-page-count">Page {entries.length ? safePage + 1 : 0} of {entries.length}</span>
        <button type="button" onClick={() => setShowCodes(value => !value)} title="Switch between subject codes and full subject names">{showCodes ? 'Subject codes' : 'Full subject names'}</button>
        <button type="button" onClick={() => setCompact(value => !value)}>{compact ? 'Comfortable size' : 'Compact size'}</button>
        <button type="button" onClick={props.onClose}>Close preview</button>
      </div>
      <div className="phikila-print-sheet-wrap">
        {current ? <article className={'phikila-print-sheet' + (compact ? ' is-compact' : '') + (report === 'Teachers' ? ' is-teacher-report' : '')}>
          <div className="phikila-print-sheet-heading">
            <div className="phikila-print-school">{props.schoolName}</div>
            {report !== 'Teachers' && <div className="phikila-print-year">Academic year {props.academicYear}</div>}
            <h1>{current}</h1>
            {report === 'Classes' && <p>Class teacher: <strong>{teacher || 'Not assigned'}</strong></p>}
            {report === 'Classrooms' && <><p>Classroom timetable</p><h2>{titleFor(report)}</h2></>}
          </div>
          <div className="phikila-print-table-wrap">
            <table className="phikila-print-table">
              <thead><tr><th className="phikila-print-day-heading">Day</th>{props.periods.map((period, index) => <th key={period.name + index} className={isBreak(period) ? 'is-break' : ''}><span>{isBreak(period) ? (period.short || period.name) : (period.short || period.name)}</span><small>{period.start}{period.end ? '–' + period.end : ''}</small></th>)}</tr></thead>
              <tbody>{props.days.map(day => <tr key={day}><th className="phikila-print-day">{props.days.length > 5 ? day.slice(0, 3).toUpperCase() : day.slice(0, 2).toUpperCase()}<small>{day}</small></th>{props.periods.map((period, periodIndex) => {
                const cellLessons = getLessons(day, periodIndex)
                const blocked = isBreak(period)
                return <td key={period.name + periodIndex} className={blocked ? 'is-break' : ''}>{blocked ? null : cellLessons.map(lesson => <div className="phikila-print-lesson" key={lesson.id}>
                  <strong>{subjectLabel(lesson.subject)}</strong>
                  {report !== 'Teachers' && <span>{teacherLabel(lesson.teacher)}</span>}
                  {report !== 'Classes' && <small>{lesson.className}</small>}
                  {report !== 'Classrooms' && lesson.room && <small>{lesson.room}</small>}
                </div>)}</td>
              })}</tr>)}</tbody>
            </table>
          </div>
          <footer className="phikila-print-sheet-footer"><span>Generated {generated}</span><span>{props.schoolName} · Timetable</span><span>aSc Timetables</span></footer>
        </article> : <div className="phikila-print-empty">No {report.toLowerCase()} available to preview.</div>}
      </div>
      <footer className="phikila-print-status"><span>Ready</span><span>Page {entries.length ? safePage + 1 : 0}/{entries.length}</span><span>Next: {entries[safePage + 1] || '—'}</span><span className="phikila-print-status-spacer" /><button type="button" onClick={props.onClose}>Close</button></footer>
    </section>
  </div>
}
