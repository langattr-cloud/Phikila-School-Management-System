import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Subject, SubjectCreate, SubjectUpdate } from '../lib/types'
import { useToast } from '../context/ToastContext'
import DataTable, { type Column } from '../components/ui/DataTable'
import Modal from '../components/ui/Modal'
import FormField from '../components/ui/FormField'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function Subjects() {
  const { success, error: toastError } = useToast()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Subject | null>(null)
  const [saving, setSaving] = useState(false)
  const [createForm, setCreateForm] = useState<SubjectCreate>({ name: '', code: '', description: '', is_active: true })
  const [editForm, setEditForm] = useState<SubjectUpdate>({})

  useEffect(() => { loadSubjects() }, [])

  async function loadSubjects() {
    try {
      setLoading(true)
      setSubjects(await api.getSubjects())
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load subjects')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    try {
      setSaving(true)
      await api.createSubject(createForm)
      await loadSubjects()
      setShowCreate(false)
      setCreateForm({ name: '', code: '', description: '', is_active: true })
      success('Subject created successfully')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create subject')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(subject: Subject) {
    setEditing(subject)
    setEditForm({ name: subject.name, code: subject.code, description: subject.description ?? '', is_active: subject.is_active })
  }

  async function handleUpdate() {
    if (!editing) return
    try {
      setSaving(true)
      await api.updateSubject(editing.id, editForm)
      await loadSubjects()
      setEditing(null)
      success('Subject updated successfully')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to update subject')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading subjects…" />

  const columns: Column<Record<string, unknown>>[] = [
    { key: 'code', header: 'Code', sortable: true, render: (row) => <span className="code-badge">{String(row.code)}</span> },
    { key: 'name', header: 'Name', sortable: true, className: 'td-bold' },
    { key: 'description', header: 'Description', className: 'td-muted' },
    { key: 'is_active', header: 'Status', render: (row) => <span className={`status-pill status-pill--${row.is_active ? 'active' : 'inactive'}`}>{row.is_active ? 'Active' : 'Inactive'}</span> },
    { key: '_actions', header: '', render: (row) => <button className="btn btn--small btn--ghost" type="button" onClick={() => startEdit(row as unknown as Subject)}>Edit</button> },
  ]

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Academic Setup</p>
        <h1 className="page-title">Subjects</h1>
        <p className="muted">Define subjects and assign them to teachers.</p>
      </header>

      <DataTable
        columns={columns}
        data={subjects as unknown as Record<string, unknown>[]}
        searchPlaceholder="Search subjects…"
        actions={
          <button className="btn btn--primary" type="button" onClick={() => setShowCreate(true)}>
            + New Subject
          </button>
        }
        emptyIcon="📚"
        emptyTitle="No subjects yet"
        emptyDescription="Add subjects to start building your curriculum."
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Subject">
        <div className="form-grid">
          <FormField label="Code" value={createForm.code} onChange={(v) => setCreateForm({ ...createForm, code: v })} required placeholder="e.g. MATH" />
          <FormField label="Name" value={createForm.name} onChange={(v) => setCreateForm({ ...createForm, name: v })} required placeholder="e.g. Mathematics" />
          <FormField as="textarea" label="Description" value={createForm.description ?? ''} onChange={(v) => setCreateForm({ ...createForm, description: v })} placeholder="Optional description" />
        </div>
        <div className="modal-actions">
          <button className="btn btn--ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn btn--primary" type="button" onClick={handleCreate} disabled={saving || !createForm.code || !createForm.name}>
            {saving ? 'Creating…' : 'Create Subject'}
          </button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Subject">
        <div className="form-grid">
          <FormField label="Code" value={editForm.code ?? ''} onChange={(v) => setEditForm({ ...editForm, code: v })} required />
          <FormField label="Name" value={editForm.name ?? ''} onChange={(v) => setEditForm({ ...editForm, name: v })} required />
          <FormField as="textarea" label="Description" value={editForm.description ?? ''} onChange={(v) => setEditForm({ ...editForm, description: v })} />
          <FormField as="select" label="Status" value={editForm.is_active?.toString() ?? 'true'} onChange={(v) => setEditForm({ ...editForm, is_active: v === 'true' })} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
        </div>
        <div className="modal-actions">
          <button className="btn btn--ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn btn--primary" type="button" onClick={handleUpdate} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
