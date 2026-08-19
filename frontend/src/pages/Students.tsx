import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { friendlyApiError, api, type AcademicYear, type Grade, type Level, type Stream } from '../lib/api'
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
  const [years, setYears] = useState<AcademicYear[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [streams, setStreams] = useState<Stream[]>([])
  const [academicYearId, setAcademicYearId] = useState<number | ''>('')
  const [levelId, setLevelId] = useState<number | ''>('')
  const [gradeId, setGradeId] = useState<number | ''>('')
  const [streamId, setStreamId] = useState<number | ''>('')

  useEffect(() => {
    Promise.all([api.academicYears(), api.levels()]).then(([ys, ls]) => {
      setYears(ys || []); setLevels((ls || []).filter(l => l.status !== false))
      const current = (ys || []).find(y => y.is_current) || (ys || [])[0]
      if (current) setAcademicYearId(current.id)
    }).catch(err => setError(friendlyApiError(err, 'load academic structure')))
  }, [])

  useEffect(() => {
    setGrades([]); setGradeId(''); setStreams([]); setStreamId('')
    if (levelId !== '') api.grades(levelId).then(setGrades).catch(err => setError(friendlyApiError(err, 'load grades')))
  }, [levelId])

  useEffect(() => {
    setStreams([]); setStreamId('')
    if (academicYearId !== '' && gradeId !== '') api.streams(academicYearId, gradeId).then(setStreams).catch(err => setError(friendlyApiError(err, 'load streams')))
  }, [academicYearId, gradeId])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const result = await students.list({
        page, page_size: 20, search: search || undefined, status: statusFilter || undefined,
        academic_year_id: academicYearId === '' ? undefined : academicYearId,
        level_id: levelId === '' ? undefined : levelId,
        grade_id: gradeId === '' ? undefined : gradeId,
        stream_id: streamId === '' ? undefined : streamId,
      })
      setData(result)
    } catch (err) { setError(friendlyApiError(err, 'load students')) } finally { setLoading(false) }
  }, [page, search, statusFilter, academicYearId, levelId, gradeId, streamId])

  useEffect(() => { void load() }, [load])

  const levelMap = useMemo(() => new Map(levels.map(l => [l.id, l.name])), [levels])
  const gradeMap = useMemo(() => new Map(grades.map(g => [g.id, g.name])), [grades])
  const streamMap = useMemo(() => new Map(streams.map(s => [s.id, s.name])), [streams])

  function resetFilters() {
    setSearch(''); setStatusFilter(''); setLevelId(''); setGradeId(''); setStreamId(''); setPage(1)
  }

  return (
    <div>
      <PageHeader title="Students" description={`Manage student records — ${data?.total ?? 0} total`} actions={<button className="button button--primary button--sm" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ Admit Student'}</button>} />
      {error && <Alert tone="error">{error}</Alert>}
      {showForm && <StudentForm onCreated={() => { setShowForm(false); void load() }} onCancel={() => setShowForm(false)} />}
      {selectedStudent && <StudentDetail student={selectedStudent} onClose={() => setSelectedStudent(null)} levelName={levelMap.get(selectedStudent.level_id || -1)} gradeName={gradeMap.get(selectedStudent.grade_id || -1)} streamName={streamMap.get(selectedStudent.stream_id || -1)} />}

      <section className="card section" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="section__title">Academic placement filters</h2>
        <p className="section__description">Filter students by Academic Year → Level → Grade → Stream.</p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <select className="input" value={academicYearId} onChange={e => { setAcademicYearId(e.target.value ? Number(e.target.value) : ''); setLevelId(''); setPage(1) }}>
            <option value="">All academic years</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>)}
          </select>
          <select className="input" value={levelId} onChange={e => { setLevelId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}>
            <option value="">All levels</option>{levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="input" value={gradeId} onChange={e => { setGradeId(e.target.value ? Number(e.target.value) : ''); setPage(1) }} disabled={levelId === ''}>
            <option value="">All grades</option>{grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select className="input" value={streamId} onChange={e => { setStreamId(e.target.value ? Number(e.target.value) : ''); setPage(1) }} disabled={gradeId === ''}>
            <option value="">All streams</option>{streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="button button--ghost button--sm" type="button" onClick={resetFilters}>Clear filters</button>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: '1 1 16rem' }} placeholder="Search by name or admission number…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <select className="input" style={{ width: '10rem' }} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option><option value="transferred">Transferred</option><option value="suspended">Suspended</option><option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {loading ? <LoadingBlock label="Loading students" rows={5} /> : !data?.items.length ? <EmptyState title="No students found" description="No students match the selected academic context." /> : <>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}><thead><tr style={{ borderBottom: '2px solid var(--color-line)' }}>
          <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Adm No</th><th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Name</th><th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Academic placement</th><th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Status</th><th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Guardians</th><th style={{ padding: 'var(--space-2)' }}></th>
        </tr></thead><tbody>{data.items.map(s => <tr key={s.id} style={{ borderBottom: '1px solid var(--color-line)' }}>
          <td style={{ padding: 'var(--space-2)', fontWeight: 600 }}>{s.admission_number}</td><td style={{ padding: 'var(--space-2)' }}>{s.first_name} {s.middle_name} {s.last_name}</td>
          <td style={{ padding: 'var(--space-2)' }}>{levelMap.get(s.level_id || -1) || '—'} {s.grade_id ? `→ ${gradeMap.get(s.grade_id) || 'Grade'}` : ''} {s.stream_id ? `→ ${streamMap.get(s.stream_id) || 'Stream'}` : ''}</td>
          <td style={{ padding: 'var(--space-2)' }}><Badge tone={s.status === 'active' ? 'success' : s.status === 'suspended' ? 'danger' : 'warning'}>{s.status}</Badge></td>
          <td style={{ padding: 'var(--space-2)' }}>{s.guardians?.length || 0}</td><td style={{ padding: 'var(--space-2)' }}><button className="button button--ghost button--sm" onClick={() => setSelectedStudent(s)}>View</button></td>
        </tr>)}</tbody></table></div>
        {data.pages > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}><button className="button button--secondary button--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span style={{ padding: 'var(--space-2)' }}>Page {page} of {data.pages}</span><button className="button button--secondary button--sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
      </>}
    </div>
  )
}

function StudentForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ admission_number: '', first_name: '', last_name: '', gender: '', date_of_birth: '' }); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null)
  async function handleSubmit(e: React.FormEvent) { e.preventDefault(); setSubmitting(true); setError(null); try { await students.create({ ...form, date_of_birth: form.date_of_birth || undefined, guardians: [] }); onCreated() } catch (err) { setError(friendlyApiError(err, 'admit student')) } finally { setSubmitting(false) } }
  return <div className="card section" style={{ marginBottom: 'var(--space-4)' }}><h2 className="section__title">Admit New Student</h2>{error && <Alert tone="error">{error}</Alert>}<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}><div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}><div className="field"><label className="field__label">Admission Number *</label><input className="input" required value={form.admission_number} onChange={e => setForm({ ...form, admission_number: e.target.value })} /></div><div className="field"><label className="field__label">First Name *</label><input className="input" required value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div><div className="field"><label className="field__label">Last Name *</label><input className="input" required value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div></div><div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}><div className="field"><label className="field__label">Gender</label><select className="input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}><option value="">Select…</option><option value="Male">Male</option><option value="Female">Female</option></select></div><div className="field"><label className="field__label">Date of Birth</label><input className="input" type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></div></div><div style={{ display: 'flex', gap: 'var(--space-2)' }}><button className="button button--primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Admit Student'}</button><button className="button button--secondary" type="button" onClick={onCancel}>Cancel</button></div></form></div>
}

function StudentDetail({ student, onClose, levelName, gradeName, streamName }: { student: Student; onClose: () => void; levelName?: string; gradeName?: string; streamName?: string }) {
  return <div className="card section" style={{ marginBottom: 'var(--space-4)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}><h2 className="section__title" style={{ marginBottom: 0 }}>{student.first_name} {student.last_name}</h2><button className="button button--ghost button--sm" onClick={onClose}>Close</button></div><dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: 'var(--space-3)' }}>
    <div><dt>Admission No</dt><dd style={{ fontWeight: 600 }}>{student.admission_number}</dd></div><div><dt>Academic placement</dt><dd style={{ fontWeight: 600 }}>{levelName || '—'} → {gradeName || '—'} → {streamName || '—'}</dd></div><div><dt>Gender</dt><dd>{student.gender || '—'}</dd></div><div><dt>DOB</dt><dd>{student.date_of_birth || '—'}</dd></div><div><dt>Email</dt><dd>{student.email || '—'}</dd></div><div><dt>Phone</dt><dd>{student.phone || '—'}</dd></div><div><dt>Status</dt><dd><Badge tone={student.status === 'active' ? 'success' : 'warning'}>{student.status}</Badge></dd></div>
  </dl>{student.guardians.length > 0 && <div style={{ marginTop: 'var(--space-4)' }}><h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Guardians</h3>{student.guardians.map(g => <div key={g.id} style={{ padding: 'var(--space-2)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)' }}><strong>{g.full_name}</strong> ({g.relationship}) — {g.phone}</div>)}</div>}</div>
}
