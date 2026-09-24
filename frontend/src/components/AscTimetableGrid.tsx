import type { Lesson, Period } from '../../lib/scheduling'

type GridDay = { index: number; name: string }
type GridLesson = {
  day_index: number
  period_index: number
  subject: string
  secondary?: string | null
}

type Props = {
  title: string
  days: GridDay[]
  periods: Period[]
  lessons: GridLesson[]
}

const formatTime = (value: string) => value?.slice(0, 5) ?? ''

export default function AscTimetableGrid({ title, days, periods, lessons }: Props) {
  const lessonMap = new Map<string, GridLesson[]>()
  for (const lesson of lessons) {
    const key = `${lesson.day_index}:${lesson.period_index}`
    const current = lessonMap.get(key) ?? []
    current.push(lesson)
    lessonMap.set(key, current)
  }

  return (
    <div style={{ width: '100%', background: '#a8b0c0', padding: 20, boxSizing: 'border-box', overflowX: 'auto' }}>
      <div style={{ background: '#fff', width: 'max-content', minWidth: 900, margin: '0 auto', padding: '20px 20px 40px', boxShadow: '0 0 10px rgba(0,0,0,.3)', boxSizing: 'border-box' }}>
        <h1 style={{ margin: '0 0 14px', textAlign: 'center', fontSize: 18, fontWeight: 800 }}>{title}</h1>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'Arial, Helvetica, sans-serif' }}>
          <thead>
            <tr>
              <th style={{ width: 105, border: '1px solid #888', background: '#e9e9e9', padding: 7, fontSize: 11 }}>DAY</th>
              {periods.map((period) => (
                <th key={period.id} style={{ border: '1px solid #888', background: period.is_teaching ? '#f1f1f1' : '#d6d6d6', padding: '6px 4px', fontSize: 11 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{period.is_teaching ? period.short_form || period.name : ''}</div>
                  <div style={{ fontSize: 9, fontWeight: 500 }}>{formatTime(period.start_time)}–{formatTime(period.end_time)}</div>
                  {!period.is_teaching && <div style={{ fontSize: 9, fontWeight: 800 }}>{period.short_form || period.name}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.index}>
                <th style={{ border: '1px solid #888', background: '#e9e9e9', padding: 8, textAlign: 'left', fontSize: 12, fontWeight: 800 }}>
                  {day.name.toUpperCase()}
                </th>
                {periods.map((period) => {
                  const items = lessonMap.get(`${day.index}:${period.index}`) ?? []
                  return (
                    <td key={period.id} style={{ border: '1px solid #888', background: period.is_teaching ? '#fff' : '#d6d6d6', height: 68, padding: period.is_teaching ? 7 : 3, verticalAlign: 'middle', textAlign: 'center' }}>
                      {period.is_teaching ? items.map((item, index) => (
                        <div key={index} style={{ fontSize: 14, lineHeight: 1.15, fontWeight: 800, overflowWrap: 'anywhere' }}>
                          <div>{item.subject}</div>
                          {item.secondary && <div style={{ marginTop: 3, fontSize: 10, fontWeight: 600, color: '#555' }}>{item.secondary}</div>}
                        </div>
                      )) : (
                        <span style={{ fontSize: 9, fontWeight: 800, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                          {period.short_form || period.name}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
