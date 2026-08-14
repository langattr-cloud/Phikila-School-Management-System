import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Examination } from '../lib/types'
import Modal from '../components/ui/Modal'
import FormField from '../components/ui/FormField'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

export default function Examinations() {
  const [exams, setExams] = useState<Examination[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', academic_year: '', term: '' })

  useEffect(() => { loadExams() }, [])

  async function loadExams() {
    try {
      setLoading(true)
      setExams(await api.getExaminations())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load examinations')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    try {
      setSaving(true)
      await api.createExamination(form)
      await loadExams()
      setShowCreate(false)
      setForm({ name: '', academic_year: '', term: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create examination')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading examinations…" />

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Operations</p>
        <h1 className="page-title">Examinations</h1>
        <p className="muted">Manage exams, grading, and report cards.</p>
      </header>

      {error && <div className="toast toast--error">{error}</div>}

      <div className="toolbar">
        <p className="toolbar-count">{exams.length} examination{exams.length !== 1 ? 's' : ''}</p>
        <button className="btn btn--primary" type="button" onClick={() => setShowCreate(true)}>
          + New Examination
        </button>
      </div>

      {exams.length === 0 ? (
        <EmptyState
          icon="📝"
          title="No examinations yet"
          description="Create examinations to start recording assessment results."
          action={
            <button className="btn btn--primary" type="button" onClick={() => setShowCreate(true)}>
              Create Examination
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Academic Year</th>
                <th>Term</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id}>
                  <td className="td-bold">{e.name}</td>
                  <td>{e.academic_year}</td>
                  <td>{e.term}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Examination">
        <div className="form-grid">
          <FormField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required placeholder="e.g. Mid-Term 1" />
          <FormField label="Academic Year" value={form.academic_year} onChange={(v) => setForm({ ...form, academic_year: v })} required placeholder="e.g. 2026" />
          <FormField label="Term" value={form.term} onChange={(v) => setForm({ ...form, term: v })} required placeholder="e.g. Term 1" />
        </div>
        <div className="modal-actions">
          <button className="btn btn--ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn btn--primary" type="button" onClick={handleCreate} disabled={saving || !form.name || !form.academic_year || !form.term}>
            {saving ? 'Creating…' : 'Create Examination'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
