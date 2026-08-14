import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Department, DepartmentCreate } from '../lib/types'
import Modal from '../components/ui/Modal'
import FormField from '../components/ui/FormField'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

export default function Departments() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<DepartmentCreate>({
    school_id: 1,
    code: '',
    name: '',
    description: '',
    status: 'Active',
  })

  useEffect(() => {
    loadDepartments()
  }, [])

  async function loadDepartments() {
    try {
      setLoading(true)
      const data = await api.getDepartments()
      setDepartments(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load departments')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    try {
      setCreating(true)
      await api.createDepartment(form)
      await loadDepartments()
      setShowCreate(false)
      setForm({ school_id: 1, code: '', name: '', description: '', status: 'Active' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create department')
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading departments…" />

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Academic Setup</p>
        <h1 className="page-title">Departments</h1>
        <p className="muted">Organize subjects and teachers into departments.</p>
      </header>

      {error && <div className="toast toast--error">{error}</div>}

      <div className="toolbar">
        <p className="toolbar-count">{departments.length} department{departments.length !== 1 ? 's' : ''}</p>
        <button className="btn btn--primary" type="button" onClick={() => setShowCreate(true)}>
          + New Department
        </button>
      </div>

      {departments.length === 0 ? (
        <EmptyState
          icon="🏢"
          title="No departments yet"
          description="Create your first department to organize subjects and teachers."
          action={
            <button className="btn btn--primary" type="button" onClick={() => setShowCreate(true)}>
              Create Department
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
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <tr key={dept.id}>
                  <td><span className="code-badge">{dept.code}</span></td>
                  <td className="td-bold">{dept.name}</td>
                  <td className="td-muted">{dept.description || '—'}</td>
                  <td>
                    <span className={`status-pill status-pill--${dept.status.toLowerCase()}`}>
                      {dept.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Department">
        <div className="form-grid">
          <FormField label="Code" value={form.code} onChange={(v) => setForm({ ...form, code: v })} required placeholder="e.g. SCI" />
          <FormField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required placeholder="e.g. Sciences" />
          <FormField as="textarea" label="Description" value={form.description ?? ''} onChange={(v) => setForm({ ...form, description: v })} placeholder="Optional description" />
          <FormField
            as="select"
            label="Status"
            value={form.status ?? 'Active'}
            onChange={(v) => setForm({ ...form, status: v })}
            options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn--ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn btn--primary" type="button" onClick={handleCreate} disabled={creating || !form.code || !form.name}>
            {creating ? 'Creating…' : 'Create Department'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
