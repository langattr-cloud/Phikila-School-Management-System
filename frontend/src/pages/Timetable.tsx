import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { TimetableEntry } from '../lib/types'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const PERIODS = Array.from({ length: 8 }, (_, i) => i + 1)

export default function Timetable() {
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getTimetableEntries()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load timetable'))
      .finally(() => setLoading(false))
  }, [])

  function getEntry(day: string, period: number) {
    return entries.find((e) => e.day_of_week === day && e.period_id === period)
  }

  if (loading) return <LoadingSpinner text="Loading timetable…" />

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Operations</p>
        <h1 className="page-title">Timetable</h1>
        <p className="muted">Schedule lessons, manage periods, and resolve clashes.</p>
      </header>

      {error && <div className="toast toast--error">{error}</div>}

      {entries.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title="No timetable entries"
          description="Generate a timetable or manually schedule lessons to get started."
        />
      ) : (
        <div className="timetable-grid">
          <div className="timetable-header">
            <div className="timetable-corner">Period</div>
            {DAYS.map((day) => (
              <div key={day} className="timetable-day-header">{day}</div>
            ))}
          </div>
          {PERIODS.map((period) => (
            <div key={period} className="timetable-row">
              <div className="timetable-period">{period}</div>
              {DAYS.map((day) => {
                const entry = getEntry(day, period)
                return (
                  <div key={day} className={`timetable-cell${entry ? ' timetable-cell--filled' : ''}`}>
                    {entry ? (
                      <div className="timetable-lesson">
                        <span className="timetable-subject">Subj {entry.subject_id}</span>
                        <span className="timetable-meta">T{entry.teacher_id}</span>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
