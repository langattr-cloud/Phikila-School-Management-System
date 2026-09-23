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
    if (!lesson) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedPrintLesson(lesson)
  }

  useEffect(() => {
    if (view !== 'class' && view !== 'teacher') return
    document.addEventListener('contextmenu', openPrintSetupFromContext, true)
    return () => document.removeEventListener('contextmenu', openPrintSetupFromContext, true)
  }, [lessons, view])

  const activeDays = useMemo(() => days.filter((day) => day.is_active), [days])
  const displayPeriods = useMemo(
    () => [...periods].sort((a, b) => minutes(a.start_time) - minutes(b.start_time) || a.index - b.index),
    [periods],
  )
  const teachingPeriods = useMemo(() => displayPeriods.filter((period) => period.is_teaching), [displayPeriods])
  const printPeriods = useMemo(
    () => displayPeriods,
    [displayPeriods],
  )
  const periodsPerDay = displayPeriods.length

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

  const targetTeachingPeriods = (lesson: Lesson, period: number) => {
    const duration = Math.max(1, lesson.duration ?? 1)
    const ordered = [...displayPeriods].sort((a, b) => a.index - b.index)
    const teaching = ordered.filter((item) => item.is_teaching)
    const start = teaching.findIndex((item) => item.index === period)
    if (start < 0 || start + duration > teaching.length) return null
    const span = teaching.slice(start, start + duration)
    const positions = span.map((item) => ordered.findIndex((candidate) => candidate.index === item.index))
    if (!positions.every((position, index) => index === 0 || position === positions[index - 1] + 1)) return null
    return span
  }

  const spanIsContiguous = (lesson: Lesson, day: number, period: number) => Boolean(targetTeachingPeriods(lesson, period))

  const lessonOccupiesSlot = (lesson: Lesson, day: number, period: number) => {
    if (lesson.day_index !== day) return false
    const span = targetTeachingPeriods(lesson, lesson.period_index)
    return Boolean(span?.some((item) => item.index === period))
  }

  const lessonsShareMoveLane = (lesson: Lesson, candidate: Lesson) => {
    const sameClass = lesson.class_id === candidate.class_id
    const sameTeacher = lesson.teacher_id != null && lesson.teacher_id === candidate.teacher_id
    const sameRoom = lesson.room_id != null && lesson.room_id === candidate.room_id
    if (view === 'whole-school' || view === 'class') return sameClass || sameTeacher || sameRoom
    if (view === 'teacher') return sameTeacher || sameClass || sameRoom
    return sameClass || sameTeacher || sameRoom
  }

  const moveBlocker = (lesson: Lesson, day: number, period: number) => {
    const span = targetTeachingPeriods(lesson, period)
    if (!span) return { kind: 'span' as const, lesson: null as Lesson | null }
    for (const candidate of lessons) {
      if (candidate.id === lesson.id || !lessonsShareMoveLane(lesson, candidate)) continue
      if (span.some((slot) => lessonOccupiesSlot(candidate, day, slot.index))) {
        return { kind: 'occupied' as const, lesson: candidate }
      }
    }
    return null
  }

  const dragTargetState = (lesson: Lesson | null, day: number, period: number) => {
    if (!lesson) return 'none' as const
    if (!spanIsContiguous(lesson, day, period)) return 'invalid' as const
    if (moveBlocker(lesson, day, period)) return 'invalid' as const
    return 'valid' as const
  }

  const hoveredSpanContains = (day: number, period: number) => {
    if (!dragging || !hovered) return false
    const [hoverDay, hoverPeriod] = hovered.split(':').map(Number)
    if (hoverDay !== day) return false
    return Boolean(targetTeachingPeriods(dragging, hoverPeriod)?.some((slot) => slot.index === period))
  }

  const moveLesson = (lesson: Lesson, day: number, period: number) => {
    if (readOnly || lesson.is_locked) return
    if (!spanIsContiguous(lesson, day, period)) {
      window.dispatchEvent(new CustomEvent('phikila:timetable-error', { detail: { message: 'A multi-period lesson must occupy consecutive teaching periods and cannot cross a break.' } }))
      return
    }
    const blocker = moveBlocker(lesson, day, period)
    if (blocker?.kind === 'occupied') {
      window.dispatchEvent(new CustomEvent('phikila:timetable-error', { detail: { message: 'The full lesson span overlaps an existing lesson. Move it to a completely free span.' } }))
      return
    }
    if (blocker?.kind === 'span') {
      window.dispatchEvent(new CustomEvent('phikila:timetable-error', { detail: { message: 'The full lesson span cannot fit in the selected timetable range.' } }))
      return
    }
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
      if (dragging && (!spanIsContiguous(dragging, day, period) || Boolean(moveBlocker(dragging, day, period)))) {
        setHovered(key)
        return
      }
      setHovered(key)
    },
    onDragLeave: () => setHovered((value) => value === key ? null : value),
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      if (dragging) moveLesson(dragging, day, period)
    },
  })

  const renderCard = (lesson: Lesson, preview = false) => {
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
    const [hoveredDay, hoveredPeriod] = hovered ? hovered.split(':').map(Number) : [lesson.day_index, lesson.period_index]
    const effectivePeriodIndex = preview ? hoveredPeriod : lesson.period_index
    const effectiveDayIndex = preview ? hoveredDay : lesson.day_index
    const period = teachingPeriods.find((item) => item.index === effectivePeriodIndex)
    const duration = Math.max(1, lesson.duration ?? 1)
    const targetSpan = targetTeachingPeriods(lesson, effectivePeriodIndex)
    const span = targetSpan ?? []
    const contiguousSpan = Boolean(targetSpan)
    const startTeachingIndex = teachingPeriods.findIndex((item) => item.index === effectivePeriodIndex)
    const maxContiguousDuration = startTeachingIndex < 0 ? 1 : (() => {
      let count = 1
      for (let index = startTeachingIndex + 1; index < teachingPeriods.length; index += 1) {
        const previous = displayPeriods.findIndex((item) => item.index === teachingPeriods[index - 1].index)
        const current = displayPeriods.findIndex((item) => item.index === teachingPeriods[index].index)
        if (current !== previous + 1) break
        count += 1
      }
      return count
    })()
    const title = `${subjectName} · ${classLabel} · ${teacher?.name || teacherCode}${duration > 1 ? ` · ${duration} periods` : ''}`
    const spanLength = contiguousSpan ? duration : 1
    const style = { backgroundColor: conflict ? '#FBE8E5' : color, borderColor: conflict ? '#9A2F24' : color, '--subject-colour': color, '--lesson-span': spanLength } as CSSProperties

    return (
      <div
        key={lesson.id}
        className={`lesson-card ${preview ? `lesson-card--drag-preview lesson-card--drag-preview-${dragTargetState(lesson, lesson.day_index, effectivePeriodIndex)}` : ''} ${dragging?.id === lesson.id && !preview ? 'lesson-card--dragging' : ''} ${duration > 1 ? 'lesson-card--multi' : ''} ${contiguousSpan ? '' : 'lesson-card--invalid-span'} ${selectedId === lesson.id ? 'lesson-card--selected' : ''} ${conflict ? 'lesson-card--conflict' : ''} ${lesson.is_locked ? 'lesson-card--locked' : ''}`}
        style={style}
        title={title}
        aria-label={title}
        role="button"
        tabIndex={-1}
        draggable={!preview && !readOnly && !lesson.is_locked}
        onMouseEnter={() => { if (!preview) setHoveredLesson(lesson) }}
        onMouseLeave={() => { if (!preview) setHoveredLesson((value) => value?.id === lesson.id ? null : value) }}
        onDragStart={(event) => {
          if (lesson.is_locked) { event.preventDefault(); return }
          setDragging(lesson)
          setHoveredLesson(lesson)
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', String(lesson.id))
        }}
        onDragEnd={() => { setDragging(null); setHoveredLesson(null) }}
        data-lesson-id={lesson.id}
        data-drag-preview={preview ? 'true' : undefined}
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
        {!readOnly && !lesson.is_locked && onResize && <div className="lesson-card__resize-controls" onClick={(event) => event.stopPropagation()}><button type="button" className="lesson-card__resize lesson-card__resize--shrink" title={duration > 1 ? 'Shrink lesson' : 'Minimum duration'} aria-label={duration > 1 ? 'Shrink lesson' : 'Minimum duration'} disabled={duration <= 1} onClick={() => { if (duration > 1) onResize(lesson, duration - 1) }}>−</button><button type="button" className="lesson-card__resize lesson-card__resize--extend" title={duration < maxContiguousDuration && duration < 10 ? 'Extend lesson' : 'Maximum contiguous duration'} aria-label={duration < maxContiguousDuration && duration < 10 ? 'Extend lesson' : 'Maximum contiguous duration'} disabled={duration >= maxContiguousDuration || duration >= 10} onClick={() => { if (duration < maxContiguousDuration && duration < 10) onResize(lesson, duration + 1) }}>+</button></div>}
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
          {activeDays.flatMap((day) => displayPeriods.map((period, index) => (
            <div key={`period-${day.index}-${period.index}`} className={`timetable__whole-period-head ${period.is_teaching ? '' : 'timetable__break-head'}`} title={`${period.name || `P${index + 1}`} · ${formatTime(period.start_time, timeFormat)}–${formatTime(period.end_time, timeFormat)}`} onClick={() => selectAppearanceCell('period', `${period.name || `P${index + 1}`} ${formatTime(period.start_time, timeFormat)}–${formatTime(period.end_time, timeFormat)}`, { day: day.index, period: period.index })}>
              <span className="timetable__period">{period.is_teaching ? `P${teachingPeriods.findIndex((item) => item.index === period.index) + 1}` : period.short_form || period.name || 'BREAK'}</span><span className="timetable__clock">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span>
            </div>
          )))}
          {wholeRows.map((row) => (
            <div key={row.id} className="timetable__whole-row">
              <div className="timetable__whole-class-label">{timetableClassLabel(row)}</div>
              {activeDays.flatMap((day) => displayPeriods.map((period, index) => {
                const key = `whole:${row.id}:${day.index}:${period.index}`
                const cellLessons = lessons.filter((lesson) => lesson.class_id === row.id && lesson.day_index === day.index && lesson.period_index === period.index && !lessons.some((candidate) => candidate.id === lesson.id && candidate.period_index !== period.index))
                return <div key={`${row.id}-${day.index}-${period.index}`} className={`timetable__whole-slot ${period.is_teaching ? '' : 'timetable__whole-slot--break'} ${currentSlot?.day === day.index && currentSlot.period === period.index ? 'timetable__whole-slot--now' : ''} ${hoveredSpanContains(day.index, period.index) ? 'timetable__cell--target' : ''}`} aria-label={`${timetableClassLabel(row)}, ${dayLabel(day)}, ${period.is_teaching ? `period ${teachingPeriods.findIndex((item) => item.index === period.index) + 1}` : period.short_form || period.name || 'break'}`} tabIndex={readOnly || !period.is_teaching ? -1 : 0} onClick={() => { if (period.is_teaching && cellLessons[0]) onSelect?.(cellLessons[0]); selectAppearanceCell('period', period.is_teaching ? `Period ${teachingPeriods.findIndex((item) => item.index === period.index) + 1}` : period.short_form || period.name || 'BREAK', { day: day.index, period: period.index }) }} onKeyDown={(event) => handleCellKeyDown(event, day.index, period.index, cellLessons)} {...period.is_teaching ? slotHandlers(key, day.index, period.index) : {}}>{period.is_teaching && cellLessons.filter((lesson) => lesson.period_index === period.index).map((lesson) => renderCard(lesson))}{dragging && hovered === key ? renderCard(dragging, true) : null}</div>
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
      {displayPeriods.map((period, index) => <div key={period.index} className={`timetable__period-head ${period.is_teaching ? '' : 'timetable__break-head'}`}><span className="timetable__period">{period.is_teaching ? `P${teachingPeriods.findIndex((item) => item.index === period.index) + 1}` : period.short_form || period.name || 'BREAK'}</span><span className="timetable__clock">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span></div>)}
      {activeDays.map((day) => <div key={day.index} className="timetable__day-row"><div className="timetable__day-label">{dayLabel(day)}</div>{displayPeriods.map((period) => { const key = `${day.index}:${period.index}`; const cellLessons = (bySlot.get(key) ?? []).filter((lesson) => lesson.period_index === period.index); return <div key={period.index} className={`timetable__cell ${period.is_teaching ? '' : 'timetable__break-cell'} ${hoveredSpanContains(day.index, period.index) ? 'timetable__cell--target' : ''}`} data-day={day.index} data-period={period.index} tabIndex={readOnly || !period.is_teaching ? -1 : 0} onKeyDown={(event) => handleCellKeyDown(event, day.index, period.index, cellLessons)} onContextMenu={(event) => { if (view === 'class' || view === 'teacher') { event.preventDefault(); event.stopPropagation(); const lesson = cellLessons[0]; if (lesson) setSelectedPrintLesson(lesson) } }} {...slotHandlers(key, day.index, period.index)}>{cellLessons.map((lesson) => renderCard(lesson))}{dragging && hovered === key ? renderCard(dragging, true) : null}</div> })}</div>)}
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
        {printPeriods.map((period, index) => <div key={period.id} className={`print-table__period ${period.is_teaching ? '' : 'print-table__break'}`}><strong>{period.is_teaching ? `P${index + 1}` : period.short_form || period.name || 'BREAK'}</strong><span>{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span></div>)}
        {activeDays.map((day) => <div key={day.id} className="print-table__row"><div className="print-table__day">{dayLabel(day)}</div>{printPeriods.map((period) => { const lesson = lessonAt(day.index, period.index); const data = lesson ? printLesson(lesson) : null; return <div key={period.id} className={`print-table__cell ${period.is_teaching ? '' : 'print-table__break-cell'}`} style={data ? { backgroundColor: data.color } : undefined}>{data && <><strong>{data.subject}</strong><small>{printReport.includes('class') ? data.teacherCode : data.classCode}</small><small>{!dense && printReport.includes('class') ? data.room : ''}</small></>}</div> })}</div>)}
      </div>
    )
  }

  const renderSummaryGrid = (kind: 'class' | 'teacher' | 'room') => {
    const rows = kind === 'class' ? wholeRows.map((item) => ({ id: item.id, label: timetableClassLabel(item) })) : kind === 'teacher' ? [...meta.teachers.values()].sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({ id: item.id, label: item.name })) : [...meta.rooms.values()].sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({ id: item.id, label: item.name }))
    const lessonMatches = (rowId: number, day: Day, period: Period) => lessons.find((lesson) => (kind === 'class' ? lesson.class_id === rowId : kind === 'teacher' ? lesson.teacher_id === rowId : lesson.room_id === rowId) && lesson.day_index === day.index && lesson.period_index === period.index)
    return <div className="summary-grid"><div className="summary-grid__corner">{kind.toUpperCase()}</div>{activeDays.flatMap((day) => displayPeriods.map((period) => <div key={`${day.id}-${period.id}`} className={`summary-grid__head ${period.is_teaching ? '' : 'summary-grid__break-head'}`}>{day.name.slice(0, 3).toUpperCase()} {period.is_teaching ? `P${teachingPeriods.findIndex((item) => item.index === period.index) + 1}` : period.short_form || period.name || 'BREAK'}</div>))}{rows.map((row) => <div key={row.id} className="summary-grid__row"><div className="summary-grid__label">{row.label}</div>{activeDays.flatMap((day) => displayPeriods.map((period) => { const lesson = period.is_teaching ? lessonMatches(row.id, day, period) : null; const data = lesson ? printLesson(lesson) : null; return <div key={`${row.id}-${day.id}-${period.id}`} className={`summary-grid__cell ${period.is_teaching ? '' : 'summary-grid__break-cell'}`} style={data ? { backgroundColor: data.color } : undefined}>{data?.subject}</div> }))}</div>)}</div>
  }

  const renderPrintPage = () => {
    const summary = printReport === 'Summary timetable of classes' ? 'class' : printReport === 'Summary timetable of teachers' ? 'teacher' : printReport === 'Summary timetable of classrooms' ? 'room' : null
    const wall = printReport.startsWith('Wall poster')
    if (summary) return <>{renderSummaryGrid(summary)}</>
    if (wall) return <>{renderSummaryGrid(printReport.endsWith('classes') ? 'class' : 'teacher')}</>
    return renderPrintTable(printEntity?.id ?? 0)
  }

  const openPrintPreview = () => { setPrintPage(0); setShowPrintPreview(true) }
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
            .timetable-print-preview__pages{flex:1;overflow:auto;padding:28px;display:flex;justify-content:center;align-items:flex-start}
            .timetable-print-preview__paper{width:297mm;min-height:210mm;background:#fff;box-sizing:border-box;padding:10mm;box-shadow:0 8px 28px rgba(0,0,0,.28);color:#111827}
            .timetable-print-preview__title{text-align:center;margin:0 0 3px;font-size:18px;font-weight:800}.timetable-print-preview__subtitle{text-align:center;margin:0 0 12px;font-size:11px;color:#475569}.timetable-print-preview__meta{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid #111827;padding-bottom:6px;margin-bottom:8px;font-size:11px;font-weight:700}
            .print-table{display:grid;grid-template-columns:58px repeat(var(--print-periods),minmax(48px,1fr));border-top:1px solid #111827;border-left:1px solid #111827}.print-table{--print-periods:${printPeriods.length || 1}}
            .print-table__corner,.print-table__period,.print-table__day,.print-table__cell{border-right:1px solid #111827;border-bottom:1px solid #111827;box-sizing:border-box}.print-table__corner,.print-table__period{background:#1e293b;color:#fff;text-align:center;min-height:42px;padding:4px 2px}.print-table__period{display:flex;flex-direction:column;justify-content:center;font-size:9px}.print-table__period span{font-size:6px;font-weight:400}.print-table__break{background:#64748b!important}.print-table__row{display:contents}.print-table__day{background:#e2e8f0;font-size:9px;font-weight:800;padding:5px;display:flex;align-items:center}.print-table__cell{min-height:42px;padding:4px;text-align:center;display:flex;flex-direction:column;justify-content:center;overflow:hidden}.print-table__cell strong{font-size:10px;line-height:1.05}.print-table__cell small{font-size:7px;line-height:1.1;margin-top:2px}.print-table__break-cell{background:#e2e8f0!important}.print-table--dense .print-table__cell{min-height:30px;padding:2px}.print-table--dense .print-table__cell small{display:none}
            .summary-grid{display:grid;grid-template-columns:70px repeat(var(--summary-cols),minmax(34px,1fr));border-top:1px solid #111827;border-left:1px solid #111827;--summary-cols:${Math.max(1, activeDays.length * displayPeriods.length)}}.summary-grid__corner,.summary-grid__head,.summary-grid__label,.summary-grid__cell{border-right:1px solid #111827;border-bottom:1px solid #111827;box-sizing:border-box}.summary-grid__corner,.summary-grid__head{background:#1e293b;color:#fff;font-size:7px;font-weight:800;text-align:center;padding:4px 2px}.summary-grid__label{background:#e2e8f0;font-size:8px;font-weight:800;padding:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.summary-grid__break-head{background:#64748b!important}.summary-grid__break-cell{background:#e2e8f0!important}.summary-grid__cell{height:24px;font-size:7px;font-weight:800;text-align:center;padding:3px;display:flex;align-items:center;justify-content:center;overflow:hidden}
            @media print{body *{visibility:hidden!important}.timetable-print-preview,.timetable-print-preview *{visibility:visible!important}.timetable-print-preview{position:absolute!important;inset:0!important;background:#fff!important}.timetable-print-preview__toolbar{display:none!important}.timetable-print-preview__pages{padding:0!important;overflow:visible!important}.timetable-print-preview__paper{width:100%!important;min-height:0!important;box-shadow:none!important;padding:8mm!important}@page{size:landscape;margin:0}}
          `}</style>
          <div className="timetable-print-preview__toolbar">
            <button type="button" onClick={() => setPrintPage((page) => Math.max(0, page - 1))} disabled={printPage === 0}>Previous page</button>
            <button type="button" onClick={() => setPrintPage((page) => Math.min(pageCount - 1, page + 1))} disabled={printPage >= pageCount - 1}>Next page</button>
            <button type="button" className="primary" onClick={() => window.print()}>Print</button>
            <span>Select your report</span>
            <select value={printReport} onChange={(event) => changeReport(event.target.value as Report)} aria-label="Select your report">
              {REPORTS.map((report) => <option key={report} value={report}>{report}</option>)}
            </select>
            <span>Page: {Math.min(printPage + 1, pageCount)}/{pageCount}</span>
            <button type="button" className="close" onClick={() => setShowPrintPreview(false)}>Close preview</button>
          </div>
          <div className="timetable-print-preview__pages">
            <div className="timetable-print-preview__paper">
              <h1 className="timetable-print-preview__title">{printEntity?.label || 'Whole School'}</h1>
              <p className="timetable-print-preview__subtitle">{printReport}</p>
              <div className="timetable-print-preview__meta"><span>{activeDays.map(dayLabel).join(' · ')}</span><span>Page {printPage + 1} of {pageCount}</span></div>
              {renderPrintPage()}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .timetable__whole-scroll{position:relative;width:100%;height:85vh;overflow:auto;min-width:0;border:1px solid #d1d5db;background:#fff}.timetable__whole-school-grid{display:grid;grid-template-columns:75px repeat(var(--tt-whole-columns,1),38px);grid-template-rows:20px 20px repeat(var(--tt-whole-rows,1),18px);width:max-content;min-width:max-content;background:#fff}.timetable__whole-corner,.timetable__whole-day-head,.timetable__whole-period-head,.timetable__whole-class-label,.timetable__whole-slot{box-sizing:border-box;border-right:1px solid #fff;border-bottom:1px solid #fff}.timetable__whole-corner,.timetable__whole-day-head,.timetable__whole-period-head{background:#111827;color:#fff;font-size:9px;font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap}.timetable__whole-corner{width:75px;min-width:75px;max-width:75px;height:20px}.timetable__whole-corner--sticky{position:sticky;left:0;z-index:30}.timetable__whole-corner--top{top:0}.timetable__whole-day-head{height:20px;min-width:38px;position:sticky;top:0;z-index:20}.timetable__whole-period-head{width:38px;min-width:38px;max-width:38px;height:20px;position:sticky;top:20px;z-index:19;flex-direction:column;gap:0}.timetable__whole-period-head .timetable__period{font-size:9px;font-weight:800;line-height:9px}.timetable__whole-period-head .timetable__clock{font-size:5px;line-height:6px;white-space:nowrap;transform:scale(.9);transform-origin:center}.timetable__whole-period-row-label{top:20px;z-index:30}.timetable__whole-row{display:contents}.timetable__whole-class-label{width:75px;min-width:75px;max-width:75px;height:18px;position:sticky;left:0;z-index:10;background:#e5e7eb;color:#111827;font-size:8px;font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.timetable__whole-slot{width:38px;min-width:38px;max-width:38px;height:18px;min-height:18px;background:#f9fafb;position:relative;overflow:hidden;font-size:8px;font-weight:700;text-align:center}.timetable__break-head{background:#64748b!important;color:#fff}.timetable__break-cell{background:#e2e8f0!important;cursor:default}.timetable__whole-slot--break{background:#e2e8f0!important;cursor:default}.timetable__whole-slot--now{box-shadow:inset 0 0 0 1px #111827}.lesson-card--multi{min-height:calc(100% + 2px);}.lesson-card--dragging{opacity:.28}.lesson-card--drag-preview{pointer-events:none;opacity:.9;outline:2px dashed currentColor;outline-offset:-2px;z-index:30}.lesson-card--drag-preview-valid{outline-color:#15803d;box-shadow:inset 0 0 0 2px rgba(21,128,61,.25)}.lesson-card--drag-preview-invalid{outline-color:#b91c1c;box-shadow:inset 0 0 0 2px rgba(185,28,28,.25);opacity:.72}.timetable__cell:has(.lesson-card--drag-preview),.timetable__whole-slot:has(.lesson-card--drag-preview){overflow:visible;z-index:20}.lesson-card--invalid-span{outline:2px solid #b91c1c}.timetable__whole-slot .lesson-card{width:100%;height:100%;min-width:0;min-height:0;margin:0;border:1px solid transparent;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0 1px}.timetable__whole-slot .lesson-card__subject{font-size:8px;font-weight:800;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timetable__whole-slot .lesson-card__class,.timetable__whole-slot .lesson-card__time{display:none}.timetable__whole-hoverbar{position:sticky;left:0;bottom:0;z-index:40;width:100%;height:30px;box-sizing:border-box;background:#111827;color:#f1c40f;display:flex;align-items:center;padding:0 8px;font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timetable__asc-toolbar{display:flex;align-items:center;gap:8px;background:#f8fafc;border-bottom:1px solid #cbd5e1;padding:4px 6px;font-size:11px}.timetable__asc-view{font-weight:800;padding:0 5px}.timetable__asc-button{border:1px solid #cbd5e1;background:#fff;border-radius:3px;padding:4px 9px;font-size:11px;cursor:pointer}.timetable__asc-button--primary{background:#2563eb;border-color:#2563eb;color:#fff}@media(max-width:700px){.timetable__whole-school-grid{grid-template-columns:60px repeat(var(--tt-whole-columns,1),34px)}.timetable__whole-corner,.timetable__whole-class-label{width:60px;min-width:60px;max-width:60px}.timetable__whole-slot,.timetable__whole-period-head,.timetable__whole-day-head{width:34px;min-width:34px;max-width:34px}}
      `}</style>
    </div>
  )
}
