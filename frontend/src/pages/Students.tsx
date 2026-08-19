import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { api, friendlyApiError } from '../lib/api'
import { students, type GuardianCreate, type Student, type StudentListResponse } from '../lib/students'

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
      setData(await students.list({ page, page_size: 20, search: search || undefined, status: statusFilter || undefined }))
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
        actions={<button className="button button--primary button--sm" onClick={() => setShowForm(!showForm)}>{showForm ? '✕ Close' : '+ Admit Student'}</button>}
      />
      {error && <Alert tone="error">{error}</Alert>}
      {showForm && <StudentForm onCreated={() => { setShowForm(false); load() }} onCancel={() => setShowForm(false)} />}
      {selectedStudent && <StudentDetail student={selectedStudent} onClose={() => setSelectedStudent(null)} />}

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 16rem' }}>
          <input className="input" placeholder="Search by name or admission number…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input" style={{ width: '10rem' }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option><option value="transferred">Transferred</option><option value="suspended">Suspended</option><option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {loading ? <LoadingBlock label="Loading students" rows={5} /> : !data?.items.length ? (
        <EmptyState title="No students found" description={search ? 'Try a different search.' : 'Admit your first student to get started.'} />
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '2px solid var(--color-line)' }}>
                <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Adm No</th><th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Name</th><th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Gender</th><th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>DOB</th><th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Status</th><th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Guardians</th><th style={{ padding: 'var(--space-2)' }}></th>
              </tr></thead>
              <tbody>{data.items.map((s) => <tr key={s.id} style={{ borderBottom: '1px solid var(--color-line)' }}>
                <td style={{ padding: 'var(--space-2)', fontWeight: 600 }}>{s.admission_number}</td><td style={{ padding: 'var(--space-2)' }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')}</td><td style={{ padding: 'var(--space-2)' }}>{s.gender || '—'}</td><td style={{ padding: 'var(--space-2)' }}>{s.date_of_birth || '—'}</td><td style={{ padding: 'var(--space-2)' }}><Badge tone={s.status === 'active' ? 'success' : s.status === 'suspended' ? 'danger' : 'warning'}>{s.status}</Badge></td><td style={{ padding: 'var(--space-2)' }}>{s.guardians?.length || 0}</td><td style={{ padding: 'var(--space-2)' }}><button className="button button--ghost button--sm" onClick={() => setSelectedStudent(s)}>View</button></td>
              </tr>)}</tbody>
            </table>
          </div>
          {data.pages > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}><button className="button button--secondary button--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button><span style={{ padding: 'var(--space-2)', fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>Page {page} of {data.pages}</span><button className="button button--secondary button--sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button></div>}
        </>
      )}
    </div>
  )
}

type FormState = {
  admission_number: string; first_name: string; middle_name: string; last_name: string; preferred_name: string
  date_of_birth: string; gender: string; email: string; phone: string; address: string; nationality: string; national_id: string; photo_url: string; admission_date: string
  academic_year_id: string; level_id: string; grade_id: string; stream_id: string; status: string
}

const emptyGuardian = (): GuardianCreate => ({ full_name: '', relationship: '', phone: '', alt_phone: '', email: '', address: '', occupation: '', is_emergency_contact: false })

function StudentForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<FormState>({ admission_number: '', first_name: '', middle_name: '', last_name: '', preferred_name: '', date_of_birth: '', gender: '', email: '', phone: '', address: '', nationality: 'Kenyan', national_id: '', photo_url: '', admission_date: '', academic_year_id: '', level_id: '', grade_id: '', stream_id: '', status: 'active' })
  const [guardians, setGuardians] = useState<GuardianCreate[]>([emptyGuardian()])
  const [academicYears, setAcademicYears] = useState<Awaited<ReturnType<typeof api.academicYears>>>([])
  const [levels, setLevels] = useState<Awaited<ReturnType<typeof api.levels>>>([])
  const [grades, setGrades] = useState<Awaited<ReturnType<typeof api.grades>>>([])
  const [streams, setStreams] = useState<Awaited<ReturnType<typeof api.streams>>>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [loadingStreams, setLoadingStreams] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.academicYears(), api.levels()]).then(([years, loadedLevels]) => {
      if (!active) return
      setAcademicYears(years); setLevels(loadedLevels)
      const currentYear = years.find((year) => year.is_current) ?? years[0]
      const firstLevel = loadedLevels[0]
      setForm((current) => ({ ...current, academic_year_id: current.academic_year_id || String(currentYear?.id ?? ''), level_id: current.level_id || String(firstLevel?.id ?? '') }))
    }).catch((err) => { if (active) setError(friendlyApiError(err, 'load academic options')) }).finally(() => { if (active) setLoadingOptions(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!form.level_id) { setGrades([]); setForm((current) => ({ ...current, grade_id: '', stream_id: '' })); return }
    let active = true; setLoadingGrades(true)
    api.grades(Number(form.level_id)).then((items) => { if (active) setGrades(items) }).catch((err) => { if (active) setError(friendlyApiError(err, 'load grades')) }).finally(() => { if (active) setLoadingGrades(false) })
    return () => { active = false }
  }, [form.level_id])

  useEffect(() => {
    if (!form.academic_year_id || !form.grade_id) { setStreams([]); setForm((current) => ({ ...current, stream_id: '' })); return }
    let active = true; setLoadingStreams(true)
    api.streams(Number(form.academic_year_id), Number(form.grade_id)).then((items) => { if (active) setStreams(items.filter((stream) => stream.status === 'ACTIVE')) }).catch((err) => { if (active) setError(friendlyApiError(err, 'load streams')) }).finally(() => { if (active) setLoadingStreams(false) })
    return () => { active = false }
  }, [form.academic_year_id, form.grade_id])

  const update = (field: keyof FormState, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const updateGuardian = (index: number, field: keyof GuardianCreate, value: string | boolean) => setGuardians((current) => current.map((guardian, i) => i === index ? { ...guardian, [field]: value } : guardian))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSubmitting(true); setError(null)
    try {
      await students.create({
        admission_number: form.admission_number.trim(), first_name: form.first_name.trim(), middle_name: form.middle_name.trim() || null, last_name: form.last_name.trim(), preferred_name: form.preferred_name.trim() || null,
        date_of_birth: form.date_of_birth || null, gender: form.gender || null, email: form.email.trim() || null, phone: form.phone.trim() || null, address: form.address.trim() || null, nationality: form.nationality.trim() || 'Kenyan', national_id: form.national_id.trim() || null, photo_url: form.photo_url.trim() || null, admission_date: form.admission_date || null,
        academic_year_id: Number(form.academic_year_id), level_id: Number(form.level_id), grade_id: Number(form.grade_id), stream_id: Number(form.stream_id), status: form.status || 'active',
        guardians: guardians.filter((g) => g.full_name.trim() || g.relationship.trim() || g.phone.trim()).map((g) => ({ full_name: g.full_name.trim(), relationship: g.relationship.trim(), phone: g.phone.trim(), alt_phone: g.alt_phone?.trim() || null, email: g.email?.trim() || null, address: g.address?.trim() || null, occupation: g.occupation?.trim() || null, is_emergency_contact: Boolean(g.is_emergency_contact) })),
      })
      onCreated()
    } catch (err) { setError(friendlyApiError(err, 'admit student')) } finally { setSubmitting(false) }
  }

  return <div className="card section" style={{ marginBottom: 'var(--space-4)' }}>
    <h2 className="section__title">Admit New Student</h2>
    {error && <Alert tone="error">{error}</Alert>}
    {loadingOptions ? <LoadingBlock label="Loading academic options" rows={2} /> : <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Field label="Admission Number *"><input className="input" required value={form.admission_number} onChange={(e) => update('admission_number', e.target.value)} /></Field><Field label="First Name *"><input className="input" required value={form.first_name} onChange={(e) => update('first_name', e.target.value)} /></Field><Field label="Middle Name"><input className="input" value={form.middle_name} onChange={(e) => update('middle_name', e.target.value)} /></Field><Field label="Last Name *"><input className="input" required value={form.last_name} onChange={(e) => update('last_name', e.target.value)} /></Field><Field label="Preferred Name"><input className="input" value={form.preferred_name} onChange={(e) => update('preferred_name', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Field label="Date of Birth"><input className="input" type="date" value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)} /></Field><Field label="Gender"><select className="input" value={form.gender} onChange={(e) => update('gender', e.target.value)}><option value="">Select…</option><option value="Male">Male</option><option value="Female">Female</option></select></Field><Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></Field><Field label="Phone"><input className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></Field><Field label="Address"><input className="input" value={form.address} onChange={(e) => update('address', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Field label="Nationality"><input className="input" value={form.nationality} onChange={(e) => update('nationality', e.target.value)} /></Field><Field label="National ID"><input className="input" value={form.national_id} onChange={(e) => update('national_id', e.target.value)} /></Field><Field label="Photo URL"><input className="input" type="url" value={form.photo_url} onChange={(e) => update('photo_url', e.target.value)} /></Field><Field label="Admission Date"><input className="input" type="date" value={form.admission_date} onChange={(e) => update('admission_date', e.target.value)} /></Field>
      </div>
      <div style={{ borderTop: '1px solid var(--color-line)', paddingTop: 'var(--space-3)' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 'var(--space-3)' }}>Academic Placement</h3>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Field label="Academic Year *"><select className="input" required value={form.academic_year_id} onChange={(e) => { update('academic_year_id', e.target.value); update('stream_id', '') }}><option value="">Select…</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}{year.is_current ? ' (Current)' : ''}</option>)}</select></Field>
          <Field label="Level *"><select className="input" required value={form.level_id} onChange={(e) => { update('level_id', e.target.value); update('grade_id', ''); update('stream_id', '') }}><option value="">Select…</option>{levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></Field>
          <Field label="Grade *"><select className="input" required disabled={!form.level_id || loadingGrades} value={form.grade_id} onChange={(e) => { update('grade_id', e.target.value); update('stream_id', '') }}><option value="">{loadingGrades ? 'Loading…' : 'Select…'}</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></Field>
          <Field label="Stream *"><select className="input" required disabled={!form.academic_year_id || !form.grade_id || loadingStreams} value={form.stream_id} onChange={(e) => update('stream_id', e.target.value)}><option value="">{loadingStreams ? 'Loading…' : 'Select…'}</option>{streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select></Field>
          <Field label="Status"><select className="input" value={form.status} onChange={(e) => update('status', e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option><option value="withdrawn">Withdrawn</option></select></Field>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--color-line)', paddingTop: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}><h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Guardians</h3><button className="button button--secondary button--sm" type="button" onClick={() => setGuardians((current) => [...current, emptyGuardian()])}>+ Add Guardian</button></div>
        {guardians.map((guardian, index) => <div key={index} style={{ border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}><Field label="Full Name"><input className="input" value={guardian.full_name} onChange={(e) => updateGuardian(index, 'full_name', e.target.value)} /></Field><Field label="Relationship"><input className="input" value={guardian.relationship} onChange={(e) => updateGuardian(index, 'relationship', e.target.value)} /></Field><Field label="Phone"><input className="input" value={guardian.phone} onChange={(e) => updateGuardian(index, 'phone', e.target.value)} /></Field><Field label="Alternative Phone"><input className="input" value={guardian.alt_phone ?? ''} onChange={(e) => updateGuardian(index, 'alt_phone', e.target.value)} /></Field><Field label="Email"><input className="input" type="email" value={guardian.email ?? ''} onChange={(e) => updateGuardian(index, 'email', e.target.value)} /></Field><Field label="Occupation"><input className="input" value={guardian.occupation ?? ''} onChange={(e) => updateGuardian(index, 'occupation', e.target.value)} /></Field><Field label="Address"><input className="input" value={guardian.address ?? ''} onChange={(e) => updateGuardian(index, 'address', e.target.value)} /></Field></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}><label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><input type="checkbox" checked={Boolean(guardian.is_emergency_contact)} onChange={(e) => updateGuardian(index, 'is_emergency_contact', e.target.checked)} /> Emergency contact</label>{guardians.length > 1 && <button className="button button--ghost button--sm" type="button" onClick={() => setGuardians((current) => current.filter((_, i) => i !== index))}>Remove</button>}</div>
        </div>)}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}><button className="button button--primary" type="submit" disabled={submitting || loadingGrades || loadingStreams}>{submitting ? 'Saving…' : 'Admit Student'}</button><button className="button button--secondary" type="button" onClick={onCancel}>Cancel</button></div>
    </form>}
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field" style={{ flex: '1 1 10rem' }}><label className="field__label">{label}</label>{children}</div>
}

