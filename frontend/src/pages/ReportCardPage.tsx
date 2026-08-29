import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { api, type SchoolProfile, type StudentListItem } from '../lib/api'
import { examinations, type ExamSubject, type Examination, type ExamEntry } from '../lib/examinations'
import { scheduling, type Subject } from '../lib/scheduling'
import { friendlyApiError } from '../lib/api'

type Row = ExamSubject & { subjectName: string; entry?: ExamEntry }

const fullName = (student: StudentListItem) => [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')
const outcomeLabel = (grade: string | null | undefined) => grade || '—'
const formatScore = (score: number | null | undefined) => score == null ? '—' : Number.isInteger(score) ? String(score) : score.toFixed(1)

export default function ReportCardPage() {
  const [exams, setExams] = useState<Examination[]>([])
  const [students, setStudents] = useState<StudentListItem[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [school, setSchool] = useState<SchoolProfile | null>(null)
  const [examId, setExamId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [assignments, setAssignments] = useState<ExamSubject[]>([])
  const [entries, setEntries] = useState<ExamEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCard, setLoadingCard] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([examinations.list(), api.students(), scheduling.subjects(), api.school()])
      .then(([nextExams, nextStudents, nextSubjects, nextSchool]) => {
        setExams(nextExams)
        setStudents(nextStudents.items)
        setSubjects(nextSubjects)
        setSchool(nextSchool)
        if (nextExams.length) setExamId(String(nextExams[0].id))
      })
      .catch(err => setError(friendlyApiError(err, 'load report-card data')))
      .finally(() => setLoading(false))
  }, [])

  const selectedExam = exams.find(item => item.id === Number(examId))
  const selectedStudent = students.find(item => item.id === Number(studentId))
  const visibleStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase()
    if (!q) return students.slice(0, 80)
    return students.filter(item => `${fullName(item)} ${item.admission_number}`.toLowerCase().includes(q)).slice(0, 80)
  }, [students, studentQuery])

  useEffect(() => {
    if (!selectedExam || !selectedStudent) {
      setAssignments([])
      setEntries([])
      return
    }
    setLoadingCard(true)
    setError(null)
    void Promise.all([
      examinations.listSubjects(selectedExam.id),
      examinations.listEntries(selectedExam.id, undefined, selectedStudent.id),
    ])
      .then(([nextAssignments, nextEntries]) => { setAssignments(nextAssignments); setEntries(nextEntries) })
      .catch(err => setError(friendlyApiError(err, 'load the student report card')))
      .finally(() => setLoadingCard(false))
  }, [selectedExam, selectedStudent])

  const rows = useMemo<Row[]>(() => assignments.map(assignment => ({
    ...assignment,
    subjectName: subjects.find(subject => subject.id === assignment.subject_id)?.name || `Subject ${assignment.subject_id}`,
    entry: entries.find(entry => entry.subject_id === assignment.subject_id),
  })), [assignments, entries, subjects])

  const total = rows.reduce((sum, row) => sum + (row.entry?.score ?? 0), 0)
  const maxTotal = rows.reduce((sum, row) => sum + row.total_marks, 0)
  const percentage = maxTotal ? (total / maxTotal) * 100 : 0
  const averagePoints = rows.length ? rows.reduce((sum, row) => sum + (row.entry?.score == null ? 0 : ((row.entry.score / row.total_marks) * 8)), 0) / rows.filter(row => row.entry?.score != null).length : 0
  const overallBand = percentage >= 80 ? 'EE2' : percentage >= 70 ? 'EE1' : percentage >= 60 ? 'ME2' : percentage >= 50 ? 'ME1' : percentage >= 40 ? 'AE2' : percentage >= 30 ? 'AE1' : percentage >= 20 ? 'BE2' : 'BE1'

  return <>
    <div className="no-print">
      <PageHeader title="Student Report Card" description="Generate, review and print a professional CBC/KNEC-style student assessment report." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Examinations', to: '/examinations' }, { label: 'Report Card' }]} actions={<button className="button button--primary" disabled={!selectedStudent || !selectedExam} onClick={() => window.print()}>Print / Save PDF</button>} />
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <LoadingBlock label="Loading report-card data" rows={4} /> : <section className="card section">
        <div className="form form--grid">
          <div className="field"><label className="field__label" htmlFor="report-exam">Examination</label><select id="report-exam" className="input" value={examId} onChange={event => setExamId(event.target.value)}><option value="">Select examination</option>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.name}{exam.exam_date ? ` · ${exam.exam_date}` : ''}</option>)}</select></div>
          <div className="field"><label className="field__label" htmlFor="student-search">Find student</label><input id="student-search" className="input" value={studentQuery} onChange={event => setStudentQuery(event.target.value)} placeholder="Name or admission number" /></div>
          <div className="field"><label className="field__label" htmlFor="report-student">Student</label><select id="report-student" className="input" value={studentId} onChange={event => setStudentId(event.target.value)}><option value="">Select student</option>{visibleStudents.map(student => <option key={student.id} value={student.id}>{fullName(student)} · {student.admission_number}</option>)}</select></div>
        </div>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem', marginBottom: 0 }}>Select an examination and student. The printable report uses the marks already entered for that examination.</p>
      </section>}
    </div>

    {!selectedExam || !selectedStudent ? <div className="no-print"><EmptyState title="Choose an examination and student" description="The completed report card will appear here for review and printing." /></div> : loadingCard ? <LoadingBlock label="Preparing report card" rows={8} /> : <article className="report-card-print">
      <header className="report-card-header">
        <div className="report-card-logo" aria-hidden="true">{school?.name?.slice(0, 1) || 'P'}</div>
        <div><div className="report-card-kicker">JUNIOR SECONDARY SCHOOL</div><h1>{school?.name || 'PHIKILA SCHOOL'}</h1><div className="report-card-title">STUDENT ASSESSMENT REPORT</div><div className="report-card-subtitle">CBC · KNEC 8-LEVEL SCALE</div></div>
      </header>
      <div className="report-card-meta"><span><strong>EXAMINATION:</strong> {selectedExam.name}</span><span><strong>DATE:</strong> {selectedExam.exam_date || '—'}</span></div>
      <section className="report-student-grid">
        <div><span>LEARNER'S NAME</span><strong>{fullName(selectedStudent)}</strong></div><div><span>ADMISSION NO.</span><strong>{selectedStudent.admission_number}</strong></div><div><span>UPI NO.</span><strong>—</strong></div><div><span>STATUS</span><strong>{selectedStudent.status}</strong></div>
      </section>
      <section className="report-summary-grid">
        <div><span>TOTAL SCORE</span><strong>{formatScore(total)} / {formatScore(maxTotal)}</strong></div><div><span>PERCENTAGE</span><strong>{percentage.toFixed(1)}%</strong></div><div><span>AVERAGE POINTS</span><strong>{Number.isFinite(averagePoints) ? averagePoints.toFixed(2) : '—'}</strong></div><div><span>OVERALL OUTCOME</span><strong>{overallBand}</strong></div>
      </section>
      <table className="report-card-table"><thead><tr><th>LEARNING AREA</th><th>MAX</th><th>SCORE</th><th>%</th><th>OUTCOME</th><th>REMARK</th></tr></thead><tbody>{rows.map(row => { const score = row.entry?.score ?? null; const pct = score == null ? null : (score / row.total_marks) * 100; return <tr key={row.id}><td>{row.subjectName}</td><td>{row.total_marks}</td><td>{formatScore(score)}</td><td>{pct == null ? '—' : `${pct.toFixed(1)}%`}</td><td><Badge tone={row.entry?.grade?.startsWith('EE') ? 'success' : row.entry?.grade?.startsWith('AE') ? 'warning' : 'info'}>{outcomeLabel(row.entry?.grade)}</Badge></td><td>{row.entry?.remarks || '—'}</td></tr>})}</tbody><tfoot><tr><th>TOTAL</th><th>{maxTotal}</th><th>{formatScore(total)}</th><th>{maxTotal ? `${percentage.toFixed(1)}%` : '—'}</th><th>{overallBand}</th><th></th></tr></tfoot></table>
      <section className="report-key"><strong>KEY:</strong> BE1 (1) / BE2 (2) = Below Expectations · AE1 (3) / AE2 (4) = Approaching Expectations · ME1 (5) / ME2 (6) = Meeting Expectations · EE1 (7) / EE2 (8) = Exceeding Expectations</section>
      <section className="report-remarks"><div><strong>CLASS TEACHER'S REMARKS</strong><div className="signature-line" /></div><div><strong>HEAD TEACHER'S REMARKS</strong><div className="signature-line" /></div></section>
      <footer className="report-footer"><span>Class Teacher: __________________</span><span>Head Teacher: __________________</span><span>Parent/Guardian: ______________</span><span>Date: ______________</span></footer>
    </article>}
  </>
}
