import { useMemo, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react'
import type { Day, Lesson, Period, SchoolClass, Subject } from '../lib/scheduling'
import { LockIcon } from './icons'
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

const hashString = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
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
  const values = [
    candidate.color,
    candidate.colour,
    candidate.background_color,
    candidate.backgroundColour,
    candidate.color_hex,
    candidate.colour_hex,
  ]
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() || null
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

  const activeDays = useMemo(() => days.filter((day) => day.is_active), [days])

  // Breaks remain available to the scheduling data, but are deliberately excluded
  // from the Whole School visual grid so the header is P1, P2, P3... only.
  const teachingPeriods = useMemo(
    () => [...periods]
      .filter((period) => period.is_teaching)
      .sort((a, b) => minutes(a.start_time) - minutes(b.start_time) || a.index - b.index),
    [periods],
  )
  const periodsPerDay = teachingPeriods.length

  const wholeRows = useMemo(
    () => [...meta.classes.values()].sort((a, b) => {
      const ag = a.grade ?? ''
      const bg = b.grade ?? ''
      return ag.localeCompare(bg, undefined, { numeric: true })
        || timetableClassLabel(a).localeCompare(timetableClassLabel(b), undefined, { numeric: true })
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

  // Resolve colours from Subject Setup by subject id first, then use a stable
  // light fallback palette for subjects without a configured colour. The CSS
  // card rules consume --subject-colour, so this value remains authoritative.
  const subjectColorMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const subject of meta.subjects.values()) {
      const configured = configuredSubjectColour(subject)
      const fallback = FALLBACK_SUBJECT_COLOURS[
        hashString(`${subject.id}:${subject.code ?? subject.name}`) % FALLBACK_SUBJECT_COLOURS.length
      ]
      map.set(subject.id, configured || fallback)
    }
    return map
  }, [meta.subjects])

  const getSubjectColor = (subject: Subject | undefined) =>
    (subject && subjectColorMap.get(subject.id)) || '#E5E7EB'

  const selectAppearanceCell = (
    type: 'lesson' | 'period' | 'day',
    label: string,
    details: { day?: number; period?: number; lessonId?: number } = {},
  ) => {
    window.dispatchEvent(new CustomEvent('phikila:timetable-cell-selected', {
      detail: { type, label, ...details },
    }))
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
    const className = assignedClass ? timetableClassLabel(assignedClass) : '—'
    const teacherName = teacher?.name || teacher?.code || teacher?.staff_number || '—'
    const subjectName = subject?.name || subject?.code || 'Lesson'
    const subjectCode = subject?.code || subjectName
    const color = getSubjectColor(subject)
    const conflict = conflicted?.has(lesson.id) ?? false
    const period = teachingPeriods.find((item) => item.index === lesson.period_index)
    const title = `${subjectName} · ${className} · ${teacherName}`
    const style = {
      backgroundColor: conflict ? '#FBE8E5' : color,
      borderColor: conflict ? '#9A2F24' : color,
      '--subject-colour': color,
    } as CSSProperties

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
          if (lesson.is_locked) {
            event.preventDefault()
            return
          }
          setDragging(lesson)
          setHoveredLesson(lesson)
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', String(lesson.id))
        }}
        onDragEnd={() => {
          setDragging(null)
          setHoveredLesson(null)
        }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect?.(lesson)
          selectAppearanceCell('lesson', subjectName, {
            day: lesson.day_index,
            period: lesson.period_index,
            lessonId: lesson.id,
          })
        }}
      >
        <span className="lesson-card__subject">{subjectCode}</span>
        <span className="lesson-card__class">
          {view === 'teacher'
            ? className
            : (secondary?.(lesson)
              || (teacherInitials && teacher
                ? teacher.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 4).toUpperCase()
                : teacher?.code || teacher?.staff_number || '—'))}
        </span>
        {timeLayout === 'single' && period && (
          <span className="lesson-card__time">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span>
        )}
        {timeLayout === 'split' && period && (
          <span className="lesson-card__time lesson-card__time--split">
            <span>{formatTime(period.start_time, timeFormat)}</span>
            <span>{formatTime(period.end_time, timeFormat)}</span>
          </span>
        )}
        {lesson.is_locked && <span className="lesson-card__lock" title="Locked"><LockIcon width={12} height={12} /></span>}
        {!readOnly && !lesson.is_locked && onResize && (
          <button
            type="button"
            className="lesson-card__resize"
            title="Extend lesson"
            aria-label="Extend lesson"
            onClick={(event) => {
              event.stopPropagation()
              onResize(lesson, Math.min(10, (lesson.duration ?? 1) + 1))
            }}
          />
        )}
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
    const gridStyle = {
      '--tt-period-count': periodsPerDay || 1,
      '--tt-whole-columns': totalColumns,
      '--tt-whole-rows': wholeRows.length || 1,
    } as CSSProperties

    return (
      <div className="timetable__whole-scroll">
        <div className="timetable__whole-school-grid" style={gridStyle}>
          <div className="timetable__whole-corner timetable__whole-corner--sticky timetable__whole-corner--top">PERIOD / TIME</div>
          {activeDays.map((day) => (
            <div
              key={`day-${day.index}`}
              className="timetable__whole-day-head"
              style={{ gridColumn: `span ${periodsPerDay || 1}` }}
              onClick={() => selectAppearanceCell('day', dayLabel(day), { day: day.index })}
            >
              {dayLabel(day).toUpperCase()}
            </div>
          ))}

          <div className="timetable__whole-corner timetable__whole-period-row-label timetable__whole-corner--sticky">PERIOD / TIME</div>
          {activeDays.flatMap((day) => teachingPeriods.map((period, index) => (
            <div
              key={`period-${day.index}-${period.index}`}
              className="timetable__whole-period-head"
              title={`${period.name || `P${index + 1}`} · ${formatTime(period.start_time, timeFormat)}–${formatTime(period.end_time, timeFormat)}`}
              onClick={() => selectAppearanceCell(
                'period',
                `${period.name || `P${index + 1}`} ${formatTime(period.start_time, timeFormat)}–${formatTime(period.end_time, timeFormat)}`,
                { day: day.index, period: period.index },
              )}
            >
              <span className="timetable__period">P{index + 1}</span>
              <span className="timetable__clock">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span>
            </div>
          )))}

          {wholeRows.map((row) => (
            <div key={row.id} className="timetable__whole-row">
              <div className="timetable__whole-class-label">{timetableClassLabel(row)}</div>
              {activeDays.flatMap((day) => teachingPeriods.map((period, index) => {
                const key = `whole:${row.id}:${day.index}:${period.index}`
                const cellLessons = lessons.filter((lesson) => lesson.class_id === row.id && lesson.day_index === day.index && lesson.period_index === period.index)
                const isTarget = hovered === key && Boolean(dragging || carrying)
                return (
                  <div
                    key={`${row.id}-${day.index}-${period.index}`}
                    className={`timetable__whole-slot ${currentSlot?.day === day.index && currentSlot.period === period.index ? 'timetable__whole-slot--now' : ''} ${isTarget ? 'timetable__cell--target' : ''}`}
                    aria-label={`${timetableClassLabel(row)}, ${dayLabel(day)}, period ${index + 1}`}
                    tabIndex={readOnly ? -1 : 0}
                    onClick={() => {
                      if (cellLessons[0]) onSelect?.(cellLessons[0])
                      selectAppearanceCell('period', `Period ${index + 1}`, { day: day.index, period: period.index })
                    }}
                    onKeyDown={(event) => handleCellKeyDown(event, day.index, period.index, cellLessons)}
                    {...slotHandlers(key, day.index, period.index)}
                  >
                    {cellLessons.map(renderCard)}
                  </div>
                )
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
      {teachingPeriods.map((period, index) => (
        <div key={period.index} className="timetable__period-head">
          <span className="timetable__period">P{index + 1}</span>
          <span className="timetable__clock">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span>
        </div>
      ))}
      {activeDays.map((day) => (
        <div key={day.index} className="timetable__day-row">
          <div className="timetable__day-label">{dayLabel(day)}</div>
          {teachingPeriods.map((period) => {
            const key = `${day.index}:${period.index}`
            const cellLessons = bySlot.get(key) ?? []
            return (
              <div
                key={period.index}
                className={`timetable__cell ${hovered === key ? 'timetable__cell--target' : ''}`}
                tabIndex={readOnly ? -1 : 0}
                onKeyDown={(event) => handleCellKeyDown(event, day.index, period.index, cellLessons)}
                {...slotHandlers(key, day.index, period.index)}
              >
                {cellLessons.map(renderCard)}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )

  return (
    <div className={`timetable timetable--${view}-view`}>
      <div className="timetable__format-hint">Click a lesson, period/time, or day/date cell to format its appearance.</div>
      {view === 'whole-school' ? renderWholeSchool() : renderDayPeriod()}
      <style>{`
        .timetable__whole-scroll{position:relative;width:100%;height:85vh;overflow:auto;min-width:0;border:1px solid #d1d5db;background:#fff}
        .timetable__whole-school-grid{display:grid;grid-template-columns:75px repeat(var(--tt-whole-columns,1),38px);grid-template-rows:20px 20px repeat(var(--tt-whole-rows,1),18px);width:max-content;min-width:max-content;background:#fff}
        .timetable__whole-corner,.timetable__whole-day-head,.timetable__whole-period-head,.timetable__whole-class-label,.timetable__whole-slot{box-sizing:border-box;border-right:1px solid #fff;border-bottom:1px solid #fff}
        .timetable__whole-corner,.timetable__whole-day-head,.timetable__whole-period-head{background:#111827;color:#fff;font-size:9px;font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap}
        .timetable__whole-corner{width:75px;min-width:75px;max-width:75px;height:20px}
        .timetable__whole-corner--sticky{position:sticky;left:0;z-index:30}
        .timetable__whole-corner--top{top:0}
        .timetable__whole-day-head{height:20px;min-width:38px;position:sticky;top:0;z-index:20}
        .timetable__whole-period-head{width:38px;min-width:38px;max-width:38px;height:20px;position:sticky;top:20px;z-index:19;flex-direction:column;gap:0}
        .timetable__whole-period-head .timetable__period{font-size:9px;font-weight:800;line-height:9px}
        .timetable__whole-period-head .timetable__clock{font-size:5px;line-height:6px;white-space:nowrap;transform:scale(.9);transform-origin:center}
        .timetable__whole-period-row-label{top:20px;z-index:30}
        .timetable__whole-row{display:contents}
        .timetable__whole-class-label{width:75px;min-width:75px;max-width:75px;height:18px;position:sticky;left:0;z-index:10;background:#e5e7eb;color:#111827;font-size:8px;font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .timetable__whole-slot{width:38px;min-width:38px;max-width:38px;height:18px;min-height:18px;background:#f9fafb;position:relative;overflow:hidden;font-size:8px;font-weight:700;text-align:center}
        .timetable__whole-slot--now{box-shadow:inset 0 0 0 1px #111827}
        .timetable__whole-slot .lesson-card{width:100%;height:100%;min-width:0;min-height:0;margin:0;border:1px solid transparent;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0 1px}
        .timetable__whole-slot .lesson-card__subject{font-size:8px;font-weight:800;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .timetable__whole-slot .lesson-card__class,.timetable__whole-slot .lesson-card__time{display:none}
        .timetable__whole-hoverbar{position:sticky;left:0;bottom:0;z-index:40;width:100%;height:30px;box-sizing:border-box;background:#111827;color:#f1c40f;display:flex;align-items:center;padding:0 8px;font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        @media(max-width:700px){.timetable__whole-school-grid{grid-template-columns:60px repeat(var(--tt-whole-columns,1),34px)}.timetable__whole-corner,.timetable__whole-class-label{width:60px;min-width:60px;max-width:60px}.timetable__whole-slot,.timetable__whole-period-head,.timetable__whole-day-head{width:34px;min-width:34px;max-width:34px}}
      `}</style>
    </div>
  )
}