import React, { useMemo, useState } from 'react'

type Lesson = { id: string; day: string; period: number; className: string; subject: string; teacher: string; room: string; locked: boolean }
type Period = { name: string; start: string; end: string; type?: 'lesson' | 'break'; short?: string; textForPrintouts?: string; printClass?: boolean; printTeacher?: boolean; printClassroom?: boolean }
type ClassDetail = { classTeacher?: string; short?: string; color?: string }
type TeacherDetail = { short?: string; number?: string; classTeacher?: string }
type SubjectDetail = { short?: string; color?: string }
type TimetableData = Record<string, Record<number, string>>
type Props = {
  schoolName: string; academicYear: string; days: string[]; periods: Period[]; lessons: Lesson[]
  classes: string[]; teachers: string[]; classrooms: string[]
  classDetails: Record<string, ClassDetail>; teacherDetails: Record<string, TeacherDetail>; subjectDetails: Record<string, SubjectDetail>
  onClose: () => void
}
type Report = 'Classes' | 'Teachers' | 'Classrooms'
type TimetableStructureProps = {
  title: string; name: string; timetableData: TimetableData; days: string[]; periods: Period[]
  lessonsByCell: Record<string, Lesson[]>; report: Report; pageInfo: string; nextName: string
  schoolName: string; academicYear: string; compact: boolean; onePageView: boolean
  teacherLabel: (teacher: string) => string; classTeacher?: string
}
const isBreak = (period: Period) => period.type === 'break' || /break|lunch|recess|games/i.test(period.name)
const displayName = (value: string, short?: string) => short?.trim() || value
const titleFor = (report: Report) => report === 'Classes' ? 'Timetable for each class' : report === 'Teachers' ? 'Timetable for each teacher' : 'Timetable for each classroom'
const dayKey = (day: string) => {
  const value = day.trim().toUpperCase()
  const aliases: Record<string, string> = { MO: 'MON', MON: 'MON', MONDAY: 'MON', TU: 'TUE', TUE: 'TUE', TUESDAY: 'TUE', WE: 'WED', WED: 'WED', WEDNESDAY: 'WED', TH: 'THU', THU: 'THU', THURSDAY: 'THU', FR: 'FRI', FRI: 'FRI', FRIDAY: 'FRI' }
  return aliases[value] || value.slice(0, 3)
}

export function TimetableStructure({ title, name, timetableData, days, periods, lessonsByCell, report, pageInfo, nextName, schoolName, academicYear, compact, onePageView, teacherLabel, classTeacher }: TimetableStructureProps) {
  const generated = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  return <article className={'phikila-print-sheet' + (compact ? ' is-compact' : '') + (report === 'Teachers' ? ' is-teacher-report' : '') + (onePageView && (report === 'Teachers' || report === 'Classes') ? ' is-one-page-view' : '')}>
    <div className="phikila-print-sheet-heading">
      {title && <div className="phikila-print-school">{title}</div>}
      {report !== 'Teachers' && <div className="phikila-print-year">Academic year {academicYear}</div>}
      <h1>{name}</h1>
      {report === 'Classes' && classTeacher?.trim() && <p className="phikila-print-class-teacher">Class Teacher: {classTeacher.trim()}</p>}
      {report === 'Classrooms' && <><p>Classroom timetable</p><h2>{titleFor(report)}</h2></>}
    </div>
    <div className="phikila-print-table-wrap">
      <table className="phikila-print-table">
        <thead><tr><th className="phikila-print-day-heading">Day</th>{periods.map((period, index) => <th key={period.name + index} className={isBreak(period) ? 'is-break' : ''}><span>{period.short || period.name}</span><small>{period.start}{period.end ? '–' + period.end : ''}</small></th>)}</tr></thead>
        <tbody>{days.map(day => <tr key={day}><th className="phikila-print-day">{dayKey(day)}</th>{periods.map((period, periodIndex) => {
          const key = dayKey(day) + ':' + periodIndex
          const cellLessons = lessonsByCell[key] || []
          const blocked = isBreak(period)
          const value = timetableData[day]?.[periodIndex] || timetableData[dayKey(day)]?.[periodIndex] || ''
          return <td key={period.name + periodIndex} className={blocked ? 'is-break' : ''}>{blocked ? null : value && <div className="phikila-print-lesson">
            <strong>{value}</strong>
            {report !== 'Teachers' && cellLessons[0]?.teacher && <span>{teacherLabel(cellLessons[0].teacher)}</span>}
            {report === 'Classrooms' && cellLessons[0]?.className && <small>{cellLessons[0].className}</small>}
            {report !== 'Classrooms' && cellLessons[0]?.room && <small>{cellLessons[0].room}</small>}
          </div>}</td>
        })}</tr>)}</tbody>
      </table>
    </div>
    <footer className="phikila-print-sheet-footer"><span>Generated {generated}</span><span>{schoolName} · {pageInfo}</span><span>{nextName ? 'Next: ' + nextName : 'Timetable'}</span></footer>
  </article>
}

