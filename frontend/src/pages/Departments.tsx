import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Department, DepartmentCreate } from '../lib/types'
import { useToast } from '../context/ToastContext'
import DataTable, { type Column } from '../components/ui/DataTable'
import Modal from '../components/ui/Modal'
import FormField from '../components/ui/FormField'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function Departments() {
  const { success, error: toastError } = useToast()
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<DepartmentCreate>({
    school_id: 1, code: '', name: '', description: '', status: 'Active',
  })

  useEffect(() => { loadDepartments() }, [])

  async function loadDepartments() {
    try {
      setLoading(true)
      setDepartments(await api.getDepartments())
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load departments')
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
      success('Department created successfully')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create department')
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading departments…" />

  const columns: Column<Record<string, unknown>>[] = [
    { key: 'code', header: 'Code', sortable: true, render: (row) => <span className="code-badge">{String(row.code)}</span> },
    { key: 'name', header: 'Name', sortable: true, className: 'td-bold' },
    { key: 'description', header: 'Description', className: 'td-muted' },
    { key: 'status', header: 'Status', render: (row) => <span className={`status-pill status-pill--${String(row.status).toLowerCase()}`}>{String(row.status)}</span> },
  ]

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Academic Setup</p>
        <h1 className="page-title">Departments</h1>
        <p className="muted">Organize subjects and teachers into departments.</p>
      </header>

      <DataTable
        columns={columns}
        data={departments as unknown as Record<string, unknown>[]}
        searchPlaceholder="Search departments…"
        actions={
          <button className="btn btn--primary" type="button" onClick={() => setShowCreate(true)}>
            + New Department
          </button>
        }
        emptyIcon="🏢"
        emptyTitle="No departments yet"
        emptyDescription="Create your first department to organize subjects and teachers."
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Department">
        <div className="form-grid">
          <FormField label="Code" value={form.code} onChange={(v) => setForm({ ...form, code: v })} required placeholder="e.g. SCI" />
          <FormField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required placeholder="e.g. Sciences" />
          <FormField as="textarea" label="Description" value={form.description ?? ''} onChange={(v) => setForm({ ...form, description: v })} placeholder="Optional description" />
          <FormField as="select" label="Status" value={form.status ?? 'Active'} onChange={(v) => setForm({ ...form, status: v })} options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} />
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
