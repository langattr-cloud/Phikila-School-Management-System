import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Subject, SubjectCreate, SubjectUpdate } from '../lib/types'
import Modal from '../components/ui/Modal'
import FormField from '../components/ui/FormField'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

export default function Subjects() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
      setError(e instanceof Error ? e.message : 'Failed to load subjects')
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create subject')
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update subject')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading subjects…" />

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Academic Setup</p>
        <h1 className="page-title">Subjects</h1>
        <p className="muted">Define subjects and assign them to teachers.</p>
      </header>

      {error && <div className="toast toast--error">{error}</div>}

      <div className="toolbar">
        <p className="toolbar-count">{subjects.length} subject{subjects.length !== 1 ? 's' : ''}</p>
        <button className="btn btn--primary" type="button" onClick={() => setShowCreate(true)}>
          + New Subject
        </button>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon="📚"
          title="No subjects yet"
          description="Add subjects to start building your curriculum."
          action={
            <button className="btn btn--primary" type="button" onClick={() => setShowCreate(true)}>
              Add Subject
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((sub) => (
                <tr key={sub.id}>
                  <td><span className="code-badge">{sub.code}</span></td>
                  <td className="td-bold">{sub.name}</td>
                  <td className="td-muted">{sub.description || '—'}</td>
                  <td>
                    <span className={`status-pill status-pill--${sub.is_active ? 'active' : 'inactive'}`}>
                      {sub.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn--small btn--ghost" type="button" onClick={() => startEdit(sub)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
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

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Subject">
        <div className="form-grid">
          <FormField label="Code" value={editForm.code ?? ''} onChange={(v) => setEditForm({ ...editForm, code: v })} required />
          <FormField label="Name" value={editForm.name ?? ''} onChange={(v) => setEditForm({ ...editForm, name: v })} required />
          <FormField as="textarea" label="Description" value={editForm.description ?? ''} onChange={(v) => setEditForm({ ...editForm, description: v })} />
          <FormField
            as="select"
            label="Status"
            value={editForm.is_active?.toString() ?? 'true'}
            onChange={(v) => setEditForm({ ...editForm, is_active: v === 'true' })}
            options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]}
          />
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
