import { useEffect, useState } from 'react'
import { scheduling, type Calendar } from '../lib/scheduling'

/**
 * Visible day/period grid for marking time off. Each cell can be clicked to
 * switch between available (✓) and unavailable (X).
 */
export function AvailabilityEditor({
  value,
  onChange,
}: {
  value: Record<string, number[]>
  onChange: (next: Record<string, number[]>) => void
}) {
  const [calendar, setCalendar] = useState<Calendar | null>(null)

  useEffect(() => {
    let active = true
    scheduling.calendar().then((data) => {
      if (active) setCalendar(data)
    }).catch(() => {
      if (active) setCalendar({ days: [], periods: [] })
    })
    return () => { active = false }
  }, [])

  if (!calendar) return <p className="form__note">Loading time-off grid…</p>
  const days = calendar.days.filter((d) => d.is_active)
  const periods = calendar.periods.filter((p) => p.is_teaching)
  if (days.length === 0 || periods.length === 0) return <p className="form__note">Set up your working days and periods first to mark time off.</p>

  const isBlocked = (day: number, period: number) => (value[String(day)] ?? []).includes(period)
  function toggle(day: number, period: number) {
    const key = String(day); const current = new Set(value[key] ?? [])
    if (current.has(period)) current.delete(period); else current.add(period)
    const next = { ...value }
    if (current.size === 0) delete next[key]; else next[key] = [...current].sort((a, b) => a - b)
    onChange(next)
  }

  const blocked = Object.values(value).flat().length
  return (
    <fieldset className="availability">
      <legend className="field__label">Time off grid</legend>
      <p className="field__hint">Click a box to mark that day and period as unavailable. <strong>✓ Available</strong> · <strong>X Time off</strong>. {blocked} period{blocked === 1 ? '' : 's'} currently blocked.</p>
      <div className="availability__scroll">
        <table className="availability__table">
          <thead><tr><th scope="col"><span className="visually-hidden">Day</span></th>{periods.map((period) => <th key={period.index} scope="col" title={`${period.start_time}–${period.end_time}`}>{period.name}</th>)}</tr></thead>
          <tbody>{days.map((day) => <tr key={day.index}>
            <th scope="row">{day.name}</th>
            {periods.map((period) => {
              const checked = isBlocked(day.index, period.index)
              return <td key={period.index}>
                <label className="availability__cell" title={`${day.name}, ${period.name}: ${checked ? 'Time off' : 'Available'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(day.index, period.index)} aria-label={`${day.name} ${period.name} ${checked ? 'time off' : 'available'}`} />
                  <span className="availability__box" aria-hidden="true">{checked ? 'X' : '✓'}</span>
                </label>
              </td>
            })}
          </tr>)}</tbody>
        </table>
      </div>
      {blocked > 0 && <button type="button" className="button button--ghost button--sm" onClick={() => onChange({})}>Clear all</button>}
    </fieldset>
  )
}
