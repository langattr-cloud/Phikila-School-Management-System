import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import type { Day, Lesson, Period, Room, SchoolClass, Subject, Teacher } from '../lib/scheduling'
import { LockIcon } from './icons'

export type LessonMeta = {
  subjects: Map<number, Subject>
  teachers: Map<number, Teacher>
  rooms: Map<number, Room>
  classes: Map<number, SchoolClass>
}

/** Custom drag payload used to pull a requirement period from the unassigned panel. */
export const UNASSIGNED_DRAG_TYPE = 'application/x-phikila-unassigned'

type Props = {
  days: Day[]
  periods: Period[]
  lessons: Lesson[]
  meta: LessonMeta
  /** Lesson ids involved in a hard conflict. */
  conflicted?: Set<number>
  selectedId?: number | null
  readOnly?: boolean
  /** 0.75 | 1 | 1.25 grid zoom. */
  zoom?: number
  dense?: boolean
  /** Day/period index of "right now", if any, for the live highlight. */
  currentSlot?: { day: number; period: number } | null
  onSelect?: (lesson: Lesson) => void
  onMove?: (lesson: Lesson, day: number, period: number) => void
  onResize?: (lesson: Lesson, duration: number) => void
  onDropUnassigned?: (requirementId: number, day: number, period: number) => void
  /** Row label shown per lesson card, e.g. the class for a teacher's view. */
  secondary?: (lesson: Lesson) => string | null
}

/**
 * The timetable workspace grid.
 *
 * Desktop renders a real <table> so screen readers announce row/column
 * relationships. Below the md breakpoint the same data becomes a day-by-day
 * agenda, which keeps every value readable at 320px instead of forcing a
 * horizontal scroll through 5+ columns.
 */
