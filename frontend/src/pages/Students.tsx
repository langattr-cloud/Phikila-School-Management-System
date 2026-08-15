import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { friendlyApiError } from '../lib/api'
import { students, type Student, type StudentListResponse } from '../lib/students'

export default function StudentsPage() {
  const [data, setData] = useState<StudentListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await students.list({
        page, page_size: 20,
        search: search || undefined,
        status: statusFilter || undefined,
      })
      setData(result)
    } catch (err) {
      setError(friendlyApiError(err, 'load students'))
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader
        title="Students"
        description={`Manage student records — ${data?.total ?? 0} total`}
        actions={
          <button className="button button--primary button--sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Close' : '+ Admit Student'}
          </button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {showForm && <StudentForm onCreated={() => { setShowForm(false); load() }} onCancel={() => setShowForm(false)} />}

      {selectedStudent && (
        <StudentDetail student={selectedStudent} onClose={() => setSelectedStudent(null)} />
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 16rem' }}>
          <input
            className="input"
            placeholder="Search by name or admission number…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="input"
          style={{ width: '10rem' }}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="graduated">Graduated</option>
          <option value="transferred">Transferred</option>
          <option value="suspended">Suspended</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingBlock label="Loading students" rows={5} />
      ) : !data?.items.length ? (
        <EmptyState title="No students found" description={search ? 'Try a different search.' : 'Admit your first student to get started.'} />
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-line)' }}>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Adm No</th>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Gender</th>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>DOB</th>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Guardians</th>
                  <th style={{ padding: 'var(--space-2)' }}></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--color-line)' }}>
                    <td style={{ padding: 'var(--space-2)', fontWeight: 600 }}>{s.admission_number}</td>
                    <td style={{ padding: 'var(--space-2)' }}>{s.first_name} {s.middle_name} {s.last_name}</td>
                    <td style={{ padding: 'var(--space-2)' }}>{s.gender || '—'}</td>
                    <td style={{ padding: 'var(--space-2)' }}>{s.date_of_birth || '—'}</td>
                    <td style={{ padding: 'var(--space-2)' }}>
                      <Badge tone={s.status === 'active' ? 'success' : s.status === 'suspended' ? 'danger' : 'warning'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td style={{ padding: 'var(--space-2)' }}>{s.guardians?.length || 0}</td>
                    <td style={{ padding: 'var(--space-2)' }}>
                      <button className="button button--ghost button--sm" onClick={() => setSelectedStudent(s)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <button className="button button--secondary button--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
              <span style={{ padding: 'var(--space-2)', fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>
                Page {page} of {data.pages}
              </span>
              <button className="button button--secondary button--sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---- Create form ---- */
function StudentForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ admission_number: '', first_name: '', last_name: '', gender: '', date_of_birth: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await students.create({
        ...form,
        date_of_birth: form.date_of_birth || undefined,
        guardians: [],
      })
      onCreated()
    } catch (err) {
      setError(friendlyApiError(err, 'admit student'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card section" style={{ marginBottom: 'var(--space-4)' }}>
      <h2 className="section__title">Admit New Student</h2>
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: '1 1 10rem' }}>
            <label className="field__label">Admission Number *</label>
            <input className="input" required value={form.admission_number} onChange={(e) => setForm({ ...form, admission_number: e.target.value })} />
          </div>
          <div className="field" style={{ flex: '1 1 10rem' }}>
            <label className="field__label">First Name *</label>
            <input className="input" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          </div>
          <div className="field" style={{ flex: '1 1 10rem' }}>
            <label className="field__label">Last Name *</label>
            <input className="input" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: '1 1 10rem' }}>
            <label className="field__label">Gender</label>
            <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Select…</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 10rem' }}>
            <label className="field__label">Date of Birth</label>
            <input className="input" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Admit Student'}</button>
          <button className="button button--secondary" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

/* ---- Detail view ---- */
function StudentDetail({ student, onClose }: { student: Student; onClose: () => void }) {
  return (
    <div className="card section" style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <h2 className="section__title" style={{ marginBottom: 0 }}>
          {student.first_name} {student.last_name}
        </h2>
        <button className="button button--ghost button--sm" onClick={onClose}>✕ Close</button>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: 'var(--space-3)' }}>
        <div><dt style={{ color: 'var(--color-ink-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>Admission No</dt><dd style={{ fontWeight: 600 }}>{student.admission_number}</dd></div>
        <div><dt style={{ color: 'var(--color-ink-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>Gender</dt><dd>{student.gender || '—'}</dd></div>
        <div><dt style={{ color: 'var(--color-ink-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>DOB</dt><dd>{student.date_of_birth || '—'}</dd></div>
        <div><dt style={{ color: 'var(--color-ink-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>Email</dt><dd>{student.email || '—'}</dd></div>
        <div><dt style={{ color: 'var(--color-ink-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>Phone</dt><dd>{student.phone || '—'}</dd></div>
        <div><dt style={{ color: 'var(--color-ink-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>Status</dt><dd><Badge tone={student.status === 'active' ? 'success' : 'warning'}>{student.status}</Badge></dd></div>
      </dl>
      {student.guardians.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Guardians</h3>
          {student.guardians.map((g) => (
            <div key={g.id} style={{ padding: 'var(--space-2)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)' }}>
              <strong>{g.full_name}</strong> ({g.relationship}) — {g.phone} {g.is_emergency_contact ? '★ Emergency' : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
