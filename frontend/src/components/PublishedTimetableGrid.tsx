import type { TimetableView } from '../lib/scheduling'
import './timetable-time-grid.css'
import './timetable-subject-colours.css'

function minutes(value: string) { const [h, m] = value.split(':').map(Number); return h * 60 + m }
function validColour(value: string | undefined) { return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : undefined }
function compactClass(value: string) { const text = value.trim(); const match = text.match(/\b(?:Grade\s*)?(\d+)([A-Za-z][A-Za-z0-9-]*)?\b/i); return match ? `${match[1]}${match[2] ?? ''}` : text }
function dayLabel(day: { name: string; date?: string; date_label?: string }) { return day.date_label || day.date ? `${day.name} · ${day.date_label ?? day.date}` : day.name }
function generatedTimestamp() { return new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) }
type Props = { view: TimetableView; mode: 'teacher' | 'class' }

export function PublishedTimetableGrid({ view, mode }: Props) {
  const periods = [...view.periods].sort((a, b) => minutes(a.start_time) - minutes(b.start_time) || a.index - b.index)
  const days = view.days
  const periodCount = Math.max(1, periods.length)
  const dayCount = Math.max(1, days.length)
  const columnTemplate = `7rem repeat(${periodCount}, minmax(0, 1fr))`

  return <div className="timetable timetable--published timetable--entity">
    <div className="entity-timetable-grid" style={{
      gridTemplateColumns: columnTemplate,
      gridTemplateRows: `1.6rem repeat(${dayCount}, 2.35rem)`,
      '--tt-day-count': dayCount,
      '--tt-period-count': periodCount,
    } as React.CSSProperties}>
      <div className="entity-timetable-corner">Day / Date</div>
      {periods.map((period, column) => <div className={`entity-timetable-period ${!period.is_teaching ? 'entity-timetable-period--break' : ''}`} style={{ gridColumn: column + 2, gridRow: 1 }} key={period.index}>
        {period.is_teaching ? <><span>{period.name}</span><small>{period.start_time}–{period.end_time}</small></> : <span>{period.name || 'BREAK'}</span>}
      </div>)}
      {days.map((day, row) => <div className="entity-timetable-day" style={{ gridColumn: 1, gridRow: row + 2 }} key={day.index}>{dayLabel(day)}</div>)}
      {periods.flatMap((period, column) => {
        if (!period.is_teaching) return <div className="entity-timetable-cell entity-timetable-cell--break entity-timetable-cell--break-span" style={{ gridColumn: column + 2 }} key={`break-${period.index}`}><span>{period.name || 'BREAK'}</span></div>
        return days.map((day, row) => {
          const lesson = view.lessons.find((item) => item.day === day.index && item.period === period.index)
          const colour = lesson ? validColour(lesson.subject_colour) : undefined
          const secondary = mode === 'class' ? (lesson?.teacher || '—') : compactClass(lesson?.class || '—')
          return <div className="entity-timetable-cell" style={{ gridColumn: column + 2, gridRow: row + 2 }} key={`${day.index}-${period.index}`}>
            {lesson ? <div className="entity-lesson-card" style={{ '--subject-colour': colour ?? '#0F2A47' } as React.CSSProperties} title={mode === 'class' ? lesson.teacher : undefined}><strong>{lesson.subject}</strong><span>{secondary}</span></div> : null}
          </div>
        })
      })}
    </div>
    <div className="timetable__print-footer"><span className="timetable__print-generated">Timetable generated: {generatedTimestamp()}</span><span className="timetable__print-brand">@Phikila Timetables</span></div>
  </div>
}
