import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Student, StudentCreate } from '../lib/types'
import Modal from '../components/ui/Modal'
import FormField from '../components/ui/FormField'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

export default function Students() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<StudentCreate>({
    admission_number: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    gender: '',
    date_of_birth: '',
    nationality: 'Kenyan',
    guardians: [],
  })

  useEffect(() => { loadStudents() }, [])

  async function loadStudents() {
    try {
      setLoading(true)
      setStudents(await api.getStudents())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load students')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm({
      admission_number: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      gender: '',
      date_of_birth: '',
      nationality: 'Kenyan',
      guardians: [],
    })
  }

  async function handleRegister() {
    try {
      setSaving(true)
      await api.createStudent(form)
      await loadStudents()
      setShowRegister(false)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to register student')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading students…" />

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">People</p>
        <h1 className="page-title">Students</h1>
        <p className="muted">Register and manage student records.</p>
      </header>

      {error && <div className="toast toast--error">{error}</div>}

      <div className="toolbar">
        <p className="toolbar-count">{students.length} student{students.length !== 1 ? 's' : ''}</p>
        <button className="btn btn--primary" type="button" onClick={() => { resetForm(); setShowRegister(true) }}>
          + Register Student
        </button>
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon="🎓"
          title="No students yet"
          description="Register your first student to get started."
          action={
            <button className="btn btn--primary" type="button" onClick={() => { resetForm(); setShowRegister(true) }}>
              Register Student
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Adm. No.</th>
                <th>Name</th>
                <th>Gender</th>
                <th>Date of Birth</th>
                <th>Status</th>
                <th>Guardians</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td><span className="code-badge">{s.admission_number}</span></td>
                  <td className="td-bold">{s.first_name} {s.middle_name ? `${s.middle_name} ` : ''}{s.last_name}</td>
                  <td>{s.gender}</td>
                  <td className="td-muted">{s.date_of_birth}</td>
                  <td>
                    <span className={`status-pill status-pill--${s.status.toLowerCase()}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="td-muted">{s.guardians?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Register Modal */}
      <Modal open={showRegister} onClose={() => setShowRegister(false)} title="Register Student">
        <div className="form-grid">
          <FormField label="Admission Number" value={form.admission_number} onChange={(v) => setForm({ ...form, admission_number: v })} required placeholder="e.g. PHK/2026/001" />
          <FormField label="First Name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} required />
          <FormField label="Middle Name" value={form.middle_name ?? ''} onChange={(v) => setForm({ ...form, middle_name: v })} />
          <FormField label="Last Name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} required />
          <FormField
            as="select"
            label="Gender"
            value={form.gender}
            onChange={(v) => setForm({ ...form, gender: v })}
            required
            options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }]}
          />
          <FormField label="Date of Birth" type="date" value={form.date_of_birth} onChange={(v) => setForm({ ...form, date_of_birth: v })} required />
          <FormField label="Nationality" value={form.nationality ?? ''} onChange={(v) => setForm({ ...form, nationality: v })} />
          <FormField label="Birth Cert. / ID No." value={form.birth_cert_or_id ?? ''} onChange={(v) => setForm({ ...form, birth_cert_or_id: v })} />
          <FormField label="Contact Info" value={form.contact_info ?? ''} onChange={(v) => setForm({ ...form, contact_info: v })} placeholder="Phone or address" />
        </div>
        <div className="modal-actions">
          <button className="btn btn--ghost" type="button" onClick={() => setShowRegister(false)}>Cancel</button>
          <button className="btn btn--primary" type="button" onClick={handleRegister} disabled={saving || !form.admission_number || !form.first_name || !form.last_name || !form.gender || !form.date_of_birth}>
            {saving ? 'Registering…' : 'Register Student'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