export default function PrintPreviewTimetableForEachClass(props: Props) {
  const [report, setReport] = useState<Report>('Classes')
  const [page, setPage] = useState(0)
  const [compact, setCompact] = useState(false)
  const [onePageView, setOnePageView] = useState(true)
  const entries = report === 'Classes' ? props.classes : report === 'Teachers' ? props.teachers : props.classrooms
  const safePage = Math.max(0, Math.min(page, Math.max(0, entries.length - 1)))
  const current = entries[safePage] || ''
  const lessonsForEntry = useMemo(() => props.lessons.filter(lesson => report === 'Classes' ? lesson.className === current : report === 'Teachers' ? lesson.teacher === current : lesson.room === current), [props.lessons, report, current])
  const subjectLabel = (subject: string) => props.subjectDetails[subject]?.short?.trim() || subject
  const classLabel = (className: string) => className.replace(/^grade\s*/i, '').trim() || className
  // Teacher IDs/numbers are metadata only; never use them as printed name fallbacks.
  const teacherLabel = (name: string) => displayName(name, props.teacherDetails[name]?.short)
  const title = report === 'Classrooms' ? props.schoolName : ''
  // Keep the grade as the heading and show an assigned class teacher on a separate line.
  const classTeacher = report === 'Classes' ? props.classDetails[current]?.classTeacher?.trim() || '' : ''
  const classHeading = current.trim()
  const name = report === 'Teachers' ? (current ? 'Teacher ' + current : 'Teacher: Not assigned') : report === 'Classes' ? classHeading : current
  const timetableData = useMemo(() => {
    const result: TimetableData = {}
    for (const day of props.days) result[dayKey(day)] = {}
    for (const lesson of lessonsForEntry) {
      const label = report === 'Teachers' ? subjectLabel(lesson.subject) + ' ' + classLabel(lesson.className) : subjectLabel(lesson.subject)
      const key = dayKey(lesson.day)
      if (!result[key]) result[key] = {}
      const existing = result[key][lesson.period]
      result[key][lesson.period] = existing ? existing + ' / ' + label : label
    }
    return result
  }, [props.days, lessonsForEntry, report, props.subjectDetails])
  const lessonsByCell = useMemo(() => {
    const result: Record<string, Lesson[]> = {}
    for (const lesson of lessonsForEntry) {
      const key = dayKey(lesson.day) + ':' + lesson.period
      ;(result[key] ||= []).push(lesson)
    }
    return result
  }, [lessonsForEntry])
  const changeReport = (next: Report) => { setReport(next); setPage(0); setOnePageView(next === 'Teachers' || next === 'Classes') }
  const goPage = (next: number) => setPage(Math.max(0, Math.min(next, entries.length - 1)))
  const pageInfo = 'Page ' + (entries.length ? safePage + 1 : 0) + ' of ' + entries.length
  const nextName = entries[safePage + 1] || ''

  return <div className="phikila-tt-modal-backdrop phikila-print-preview-backdrop" role="presentation">
    <style>{`
      /* Personal class and teacher reports are constrained to one landscape page. */
      .phikila-print-sheet.is-one-page-view { height: 100%; min-height: 0; overflow: hidden; }
      .phikila-print-sheet-heading { position: relative; }
      .phikila-print-class-teacher { position: absolute; top: 0; right: 0; max-width: 38%; margin: 0; font-size: 0.75rem; line-height: 1.25; font-weight: 400; text-align: right; }
      @media print { .phikila-print-class-teacher { font-size: 9pt; } }
      .phikila-print-sheet.is-one-page-view .phikila-print-year { display: block; }
      @media print {
        @page { size: landscape; margin: 9mm; }
        .phikila-print-sheet.is-one-page-view {
          box-sizing: border-box !important;
          width: 100% !important;
          height: 180mm !important;
          min-height: 0 !important;
          max-height: 180mm !important;
          margin: 0 !important;
          padding: 5mm 4mm 3mm !important;
          overflow: hidden !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          break-after: auto !important;
          page-break-after: auto !important;
        }
        .phikila-print-sheet.is-one-page-view .phikila-print-sheet-heading { flex: 0 0 auto !important; padding-bottom: 3mm !important; }
        .phikila-print-sheet.is-one-page-view .phikila-print-year { display: block !important; }
        .phikila-print-sheet.is-one-page-view .phikila-print-table-wrap { flex: 1 1 0 !important; min-height: 0 !important; overflow: hidden !important; }
        .phikila-print-sheet.is-one-page-view .phikila-print-table {
          display: table !important;
          width: 100% !important;
          height: 100% !important;
          table-layout: fixed !important;
          border-collapse: collapse !important;
        }
        .phikila-print-sheet.is-one-page-view .phikila-print-table thead { height: 16% !important; }
        .phikila-print-sheet.is-one-page-view .phikila-print-table tbody {
          height: 84% !important;
        }
        .phikila-print-sheet.is-one-page-view .phikila-print-table tbody tr {
          height: 20% !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .phikila-print-sheet.is-one-page-view .phikila-print-table th,
        .phikila-print-sheet.is-one-page-view .phikila-print-table td {
          box-sizing: border-box !important;
          overflow-wrap: anywhere !important;
          word-break: normal !important;
        }
        .phikila-print-sheet.is-one-page-view .phikila-print-lesson {
          max-height: 100% !important;
          overflow: hidden !important;
        }
        .phikila-print-sheet.is-one-page-view .phikila-print-sheet-footer { flex: 0 0 auto !important; margin-top: 2mm !important; }
      }
    `}</style>
    <section className="phikila-print-preview" role="dialog" aria-modal="true" aria-labelledby="phikila-print-title">
      <header className="phikila-print-menu" aria-label="Print preview menu">
        {['Main', 'File', 'Specification', 'View', 'Timetable', 'Options', 'Help'].map(item => <button key={item} type="button" onClick={() => item === 'File' ? window.print() : undefined}>{item}</button>)}
        <strong id="phikila-print-title">Print preview</strong>
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
        <span className="phikila-print-page-count">{pageInfo}</span>
        <button type="button" onClick={() => setCompact(value => !value)}>{compact ? 'Comfortable size' : 'Compact size'}</button>
        <button type="button" onClick={props.onClose}>Close preview</button>
      </div>
      <div className="phikila-print-sheet-wrap">
        {current ? <TimetableStructure title={title} name={name} timetableData={timetableData} days={props.days} periods={props.periods} lessonsByCell={lessonsByCell} report={report} pageInfo={pageInfo} nextName={nextName} schoolName={props.schoolName} academicYear={props.academicYear} compact={compact} onePageView={onePageView} teacherLabel={teacherLabel} classTeacher={classTeacher} /> : <div className="phikila-print-empty">No {report.toLowerCase()} available to preview.</div>}
      </div>
      <footer className="phikila-print-status"><span>Ready</span><span>{pageInfo}</span><span>Next: {nextName || '—'}</span><span className="phikila-print-status-spacer" /><button type="button" onClick={props.onClose}>Close</button></footer>
    </section>
  </div>
}
