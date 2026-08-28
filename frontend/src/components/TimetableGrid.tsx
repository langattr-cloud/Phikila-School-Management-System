import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { Lesson, Period, Subject, Teacher, Room, Day, SchoolClass } from '../lib/scheduling'
import { LockIcon } from './icons'
import './timetable-time-grid.css'
import './timetable-subject-colours.css'
import './timetable-asc-toolbar.css'
import './timetable-three-view.css'

type LessonMeta = {
  subjects: Map<number, Subject>
  teachers: Map<number, Teacher>
  rooms: Map<number, Room>
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
  onSelect?: (lesson: Lesson) => void
  onMove?: (lesson: Lesson, day: number, period: number) => void
  onResize?: (lesson: Lesson, duration: number) => void
  onDropUnassigned?: (unassignedId: number, day: number, period: number) => void
  secondary?: (lesson: Lesson) => string | null | undefined
  teacherInitials?: boolean
}

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function initials(name: string | null | undefined) {
  if (!name) return ''
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
}

const SUBJECT_COLOURS = ['#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#CA8A04', '#16A34A', '#0891B2', '#0F766E', '#4F46E5']

function colourFor(subject: Subject | undefined, index: number) {
  return subject?.colour && /^#[0-9A-Fa-f]{6}$/.test(subject.colour)
    ? subject.colour
    : SUBJECT_COLOURS[index % SUBJECT_COLOURS.length]
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
  zoom = 1,
  dense = false,
  currentSlot,
  onSelect,
  onMove,
  onResize,
  secondary,
  teacherInitials = false,
}: Props) {
  const [dragging, setDragging] = useState<Lesson | null>(null)
  const [carrying, setCarrying] = useState<Lesson | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const orderedPeriods = useMemo(
    () => [...periods].sort((a, b) => minutes(a.start_time) - minutes(b.start_time) || a.index - b.index),
    [periods],
  )

  const subjectIndexes = useMemo(() => {
    const subjects = [...meta.subjects.values()].sort((a, b) => a.id - b.id)
    return new Map(subjects.map((subject, index) => [subject.id, index]))
  }, [meta.subjects])

  const bySlot = useMemo(() => {
    const result = new Map<string, Lesson[]>()
    for (const lesson of lessons) {
      const key = `${lesson.day_index}:${lesson.period_index}`
      result.set(key, [...(result.get(key) ?? []), lesson])
    }
    return result
  }, [lessons])

  const wholeRows = useMemo(() => {
    const ids = [...new Set(lessons.map((lesson) => lesson.class_id))]
    return ids
      .map((id) => ({ id, name: meta.classes.get(id)?.name ?? `Class ${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [lessons, meta.classes])

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
    if (carrying) {
      moveLesson(carrying, day, period)
      return
    }
    const lesson = cellLessons.find((item) => !item.is_locked) ?? cellLessons[0]
    if (lesson) {
      onSelect?.(lesson)
      if (!lesson.is_locked) setCarrying(lesson)
    }
  }

  const renderCard = (lesson: Lesson, compact = false) => {
    const subject = meta.subjects.get(lesson.subject_id)
    const teacher = lesson.teacher_id ? meta.teachers.get(lesson.teacher_id) : null
    const room = lesson.room_id ? meta.rooms.get(lesson.room_id) : null
    const context = secondary?.(lesson)
    const teacherCode = teacher?.code?.trim() || teacher?.staff_number?.trim() || ''
    const subjectColour = colourFor(subject, subjectIndexes.get(lesson.subject_id) ?? 0)
    const conflict = conflicted?.has(lesson.id) ?? false
    const cardStyle = {
      '--subject-colour': subjectColour,
      backgroundColor: conflict ? '#FBE8E5' : `${subjectColour}1A`,
      borderLeftColor: conflict ? '#9A2F24' : subjectColour,
    } as CSSProperties

    return (
      <div
        key={lesson.id}
        className={[
          'lesson-card',
          compact ? 'lesson-card--compact' : '',
          selectedId === lesson.id ? 'lesson-card--selected' : '',
          conflict ? 'lesson-card--conflict' : '',
          lesson.is_locked ? 'lesson-card--locked' : '',
          carrying?.id === lesson.id ? 'lesson-card--carrying' : '',
        ].filter(Boolean).join(' ')}
        style={cardStyle}
        draggable={!readOnly && !lesson.is_locked}
        onDragStart={(event) => {
          if (lesson.is_locked) {
            event.preventDefault()
            return
          }
          setDragging(lesson)
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', String(lesson.id))
        }}
        onDragEnd={() => setDragging(null)}
        onClick={() => onSelect?.(lesson)}
        role="button"
        tabIndex={-1}
        aria-label={`${subject?.name ?? 'Lesson'}${context ? `, ${context}` : ''}`}
      >
        <span className="lesson-card__subject" style={{ color: subjectColour }}>
          {subject?.code ?? subject?.name ?? 'Lesson'}
        </span>
        {(view === 'whole-school' || view === 'teacher' || view === 'generic') && context && (
          <span className="lesson-card__line">{context}</span>
        )}
        {view === 'class' && teacherCode && <span className="lesson-card__line">{teacherCode}</span>}
        {view === 'class' && room?.name && <span className="lesson-card__line lesson-card__room">{room.name}</span>}
        {view === 'teacher' && teacherInitials && teacher?.name && (
          <span className="lesson-card__line">{initials(teacher.name)}</span>
        )}
        {conflict && <span className="lesson-card__flag">Conflict</span>}
        {lesson.is_locked && (
          <span className="lesson-card__lock" title="Locked">
            <LockIcon width={12} height={12} />
          </span>
        )}
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

  const wholeGridStyle = {
    '--tt-columns': days.map(() => 'minmax(150px, 1fr)').join(' '),
    '--tt-period-count': orderedPeriods.length || 1,
  } as CSSProperties

  const timeGridStyle = {
    '--tt-columns': orderedPeriods
      .map((period) => `${Math.max(1, minutes(period.end_time) - minutes(period.start_time))}fr`)
      .join(' '),
  } as CSSProperties

  const wholeSchoolGrid = (
    <div className="timetable__whole-school-grid" style={wholeGridStyle}>
      <div className="timetable__whole-corner">Grade / Stream</div>
      {days.map((day) => (
        <div key={day.index} className="timetable__whole-day-head">{day.name}</div>
      ))}
      {wholeRows.map((row) => (
        <div key={row.id} className="timetable__whole-row">
          <div className="timetable__whole-class-label">{row.name}</div>
          {days.map((day) => (
            <div key={day.index} className="timetable__whole-day-cell">
              {orderedPeriods.map((period) => {
                const cellLessons = lessons.filter(
                  (lesson) => lesson.class_id === row.id && lesson.day_index === day.index && lesson.period_index === period.index,
                )
                const key = `whole:${row.id}:${day.index}:${period.index}`
                const isBreak = !period.is_teaching
                const isTarget = hovered === key && Boolean(dragging || carrying)
                return (
                  <div
                    key={period.index}
                    className={[
                      'timetable__whole-period',
                      isBreak ? 'timetable__whole-period--break' : '',
                      currentSlot?.day === day.index && currentSlot.period === period.index ? 'timetable__whole-period--now' : '',
                      isTarget ? 'timetable__cell--target' : '',
                    ].filter(Boolean).join(' ')}
                    aria-label={`${row.name}, ${day.name}, ${period.name}`}
                    onDragOver={(event) => {
                      if (readOnly || isBreak || !dragging) return
                      event.preventDefault()
                      setHovered(key)
                    }}
                    onDragLeave={() => setHovered((value) => value === key ? null : value)}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (!isBreak && dragging) moveLesson(dragging, day.index, period.index)
                    }}
                  >
                    {isBreak ? <span className="timetable__whole-break">{period.name}</span> : cellLessons.map((lesson) => renderCard(lesson, true))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )

  const dayPeriodGrid = (
    <>
      {carrying && (
        <div className="timetable__carrying" role="status">
          Moving <strong>{meta.subjects.get(carrying.subject_id)?.name ?? 'lesson'}</strong>. Select another cell to place it.
          <button type="button" className="link" onClick={() => setCarrying(null)}>Cancel</button>
        </div>
      )}
      <div className="timetable__time-grid" style={timeGridStyle}>
        <div className="timetable__corner">Day</div>
        {orderedPeriods.map((period) => (
          <div key={period.index} className={`timetable__period-head ${!period.is_teaching ? 'timetable__period-head--break' : ''}`}>
            <span className="timetable__period">{period.name}</span>
            <span className="timetable__clock">{period.start_time}–{period.end_time}</span>
          </div>
        ))}
        {days.map((day) => (
          <div key={day.index} className="timetable__day-row">
            <div className="timetable__day-label">{day.name}</div>
            {orderedPeriods.map((period) => {
              const key = `${day.index}:${period.index}`
              const cellLessons = bySlot.get(key) ?? []
              const isBreak = !period.is_teaching
              const isTarget = hovered === key && Boolean(dragging || carrying)
              return (
                <div
                  key={period.index}
                  className={[
                    'timetable__cell',
                    isBreak ? 'timetable__cell--break' : '',
                    currentSlot?.day === day.index && currentSlot.period === period.index ? 'timetable__cell--now' : '',
                    isTarget ? 'timetable__cell--target' : '',
                    cellLessons.length === 0 ? 'timetable__cell--empty' : '',
                  ].filter(Boolean).join(' ')}
                  tabIndex={readOnly ? -1 : 0}
                  aria-label={`${day.name} ${period.name}`}
                  onKeyDown={(event) => handleCellKeyDown(event, day.index, period.index, cellLessons)}
                  onDragOver={(event) => {
                    if (readOnly || isBreak || !dragging) return
                    event.preventDefault()
                    setHovered(key)
                  }}
                  onDragLeave={() => setHovered((value) => value === key ? null : value)}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (!isBreak && dragging) moveLesson(dragging, day.index, period.index)
                  }}
                >
                  {isBreak ? <span className="timetable__break-vertical">•</span> : cellLessons.map((lesson) => renderCard(lesson))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )

  return (
    <div className={[
      'timetable',
      `timetable--zoom-${zoom === 0.75 ? '75' : zoom === 1.25 ? '125' : '100'}`,
      dense ? 'timetable--dense' : '',
      `timetable--${view}-view`,
    ].filter(Boolean).join(' ')}>
      {view === 'whole-school' ? wholeSchoolGrid : dayPeriodGrid}
    </div>
  )
}
