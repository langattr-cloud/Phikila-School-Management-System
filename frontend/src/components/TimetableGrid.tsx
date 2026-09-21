import { useEffect, useMemo, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react'
import type { Day, Lesson, Period, SchoolClass, Subject } from '../lib/scheduling'
import { LockIcon } from './icons'
import { PrintSetupModal } from './PrintSetupModal'
import { timetableClassLabel } from './timetable-view-helpers'
import './timetable-time-grid.css'
import './timetable-subject-colours.css'
import './timetable-asc-toolbar.css'
import './timetable-three-view.css'
import './timetable-period-format.css'

type LessonMeta = {
  subjects: Map<number, Subject>
  teachers: Map<number, { id: number; name: string; code?: string; staff_number?: string }>
  rooms: Map<number, { id: number; name: string }>
  classes: Map<number, SchoolClass>
}
export type { LessonMeta }
export const UNASSIGNED_DRAG_TYPE = 'application/x-phikila-unassigned'
type ViewKind = 'whole-school' | 'class' | 'teacher' | 'generic'
type Props = {
  days: Day[]
  periods: Period[]
  lessons: Lesson[]
  meta: LessonMeta
  view?: ViewKind
  conflicted?: Set<number>
  selectedId?: number | null
  readOnly?: boolean
  zoom?: number
  dense?: boolean
  currentSlot?: { day: number; period: number } | null
  timeFormat?: '24h' | '12h'
  timeLayout?: 'split' | 'single'
  onSelect?: (lesson: Lesson) => void
  onMove?: (lesson: Lesson, day: number, period: number) => void
  onResize?: (lesson: Lesson, duration: number) => void
  onDropUnassigned?: (unassignedId: number, day: number, period: number) => void
  secondary?: (lesson: Lesson) => string | null | undefined
  teacherInitials?: boolean
}

const minutes = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

const dayLabel = (day: Day) => {
  const item = day as Day & { date?: string; date_label?: string }
  return item.date_label || item.date || day.name
}

const formatTime = (value: string, format: '24h' | '12h') => {
  const [rawHour, minute] = value.split(':').map(Number)
  if (format === '24h') return `${String(rawHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const suffix = rawHour >= 12 ? 'PM' : 'AM'
  return `${rawHour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

const FALLBACK_SUBJECT_COLOURS = [
  '#FDE68A', '#BFDBFE', '#C7D2FE', '#DDD6FE', '#FBCFE8', '#FECACA',
  '#A7F3D0', '#BAE6FD', '#D9F99D', '#FED7AA', '#C4B5FD', '#F9A8D4',
]

const REPORTS = [
  'Timetable for each class',
  'Timetable for each teacher',
  'Timetable for each classroom',
  'Timetable for each subject',
  'Summary timetable of classes',
  'Summary timetable of teachers',
  'Summary timetable of classrooms',
  'Wall poster of classes',
  'Wall poster of teachers',
] as const

type Report = typeof REPORTS[number]
type PrintEntity = { id: number; label: string }

const hashString = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  return Math.abs(hash)
}

const configuredSubjectColour = (subject: Subject) => {
  const candidate = subject as Subject & {
    color?: unknown
    colour?: unknown
    background_color?: unknown
    backgroundColour?: unknown
    color_hex?: unknown
    colour_hex?: unknown
  }
  return [candidate.color, candidate.colour, candidate.background_color, candidate.backgroundColour, candidate.color_hex, candidate.colour_hex]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() || null
}

export function TimetableGrid({
  days,
  periods,
  lessons,
  meta,
  view = 'whole-school',
  conflicted,
  selectedId,
  readOnly = false,
  currentSlot,
  timeFormat = '24h',
  timeLayout = 'split',
  onSelect,
  onMove,
  onResize,
  secondary,
  teacherInitials = false,
}: Props) {
  const [dragging, setDragging] = useState<Lesson | null>(null)
  const [carrying, setCarrying] = useState<Lesson | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [hoveredLesson, setHoveredLesson] = useState<Lesson | null>(null)
  const [selectedPrintLesson, setSelectedPrintLesson] = useState<Lesson | null>(null)
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [printReport, setPrintReport] = useState<Report>('Timetable for each class')
  const [printPage, setPrintPage] = useState(0)
  const [printTimestamp, setPrintTimestamp] = useState('')

  const openPrintSetupFromContext = (event: MouseEvent) => {
    if (view !== 'class' && view !== 'teacher') return
    const target = event.target as HTMLElement | null
    const lessonCard = target?.closest?.('[data-lesson-id]') as HTMLElement | null
    const cell = target?.closest?.('.timetable__cell') as HTMLElement | null
    const lessonId = lessonCard?.dataset.lessonId
    const dayIndex = cell ? Number(cell.dataset.day) : NaN
    const periodIndex = cell ? Number(cell.dataset.period) : NaN
    const lesson = lessonId
      ? lessons.find((item) => String(item.id) === lessonId)
      : Number.isFinite(dayIndex) && Number.isFinite(periodIndex)
        ? lessons.find((item) => item.day_index === dayIndex && item.period_index === periodIndex)
        : undefined
    const contextLesson = lesson ?? lessons[0]
    if (!contextLesson) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedPrintLesson(contextLesson)
  }

  useEffect(() => {
    document.addEventListener('contextmenu', openPrintSetupFromContext, true)
    return () => document.removeEventListener('contextmenu', openPrintSetupFromContext, true)
  }, [lessons, view])

  const activeDays = useMemo(() => days.filter((day) => day.is_active), [days])
  const teachingPeriods = useMemo(
    () => [...periods].filter((period) => period.is_teaching).sort((a, b) => minutes(a.start_time) - minutes(b.start_time) || a.index - b.index),
    [periods],
  )
  const printPeriods = useMemo(
    () => [...periods].sort((a, b) => minutes(a.start_time) - minutes(b.start_time) || a.index - b.index),
    [periods],
  )
  const periodsPerDay = teachingPeriods.length

  const wholeRows = useMemo(
    () => [...meta.classes.values()].sort((a, b) => {
      const ag = a.grade ?? ''
      const bg = b.grade ?? ''
      return ag.localeCompare(bg, undefined, { numeric: true }) || timetableClassLabel(a).localeCompare(timetableClassLabel(b), undefined, { numeric: true })
    }),
    [meta.classes],
  )

  const bySlot = useMemo(() => {
    const map = new Map<string, Lesson[]>()
    for (const lesson of lessons) {
      const key = `${lesson.day_index}:${lesson.period_index}`
      map.set(key, [...(map.get(key) ?? []), lesson])
    }
    return map
  }, [lessons])

  const subjectColorMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const subject of meta.subjects.values()) {
      const configured = configuredSubjectColour(subject)
      const fallback = FALLBACK_SUBJECT_COLOURS[hashString(`${subject.id}:${subject.code ?? subject.name}`) % FALLBACK_SUBJECT_COLOURS.length]
      map.set(subject.id, configured || fallback)
    }
    return map
  }, [meta.subjects])

  const getSubjectColor = (subject: Subject | undefined) => (subject && subjectColorMap.get(subject.id)) || '#E5E7EB'

  const printEntities = useMemo<PrintEntity[]>(() => {
    if (printReport.includes('class')) return wholeRows.map((item) => ({ id: item.id, label: timetableClassLabel(item) }))
    if (printReport.includes('teacher')) return [...meta.teachers.values()].sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({ id: item.id, label: item.name || item.code || item.staff_number || `Teacher ${item.id}` }))
    if (printReport.includes('classroom')) return [...meta.rooms.values()].sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({ id: item.id, label: item.name }))
    if (printReport.includes('subject')) return [...meta.subjects.values()].sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({ id: item.id, label: item.name || item.code || `Subject ${item.id}` }))
    return [{ id: 0, label: 'Whole School' }]
  }, [printReport, wholeRows, meta.teachers, meta.rooms, meta.subjects])

  const pageCount = Math.max(1, printEntities.length)
  const printEntity = printEntities[Math.min(printPage, pageCount - 1)]

  const selectAppearanceCell = (type: 'lesson' | 'period' | 'day', label: string, details: { day?: number; period?: number; lessonId?: number } = {}) => {
    window.dispatchEvent(new CustomEvent('phikila:timetable-cell-selected', { detail: { type, label, ...details } }))
  }

  const moveLesson = (lesson: Lesson, day: number, period: number) => {
    if (readOnly || lesson.is_locked) return
    onMove?.(lesson, day, period)
    setDragging(null)
    setCarrying(null)
    setHovered(null)
  }

  const handleCellKeyDown = (event: KeyboardEvent, day: number, period: number, cellLessons: Lesson[]) => {
    if (readOnly || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    if (carrying) return moveLesson(carrying, day, period)
    const lesson = cellLessons.find((item) => !item.is_locked) ?? cellLessons[0]
    if (lesson) {
      onSelect?.(lesson)
      if (!lesson.is_locked) setCarrying(lesson)
    }
  }

  const slotHandlers = (key: string, day: number, period: number) => ({
    onDragOver: (event: DragEvent) => {
      if (readOnly || !dragging) return
      event.preventDefault()
      setHovered(key)
    },
    onDragLeave: () => setHovered((value) => value === key ? null : value),
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      if (dragging) moveLesson(dragging, day, period)
    },
  })

  const renderCard = (lesson: Lesson) => {
    const subject = meta.subjects.get(lesson.subject_id)
    const assignedClass = meta.classes.get(lesson.class_id)
    const teacher = lesson.teacher_id ? meta.teachers.get(lesson.teacher_id) : undefined
    const classLabel = assignedClass ? timetableClassLabel(assignedClass) : '—'
    const classCode = (assignedClass as (SchoolClass & { code?: string }) | undefined)?.code || classLabel
    const teacherCode = teacher?.code || teacher?.staff_number || '—'
    const subjectName = subject?.name || subject?.code || 'Lesson'
    const subjectCode = subject?.code || subjectName
    const color = getSubjectColor(subject)
    const conflict = conflicted?.has(lesson.id) ?? false
    const period = teachingPeriods.find((item) => item.index === lesson.period_index)
    const title = `${subjectName} · ${classLabel} · ${teacher?.name || teacherCode}`
    const style = { backgroundColor: conflict ? '#FBE8E5' : color, borderColor: conflict ? '#9A2F24' : color, '--subject-colour': color } as CSSProperties

    return (
      <div
        key={lesson.id}
        className={`lesson-card ${selectedId === lesson.id ? 'lesson-card--selected' : ''} ${conflict ? 'lesson-card--conflict' : ''} ${lesson.is_locked ? 'lesson-card--locked' : ''}`}
        style={style}
        title={title}
        aria-label={title}
        role="button"
        tabIndex={-1}
        draggable={!readOnly && !lesson.is_locked}
        onMouseEnter={() => setHoveredLesson(lesson)}
        onMouseLeave={() => setHoveredLesson((value) => value?.id === lesson.id ? null : value)}
        onDragStart={(event) => {
          if (lesson.is_locked) { event.preventDefault(); return }
          setDragging(lesson)
          setHoveredLesson(lesson)
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', String(lesson.id))
        }}
        onDragEnd={() => { setDragging(null); setHoveredLesson(null) }}
        data-lesson-id={lesson.id}
        data-day={lesson.day_index}
        data-period={lesson.period_index}
        onClick={(event) => {
          event.stopPropagation()
          onSelect?.(lesson)
          selectAppearanceCell('lesson', subjectName, { day: lesson.day_index, period: lesson.period_index, lessonId: lesson.id })
        }}
      >
        <span className="lesson-card__subject">{subjectCode}</span>
        <span className="lesson-card__class">{view === 'teacher' ? classCode : teacherCode}</span>
        {timeLayout === 'single' && period && <span className="lesson-card__time">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span>}
        {timeLayout === 'split' && period && <span className="lesson-card__time lesson-card__time--split"><span>{formatTime(period.start_time, timeFormat)}</span><span>{formatTime(period.end_time, timeFormat)}</span></span>}
        {lesson.is_locked && <span className="lesson-card__lock" title="Locked"><LockIcon width={12} height={12} /></span>}
        {!readOnly && !lesson.is_locked && onResize && <button type="button" className="lesson-card__resize" title="Extend lesson" aria-label="Extend lesson" onClick={(event) => { event.stopPropagation(); onResize(lesson, Math.min(10, (lesson.duration ?? 1) + 1)) }} />}
      </div>
    )
  }

  const hoverText = hoveredLesson
    ? (() => {
        const subject = meta.subjects.get(hoveredLesson.subject_id)
        const cls = meta.classes.get(hoveredLesson.class_id)
        const teacher = hoveredLesson.teacher_id ? meta.teachers.get(hoveredLesson.teacher_id) : undefined
        return `${subject?.name || subject?.code || 'Subject'} · ${cls ? timetableClassLabel(cls) : 'Class'} · ${teacher?.name || teacher?.code || teacher?.staff_number || 'Teacher'}`
      })()
    : 'Hover a lesson to see subject, class and teacher.'

  const renderWholeSchool = () => {
    const totalColumns = Math.max(1, activeDays.length * Math.max(1, periodsPerDay))
    const gridStyle = { '--tt-period-count': periodsPerDay || 1, '--tt-whole-columns': totalColumns, '--tt-whole-rows': wholeRows.length || 1 } as CSSProperties
    return (
      <div className="timetable__whole-scroll">
        <div className="timetable__whole-school-grid" style={gridStyle}>
          <div className="timetable__whole-corner timetable__whole-corner--sticky timetable__whole-corner--top">PERIOD / TIME</div>
          {activeDays.map((day) => <div key={`day-${day.index}`} className="timetable__whole-day-head" style={{ gridColumn: `span ${periodsPerDay || 1}` }} onClick={() => selectAppearanceCell('day', dayLabel(day), { day: day.index })}>{dayLabel(day).toUpperCase()}</div>)}
          <div className="timetable__whole-corner timetable__whole-period-row-label timetable__whole-corner--sticky">PERIOD / TIME</div>
          {activeDays.flatMap((day) => teachingPeriods.map((period, index) => (
            <div key={`period-${day.index}-${period.index}`} className="timetable__whole-period-head" title={`${period.name || `P${index + 1}`} · ${formatTime(period.start_time, timeFormat)}–${formatTime(period.end_time, timeFormat)}`} onClick={() => selectAppearanceCell('period', `${period.name || `P${index + 1}`} ${formatTime(period.start_time, timeFormat)}–${formatTime(period.end_time, timeFormat)}`, { day: day.index, period: period.index })}>
              <span className="timetable__period">P{index + 1}</span><span className="timetable__clock">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span>
            </div>
          )))}
          {wholeRows.map((row) => (
            <div key={row.id} className="timetable__whole-row">
              <div className="timetable__whole-class-label">{timetableClassLabel(row)}</div>
              {activeDays.flatMap((day) => teachingPeriods.map((period, index) => {
                const key = `whole:${row.id}:${day.index}:${period.index}`
                const cellLessons = lessons.filter((lesson) => lesson.class_id === row.id && lesson.day_index === day.index && lesson.period_index === period.index)
                return <div key={`${row.id}-${day.index}-${period.index}`} data-day={day.index} data-period={period.index} className={`timetable__whole-slot ${currentSlot?.day === day.index && currentSlot.period === period.index ? 'timetable__whole-slot--now' : ''} ${hovered === key && Boolean(dragging || carrying) ? 'timetable__cell--target' : ''}`} aria-label={`${timetableClassLabel(row)}, ${dayLabel(day)}, period ${index + 1}`} tabIndex={readOnly ? -1 : 0} onClick={() => { if (cellLessons[0]) onSelect?.(cellLessons[0]); selectAppearanceCell('period', `Period ${index + 1}`, { day: day.index, period: period.index }) }} onKeyDown={(event) => handleCellKeyDown(event, day.index, period.index, cellLessons)} {...slotHandlers(key, day.index, period.index)}>{cellLessons.map(renderCard)}</div>
              }))}
            </div>
          ))}
        </div>
        <div className="timetable__whole-hoverbar" aria-live="polite">{hoverText}</div>
      </div>
    )
  }

  const renderDayPeriod = () => (
    <div className="timetable__time-grid" style={{ '--tt-period-count': periodsPerDay || 1 } as CSSProperties}>
      <div className="timetable__corner">Day / Date</div>
      {teachingPeriods.map((period, index) => <div key={period.index} className="timetable__period-head"><span className="timetable__period">P{index + 1}</span><span className="timetable__clock">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span></div>)}
      {activeDays.map((day) => <div key={day.index} className="timetable__day-row"><div className="timetable__day-label">{dayLabel(day)}</div>{teachingPeriods.map((period) => { const key = `${day.index}:${period.index}`; const cellLessons = bySlot.get(key) ?? []; return <div key={period.index} className={`timetable__cell ${hovered === key ? 'timetable__cell--target' : ''} ${currentSlot?.day === day.index && currentSlot.period === period.index ? 'timetable__cell--now' : ''}`} data-day={day.index} data-period={period.index} tabIndex={readOnly ? -1 : 0} onKeyDown={(event) => handleCellKeyDown(event, day.index, period.index, cellLessons)} onContextMenu={(event) => { if (view === 'class' || view === 'teacher') { event.preventDefault(); event.stopPropagation(); const lesson = cellLessons[0]; if (lesson) setSelectedPrintLesson(lesson) } }} {...slotHandlers(key, day.index, period.index)}>{cellLessons.map(renderCard)}</div> })}</div>)}
    </div>
  )

  const lessonsForEntity = (entityId: number) => {
    if (printReport.includes('class')) return lessons.filter((lesson) => lesson.class_id === entityId)
    if (printReport.includes('teacher')) return lessons.filter((lesson) => lesson.teacher_id === entityId)
    if (printReport.includes('classroom')) return lessons.filter((lesson) => lesson.room_id === entityId)
    if (printReport.includes('subject')) return lessons.filter((lesson) => lesson.subject_id === entityId)
    return lessons
  }

  const printLesson = (lesson: Lesson) => {
    const subject = meta.subjects.get(lesson.subject_id)
    const teacher = lesson.teacher_id ? meta.teachers.get(lesson.teacher_id) : undefined
    const cls = meta.classes.get(lesson.class_id)
    const room = lesson.room_id ? meta.rooms.get(lesson.room_id) : undefined
    const color = getSubjectColor(subject)
    const classLabel = cls ? timetableClassLabel(cls) : '—'
    const classCode = (cls as (SchoolClass & { code?: string }) | undefined)?.code || classLabel
    const teacherCode = teacher?.code || teacher?.staff_number || '—'
    return { subject: subject?.code || subject?.name || 'Lesson', teacherCode, classCode, room: room?.name || '—', color }
  }

  const renderPrintTable = (entityId: number, dense = false) => {
    const entityLessons = lessonsForEntity(entityId)
    const lessonAt = (dayIndex: number, periodIndex: number) => entityLessons.find((lesson) => lesson.day_index === dayIndex && lesson.period_index === periodIndex)
    return (
      <div className={`print-table ${dense ? 'print-table--dense' : ''}`}>
        <div className="print-table__corner">DAY / PERIOD</div>
        {printPeriods.map((period, index) => <div key={period.id} className={`print-table__period ${period.is_teaching ? 'print-table__teaching' : 'print-table__break'}`} data-column-type={period.is_teaching ? 'period' : 'break'}><strong>{period.is_teaching ? `P${teachingPeriods.findIndex((item) => item.id === period.id) + 1}` : period.short_form || period.name || 'BREAK'}</strong><span>{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span></div>)}
        {activeDays.map((day) => <div key={day.id} className="print-table__row"><div className="print-table__day">{dayLabel(day)}</div>{printPeriods.map((period) => { const lesson = lessonAt(day.index, period.index); const data = lesson ? printLesson(lesson) : null; return <div key={period.id} className={`print-table__cell ${period.is_teaching ? '' : 'print-table__break-cell'}`} data-column-type={period.is_teaching ? 'period' : 'break'} style={data ? { backgroundColor: data.color } : undefined}>{data && <><strong>{data.subject}</strong><small>{printReport.includes('class') ? data.teacherCode : data.classCode}</small><small>{!dense && printReport.includes('class') ? data.room : ''}</small></>}</div> })}</div>)}
      </div>
    )
  }

  const renderSummaryGrid = (kind: 'class' | 'teacher' | 'room') => {
    const rows = kind === 'class' ? wholeRows.map((item) => ({ id: item.id, label: timetableClassLabel(item) })) : kind === 'teacher' ? [...meta.teachers.values()].sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({ id: item.id, label: item.name })) : [...meta.rooms.values()].sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({ id: item.id, label: item.name }))
    const lessonMatches = (rowId: number, day: Day, period: Period) => lessons.find((lesson) => (kind === 'class' ? lesson.class_id === rowId : kind === 'teacher' ? lesson.teacher_id === rowId : lesson.room_id === rowId) && lesson.day_index === day.index && lesson.period_index === period.index)
    return <div className="summary-grid"><div className="summary-grid__corner">{kind.toUpperCase()}</div>{activeDays.flatMap((day) => teachingPeriods.map((period, index) => <div key={`${day.id}-${period.id}`} className="summary-grid__head">{day.name.slice(0, 3).toUpperCase()} P{index + 1}</div>))}{rows.map((row) => <div key={row.id} className="summary-grid__row"><div className="summary-grid__label">{row.label}</div>{activeDays.flatMap((day) => teachingPeriods.map((period) => { const lesson = lessonMatches(row.id, day, period); const data = lesson ? printLesson(lesson) : null; return <div key={`${row.id}-${day.id}-${period.id}`} className="summary-grid__cell" style={data ? { backgroundColor: data.color } : undefined}>{data?.subject}</div> }))}</div>)}</div>
  }

  const renderPrintPage = () => {
    const summary = printReport === 'Summary timetable of classes' ? 'class' : printReport === 'Summary timetable of teachers' ? 'teacher' : printReport === 'Summary timetable of classrooms' ? 'room' : null
    const wall = printReport.startsWith('Wall poster')
    if (summary) return <>{renderSummaryGrid(summary)}</>
    if (wall) return <>{renderSummaryGrid(printReport.endsWith('classes') ? 'class' : 'teacher')}</>
    return renderPrintTable(printEntity?.id ?? 0)
  }

  const openPrintPreview = () => { setPrintPage(0); setPrintTimestamp(new Date().toLocaleString()); setShowPrintPreview(true) }
  const changeReport = (value: Report) => { setPrintReport(value); setPrintPage(0) }

  return (
    <div
      className={`timetable timetable--${view}-view`}
      onContextMenuCapture={(event) => openPrintSetupFromContext(event.nativeEvent)}
    >
      <div className="timetable__asc-toolbar">
        <span className="timetable__asc-view">Whole</span>
        <button type="button" className="timetable__asc-button" onClick={() => window.print()}>Print</button>
        <button type="button" className="timetable__asc-button timetable__asc-button--primary" onClick={openPrintPreview}>Print preview</button>
      </div>
      <div className="timetable__format-hint">Click a lesson, period/time, or day/date cell to format its appearance.</div>
      {view === 'whole-school' ? renderWholeSchool() : renderDayPeriod()}

      {selectedPrintLesson && (
        <PrintSetupModal
          lesson={selectedPrintLesson}
          meta={meta}
          onClose={() => setSelectedPrintLesson(null)}
        />
      )}

      {showPrintPreview && (
        <div className="timetable-print-preview" role="dialog" aria-modal="true" aria-label="Timetable print preview">
          <style>{`
            .timetable-print-preview{position:fixed;inset:0;z-index:1000;background:rgba(71,85,105,.72);display:flex;flex-direction:column;font-family:Arial,sans-serif}
            .timetable-print-preview__toolbar{background:#f1f5f9;border-bottom:1px solid #cbd5e1;padding:8px 12px;display:flex;align-items:center;gap:8px;font-size:12px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
            .timetable-print-preview__toolbar button,.timetable-print-preview__toolbar select{height:30px;border:1px solid #94a3b8;background:#fff;border-radius:3px;padding:0 10px;font-size:12px}
            .timetable-print-preview__toolbar button{cursor:pointer}.timetable-print-preview__toolbar .primary{background:#2563eb;color:#fff;border-color:#2563eb}.timetable-print-preview__toolbar .close{margin-left:auto;background:#dc2626;color:#fff;border-color:#dc2626}
            .timetable-print-preview__pages{flex:1;overflow:hidden;padding:16px;display:flex;justify-content:center;align-items:center;min-height:0}
            .timetable-print-preview__stage{display:flex;align-items:center;justify-content:center;gap:10px;max-width:100%;max-height:100%}
            .timetable-print-preview__paper{width:min(297mm, calc((100vh - 92px) * 1.4142857));height:min(210mm, calc(100vh - 92px));max-width:100%;max-height:100%;background:#fff;box-sizing:border-box;padding:8mm;box-shadow:0 8px 28px rgba(0,0,0,.28);color:#111827;overflow:hidden;display:flex;flex-direction:column}
            .timetable-print-preview__content{flex:1;min-height:0;overflow:hidden}
            .timetable-print-preview__nav{display:flex;flex-direction:column;align-items:center;gap:6px;flex:0 0 auto}
            .timetable-print-preview__nav button{width:34px;height:34px;border:1px solid #94a3b8;background:#fff;border-radius:3px;font-size:18px;line-height:1;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.12)}
            .timetable-print-preview__nav button:disabled{opacity:.4;cursor:default}
            .timetable-print-preview__page-label{min-width:34px;text-align:center;font-size:10px;font-weight:700;color:#334155}
            .timetable-print-preview__title{text-align:center;margin:0 0 3px;font-size:18px;font-weight:800}.timetable-print-preview__subtitle{text-align:center;margin:0 0 12px;font-size:11px;color:#475569}.timetable-print-preview__meta{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid #111827;padding-bottom:6px;margin-bottom:8px;font-size:11px;font-weight:700}
            .print-table{display:grid;grid-template-columns:58px repeat(var(--print-periods),minmax(48px,1fr));border-top:1px solid #111827;border-left:1px solid #111827}.print-table{--print-periods:${printPeriods.length || 1}}
            .print-table__corner,.print-table__period,.print-table__day,.print-table__cell{border-right:1px solid #111827;border-bottom:1px solid #111827;box-sizing:border-box}.print-table__corner,.print-table__period{background:#1e293b;color:#fff;text-align:center;min-height:42px;padding:4px 2px}.print-table__period{display:flex;flex-direction:column;justify-content:center;font-size:9px}.print-table__period span{font-size:6px;font-weight:400}.print-table__teaching{min-width:0}.print-table__break{background:#64748b!important;min-width:62px}.print-table__break strong{font-size:8px;letter-spacing:.2px}.print-table__break-cell{background:#fff!important;padding:0!important;border-right:2px solid #94a3b8!important;color:transparent!important;min-width:62px}.print-table__break-cell *{display:none!important}.print-table__row{display:contents}.print-table__day{background:#e2e8f0;font-size:9px;font-weight:800;padding:5px;display:flex;align-items:center}.print-table__cell{min-height:42px;padding:4px;text-align:center;display:flex;flex-direction:column;justify-content:center;overflow:hidden}.print-table__cell strong{font-size:10px;line-height:1.05}.print-table__cell small{font-size:7px;line-height:1.1;margin-top:2px}.print-table__break-cell{background:#e2e8f0!important}.print-table--dense .print-table__cell{min-height:30px;padding:2px}.print-table--dense .print-table__cell small{display:none}
            .timetable-print-preview__footer{flex:0 0 auto;border-top:1px solid #94a3b8;margin-top:5px;padding-top:4px;display:flex;justify-content:space-between;gap:12px;font-size:8px;font-weight:700;color:#334155}.timetable-print-preview__footer span:last-child{text-align:right}.summary-grid{display:grid;grid-template-columns:70px repeat(var(--summary-cols),minmax(34px,1fr));border-top:1px solid #111827;border-left:1px solid #111827;--summary-cols:${Math.max(1, activeDays.length * teachingPeriods.length)}}.summary-grid__corner,.summary-grid__head,.summary-grid__label,.summary-grid__cell{border-right:1px solid #111827;border-bottom:1px solid #111827;box-sizing:border-box}.summary-grid__corner,.summary-grid__head{background:#1e293b;color:#fff;font-size:7px;font-weight:800;text-align:center;padding:4px 2px}.summary-grid__label{background:#e2e8f0;font-size:8px;font-weight:800;padding:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.summary-grid__cell{height:24px;font-size:7px;font-weight:800;text-align:center;padding:3px;display:flex;align-items:center;justify-content:center;overflow:hidden}
            @media print{body *{visibility:hidden!important}.timetable-print-preview,.timetable-print-preview *{visibility:visible!important}.timetable-print-preview{position:absolute!important;inset:0!important;background:#fff!important}.timetable-print-preview__toolbar{display:none!important}.timetable-print-preview__pages{padding:0!important;overflow:visible!important}.timetable-print-preview__nav{display:none!important}.timetable-print-preview__stage{display:block!important;width:100%!important;height:100%!important}.timetable-print-preview__paper{width:100%!important;height:auto!important;min-height:0!important;box-shadow:none!important;padding:8mm!important}.timetable-print-preview__content{overflow:visible!important}@page{size:landscape;margin:0}}
          `}</style>
          <div className="timetable-print-preview__toolbar">
            <button type="button" className="primary" onClick={() => window.print()}>Print</button>
            <span>Select your report</span>
            <select value={printReport} onChange={(event) => changeReport(event.target.value as Report)} aria-label="Select your report">
              {REPORTS.map((report) => <option key={report} value={report}>{report}</option>)}
            </select>
            <button type="button" className="close" onClick={() => setShowPrintPreview(false)}>Close preview</button>
          </div>
          <div className="timetable-print-preview__pages">
            <div className="timetable-print-preview__stage">
              <div className="timetable-print-preview__nav" aria-label="Print preview pages">
                <button type="button" onClick={() => setPrintPage((page) => Math.max(0, page - 1))} disabled={printPage === 0} aria-label="Previous page" title="Previous page">‹</button>
                <span className="timetable-print-preview__page-label">{printPage + 1}/{pageCount}</span>
                <button type="button" onClick={() => setPrintPage((page) => Math.min(pageCount - 1, page + 1))} disabled={printPage >= pageCount - 1} aria-label="Next page" title="Next page">›</button>
              </div>
              <div className="timetable-print-preview__paper">
                <div className="timetable-print-preview__content">
                  <h1 className="timetable-print-preview__title">{printEntity?.label || 'Whole School'}</h1>
                  <p className="timetable-print-preview__subtitle">{printReport}</p>
                  <div className="timetable-print-preview__meta"><span>{activeDays.map(dayLabel).join(' · ')}</span></div>
                  {renderPrintPage()}
                </div>
                <footer className="timetable-print-preview__footer">
                  <span>Phikila Timetables</span>
                  <span>{printTimestamp || new Date().toLocaleString()}</span>
                </footer>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .timetable__whole-scroll{position:relative;width:100%;height:85vh;overflow:auto;min-width:0;border:1px solid #d1d5db;background:#fff}.timetable__whole-school-grid{display:grid;grid-template-columns:75px repeat(var(--tt-whole-columns,1),38px);grid-template-rows:20px 20px repeat(var(--tt-whole-rows,1),18px);width:max-content;min-width:max-content;background:#fff}.timetable__whole-corner,.timetable__whole-day-head,.timetable__whole-period-head,.timetable__whole-class-label,.timetable__whole-slot{box-sizing:border-box;border-right:1px solid #fff;border-bottom:1px solid #fff}.timetable__whole-corner,.timetable__whole-day-head,.timetable__whole-period-head{background:#111827;color:#fff;font-size:9px;font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap}.timetable__whole-corner{width:75px;min-width:75px;max-width:75px;height:20px}.timetable__whole-corner--sticky{position:sticky;left:0;z-index:30}.timetable__whole-corner--top{top:0}.timetable__whole-day-head{height:20px;min-width:38px;position:sticky;top:0;z-index:20}.timetable__whole-period-head{width:38px;min-width:38px;max-width:38px;height:20px;position:sticky;top:20px;z-index:19;flex-direction:column;gap:0}.timetable__whole-period-head .timetable__period{font-size:9px;font-weight:800;line-height:9px}.timetable__whole-period-head .timetable__clock{font-size:5px;line-height:6px;white-space:nowrap;transform:scale(.9);transform-origin:center}.timetable__whole-period-row-label{top:20px;z-index:30}.timetable__whole-row{display:contents}.timetable__whole-class-label{width:75px;min-width:75px;max-width:75px;height:18px;position:sticky;left:0;z-index:10;background:#e5e7eb;color:#111827;font-size:8px;font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.timetable__whole-slot{width:38px;min-width:38px;max-width:38px;height:18px;min-height:18px;background:#f9fafb;position:relative;overflow:hidden;font-size:8px;font-weight:700;text-align:center}.timetable__whole-slot--now{box-shadow:inset 0 0 0 1px #111827}.timetable__whole-slot .lesson-card{width:100%;height:100%;min-width:0;min-height:0;margin:0;border:1px solid transparent;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0 1px}.timetable__whole-slot .lesson-card__subject{font-size:8px;font-weight:800;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timetable__whole-slot .lesson-card__class,.timetable__whole-slot .lesson-card__time{display:none}.timetable__whole-hoverbar{position:sticky;left:0;bottom:0;z-index:40;width:100%;height:30px;box-sizing:border-box;background:#111827;color:#f1c40f;display:flex;align-items:center;padding:0 8px;font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timetable__asc-toolbar{display:flex;align-items:center;gap:8px;background:#f8fafc;border-bottom:1px solid #cbd5e1;padding:4px 6px;font-size:11px}.timetable__asc-view{font-weight:800;padding:0 5px}.timetable__asc-button{border:1px solid #cbd5e1;background:#fff;border-radius:3px;padding:4px 9px;font-size:11px;cursor:pointer}.timetable__asc-button--primary{background:#2563eb;border-color:#2563eb;color:#fff}.timetable__cell--now{box-shadow:inset 0 0 0 2px #111827;background-image:linear-gradient(rgba(255,255,255,.18),rgba(255,255,255,.18))}@media(max-width:700px){.timetable__whole-school-grid{grid-template-columns:60px repeat(var(--tt-whole-columns,1),34px)}.timetable__whole-corner,.timetable__whole-class-label{width:60px;min-width:60px;max-width:60px}.timetable__whole-slot,.timetable__whole-period-head,.timetable__whole-day-head{width:34px;min-width:34px;max-width:34px}}
      `}</style>
    </div>
  )
}
