import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Teacher, TeacherCreate } from '../lib/types'
import Modal from '../components/ui/Modal'
import FormField from '../components/ui/FormField'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

export default function Teachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Teacher | null>(null)
  const [deleting, setDeleting] = useState<Teacher | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<TeacherCreate>({ name: '', tsc_number: '', email: '', department_id: undefined })

  useEffect(() => { loadTeachers() }, [])

  async function loadTeachers() {
    try {
      setLoading(true)
      setTeachers(await api.getTeachers())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load teachers')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm({ name: '', tsc_number: '', email: '', department_id: undefined })
  }

  async function handleCreate() {
    try {
      setSaving(true)
      await api.createTeacher(form)
      await loadTeachers()
      setShowCreate(false)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create teacher')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(teacher: Teacher) {
    setEditing(teacher)
    setForm({ name: teacher.name, tsc_number: teacher.tsc_number, email: teacher.email ?? '', department_id: teacher.department_id })
  }

  async function handleUpdate() {
    if (!editing) return
    try {
      setSaving(true)
      await api.updateTeacher(editing.id, form)
      await loadTeachers()
      setEditing(null)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update teacher')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      setSaving(true)
      await api.deleteTeacher(deleting.id)
      await loadTeachers()
      setDeleting(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete teacher')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading teachers…" />

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">People</p>
        <h1 className="page-title">Teachers</h1>
        <p className="muted">Manage teacher profiles, allocations, and workload.</p>
      </header>

      {error && <div className="toast toast--error">{error}</div>}

      <div className="toolbar">
        <p className="toolbar-count">{teachers.length} teacher{teachers.length !== 1 ? 's' : ''}</p>
        <button className="btn btn--primary" type="button" onClick={() => { resetForm(); setShowCreate(true) }}>
          + Add Teacher
        </button>
      </div>

      {teachers.length === 0 ? (
        <EmptyState
          icon="👩‍🏫"
          title="No teachers yet"
          description="Add teachers to start building your staff directory."
          action={
            <button className="btn btn--primary" type="button" onClick={() => { resetForm(); setShowCreate(true) }}>
              Add Teacher
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>TSC No.</th>
                <th>Email</th>
                <th>Qualifications</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td className="td-bold">{t.name}</td>
                  <td><span className="code-badge">{t.tsc_number}</span></td>
                  <td className="td-muted">{t.email || '—'}</td>
                  <td className="td-muted">
                    {t.qualifications && t.qualifications.length > 0
                      ? t.qualifications.map((q) => q.title).join(', ')
                      : '—'}
                  </td>
                  <td className="td-actions">
                    <button className="btn btn--small btn--ghost" type="button" onClick={() => startEdit(t)}>Edit</button>
                    <button className="btn btn--small btn--danger" type="button" onClick={() => setDeleting(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Teacher">
        <div className="form-grid">
          <FormField label="Full Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required placeholder="e.g. Jane Muthoni" />
          <FormField label="TSC Number" value={form.tsc_number} onChange={(v) => setForm({ ...form, tsc_number: v })} required placeholder="e.g. 123456" />
          <FormField label="Email" type="email" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} placeholder="teacher@school.org" />
        </div>
        <div className="modal-actions">
          <button className="btn btn--ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn btn--primary" type="button" onClick={handleCreate} disabled={saving || !form.name || !form.tsc_number}>
            {saving ? 'Adding…' : 'Add Teacher'}
          </button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Teacher">
        <div className="form-grid">
          <FormField label="Full Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <FormField label="TSC Number" value={form.tsc_number} onChange={(v) => setForm({ ...form, tsc_number: v })} required />
          <FormField label="Email" type="email" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
        </div>
        <div className="modal-actions">
          <button className="btn btn--ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn btn--primary" type="button" onClick={handleUpdate} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Teacher">
        <p className="muted">
          Are you sure you want to delete <strong>{deleting?.name}</strong>? This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="btn btn--ghost" type="button" onClick={() => setDeleting(null)}>Cancel</button>
          <button className="btn btn--danger" type="button" onClick={handleDelete} disabled={saving}>
            {saving ? 'Deleting…' : 'Delete Teacher'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
