import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Teacher, TeacherCreate } from '../lib/types'
import { useToast } from '../context/ToastContext'
import DataTable, { type Column } from '../components/ui/DataTable'
import Modal from '../components/ui/Modal'
import FormField from '../components/ui/FormField'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function Teachers() {
  const { success, error: toastError } = useToast()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
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
      toastError(e instanceof Error ? e.message : 'Failed to load teachers')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() { setForm({ name: '', tsc_number: '', email: '', department_id: undefined }) }

  async function handleCreate() {
    try {
      setSaving(true)
      await api.createTeacher(form)
      await loadTeachers()
      setShowCreate(false)
      resetForm()
      success('Teacher added successfully')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create teacher')
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
      success('Teacher updated successfully')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to update teacher')
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
      success('Teacher deleted successfully')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to delete teacher')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading teachers…" />

  const columns: Column<Record<string, unknown>>[] = [
    { key: 'name', header: 'Name', sortable: true, className: 'td-bold' },
    { key: 'tsc_number', header: 'TSC No.', sortable: true, render: (row) => <span className="code-badge">{String(row.tsc_number)}</span> },
    { key: 'email', header: 'Email', className: 'td-muted' },
    { key: 'qualifications', header: 'Qualifications', className: 'td-muted', render: (row) => { const q = row.qualifications as { title: string }[] | undefined; return q && q.length > 0 ? q.map((x) => x.title).join(', ') : '—' } },
    { key: '_actions', header: '', render: (row) => (
      <div className="td-actions">
        <button className="btn btn--small btn--ghost" type="button" onClick={(e) => { e.stopPropagation(); startEdit(row as unknown as Teacher) }}>Edit</button>
        <button className="btn btn--small btn--danger" type="button" onClick={(e) => { e.stopPropagation(); setDeleting(row as unknown as Teacher) }}>Delete</button>
      </div>
    )},
  ]

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">People</p>
        <h1 className="page-title">Teachers</h1>
        <p className="muted">Manage teacher profiles, allocations, and workload.</p>
      </header>

      <DataTable
        columns={columns}
        data={teachers as unknown as Record<string, unknown>[]}
        searchPlaceholder="Search teachers…"
        actions={
          <button className="btn btn--primary" type="button" onClick={() => { resetForm(); setShowCreate(true) }}>
            + Add Teacher
          </button>
        }
        emptyIcon="👩‍🏫"
        emptyTitle="No teachers yet"
        emptyDescription="Add teachers to start building your staff directory."
      />

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

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Teacher">
        <p className="muted">Are you sure you want to delete <strong>{deleting?.name}</strong>? This action cannot be undone.</p>
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
