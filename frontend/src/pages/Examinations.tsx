import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Examination } from '../lib/types'
import { useToast } from '../context/ToastContext'
import DataTable, { type Column } from '../components/ui/DataTable'
import Modal from '../components/ui/Modal'
import FormField from '../components/ui/FormField'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function Examinations() {
  const { success, error: toastError } = useToast()
  const [exams, setExams] = useState<Examination[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', academic_year: '', term: '' })

  useEffect(() => { loadExams() }, [])

  async function loadExams() {
    try {
      setLoading(true)
      setExams(await api.getExaminations())
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load examinations')
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
      success('Examination created successfully')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create examination')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading examinations…" />

  const columns: Column<Record<string, unknown>>[] = [
    { key: 'name', header: 'Name', sortable: true, className: 'td-bold' },
    { key: 'academic_year', header: 'Academic Year', sortable: true },
    { key: 'term', header: 'Term', sortable: true },
  ]

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Operations</p>
        <h1 className="page-title">Examinations</h1>
        <p className="muted">Manage exams, grading, and report cards.</p>
      </header>

      <DataTable
        columns={columns}
        data={exams as unknown as Record<string, unknown>[]}
        searchPlaceholder="Search examinations…"
        actions={
          <button className="btn btn--primary" type="button" onClick={() => setShowCreate(true)}>
            + New Examination
          </button>
        }
        emptyIcon="📝"
        emptyTitle="No examinations yet"
        emptyDescription="Create examinations to start recording assessment results."
      />

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
