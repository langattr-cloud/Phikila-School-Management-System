import type { TimetableView } from '../lib/scheduling'
import './timetable-time-grid.css'
import './timetable-subject-colours.css'

function minutes(value: string) { const [h, m] = value.split(':').map(Number); return h * 60 + m }
function validColour(value: string | undefined) { return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : undefined }
function compactClass(value: string) { const match = value.trim().match(/\b\d+[A-Za-z][A-Za-z0-9-]*\b/); return match?.[0] ?? value.trim() }
type Props = { view: TimetableView; mode: 'teacher' | 'class' }

export function PublishedTimetableGrid({ view, mode }: Props) {
  const periods = [...view.periods].sort((a, b) => minutes(a.start_time) - minutes(b.start_time) || a.index - b.index)
  const columns = periods.map((p) => `${Math.max(1, minutes(p.end_time) - minutes(p.start_time))}fr`).join(' ')
  return <div className="timetable timetable--published"><div className="timetable__time-grid" style={{ '--tt-columns': columns } as React.CSSProperties}>
    <div className="timetable__corner">Day</div>
    {periods.map((p) => <div className={`timetable__period-head ${!p.is_teaching ? 'timetable__period-head--break' : ''}`} key={p.index}><span className="timetable__period">{p.name}</span><span className="timetable__clock">{p.start_time}–{p.end_time}</span></div>)}
    {view.days.map((day) => <div className="timetable__day-row" key={day.index}><div className="timetable__day-label">{day.name}</div>{periods.map((period) => { const lesson = view.lessons.find((item) => item.day === day.index && item.period === period.index); const isBreak = !period.is_teaching; const breakWord = period.name.trim().split(/\s+/).at(-1)?.replace(/[^A-Za-z]/g, '') || period.name.replace(/[^A-Za-z]/g, ''); const letter = breakWord[view.days.findIndex((d) => d.index === day.index)]?.toUpperCase() ?? breakWord[0]?.toUpperCase() ?? '•'; const colour = lesson ? validColour(lesson.subject_colour) : undefined; return <div className={`timetable__cell ${isBreak ? 'timetable__cell--break' : ''}`} key={period.index}>{isBreak ? <span className="timetable__break-vertical" aria-label={period.name}>{letter}</span> : lesson ? <div className="lesson-card lesson-card--published" style={{ '--subject-colour': colour ?? '#0F2A47' } as React.CSSProperties} title={mode === 'class' && lesson.teacher ? lesson.teacher : undefined}><span className="lesson-card__subject">{lesson.subject}</span><span className="lesson-card__class">{compactClass(lesson.class)}</span></div> : null}</div> })}</div>)}
  </div></div>
}
