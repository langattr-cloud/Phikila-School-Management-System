import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { api, type AcademicYear, type Grade, type Level, type Stream, type StreamStudent } from '../lib/api'
import { examinations, type ExamSubject, type Examination } from '../lib/examinations'
import { scheduling, type Teacher } from '../lib/scheduling'
import { friendlyApiError } from '../lib/api'

const nameOf = (row: StreamStudent) => [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ')

type Principal = { role?: string; teacher_id?: number | null }

export default function MarkAccessPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [exams, setExams] = useState<Examination[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [streams, setStreams] = useState<Stream[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([])
  const [assignments, setAssignments] = useState<ExamSubject[]>([])
  const [students, setStudents] = useState<StreamStudent[]>([])
  const [entries, setEntries] = useState<Record<number, { score: string; remarks: string }>>({})
  const [examId, setExamId] = useState('')
  const [yearId, setYearId] = useState('')
  const [levelId, setLevelId] = useState('')
  const [gradeId, setGradeId] = useState('')
  const [streamId, setStreamId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isDos = principal?.role === 'scheduler' || principal?.role === 'admin'
  const selectedExam = exams.find(item => item.id === Number(examId))
  const selectedAssignment = assignments.find(item => item.subject_id === Number(subjectId) && item.stream_id === Number(streamId) && item.grade_id === Number(gradeId))
  const canUpload = Boolean(selectedAssignment && (isDos || (principal?.role === 'teacher' && principal.teacher_id === selectedAssignment.teacher_id)))

  const visibleAssignments = useMemo(() => assignments.filter(item =>
    (!yearId || item.academic_year_id === Number(yearId)) &&
    (!levelId || item.level_id === Number(levelId)) &&
    (!gradeId || item.grade_id === Number(gradeId)) &&
    (!streamId || item.stream_id === Number(streamId))
  ), [assignments, yearId, levelId, gradeId, streamId])

  useEffect(() => {
    void Promise.all([
      scheduling.me(),
      examinations.list(),
      api.academicYears(),
      api.levels(),
      scheduling.teachers(),
      scheduling.subjects(),
    ]).then(([me, nextExams, nextYears, nextLevels, nextTeachers, nextSubjects]) => {
      setPrincipal(me)
      setExams(nextExams)
      setYears(nextYears)
      setLevels(nextLevels)
      setTeachers(nextTeachers)
      setSubjects(nextSubjects.map(item => ({ id: item.id, name: item.name })))
      const currentYear = nextYears.find(item => item.is_current) ?? nextYears[0]
      if (currentYear) setYearId(String(currentYear.id))
      if (nextExams[0]) setExamId(String(nextExams[0].id))
    }).catch(err => setError(friendlyApiError(err, 'load mark access'))).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!levelId) { setGrades([]); setGradeId(''); setStreams([]); setStreamId(''); return }
    void api.grades(Number(levelId)).then(setGrades).catch(() => setGrades([]))
  }, [levelId])

  useEffect(() => {
    if (!yearId || !gradeId) { setStreams([]); setStreamId(''); return }
    void api.streams(Number(yearId), Number(gradeId)).then(setStreams).catch(() => setStreams([]))
  }, [yearId, gradeId])

  useEffect(() => {
    if (!selectedExam) { setAssignments([]); return }
    void examinations.listSubjects(selectedExam.id).then(setAssignments).catch(err => setError(friendlyApiError(err, 'load subject assignments')))
  }, [selectedExam])

  useEffect(() => {
    if (!streamId) { setStudents([]); return }
    void api.streamStudents(Number(streamId)).then(setStudents).catch(err => setError(friendlyApiError(err, 'load stream learners')))
  }, [streamId])

  useEffect(() => {
    if (!selectedExam || !selectedAssignment) { setEntries({}); return }
    void examinations.listEntries(selectedExam.id, selectedAssignment.subject_id).then(rows => {
      const next: Record<number, { score: string; remarks: string }> = {}
      rows.forEach(row => { next[row.student_id] = { score: row.score == null ? '' : String(row.score), remarks: row.remarks ?? '' } })
      setEntries(next)
    }).catch(err => setError(friendlyApiError(err, 'load marks')))
  }, [selectedExam, selectedAssignment])

  async function assignTeacher() {
    if (!selectedExam || !yearId || !levelId || !gradeId || !streamId || !subjectId) return
    setBusy(true); setMessage(null)
    try {
      const existing = assignments.find(item => item.exam_id === selectedExam.id && item.subject_id === Number(subjectId) && item.academic_year_id === Number(yearId) && item.grade_id === Number(gradeId) && item.stream_id === Number(streamId))
      const payload = {
        subject_id: Number(subjectId), academic_year_id: Number(yearId), level_id: Number(levelId), grade_id: Number(gradeId), stream_id: Number(streamId),
        teacher_id: assignmentTeacherId ? Number(assignmentTeacherId) : null,
        total_marks: existing?.total_marks ?? selectedExam.total_marks,
      }
      if (existing) await examinations.updateSubject(selectedExam.id, existing.id, payload)
      else await examinations.assignSubject(selectedExam.id, payload)
      setAssignments(await examinations.listSubjects(selectedExam.id))
      setMessage('Teacher assignment saved. The assigned teacher can upload marks; other teachers remain view-only.')
    } catch (err) { setMessage(friendlyApiError(err, 'save teacher assignment')) }
    finally { setBusy(false) }
  }

  const [assignmentTeacherId, setAssignmentTeacherId] = useState('')

  useEffect(() => {
    const teacher = visibleAssignments.find(item => item.subject_id === Number(subjectId))?.teacher_id
    setAssignmentTeacherId(teacher ? String(teacher) : '')
  }, [visibleAssignments, subjectId])

  async function saveMarks() {
    if (!selectedExam || !selectedAssignment || !canUpload) return
    setBusy(true); setMessage(null)
    try {
      const payload = students.filter(student => entries[student.id]?.score !== '').map(student => ({
        student_id: student.id,
        subject_id: selectedAssignment.subject_id,
        score: Number(entries[student.id]?.score),
        remarks: entries[student.id]?.remarks || null,
      }))
      const result = await examinations.enterScores(selectedExam.id, payload)
      setMessage(`Saved ${result.created + result.updated} mark${result.created + result.updated === 1 ? '' : 's'}.`)
    } catch (err) { setMessage(friendlyApiError(err, 'save marks')) }
    finally { setBusy(false) }
  }

  if (loading) return <LoadingBlock label="Loading mark access" rows={7} />

  return <div>
    <PageHeader title="Marks Access & Upload" description="Use the same Level → Grade → Stream workflow for DOS assignments and teacher mark entry." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Examinations', to: '/examinations' }, { label: 'Marks Access' }]} />
    {error && <Alert tone="error">{error}</Alert>}
    {message && <Alert tone="info">{message}</Alert>}

    <section className="card section">
      <h2 className="section__title">1. Select academic context</h2>
      <div className="form form--grid">
        <Select label="Examination" value={examId} options={exams.map(item => [item.id, item.name])} onChange={setExamId} />
        <Select label="Academic year" value={yearId} options={years.map(item => [item.id, item.name])} onChange={value => { setYearId(value); setGradeId(''); setStreamId('') }} />
        <Select label="Level" value={levelId} options={levels.map(item => [item.id, item.name])} onChange={value => { setLevelId(value); setGradeId(''); setStreamId('') }} />
        <Select label="Grade" value={gradeId} options={grades.map(item => [item.id, item.name])} onChange={value => { setGradeId(value); setStreamId('') }} />
        <Select label="Stream" value={streamId} options={streams.map(item => [item.id, item.name])} onChange={value => setStreamId(value)} />
        <Select label="Subject" value={subjectId} options={visibleAssignments.length ? visibleAssignments.map(item => [item.subject_id, subjects.find(subject => subject.id === item.subject_id)?.name ?? `Subject ${item.subject_id}`] as [number, string]) : subjects.map(item => [item.id, item.name] as [number, string])} onChange={setSubjectId} />
      </div>
    </section>

    {isDos && selectedExam && levelId && gradeId && streamId && subjectId && <section className="card section">
      <h2 className="section__title">2. DOS teacher permission</h2>
      <p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>Assign a teacher to this exact Level, Grade, Stream and Subject. Assignment is the explicit permission to upload marks for that context.</p>
      <div className="form form--grid">
        <Select label="Teacher" value={assignmentTeacherId} options={teachers.map(item => [item.id, item.name])} onChange={setAssignmentTeacherId} />
      </div>
      <button className="button button--primary" disabled={busy || selectedExam.status === 'published' || selectedExam.status === 'locked'} onClick={assignTeacher}>{busy ? 'Saving…' : 'Grant / Update Upload Permission'}</button>
    </section>}

    {streamId && subjectId && <section className="card section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div><h2 className="section__title">3. {canUpload ? 'Upload marks' : 'View marks'}</h2><p style={{ color: 'var(--color-ink-muted)', margin: 0 }}>{selectedAssignment ? `${subjects.find(item => item.id === selectedAssignment.subject_id)?.name ?? 'Subject'} · ${streams.find(item => item.id === Number(streamId))?.name ?? ''}` : 'No assignment exists for this context yet.'}</p></div>
        {selectedAssignment && <Badge tone={canUpload ? 'success' : 'info'}>{canUpload ? 'Upload permission granted' : 'View only'}</Badge>}
      </div>
      {!selectedAssignment ? <EmptyState title="Subject not assigned" description="DOS must assign a teacher to this subject and stream before marks can be uploaded." /> : <>
        <div style={{ overflowX: 'auto', marginTop: 'var(--space-3)' }}>
          <table style={{ width: '100%' }}><thead><tr><th>Learner</th><th>Admission No.</th><th>Score / {selectedAssignment.total_marks}</th><th>Remarks</th></tr></thead><tbody>
            {students.map(student => <tr key={student.id}><td>{nameOf(student)}</td><td>{student.admission_number}</td><td><input className="input" style={{ minWidth: '7rem' }} type="number" min="0" max={selectedAssignment.total_marks} disabled={!canUpload} value={entries[student.id]?.score ?? ''} onChange={event => setEntries(current => ({ ...current, [student.id]: { score: event.target.value, remarks: current[student.id]?.remarks ?? '' } }))} /></td><td><input className="input" disabled={!canUpload} value={entries[student.id]?.remarks ?? ''} onChange={event => setEntries(current => ({ ...current, [student.id]: { score: current[student.id]?.score ?? '', remarks: event.target.value } }))} /></td></tr>)}
          </tbody></table>
        </div>
        {canUpload && <button className="button button--primary" style={{ marginTop: 'var(--space-3)' }} disabled={busy} onClick={saveMarks}>{busy ? 'Saving…' : 'Save Marks'}</button>}
      </>}
    </section>}
  </div>
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<[number, string]>; onChange: (value: string) => void }) {
  return <div className="field"><label className="field__label">{label}</label><select className="input" value={value} onChange={event => onChange(event.target.value)}><option value="">Select {label.toLowerCase()}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
}
