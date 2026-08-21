import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { api, type AcademicYear, type Grade, type Level, type Stream, type StudentListItem } from '../lib/api'
import { apiFetch, friendlyApiError } from '../lib/api'
import {
  examinations,
  type ExamSeries,
  type Examination,
  type ExamSubject,
  type ResultsAnalysis,
  type StudentResult,
} from '../lib/examinations'

type Tab = 'setup' | 'marks' | 'results'
type Option = [number, string]

export default function ExaminationsPage() {
  const [series, setSeries] = useState<ExamSeries[]>([])
  const [exams, setExams] = useState<Examination[]>([])
  const [selected, setSelected] = useState<Examination | null>(null)
  const [tab, setTab] = useState<Tab>('setup')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSeries, nextExams] = await Promise.all([
        examinations.listSeries(),
        examinations.list(),
      ])
      setSeries(nextSeries)
      setExams(nextExams)
      setSelected(current => current ? nextExams.find(exam => exam.id === current.id) ?? current : null)
    } catch (err) {
      setError(friendlyApiError(err, 'load examinations'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div>
      <PageHeader
        title="Examinations"
        description="Configure examinations, enter marks, review results, and publish safely."
      />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="card" style={{ padding: 'var(--space-2)', marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {(['setup', 'marks', 'results'] as Tab[]).map(item => (
          <button
            key={item}
            className={`button button--sm ${tab === item ? 'button--primary' : 'button--secondary'}`}
            onClick={() => setTab(item)}
          >
            {item === 'setup' ? 'Examination Setup' : item === 'marks' ? 'Mark Entry' : 'Results & Report Cards'}
          </button>
        ))}
      </div>
      {loading ? (
        <LoadingBlock label="Loading examinations" rows={5} />
      ) : tab === 'setup' ? (
        <SetupTab series={series} exams={exams} onRefresh={load} onSelect={setSelected} />
      ) : !selected ? (
        <EmptyState title="Select an examination" description="Choose an examination from Setup first, then open Mark Entry or Results." />
      ) : tab === 'marks' ? (
        <MarkEntryTab exam={selected} />
      ) : (
        <ResultsTab exam={selected} />
      )}
    </div>
  )
}

function SetupTab({ series, exams, onRefresh, onSelect }: { series: ExamSeries[]; exams: Examination[]; onRefresh: () => void; onSelect: (exam: Examination) => void }) {
  const [showSeries, setShowSeries] = useState(false)
  const [showExam, setShowExam] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function changeStatus(exam: Examination, status: 'draft' | 'active' | 'published' | 'locked') {
    try {
      const updated = await examinations.setStatus(exam.id, status)
      setMessage(`${updated.name} is now ${updated.status}.`)
      onRefresh()
    } catch (err) {
      setMessage(friendlyApiError(err, 'change examination status'))
    }
  }

  return (
    <>
      {message && <Alert tone="info">{message}</Alert>}
      <section className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="section__title">Exam Series</h2>
          <button className="button button--secondary button--sm" onClick={() => setShowSeries(value => !value)}>+ Series</button>
        </div>
        {showSeries && <NewSeriesForm onCreated={() => { setShowSeries(false); onRefresh() }} onCancel={() => setShowSeries(false)} />}
        {!series.length ? (
          <EmptyState title="No exam series" description="Create a series before adding examinations." />
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {series.map(item => (
              <div className="card" key={item.id} style={{ padding: 'var(--space-3)', display: 'flex', justifyContent: 'space-between' }}>
                <strong>{item.name}</strong>
                <Badge tone={item.status === 'active' ? 'success' : 'warning'}>{item.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="section__title">Examinations</h2>
          <button className="button button--primary button--sm" disabled={!series.length} onClick={() => setShowExam(value => !value)}>+ Examination</button>
        </div>
        {showExam && <NewExamForm series={series} onCreated={() => { setShowExam(false); onRefresh() }} onCancel={() => setShowExam(false)} />}
        {!exams.length ? (
          <EmptyState title="No examinations" description="Create an examination to begin configuration." />
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {exams.map(exam => (
              <div className="card" key={exam.id} style={{ padding: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{exam.name}</strong>
                    <div style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>{exam.exam_date || 'No date'} · {exam.total_marks} marks · Pass {exam.passing_marks}</div>
                  </div>
                  <Badge tone={exam.status === 'published' ? 'success' : exam.status === 'locked' ? 'info' : 'warning'}>{exam.status}</Badge>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                  <button className="button button--secondary button--sm" onClick={() => onSelect(exam)}>Select</button>
                  {exam.status === 'draft' && <button className="button button--secondary button--sm" onClick={() => changeStatus(exam, 'active')}>Open for marks</button>}
                  {exam.status === 'active' && <button className="button button--secondary button--sm" onClick={() => changeStatus(exam, 'published')}>Publish</button>}
                  {exam.status === 'published' && <button className="button button--secondary button--sm" onClick={() => changeStatus(exam, 'locked')}>Lock</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {exams.map(exam => <ConfigurationPanel key={exam.id} exam={exam} onUpdated={onRefresh} />)}
    </>
  )
}

function ConfigurationPanel({ exam, onUpdated }: { exam: Examination; onUpdated: () => void }) {
  const [open, setOpen] = useState(false)
  const [subjects, setSubjects] = useState<ExamSubject[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [streams, setStreams] = useState<Stream[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState({ subject_id: '', academic_year_id: '', level_id: '', grade_id: '', stream_id: '', teacher_id: '', total_marks: '100' })

  useEffect(() => {
    if (!open) return
    void Promise.all([examinations.listSubjects(exam.id), api.academicYears(), api.levels()])
      .then(([subjectRows, yearRows, levelRows]) => { setSubjects(subjectRows); setYears(yearRows); setLevels(levelRows) })
      .catch(err => setMessage(friendlyApiError(err, 'load examination configuration')))
  }, [open, exam.id])

  useEffect(() => {
    if (form.level_id) void api.grades(Number(form.level_id)).then(setGrades).catch(() => setGrades([]))
    else setGrades([])
  }, [form.level_id])

  useEffect(() => {
    if (form.academic_year_id && form.grade_id) void api.streams(Number(form.academic_year_id), Number(form.grade_id)).then(setStreams).catch(() => setStreams([]))
    else setStreams([])
  }, [form.academic_year_id, form.grade_id])

  async function assign() {
    try {
      await examinations.assignSubject(exam.id, {
        subject_id: Number(form.subject_id),
        academic_year_id: Number(form.academic_year_id),
        level_id: Number(form.level_id),
        grade_id: Number(form.grade_id),
        stream_id: Number(form.stream_id),
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
        total_marks: Number(form.total_marks),
      })
      setMessage('Subject assigned.')
      setSubjects(await examinations.listSubjects(exam.id))
      onUpdated()
    } catch (err) {
      setMessage(friendlyApiError(err, 'assign subject'))
    }
  }

  return (
    <div className="card section" style={{ marginTop: 'var(--space-3)' }}>
      <button className="button button--ghost button--sm" onClick={() => setOpen(value => !value)}>{open ? 'Hide' : 'Configure'} {exam.name}</button>
      {open && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          {message && <Alert tone="info">{message}</Alert>}
          <h3>Subject assignments</h3>
          <p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>Use the existing subject and teacher IDs; academic year, level, grade and stream are selected from the canonical academic context.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))', gap: 'var(--space-2)' }}>
            <NumberField label="Subject ID" value={form.subject_id} onChange={value => setForm({ ...form, subject_id: value })} />
            <NumberField label="Teacher ID (optional)" value={form.teacher_id} onChange={value => setForm({ ...form, teacher_id: value })} />
            <NumberField label="Maximum marks" value={form.total_marks} onChange={value => setForm({ ...form, total_marks: value })} />
            <Select label="Academic year" value={form.academic_year_id} options={years.map(item => [item.id, item.name] as Option)} onChange={value => setForm({ ...form, academic_year_id: value, grade_id: '', stream_id: '' })} />
            <Select label="Level" value={form.level_id} options={levels.map(item => [item.id, item.name] as Option)} onChange={value => setForm({ ...form, level_id: value, grade_id: '', stream_id: '' })} />
            <Select label="Grade" value={form.grade_id} options={grades.map(item => [item.id, item.name] as Option)} onChange={value => setForm({ ...form, grade_id: value, stream_id: '' })} />
            <Select label="Stream" value={form.stream_id} options={streams.map(item => [item.id, item.name] as Option)} onChange={value => setForm({ ...form, stream_id: value })} />
          </div>
          <button className="button button--primary button--sm" disabled={!form.subject_id || !form.academic_year_id || !form.level_id || !form.grade_id || !form.stream_id} onClick={assign}>Assign subject</button>
          <div style={{ marginTop: 'var(--space-3)', overflowX: 'auto' }}>
            <table style={{ width: '100%' }}><thead><tr><th>Subject ID</th><th>Academic context</th><th>Teacher</th><th>Marks</th></tr></thead><tbody>
              {subjects.map(subject => <tr key={subject.id}><td>{subject.subject_id}</td><td>{subject.grade_id} / {subject.stream_id}</td><td>{subject.teacher_id ?? '—'}</td><td>{subject.total_marks}</td></tr>)}
            </tbody></table>
          </div>
        </div>
      )}
    </div>
  )
}

function MarkEntryTab({ exam }: { exam: Examination }) {
  const [subjects, setSubjects] = useState<ExamSubject[]>([])
  const [students, setStudents] = useState<StudentListItem[]>([])
  const [subjectId, setSubjectId] = useState('')
  const [scores, setScores] = useState<Record<number, string>>({})
  const [remarks, setRemarks] = useState<Record<number, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void examinations.listSubjects(exam.id).then(setSubjects).catch(err => setMessage(friendlyApiError(err, 'load mark entry')))
  }, [exam.id])

  const subject = subjects.find(item => item.subject_id === Number(subjectId))
  const max = subject?.total_marks ?? exam.total_marks

  useEffect(() => {
    if (!subject) { setStudents([]); return }
    const query = new URLSearchParams({ page: '1', page_size: '100', academic_year_id: String(subject.academic_year_id), level_id: String(subject.level_id), grade_id: String(subject.grade_id), stream_id: String(subject.stream_id) })
    void Promise.all([
      apiFetch<{ items: StudentListItem[]; total: number }>(`/api/v1/students?${query.toString()}`),
      examinations.listEntries(exam.id, subject.subject_id),
    ]).then(([studentResponse, rows]) => {
      setStudents(studentResponse.items)
      const nextScores: Record<number, string> = {}
      const nextRemarks: Record<number, string> = {}
      rows.forEach(row => { if (row.score != null) nextScores[row.student_id] = String(row.score); if (row.remarks) nextRemarks[row.student_id] = row.remarks })
      setScores(nextScores)
      setRemarks(nextRemarks)
    }).catch(err => setMessage(friendlyApiError(err, 'load marks')))
  }, [exam.id, subject])

  async function save() {
    if (!subject) return
    setBusy(true)
    try {
      const entries = Object.entries(scores).filter(([, value]) => value !== '').map(([id, value]) => ({ student_id: Number(id), subject_id: subject.subject_id, score: Number(value), remarks: remarks[Number(id)] || null }))
      const result = await examinations.enterScores(exam.id, entries)
      setMessage(`Saved ${result.created + result.updated} marks.`)
    } catch (err) {
      setMessage(friendlyApiError(err, 'save marks'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section">
      <h2 className="section__title">Mark Entry — {exam.name}</h2>
      {message && <Alert tone="info">{message}</Alert>}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'end', marginBottom: 'var(--space-3)' }}>
        <Select label="Subject assignment" value={subjectId} options={subjects.map(item => [item.subject_id, `Subject ${item.subject_id} · Grade ${item.grade_id} · Stream ${item.stream_id}`] as Option)} onChange={setSubjectId} />
        <Badge tone={exam.status === 'active' ? 'success' : 'warning'}>{exam.status}</Badge>
      </div>
      {!subject ? (
        <EmptyState title="Select a subject" description="Choose a configured subject to load students from its exact academic context." />
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%' }}><thead><tr><th>Admission</th><th>Student</th><th>Score / {max}</th><th>Remarks</th></tr></thead><tbody>
            {students.map(student => <tr key={student.id}><td>{student.admission_number}</td><td>{student.first_name} {student.last_name}</td><td><input className="input" style={{ maxWidth: '8rem' }} type="number" min="0" max={max} value={scores[student.id] ?? ''} onChange={event => setScores({ ...scores, [student.id]: event.target.value })} /></td><td><input className="input" value={remarks[student.id] ?? ''} onChange={event => setRemarks({ ...remarks, [student.id]: event.target.value })} /></td></tr>)}
          </tbody></table></div>
          <button className="button button--primary" disabled={busy || exam.status !== 'active' || !students.length} onClick={save}>{busy ? 'Saving…' : 'Save marks'}</button>
          {exam.status !== 'active' && <p style={{ color: 'var(--color-ink-muted)' }}>Mark entry is available only while the examination is active.</p>}
        </>
      )}
    </section>
  )
}

function ResultsTab({ exam }: { exam: Examination }) {
  const [results, setResults] = useState<StudentResult[]>([])
  const [analysis, setAnalysis] = useState<ResultsAnalysis | null>(null)
  const [selected, setSelected] = useState<StudentResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([examinations.generateResults(exam.id), examinations.resultsAnalysis(exam.id)])
      .then(([resultRows, resultAnalysis]) => { setResults(resultRows); setAnalysis(resultAnalysis) })
      .catch(err => setMessage(friendlyApiError(err, 'generate results')))
  }, [exam.id])

  return (
    <section className="section">
      {message && <Alert tone="error">{message}</Alert>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}><h2 className="section__title">Results — {exam.name}</h2><button className="button button--secondary button--sm" onClick={() => window.print()}>Print</button></div>
      {analysis && <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}><Badge tone="info">Students: {analysis.cohort_size}</Badge><Badge tone="info">Cohort mean: {analysis.cohort_mean ?? '—'}%</Badge>{Object.entries(analysis.band_distribution).map(([key, value]) => <Badge key={key}>{key}: {value}</Badge>)}<Badge tone="success">Improved: {analysis.progress_summary.improved ?? 0}</Badge><Badge tone="warning">Declined: {analysis.progress_summary.declined ?? 0}</Badge></div>}
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%' }}><thead><tr><th>#</th><th>Admission</th><th>Name</th><th>Total</th><th>Average</th><th>Mean %</th><th>Band</th><th>Progress</th><th /></tr></thead><tbody>
        {results.map(result => <tr key={result.student_id}><td>{result.position}</td><td>{result.admission_number}</td><td>{result.student_name}</td><td>{result.total_score}</td><td>{result.average}</td><td>{result.percentage ?? '—'}</td><td>{result.band ?? '—'}</td><td>{result.progress ?? '—'}</td><td><button className="button button--ghost button--sm" onClick={() => setSelected(result)}>Report card</button></td></tr>)}
      </tbody></table></div>
      {selected && <ReportCard result={selected} exam={exam} onClose={() => setSelected(null)} />}
    </section>
  )
}

function ReportCard({ result, exam, onClose }: { result: StudentResult; exam: Examination; onClose: () => void }) {
  return <div className="card section" style={{ marginTop: 'var(--space-4)' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><h3>Report Card</h3><button className="button button--ghost button--sm" onClick={onClose}>Close</button></div><p><strong>{result.student_name}</strong> · {result.admission_number}</p><p>{exam.name} · Position {result.position ?? '—'} · Average {result.average}% · Band {result.band ?? '—'}</p><table style={{ width: '100%' }}><thead><tr><th>Subject</th><th>Score</th><th>%</th><th>Grade/Band</th></tr></thead><tbody>{result.subject_scores.map(subject => <tr key={subject.subject_id}><td>{subject.subject_id}</td><td>{subject.score}</td><td>{subject.percentage ?? '—'}</td><td>{subject.grade ?? subject.band ?? '—'}</td></tr>)}</tbody></table><button className="button button--primary button--sm" onClick={() => window.print()}>Print report card</button></div>
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span className="field__label">{label}</span><input className="input" type="number" min="0" value={value} onChange={event => onChange(event.target.value)} /></label>
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return <label className="field" style={{ minWidth: '12rem' }}><span className="field__label">{label}</span><select className="input" value={value} onChange={event => onChange(event.target.value)}><option value="">Select…</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
}

function NewSeriesForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  async function save() {
    try { await examinations.createSeries({ name: name.trim() }); onCreated() }
    catch (err) { setError(friendlyApiError(err, 'create exam series')) }
  }
  return <div className="card" style={{ padding: 'var(--space-3)', margin: 'var(--space-3) 0' }}>{error && <Alert tone="error">{error}</Alert>}<div style={{ display: 'flex', gap: 'var(--space-2)' }}><input className="input" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. 2026 Term 2"/><button className="button button--primary" disabled={!name.trim()} onClick={save}>Create</button><button className="button button--secondary" onClick={onCancel}>Cancel</button></div></div>
}

function NewExamForm({ series, onCreated, onCancel }: { series: ExamSeries[]; onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ series_id: series[0]?.id || 0, name: '', exam_date: '', total_marks: 100, passing_marks: 50 })
  const [error, setError] = useState('')
  async function save() {
    if (form.passing_marks > form.total_marks) { setError('Passing marks cannot exceed total marks.'); return }
    try { await examinations.create(form); onCreated() }
    catch (err) { setError(friendlyApiError(err, 'create examination')) }
  }
  return <div className="card" style={{ padding: 'var(--space-3)', margin: 'var(--space-3) 0' }}>{error && <Alert tone="error">{error}</Alert>}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))', gap: 'var(--space-2)' }}><Select label="Series" value={String(form.series_id)} options={series.map(item => [item.id, item.name] as Option)} onChange={value => setForm({ ...form, series_id: Number(value) })}/><label className="field"><span className="field__label">Exam name</span><input className="input" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label className="field"><span className="field__label">Date</span><input className="input" type="date" value={form.exam_date} onChange={event => setForm({ ...form, exam_date: event.target.value })}/></label><NumberField label="Total marks" value={String(form.total_marks)} onChange={value => setForm({ ...form, total_marks: Number(value) })}/><NumberField label="Pass marks" value={String(form.passing_marks)} onChange={value => setForm({ ...form, passing_marks: Number(value) })}/></div><div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-2)' }}><button className="button button--primary" disabled={!form.name.trim()} onClick={save}>Create</button><button className="button button--secondary" onClick={onCancel}>Cancel</button></div></div>
}