function StudentDetail({ student, onClose }: { student: Student; onClose: () => void }) {
  return <div className="card section" style={{ marginBottom: 'var(--space-4)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}><h2 className="section__title" style={{ marginBottom: 0 }}>{[student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')}</h2><button className="button button--ghost button--sm" onClick={onClose}>✕ Close</button></div>
    <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: 'var(--space-3)' }}>
      <div><dt>Admission No</dt><dd style={{ fontWeight: 600 }}>{student.admission_number}</dd></div><div><dt>Preferred Name</dt><dd>{student.preferred_name || '—'}</dd></div><div><dt>Gender</dt><dd>{student.gender || '—'}</dd></div><div><dt>DOB</dt><dd>{student.date_of_birth || '—'}</dd></div><div><dt>Email</dt><dd>{student.email || '—'}</dd></div><div><dt>Phone</dt><dd>{student.phone || '—'}</dd></div><div><dt>Address</dt><dd>{student.address || '—'}</dd></div><div><dt>Nationality</dt><dd>{student.nationality || '—'}</dd></div><div><dt>National ID</dt><dd>{student.national_id || '—'}</dd></div><div><dt>Admission Date</dt><dd>{student.admission_date || '—'}</dd></div><div><dt>Status</dt><dd><Badge tone={student.status === 'active' ? 'success' : 'warning'}>{student.status}</Badge></dd></div>
    </dl>
    {student.guardians.length > 0 && <div style={{ marginTop: 'var(--space-4)' }}><h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Guardians</h3>{student.guardians.map((g) => <div key={g.id} style={{ padding: 'var(--space-2)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)' }}><strong>{g.full_name}</strong> ({g.relationship}) — {g.phone} {g.is_emergency_contact ? '★ Emergency' : ''}</div>)}</div>}
  </div>
}