export function TimetableGrid({
  days,
  periods,
  lessons,
  meta,
  conflicted,
  selectedId,
  readOnly = false,
  zoom = 1,
  dense = false,
  currentSlot,
  onSelect,
  onMove,
  onResize,
  onDropUnassigned,
  secondary,
}: Props) {
  const [dragging, setDragging] = useState<Lesson | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [externalDrag, setExternalDrag] = useState(false)
  const [resizing, setResizing] = useState<{ lessonId: number; duration: number } | null>(null)
  // Keyboard "pick up then place" alternative to dragging.
  const [carrying, setCarrying] = useState<Lesson | null>(null)
  const liveRef = useRef<HTMLParagraphElement>(null)

  const byslot = useMemo(() => {
    const map = new Map<string, Lesson[]>()
    for (const lesson of lessons) {
      const key = `${lesson.day_index}:${lesson.period_index}`
      const bucket = map.get(key)
      if (bucket) bucket.push(lesson)
      else map.set(key, [lesson])
    }
    return map
  }, [lessons])

  // A multi-period lesson renders only in its start cell; these cells just
  // show a subtle continuation strip.
  const coveredBy = useMemo(() => {
    const map = new Map<string, { lesson: Lesson; from: number }>()
    for (const lesson of lessons) {
      const duration = lesson.duration ?? 1
      for (let offset = 1; offset < duration; offset += 1) {
        map.set(`${lesson.day_index}:${lesson.period_index + offset}`, { lesson, from: offset })
      }
    }
    return map
  }, [lessons])

  const announce = (message: string) => {
    if (liveRef.current) liveRef.current.textContent = message
  }

  function describe(lesson: Lesson): string {
    const subject = meta.subjects.get(lesson.subject_id)?.name ?? 'Lesson'
    const extra = secondary?.(lesson)
    return extra ? `${subject}, ${extra}` : subject
  }

  function place(lesson: Lesson, day: number, period: number) {
    onMove?.(lesson, day, period)
    setCarrying(null)
    setDragging(null)
    setHovered(null)
    setExternalDrag(false)
  }

  function onCellKeyDown(event: KeyboardEvent, day: number, period: number, cellLessons: Lesson[]) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (readOnly) return
    event.preventDefault()

    if (carrying) {
      place(carrying, day, period)
      announce(`Moved ${describe(carrying)} to ${days.find((d) => d.index === day)?.name}, ${
        periods.find((p) => p.index === period)?.name
      }.`)
      return
    }
    const first = cellLessons[0]
    if (first) {
      setCarrying(first)
      onSelect?.(first)
      announce(`${describe(first)} picked up. Move to another cell and press Enter to place it.`)
    }
  }

  const teaching = periods.filter((p) => p.is_teaching)

  function isDragOverAllowed(event: DragEvent) {
    return Boolean(event.dataTransfer.types.includes(UNASSIGNED_DRAG_TYPE)) || dragging !== null
  }

  function handleResizeStart(event: PointerEvent, lesson: Lesson) {
    if (readOnly || !onResize) return
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const startDuration = lesson.duration ?? 1
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)

    const move = (ev: globalThis.PointerEvent) => {
      const delta = Math.round((ev.clientY - startY) / 30)
      const next = Math.min(10, Math.max(1, startDuration + delta))
      setResizing({ lessonId: lesson.id, duration: next })
    }
    const up = (ev: globalThis.PointerEvent) => {
      const delta = Math.round((ev.clientY - startY) / 30)
      const next = Math.min(10, Math.max(1, startDuration + delta))
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      setResizing(null)
      if (next !== startDuration) {
        onResize(lesson, next)
        announce(`Resized ${describe(lesson)} to ${next} ${next === 1 ? 'period' : 'periods'}.`)
      }
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  function renderCard(lesson: Lesson, compact = false) {
    const subject = meta.subjects.get(lesson.subject_id)
    const teacher = lesson.teacher_id ? meta.teachers.get(lesson.teacher_id) : null
    const room = lesson.room_id ? meta.rooms.get(lesson.room_id) : null
    const bad = conflicted?.has(lesson.id)
    const extra = secondary?.(lesson)
    const shownDuration =
      resizing?.lessonId === lesson.id ? resizing.duration : (lesson.duration ?? 1)

    return (
      <div
        key={lesson.id}
        className={[
          'lesson-card',
          bad ? 'lesson-card--conflict' : '',
          selectedId === lesson.id ? 'lesson-card--selected' : '',
          carrying?.id === lesson.id ? 'lesson-card--carrying' : '',
          compact ? 'lesson-card--compact' : '',
          shownDuration > 1 ? 'lesson-card--multi' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={
          {
            '--subject-colour': subject?.colour ?? '#0F2A47',
            '--span': String(Math.min(shownDuration, 4)),
          } as React.CSSProperties
        }
        draggable={!readOnly}
        onDragStart={(event: DragEvent) => {
          setDragging(lesson)
          event.dataTransfer.effectAllowed = 'move'
          // Firefox requires data to be set for a drag to start.
          event.dataTransfer.setData('text/plain', String(lesson.id))
        }}
        onDragEnd={() => setDragging(null)}
        onClick={() => onSelect?.(lesson)}
        role="button"
        tabIndex={-1}
        aria-label={`${describe(lesson)}${
          shownDuration > 1 ? `, ${shownDuration} periods` : ''
        }${bad ? '. Has a conflict' : ''}`}
      >
        <span className="lesson-card__subject">{subject?.name ?? 'Lesson'}</span>
        {extra && <span className="lesson-card__line">{extra}</span>}
        {teacher && <span className="lesson-card__line">{teacher.name}</span>}
        {room && <span className="lesson-card__line lesson-card__room">{room.name}</span>}
        {!room && <span className="lesson-card__line lesson-card__room">No room</span>}
        {shownDuration > 1 && (
          <span className="lesson-card__badge">{shownDuration} periods</span>
        )}
        {bad && (
          <span className="lesson-card__flag">
            {/* Text, not just colour, so the state survives colour-blindness. */}
            Conflict
          </span>
        )}
        {lesson.is_locked && (
          <span className="lesson-card__lock" title="Locked">
            <LockIcon width={12} height={12} />
          </span>
        )}
        {!readOnly && onResize && (
          <span
            className="lesson-card__resize"
            title="Drag to change the lesson duration"
            onPointerDown={(event) => handleResizeStart(event, lesson)}
            onDragStart={(event) => event.preventDefault()}
            aria-hidden="true"
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={[
        'timetable',
        `timetable--zoom-${zoom === 0.75 ? '75' : zoom === 1.25 ? '125' : '100'}`,
        dense ? 'timetable--dense' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="visually-hidden" aria-live="polite" ref={liveRef} />
      {carrying && (
        <div className="timetable__carrying" role="status">
          Moving <strong>{describe(carrying)}</strong>. Choose a cell and press Enter, or{' '}
          <button type="button" className="link" onClick={() => setCarrying(null)}>
            cancel
          </button>
          .
        </div>
      )}

      {/* Desktop / tablet: real table semantics */}
      <div className="timetable__scroll">
        <table className="timetable__table">
          <caption className="visually-hidden">
            Weekly timetable. Periods are rows, days are columns.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="timetable__time-head">
                Time
              </th>
              {days.map((day) => (
                <th
                  key={day.index}
                  scope="col"
                  className={currentSlot?.day === day.index ? 'timetable__day--today' : ''}
                >
                  {day.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => {
              if (!period.is_teaching) {
                return (
                  <tr key={period.index} className="timetable__break-row">
                    <th scope="row" className="timetable__time">
                      <span className="timetable__period">{period.name}</span>
                      <span className="timetable__clock">{period.start_time}</span>
                    </th>
                    <td colSpan={days.length}>
                      <span className="timetable__break">{period.name}</span>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={period.index}>
                  <th scope="row" className="timetable__time">
                    <span className="timetable__period">{period.name}</span>
                    <span className="timetable__clock">
                      {period.start_time}–{period.end_time}
                    </span>
                  </th>
                  {days.map((day) => {
                    const key = `${day.index}:${period.index}`
                    const continuation = coveredBy.get(key)
                    const cell = byslot.get(key) ?? []
                    const isTarget = hovered === key && (dragging !== null || externalDrag)
                    const isNow =
                      currentSlot?.day === day.index && currentSlot.period === period.index
                    if (continuation) {
                      return (
                        <td key={key} className="timetable__cell timetable__cell--continuation">
                          <span className="timetable__continuation" aria-hidden="true">
                            ↳ continues
                          </span>
                        </td>
                      )
                    }
                    return (
                      <td
                        key={key}
                        className={[
                          'timetable__cell',
                          isTarget ? 'timetable__cell--target' : '',
                          cell.length === 0 ? 'timetable__cell--empty' : '',
                          isNow ? 'timetable__cell--now' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        tabIndex={readOnly ? -1 : 0}
                        aria-label={`${day.name} ${period.name}${
                          cell.length ? `: ${cell.map(describe).join('; ')}` : ': free'
                        }`}
                        onKeyDown={(event) => onCellKeyDown(event, day.index, period.index, cell)}
                        onDragOver={(event) => {
                          if (readOnly || !isDragOverAllowed(event)) return
                          event.preventDefault()
                          event.dataTransfer.dropEffect = dragging ? 'move' : 'copy'
                          setExternalDrag(event.dataTransfer.types.includes(UNASSIGNED_DRAG_TYPE))
                          setHovered(key)
                        }}
                        onDragLeave={() => setHovered((current) => (current === key ? null : current))}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (dragging) {
                            place(dragging, day.index, period.index)
                            return
                          }
                          const raw = event.dataTransfer.getData(UNASSIGNED_DRAG_TYPE)
                          if (raw) {
                            setHovered(null)
                            setExternalDrag(false)
                            onDropUnassigned?.(Number(raw), day.index, period.index)
                          }
                        }}
                      >
                        {cell.map((lesson) => renderCard(lesson))}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: day-by-day agenda */}
      <div className="timetable__agenda">
        {days.map((day) => {
          const dayLessons = teaching
            .map((period) => ({ period, items: byslot.get(`${day.index}:${period.index}`) ?? [] }))
            .filter((row) => row.items.length > 0)
          return (
            <section key={day.index} className="agenda-day" aria-labelledby={`agenda-${day.index}`}>
              <h3 className="agenda-day__title" id={`agenda-${day.index}`}>
                {day.name}
                {currentSlot?.day === day.index && <span className="agenda-day__today">Today</span>}
              </h3>
              {dayLessons.length === 0 ? (
                <p className="agenda-day__empty">No lessons scheduled.</p>
              ) : (
                <ul className="agenda-list">
                  {dayLessons.map(({ period, items }) => (
                    <li className="agenda-row" key={period.index}>
                      <div className="agenda-row__time">
                        <span className="agenda-row__clock">{period.start_time}</span>
                        <span className="agenda-row__period">{period.name}</span>
                      </div>
                      <div className="agenda-row__body">{items.map((l) => renderCard(l, true))}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
