import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { ClassRegister } from '../lib/types'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

export default function ClassRegisters() {
  const [classes, setClasses] = useState<ClassRegister[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getClassRegisters()
      .then(setClasses)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner text="Loading class registers…" />

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">People</p>
        <h1 className="page-title">Class Registers</h1>
        <p className="muted">Set up classes and assign class teachers.</p>
      </header>

      {error && <div className="toast toast--error">{error}</div>}

      {classes.length === 0 ? (
        <EmptyState
          icon="🏫"
          title="No classes yet"
          description="Create class registers to organize students into groups."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Academic Year</th>
                <th>Grade/Form</th>
                <th>Stream</th>
                <th>Room</th>
                <th>Capacity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <td><span className="code-badge">#{c.id}</span></td>
                  <td className="td-bold">Year {c.academic_year_id}</td>
                  <td>Form {c.grade_form_id}</td>
                  <td>Stream {c.stream_id}</td>
                  <td className="td-muted">{c.room_id || '—'}</td>
                  <td>{c.capacity}</td>
                  <td>
                    <span className={`status-pill status-pill--${c.status.toLowerCase()}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
