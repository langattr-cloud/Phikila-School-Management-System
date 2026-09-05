import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { EmptyState, LoadingBlock } from '../components/States'
import { api, type AcademicYear, type Grade, type Level, type SchoolProfile, type StudentListItem, type Term } from '../lib/api'
import { examinations, type ExamEntry, type ExamSeries, type ExamSubject, type Examination, type GradeScale, type StudentResult } from '../lib/examinations'
import { scheduling, type Subject, type Teacher } from '../lib/scheduling'
import { friendlyApiError } from '../lib/api'
import '../report-card.css'

type ComparisonRow = {
  subjectId: number
  subjectName: string
  previousAssignment?: ExamSubject
  currentAssignment?: ExamSubject
  previousEntry?: ExamEntry
  currentEntry?: ExamEntry
  teacherName: string
}

const fullName = (student: StudentListItem) => [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')
const formatScore = (score: number | null | undefined) => score == null ? '—' : Number.isInteger(score) ? String(score) : score.toFixed(1)
const formatNumber = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
const examTime = (exam: Examination) => exam.exam_date ? new Date(`${exam.exam_date}T00:00:00`).getTime() : 0
const examSort = (a: Examination, b: Examination) => examTime(a) - examTime(b) || a.id - b.id
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'P'
const gradeTone = (grade: string | null | undefined) => {
  if (!grade) return ''
  const match = grade.match(/(\d+)/)
  const points = match ? Number(match[1]) : 0
  return points >= 7 ? 'grade-ee' : points >= 5 ? 'grade-me' : points >= 3 ? 'grade-ae' : 'grade-be'
}
const scaleClass = (points: number | null | undefined) => points && points >= 1 && points <= 8 ? `scale-${points}` : 'scale-default'

export default function ReportCardPage() {
  const [exams, setExams] = useState<Examination[]>([])
  const [series, setSeries] = useState<ExamSeries[]>([])
  const [students, setStudents] = useState<StudentListItem[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [school, setSchool] = useState<SchoolProfile | null>(null)
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [gradeScale, setGradeScale] = useState<GradeScale[]>([])
  const [examId, setExamId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [currentAssignments, setCurrentAssignments] = useState<ExamSubject[]>([])
  const [previousAssignments, setPreviousAssignments] = useState<ExamSubject[]>([])
  const [currentEntries, setCurrentEntries] = useState<ExamEntry[]>([])
  const [previousEntries, setPreviousEntries] = useState<ExamEntry[]>([])
  const [currentResult, setCurrentResult] = useState<StudentResult | null>(null)
  const [previousResult, setPreviousResult] = useState<StudentResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingCard, setLoadingCard] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      examinations.list(), examinations.listSeries(), api.students(), scheduling.subjects(), scheduling.teachers(), api.school(),
      api.academicYears(), api.terms(), api.levels(), api.grades(), examinations.listGradeScale(),
    ]).then(([nextExams, nextSeries, nextStudents, nextSubjects, nextTeachers, nextSchool, nextYears, nextTerms, nextLevels, nextGrades, nextScale]) => {
      setExams(nextExams); setSeries(nextSeries); setStudents(nextStudents.items); setSubjects(nextSubjects); setTeachers(nextTeachers); setSchool(nextSchool)
      setAcademicYears(nextYears); setTerms(nextTerms); setLevels(nextLevels); setGrades(nextGrades); setGradeScale(nextScale)
      const ordered = [...nextExams].sort((a, b) => examSort(b, a));
      if (ordered.length) setExamId(String(ordered[0].id))
    }).catch(err => setError(friendlyApiError(err, 'load report-card data'))).finally(() => setLoading(false))
  }, [])

  const selectedExam = exams.find(item => item.id === Number(examId))
  const selectedStudent = students.find(item => item.id === Number(studentId))
  const previousExam = useMemo(() => {
    if (!selectedExam) return null
    return [...exams].filter(item => item.id !== selectedExam.id && examSort(item, selectedExam) < 0).sort((a, b) => examSort(b, a))[0] || null
  }, [exams, selectedExam])
  const visibleStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase()
    if (!q) return students.slice(0, 80)
    return students.filter(item => `${fullName(item)} ${item.admission_number}`.toLowerCase().includes(q)).slice(0, 80)
  }, [students, studentQuery])

  useEffect(() => {
    if (!selectedExam || !selectedStudent) {
      setCurrentAssignments([]); setPreviousAssignments([]); setCurrentEntries([]); setPreviousEntries([]); setCurrentResult(null); setPreviousResult(null); return
    }
    let cancelled = false
    setLoadingCard(true); setError(null)
    void (async () => {
      try {
        const currentAssignmentsNext = await examinations.listSubjects(selectedExam.id)
        const currentEntriesNext = await examinations.listEntries(selectedExam.id, undefined, selectedStudent.id)
        const currentContext = currentAssignmentsNext[0] ? { academic_year_id: currentAssignmentsNext[0].academic_year_id, level_id: currentAssignmentsNext[0].level_id, grade_id: currentAssignmentsNext[0].grade_id, stream_id: currentAssignmentsNext[0].stream_id } : {}
        const currentResults = await examinations.generateResults(selectedExam.id, currentContext)
        let previousAssignmentsNext: ExamSubject[] = []
        let previousEntriesNext: ExamEntry[] = []
        let previousResultNext: StudentResult | null = null
        if (previousExam) {
          previousAssignmentsNext = await examinations.listSubjects(previousExam.id)
          previousEntriesNext = await examinations.listEntries(previousExam.id, undefined, selectedStudent.id)
          const previousContext = previousAssignmentsNext[0] ? { academic_year_id: previousAssignmentsNext[0].academic_year_id, level_id: previousAssignmentsNext[0].level_id, grade_id: previousAssignmentsNext[0].grade_id, stream_id: previousAssignmentsNext[0].stream_id } : {}
          const previousResults = await examinations.generateResults(previousExam.id, previousContext)
          previousResultNext = previousResults.find(item => item.student_id === selectedStudent.id) || null
        }
        if (cancelled) return
        setCurrentAssignments(currentAssignmentsNext); setCurrentEntries(currentEntriesNext); setCurrentResult(currentResults.find(item => item.student_id === selectedStudent.id) || null)
        setPreviousAssignments(previousAssignmentsNext); setPreviousEntries(previousEntriesNext); setPreviousResult(previousResultNext)
      } catch (err) {
        if (!cancelled) setError(friendlyApiError(err, 'load the student report card'))
      } finally {
        if (!cancelled) setLoadingCard(false)
      }
    })()
    return () => { cancelled = true }
  }, [selectedExam, selectedStudent, previousExam])

  const subjectById = useMemo(() => new Map(subjects.map(subject => [subject.id, subject])), [subjects])
  const teacherById = useMemo(() => new Map(teachers.map(teacher => [teacher.id, teacher])), [teachers])
  const rows = useMemo<ComparisonRow[]>(() => {
    const currentMap = new Map(currentAssignments.map(item => [item.subject_id, item]))
    const previousMap = new Map(previousAssignments.map(item => [item.subject_id, item]))
    const currentEntryMap = new Map(currentEntries.map(item => [item.subject_id, item]))
    const previousEntryMap = new Map(previousEntries.map(item => [item.subject_id, item]))
    const ids = [...new Set([...currentAssignments.map(item => item.subject_id), ...previousAssignments.map(item => item.subject_id)])]
    return ids.map(subjectId => {
      const currentAssignment = currentMap.get(subjectId)
      const previousAssignment = previousMap.get(subjectId)
      const teacher = currentAssignment?.teacher_id != null ? teacherById.get(currentAssignment.teacher_id) : undefined
      const previousTeacher = previousAssignment?.teacher_id != null ? teacherById.get(previousAssignment.teacher_id) : undefined
      return { subjectId, subjectName: subjectById.get(subjectId)?.name || `Subject ${subjectId}`, currentAssignment, previousAssignment, currentEntry: currentEntryMap.get(subjectId), previousEntry: previousEntryMap.get(subjectId), teacherName: teacher?.name || previousTeacher?.name || '—' }
    })
  }, [currentAssignments, previousAssignments, currentEntries, previousEntries, subjectById, teacherById])

  const currentAssignment = currentAssignments[0]
  const currentGrade = grades.find(item => item.id === currentAssignment?.grade_id)
  const currentLevel = levels.find(item => item.id === currentAssignment?.level_id)
  const selectedSeries = series.find(item => item.id === selectedExam?.series_id)
  const academicYear = academicYears.find(item => item.id === selectedSeries?.academic_year_id)
  const term = terms.find(item => item.id === selectedSeries?.term_id)
  const currentTotal = rows.reduce((sum, row) => sum + (row.currentEntry?.score ?? 0), 0)
  const currentMax = rows.reduce((sum, row) => sum + (row.currentAssignment?.total_marks ?? 0), 0)
  const previousTotal = rows.reduce((sum, row) => sum + (row.previousEntry?.score ?? 0), 0)
  const previousMax = rows.reduce((sum, row) => sum + (row.previousAssignment?.total_marks ?? 0), 0)
  const currentPercentage = currentResult?.percentage ?? (currentMax ? (currentTotal / currentMax) * 100 : null)
  const previousPercentage = previousResult?.percentage ?? (previousMax ? (previousTotal / previousMax) * 100 : null)
  const overallDeviation = currentPercentage != null && previousPercentage != null ? currentPercentage - previousPercentage : null
  const currentAverage = currentResult?.average ?? (rows.filter(row => row.currentEntry?.score != null).length ? rows.reduce((sum, row) => sum + ((row.currentEntry!.score! / (row.currentAssignment?.total_marks || 1)) * 100), 0) / rows.filter(row => row.currentEntry?.score != null).length : null)
  const previousAverage = previousResult?.average ?? (rows.filter(row => row.previousEntry?.score != null).length ? rows.reduce((sum, row) => sum + ((row.previousEntry!.score! / (row.previousAssignment?.total_marks || 1)) * 100), 0) / rows.filter(row => row.previousEntry?.score != null).length : null)
  const currentOverallGrade = currentResult?.grade || currentResult?.band || null
  const previousOverallGrade = previousResult?.grade || previousResult?.band || null
  const scaleForCurrent = useMemo(() => {
    const levelHint = `${currentLevel?.code || ''} ${currentLevel?.name || ''}`.toLowerCase()
    const educationLevel = levelHint.includes('primary') ? 'primary' : levelHint.includes('senior') ? 'senior' : levelHint.includes('junior') ? 'junior' : null
    const matching = gradeScale.filter(item => item.education_level == null || item.education_level === educationLevel)
    return matching.sort((a, b) => (a.points ?? 99) - (b.points ?? 99) || a.min_score - b.min_score)
  }, [gradeScale, currentLevel])

  const deviationDisplay = (previous: number | null | undefined, current: number | null | undefined) => {
    if (previous == null || current == null) return <span className="deviation deviation--new">New</span>
    const delta = current - previous
    return <span className={`deviation ${delta > 0 ? 'deviation--up' : delta < 0 ? 'deviation--down' : 'deviation--flat'}`}><strong>{delta > 0 ? '+' : ''}{formatNumber(delta, 1)} pp</strong><span aria-hidden="true">{delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}</span></span>
  }

  return <>
    <div className="no-print">
      <PageHeader title="Student Report Card" description="Generate, review and print a comparison of the selected student's previous and current assessments." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Examinations', to: '/examinations' }, { label: 'Report Card' }]} actions={<button className="button button--primary" disabled={!selectedStudent || !selectedExam || loadingCard} onClick={() => window.print()}>Print / Save PDF</button>} />
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <LoadingBlock label="Loading report-card data" rows={4} /> : <section className="card section report-card-controls"><div className="form form--grid"><div className="field"><label className="field__label" htmlFor="report-exam">Current assessment</label><select id="report-exam" className="input" value={examId} onChange={e => setExamId(e.target.value)}><option value="">Select assessment</option>{[...exams].sort((a, b) => examSort(b, a)).map(exam => <option key={exam.id} value={exam.id}>{exam.name}{exam.exam_date ? ` · ${exam.exam_date}` : ''}</option>)}</select></div><div className="field"><label className="field__label" htmlFor="student-search">Find student</label><input id="student-search" className="input" value={studentQuery} onChange={e => setStudentQuery(e.target.value)} placeholder="Name or admission number" /></div><div className="field"><label className="field__label" htmlFor="report-student">Student</label><select id="report-student" className="input" value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">Select student</option>{visibleStudents.map(student => <option key={student.id} value={student.id}>{fullName(student)} · {student.admission_number}</option>)}</select></div></div></section>}
    </div>

    {!selectedExam || !selectedStudent ? <div className="no-print"><EmptyState title="Choose an assessment and student" description="The completed comparison report will appear here for review and printing." /></div> : loadingCard ? <LoadingBlock label="Preparing comparison report" rows={8} /> : <article className="report-card-print">
      <header className="report-card-header">
        <div className="report-card-brand"><img src="/brand/phikila-mark.svg" alt="" className="report-card-mark" /><span>{initials(school?.name || 'Phikila')}</span></div>
        <div className="report-card-header-copy"><div className="report-card-kicker">{currentLevel?.name || 'School Assessment'}</div><h1>{school?.name || 'School'}</h1><div className="report-card-title">Assessment Report</div><div className="report-card-subtitle">{selectedExam.description || selectedExam.name}</div></div>
      </header>

      <section className="report-card-meta"><span><strong>Academic Year:</strong> {academicYear?.name || '—'}</span><span><strong>Term:</strong> {term?.name || '—'}</span><span><strong>Current:</strong> {selectedExam.name}</span><span><strong>Previous:</strong> {previousExam?.name || 'No previous assessment'}</span></section>

      <section className="report-student-grid"><div><span>LEARNER'S NAME</span><strong>{fullName(selectedStudent)}</strong></div><div><span>ADMISSION NO.</span><strong>{selectedStudent.admission_number}</strong></div><div><span>GRADE / CLASS</span><strong>{currentGrade?.name || currentLevel?.name || '—'}</strong></div><div><span>UPI NO.</span><strong>—</strong></div></section>

      <section className="report-comparison-banner"><div><span>PREVIOUS ASSESSMENT</span><strong>{previousExam?.name || 'Not available'}</strong></div><div className="comparison-arrow" aria-hidden="true">→</div><div><span>CURRENT ASSESSMENT</span><strong>{selectedExam.name}</strong></div></section>

      <table className="report-card-table"><thead><tr><th rowSpan={2}>LEARNING AREA</th><th colSpan={2}>{previousExam?.name || 'Previous'}</th><th colSpan={2}>{selectedExam.name}</th><th rowSpan={2}>DEVIATION</th><th rowSpan={2}>SUBJECT TEACHER</th></tr><tr><th>SCORE</th><th>OUTCOME</th><th>SCORE</th><th>OUTCOME</th></tr></thead><tbody>{rows.map(row => <tr key={row.subjectId}><td>{row.subjectName}</td><td>{formatScore(row.previousEntry?.score)}</td><td><span className={`report-grade ${gradeTone(row.previousEntry?.grade)}`}>{row.previousEntry?.grade || '—'}</span></td><td>{formatScore(row.currentEntry?.score)}</td><td><span className={`report-grade ${gradeTone(row.currentEntry?.grade)}`}>{row.currentEntry?.grade || '—'}</span></td><td>{deviationDisplay(row.previousEntry?.percentage ?? (row.previousEntry?.score != null && row.previousAssignment ? (row.previousEntry.score / row.previousAssignment.total_marks) * 100 : null), row.currentEntry?.percentage ?? (row.currentEntry?.score != null && row.currentAssignment ? (row.currentEntry.score / row.currentAssignment.total_marks) * 100 : null))}</td><td>{row.teacherName}</td></tr>)}</tbody><tfoot><tr><th>TOTAL SCORE</th><th>{formatScore(previousTotal)}</th><th></th><th>{formatScore(currentTotal)}</th><th></th><th>{deviationDisplay(previousPercentage, currentPercentage)}</th><th></th></tr><tr><th>AVERAGE</th><th colSpan={2}>{formatNumber(previousAverage, 2)}{previousAverage != null ? '%' : ''}</th><th colSpan={2}>{formatNumber(currentAverage, 2)}{currentAverage != null ? '%' : ''}</th><th>{deviationDisplay(previousAverage, currentAverage)}</th><th></th></tr></tfoot></table>

      <section className="report-overall"><div><span>PREVIOUS OVERALL</span><strong>{previousOverallGrade || '—'}</strong></div><div className="report-overall-progress"><span>OVERALL CHANGE</span><strong>{overallDeviation == null ? '—' : `${overallDeviation > 0 ? '+' : ''}${formatNumber(overallDeviation, 1)} percentage points`}</strong><small>{overallDeviation == null ? 'No earlier result available' : overallDeviation > 0 ? 'Improved' : overallDeviation < 0 ? 'Declined' : 'Maintained'}</small></div><div><span>CURRENT OVERALL</span><strong>{currentOverallGrade || '—'}</strong></div></section>

      <section className="report-infographic"><div className="report-section-heading"><h2>Performance Comparison</h2><span>Previous vs Current</span></div><div className="chart-legend"><span><i className="legend-swatch legend-previous" /> Previous</span><span><i className="legend-swatch legend-current" /> Current</span></div><div className="comparison-chart">{rows.map(row => { const previous = row.previousEntry?.percentage ?? (row.previousEntry?.score != null && row.previousAssignment ? (row.previousEntry.score / row.previousAssignment.total_marks) * 100 : null); const current = row.currentEntry?.percentage ?? (row.currentEntry?.score != null && row.currentAssignment ? (row.currentEntry.score / row.currentAssignment.total_marks) * 100 : null); const max = Math.max(previous ?? 0, current ?? 0, 1); return <div className="chart-row" key={row.subjectId}><div className="chart-label">{row.subjectName}</div><div className="chart-bars"><div className="chart-bar-line"><span className="chart-bar chart-bar--previous" style={{ width: `${((previous ?? 0) / 100) * 100}%` }} /><b>{previous == null ? '—' : `${formatNumber(previous, 0)}%`}</b></div><div className="chart-bar-line"><span className="chart-bar chart-bar--current" style={{ width: `${((current ?? 0) / 100) * 100}%` }} /><b>{current == null ? '—' : `${formatNumber(current, 0)}%`}</b></div></div><div className="chart-delta">{max > 0 ? deviationDisplay(previous, current) : '—'}</div></div>})}</div></section>

      {scaleForCurrent.length > 0 && <section className="report-key"><div className="report-section-heading"><h2>Assessment Scale</h2><span>Configured for this school</span></div><div className="scale-grid">{scaleForCurrent.map(item => <div className={`scale-item ${scaleClass(item.points)}`} key={item.id}><strong>{item.grade}</strong><span>{item.description || `${item.min_score}–${item.max_score}`}</span>{item.points != null && <small>{item.points} point{item.points === 1 ? '' : 's'}</small>}</div>)}</div></section>}

      <section className="report-remarks"><div><strong>CLASS TEACHER'S REMARKS</strong><div className="remarks-line" /><div className="remarks-line" /><div className="signature-row"><span>Signature</span><i /></div></div><div><strong>HEAD TEACHER'S REMARKS</strong><div className="remarks-line" /><div className="remarks-line" /><div className="signature-row"><span>Signature</span><i /></div></div></section>
      <footer className="report-footer"><span>Parent/Guardian: ____________________</span><span>Date: ____________________</span><span>Next Term Begins: ____________________</span><span className="stamp-box">School Stamp</span></footer>
    </article>}
  </>
}
