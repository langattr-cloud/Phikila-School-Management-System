import { useMemo, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react'
import type { Day, Lesson, Period, SchoolClass, Subject } from '../lib/scheduling'
import { LockIcon } from './icons'
import { timetableClassLabel } from './timetable-view-helpers'
import './timetable-time-grid.css'
import './timetable-subject-colours.css'
import './timetable-asc-toolbar.css'
import './timetable-three-view.css'
import './timetable-period-format.css'

type LessonMeta = { subjects: Map<number, Subject>; teachers: Map<number, { id: number; name: string; code?: string; staff_number?: string }>; rooms: Map<number, { id: number; name: string }>; classes: Map<number, SchoolClass> }
export type { LessonMeta }
export const UNASSIGNED_DRAG_TYPE = 'application/x-phikila-unassigned'
type ViewKind = 'whole-school' | 'class' | 'teacher' | 'generic'
type Props = { days: Day[]; periods: Period[]; lessons: Lesson[]; meta: LessonMeta; view?: ViewKind; conflicted?: Set<number>; selectedId?: number | null; readOnly?: boolean; zoom?: number; dense?: boolean; currentSlot?: { day: number; period: number } | null; timeFormat?: '24h' | '12h'; timeLayout?: 'split' | 'single'; onSelect?: (lesson: Lesson) => void; onMove?: (lesson: Lesson, day: number, period: number) => void; onResize?: (lesson: Lesson, duration: number) => void; onDropUnassigned?: (unassignedId: number, day: number, period: number) => void; secondary?: (lesson: Lesson) => string | null | undefined; teacherInitials?: boolean }

const minutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m }
const dayLabel = (day: Day) => { const item = day as Day & { date?: string; date_label?: string }; return item.date_label || item.date || day.name }
const formatTime = (value: string, format: '24h' | '12h') => { const [rawHour, minute] = value.split(':').map(Number); if (format === '24h') return `${String(rawHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; const suffix = rawHour >= 12 ? 'PM' : 'AM'; return `${rawHour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}` }

export function TimetableGrid({ days, periods, lessons, meta, view = 'whole-school', conflicted, selectedId, readOnly = false, currentSlot, timeFormat = '24h', timeLayout = 'split', onSelect, onMove, onResize, secondary, teacherInitials = false }: Props) {
  const [dragging, setDragging] = useState<Lesson | null>(null)
  const [carrying, setCarrying] = useState<Lesson | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const activeDays = useMemo(() => days.filter((day) => day.is_active), [days])
  const teachingPeriods = useMemo(() => [...periods].filter((period) => period.is_teaching).sort((a, b) => minutes(a.start_time) - minutes(b.start_time) || a.index - b.index), [periods])
  const periodsPerDay = teachingPeriods.length
  const wholeRows = useMemo(() => [...meta.classes.values()].sort((a, b) => { const ag = a.grade ?? ''; const bg = b.grade ?? ''; return ag.localeCompare(bg, undefined, { numeric: true }) || timetableClassLabel(a).localeCompare(timetableClassLabel(b), undefined, { numeric: true }) }), [meta.classes])
  const bySlot = useMemo(() => { const map = new Map<string, Lesson[]>(); for (const lesson of lessons) { const key = `${lesson.day_index}:${lesson.period_index}`; map.set(key, [...(map.get(key) ?? []), lesson]) } return map }, [lessons])
  const subjectIndexes = useMemo(() => new Map([...meta.subjects.values()].sort((a, b) => a.id - b.id).map((subject, index) => [subject.id, index])), [meta.subjects])

  const getSubjectColor = (code: string | undefined) => {
    const subject = [...meta.subjects.values()].find((item) => item.code === code)
    const color = (subject as Subject & { color?: string; colour?: string } | undefined)?.color || (subject as Subject & { colour?: string } | undefined)?.colour
    return color || '#F3F4F6'
  }
  const subjectColor = (subject: Subject | undefined) => {
    if (!subject) return '#F3F4F6'
    return getSubjectColor(subject.code)
  }

  const selectAppearanceCell = (type: 'lesson' | 'period' | 'day', label: string, details: { day?: number; period?: number; lessonId?: number } = {}) => {
    window.dispatchEvent(new CustomEvent('phikila:timetable-cell-selected', { detail: { type, label, ...details } }))
  }
  const moveLesson = (lesson: Lesson, day: number, period: number) => {
    if (readOnly || lesson.is_locked) return
    onMove?.(lesson, day, period)
    setDragging(null); setCarrying(null); setHovered(null)
  }
  const handleCellKeyDown = (event: KeyboardEvent, day: number, period: number, cellLessons: Lesson[]) => {
    if (readOnly || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    if (carrying) return moveLesson(carrying, day, period)
    const lesson = cellLessons.find((item) => !item.is_locked) ?? cellLessons[0]
    if (lesson) { onSelect?.(lesson); if (!lesson.is_locked) setCarrying(lesson) }
  }
  const slotHandlers = (key: string, day: number, period: number) => ({
    onDragOver: (event: DragEvent) => { if (readOnly || !dragging) return; event.preventDefault(); setHovered(key) },
    onDragLeave: () => setHovered((value) => value === key ? null : value),
    onDrop: (event: DragEvent) => { event.preventDefault(); if (dragging) moveLesson(dragging, day, period) },
  })

  const renderCard = (lesson: Lesson) => {
    const subject = meta.subjects.get(lesson.subject_id)
    const assignedClass = meta.classes.get(lesson.class_id)
    const teacher = lesson.teacher_id ? meta.teachers.get(lesson.teacher_id) : undefined
    const className = assignedClass ? timetableClassLabel(assignedClass) : '—'
    const teacherName = teacher?.name || teacher?.code || teacher?.staff_number || '—'
    const subjectName = subject?.name || subject?.code || 'Lesson'
    const subjectCode = subject?.code || subjectName
    const color = subjectColor(subject)
    const conflict = conflicted?.has(lesson.id) ?? false
    const period = teachingPeriods.find((item) => item.index === lesson.period_index)
    const title = `${subjectName} · ${className} · ${teacherName}`
    const style = { backgroundColor: conflict ? '#FBE8E5' : color, borderColor: conflict ? '#9A2F24' : color, '--subject-colour': color } as CSSProperties
    return <div key={lesson.id} className={`lesson-card ${selectedId === lesson.id ? 'lesson-card--selected' : ''} ${conflict ? 'lesson-card--conflict' : ''} ${lesson.is_locked ? 'lesson-card--locked' : ''}`} style={style} title={title} aria-label={title} role="button" tabIndex={-1} draggable={!readOnly && !lesson.is_locked}
      onDragStart={(event) => { if (lesson.is_locked) { event.preventDefault(); return }; setDragging(lesson); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(lesson.id)) }}
      onDragEnd={() => setDragging(null)}
      onClick={(event) => { event.stopPropagation(); onSelect?.(lesson); selectAppearanceCell('lesson', subjectName, { day: lesson.day_index, period: lesson.period_index, lessonId: lesson.id }) }}>
      <span className="lesson-card__subject">{subjectCode}</span>
      <span className="lesson-card__class">{view === 'teacher' ? className : (secondary?.(lesson) || (teacherInitials && teacher ? teacher.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 4).toUpperCase() : teacher?.code || teacher?.staff_number || '—'))}</span>
      {timeLayout === 'single' && period && <span className="lesson-card__time">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span>}
      {timeLayout === 'split' && period && <span className="lesson-card__time lesson-card__time--split"><span>{formatTime(period.start_time, timeFormat)}</span><span>{formatTime(period.end_time, timeFormat)}</span></span>}
      {lesson.is_locked && <span className="lesson-card__lock" title="Locked"><LockIcon width={12} height={12} /></span>}
      {!readOnly && !lesson.is_locked && onResize && <button type="button" className="lesson-card__resize" title="Extend lesson" aria-label="Extend lesson" onClick={(event) => { event.stopPropagation(); onResize(lesson, Math.min(10, (lesson.duration ?? 1) + 1)) }} />}
    </div>
  }

  const renderWholeSchool = () => {
    const totalColumns = Math.max(1, activeDays.length * Math.max(1, periodsPerDay))
    const gridStyle = { '--tt-period-count': periodsPerDay || 1, '--tt-whole-columns': totalColumns } as CSSProperties
    return <div className="timetable__whole-scroll">
      <div className="timetable__whole-school-grid" style={gridStyle}>
        <div className="timetable__whole-corner timetable__whole-corner--sticky">PERIOD / TIME</div>
        {activeDays.map((day) => <div key={`day-${day.index}`} className="timetable__whole-day-head" style={{ gridColumn: `span ${periodsPerDay || 1}` }} onClick={() => selectAppearanceCell('day', dayLabel(day), { day: day.index })}>{dayLabel(day).toUpperCase()}</div>)}
        <div className="timetable__whole-corner timetable__whole-period-row-label">PERIOD / TIME</div>
        {activeDays.flatMap((day) => teachingPeriods.map((period, index) => <div key={`period-${day.index}-${period.index}`} className="timetable__whole-period-head" onClick={() => selectAppearanceCell('period', `${period.name || `P${index + 1}`} ${formatTime(period.start_time, timeFormat)}–${formatTime(period.end_time, timeFormat)}`, { day: day.index, period: period.index })}><span className="timetable__period">{index + 1}</span><span className="timetable__clock">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span></div>))}
        {wholeRows.map((row) => <div key={row.id} className="timetable__whole-row">
          <div className="timetable__whole-class-label">{timetableClassLabel(row)}</div>
          {activeDays.flatMap((day) => teachingPeriods.map((period) => {
            const key = `whole:${row.id}:${day.index}:${period.index}`
            const cellLessons = lessons.filter((lesson) => lesson.class_id === row.id && lesson.day_index === day.index && lesson.period_index === period.index)
            const isTarget = hovered === key && Boolean(dragging || carrying)
            return <div key={`${row.id}-${day.index}-${period.index}`} className={`timetable__whole-slot ${currentSlot?.day === day.index && currentSlot.period === period.index ? 'timetable__whole-slot--now' : ''} ${isTarget ? 'timetable__cell--target' : ''}`} aria-label={`${timetableClassLabel(row)}, ${dayLabel(day)}, period ${teachingPeriods.findIndex((item) => item.index === period.index) + 1}`} tabIndex={readOnly ? -1 : 0}
              onClick={() => { if (cellLessons[0]) onSelect?.(cellLessons[0]); selectAppearanceCell('period', `Period ${teachingPeriods.findIndex((item) => item.index === period.index) + 1}`, { day: day.index, period: period.index }) }}
              onKeyDown={(event) => handleCellKeyDown(event, day.index, period.index, cellLessons)} {...slotHandlers(key, day.index, period.index)}>
              {cellLessons.map(renderCard)}
            </div>
          }))}
        </div>)}
      </div>
      <div className="timetable__whole-hoverbar" aria-live="polite">{hovered ? (() => { const match = /^whole:(\d+):(\d+):(\d+)$/.exec(hovered); const lesson = match ? lessons.find((item) => item.class_id === Number(match[1]) && item.day_index === Number(match[2]) && item.period_index === Number(match[3])) : undefined; if (!lesson) return 'Hover a lesson to see subject, class and teacher.'; const subject = meta.subjects.get(lesson.subject_id); const cls = meta.classes.get(lesson.class_id); const teacher = lesson.teacher_id ? meta.teachers.get(lesson.teacher_id) : undefined; return `${subject?.name || subject?.code || 'Subject'} · ${cls ? timetableClassLabel(cls) : 'Class'} · ${teacher?.name || teacher?.code || 'Teacher'}` })() : 'Hover a lesson to see subject, class and teacher.'}</div>
    </div>
  }

  const renderDayPeriod = () => <div className="timetable__time-grid" style={{ '--tt-period-count': periodsPerDay || 1 } as CSSProperties}>
    <div className="timetable__corner">Day / Date</div>
    {teachingPeriods.map((period, index) => <div key={period.index} className="timetable__period-head"><span className="timetable__period">{index + 1}</span><span className="timetable__clock">{formatTime(period.start_time, timeFormat)}–{formatTime(period.end_time, timeFormat)}</span></div>)}
    {activeDays.map((day) => <div key={day.index} className="timetable__day-row"><div className="timetable__day-label">{dayLabel(day)}</div>{teachingPeriods.map((period) => { const key = `${day.index}:${period.index}`; const cellLessons = bySlot.get(key) ?? []; return <div key={period.index} className={`timetable__cell ${hovered === key ? 'timetable__cell--target' : ''}`} tabIndex={readOnly ? -1 : 0} onKeyDown={(event) => handleCellKeyDown(event, day.index, period.index, cellLessons)} {...slotHandlers(key, day.index, period.index)}>{cellLessons.map(renderCard)}</div> })}</div>)}
  </div>

  const unused = subjectIndexes.size
  void unused
  return <div className={`timetable timetable--${view}-view`}><div className="timetable__format-hint">Click a lesson, period/time, or day/date cell to format its appearance.</div>{view === 'whole-school' ? renderWholeSchool() : renderDayPeriod()}
    <style>{`
      .timetable__whole-scroll{position:relative;width:100%;height:85vh;overflow:auto;min-width:0;border:1px solid #d1d5db;background:#fff}
      .timetable__whole-school-grid{display:grid;grid-template-columns:180px repeat(var(--tt-whole-columns,1),55px);grid-auto-rows:30px;width:max-content;min-width:max-content;background:#fff}
      .timetable__whole-corner,.timetable__whole-day-head,.timetable__whole-period-head,.timetable__whole-class-label,.timetable__whole-slot{box-sizing:border-box;border-right:1px solid #fff;border-bottom:1px solid #fff}
      .timetable__whole-corner,.timetable__whole-day-head,.timetable__whole-period-head{background:#111827;color:#fff;font-size:11px;font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center}
      .timetable__whole-corner{width:180px;min-width:180px;max-width:180px}
      .timetable__whole-corner--sticky,.timetable__whole-class-label{position:sticky;left:0;z-index:8}
      .timetable__whole-day-head{height:30px;min-width:55px}
      .timetable__whole-period-head{width:55px;min-width:55px;max-width:55px;height:30px;flex-direction:column;gap:1px}
      .timetable__whole-period-head .timetable__period{font-size:11px;font-weight:800;line-height:1}
      .timetable__whole-period-head .timetable__clock{font-size:8px;font-weight:600;line-height:1;white-space:nowrap}
      .timetable__whole-period-row-label{position:sticky;left:0;z-index:9}
      .timetable__whole-row{display:contents}
      .timetable__whole-class-label{width:180px;min-width:180px;max-width:180px;height:30px;background:#f3f4f6;color:#111827;padding:0 8px;display:flex;align-items:center;font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:5}
      .timetable__whole-slot{width:55px;min-width:55px;max-width:55px;height:30px;padding:1px;background:#f3f4f6;position:relative;overflow:hidden}
      .timetable__whole-slot--now{box-shadow:inset 0 0 0 2px #2563eb}
      .timetable__whole-slot .lesson-card{width:100%;height:100%;min-width:0;min-height:0;margin:0;padding:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;box-sizing:border-box;border:1px solid var(--subject-colour,#F3F4F6);border-radius:1px;overflow:hidden;cursor:pointer}
      .timetable__whole-slot .lesson-card__subject,.timetable__whole-slot .lesson-card__class,.timetable__whole-slot .lesson-card__time{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#111827;text-align:center;font-size:11px;line-height:1;font-weight:800}
      .timetable__whole-slot .lesson-card__class{font-size:9px}
      .timetable__whole-slot .lesson-card__time{font-size:7px;font-weight:600}
      .timetable__whole-slot .lesson-card__time--split{display:none}
      .timetable__whole-slot .lesson-card__lock,.timetable__whole-slot .lesson-card__resize{display:none}
      .timetable__whole-hoverbar{position:sticky;bottom:0;z-index:20;min-height:28px;padding:6px 10px;background:#111827;color:#fff;font-size:11px;font-weight:700;border-top:1px solid #374151}
      .timetable__whole-slot .lesson-card--conflict{background:#FBE8E5!important;border-color:#9A2F24!important}
      .timetable__whole-slot .lesson-card--selected{outline:2px solid #2563eb;outline-offset:-2px}
      @media(max-width:700px){.timetable__whole-school-grid{grid-template-columns:140px repeat(var(--tt-whole-columns,1),55px)}.timetable__whole-corner,.timetable__whole-class-label{width:140px;min-width:140px;max-width:140px}.timetable__whole-slot,.timetable__whole-period-head{width:55px;min-width:55px;max-width:55px}.timetable__whole-hoverbar{font-size:10px}}
    `}</style>
  </div>
}
