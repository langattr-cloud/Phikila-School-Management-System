import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { examinations, type ExamSeries, type Examination } from '../lib/examinations'
import { api, type AcademicYear, type Term } from '../lib/api'
import { friendlyApiError } from '../lib/api'

type ExamForm = { series_id: number; name: string; exam_date: string; total_marks: number; passing_marks: number }
type SeriesForm = { name: string; academic_year_id: number; term_id: number }

const emptyExam = (seriesId = 0): ExamForm => ({ series_id: seriesId, name: '', exam_date: '', total_marks: 100, passing_marks: 50 })
const emptySeries = (yearId = 0): SeriesForm => ({ name: '', academic_year_id: yearId, term_id: 0 })

export default function ExaminationSetupPage() {
  const [series, setSeries] = useState<ExamSeries[]>([])
  const [exams, setExams] = useState<Examination[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null)
  const [editingExam, setEditingExam] = useState<Examination | null>(null)
  const [examForm, setExamForm] = useState<ExamForm>(emptyExam())
  const [seriesForm, setSeriesForm] = useState<SeriesForm>(emptySeries())
  const [showSeriesForm, setShowSeriesForm] = useState(false)
  const [showExamForm, setShowExamForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSeries, nextExams, nextYears, nextTerms] = await Promise.all([
        examinations.listSeries(),
        examinations.list(),
        api.academicYears(),
        api.terms(),
      ])
      setSeries(nextSeries)
      setExams(nextExams)
      setYears(nextYears)
      setTerms(nextTerms)
      setSelectedSeriesId(current => current && nextSeries.some(item => item.id === current) ? current : nextSeries[0]?.id ?? null)
    } catch (err) {
      setError(friendlyApiError(err, 'load examination setup'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const selectedSeries = useMemo(() => series.find(item => item.id === selectedSeriesId) ?? null, [series, selectedSeriesId])
  const visibleExams = useMemo(() => selectedSeriesId == null ? exams : exams.filter(item => item.series_id === selectedSeriesId), [exams, selectedSeriesId])
  const availableTerms = useMemo(() => seriesForm.academic_year_id ? terms.filter(term => term.academic_year_id === seriesForm.academic_year_id) : [], [terms, seriesForm.academic_year_id])

  function startSeries() {
    setSeriesForm(emptySeries(years.find(item => item.is_current)?.id ?? years[0]?.id ?? 0))
    setShowSeriesForm(true)
    setShowExamForm(false)
    setMessage(null)
    setError(null)
  }

  async function saveSeries() {
    if (!seriesForm.name.trim()) return setError('Enter an exam series name.')
    if (!seriesForm.academic_year_id) return setError('Select an academic year.')
    if (!seriesForm.term_id) return setError('Select a term.')
    setBusy(true); setError(null)
    try {
      const created = await examinations.createSeries({ name: seriesForm.name.trim(), academic_year_id: seriesForm.academic_year_id, term_id: seriesForm.term_id })
      setMessage(`${created.name} registered.`)
      setShowSeriesForm(false)
      setSelectedSeriesId(created.id)
      await load()
    } catch (err) {
      setError(friendlyApiError(err, 'register the exam series'))
    } finally { setBusy(false) }
  }

  function startExam() {
    if (!selectedSeriesId) return setError('Register or select an exam series first.')
    setEditingExam(null)
    setExamForm(emptyExam(selectedSeriesId))
    setShowExamForm(true)
    setMessage(null)
    setError(null)
  }

  function editExam(exam: Examination) {
    setEditingExam(exam)
    setExamForm({ series_id: exam.series_id, name: exam.name, exam_date: exam.exam_date ?? '', total_marks: exam.total_marks, passing_marks: exam.passing_marks })
    setShowExamForm(true)
    setMessage(null)
    setError(null)
  }

  function cancelExam() { setEditingExam(null); setShowExamForm(false) }

  async function saveExam() {
    if (!examForm.name.trim()) return setError('Enter an examination name.')
    if (examForm.passing_marks > examForm.total_marks) return setError('Pass marks cannot exceed total marks.')
    setBusy(true); setError(null)
    try {
      if (editingExam) {
        await examinations.update(editingExam.id, { name: examForm.name.trim(), description: editingExam.description, exam_date: examForm.exam_date || null, total_marks: examForm.total_marks, passing_marks: examForm.passing_marks })
        setMessage(`${examForm.name.trim()} updated.`)
      } else {
        await examinations.create({ series_id: examForm.series_id, name: examForm.name.trim(), exam_date: examForm.exam_date || null, total_marks: examForm.total_marks, passing_marks: examForm.passing_marks })
        setMessage(`${examForm.name.trim()} created.`)
      }
      cancelExam()
      await load()
    } catch (err) {
      setError(friendlyApiError(err, editingExam ? 'update the examination' : 'create the examination'))
    } finally { setBusy(false) }
  }

  async function changeStatus(exam: Examination, status: 'active' | 'published' | 'locked') {
    setBusy(true); setError(null)
    try {
      await examinations.setStatus(exam.id, status)
      setMessage(`${exam.name} is now ${status}.`)
      await load()
    } catch (err) { setError(friendlyApiError(err, 'change examination status')) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Examination Setup" description="Register the exam series first, then add examinations under it. Keep the setup in one place." />
      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="info">{message}</Alert>}

      {loading ? <LoadingBlock label="Loading examination setup" rows={6} /> : (
        <>
          <section className="section">
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <div>
                  <h2 className="section__title" style={{ marginBottom: '.25rem' }}>1. Exam Series</h2>
                  <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>Register the assessment period once, using the academic year and term.</p>
                </div>
                <button className="button button--primary button--sm" disabled={busy} onClick={startSeries}>+ Register Exam Series</button>
              </div>

              {showSeriesForm && <SeriesForm form={seriesForm} years={years} terms={availableTerms} busy={busy} onChange={setSeriesForm} onSave={saveSeries} onCancel={() => setShowSeriesForm(false)} />}

              {!series.length ? <EmptyState title="No exam series registered" description="Register the first exam series to continue." /> : (
                <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                  {series.map(item => {
                    const active = item.id === selectedSeriesId
                    const year = years.find(row => row.id === item.academic_year_id)
                    const term = terms.find(row => row.id === item.term_id)
                    return <button type="button" key={item.id} onClick={() => { setSelectedSeriesId(item.id); setShowExamForm(false) }} className="card" style={{ textAlign: 'left', padding: 'var(--space-3)', border: active ? '2px solid var(--color-primary)' : undefined, cursor: 'pointer', background: 'var(--color-surface)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'center' }}>
                        <div><strong>{item.name}</strong><div style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem', marginTop: '.2rem' }}>{year?.name ?? 'Academic year not set'} · {term?.name ?? 'Term not set'}</div></div>
                        <Badge tone={item.status === 'active' ? 'success' : 'warning'}>{item.status}</Badge>
                      </div>
                    </button>
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="section">
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <div>
                  <h2 className="section__title" style={{ marginBottom: '.25rem' }}>2. Examinations</h2>
                  <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>{selectedSeries ? `Add papers or assessments under ${selectedSeries.name}.` : 'Select an exam series above to add examinations.'}</p>
                </div>
                <button className="button button--primary button--sm" disabled={!selectedSeriesId || busy} onClick={startExam}>+ Add Examination</button>
              </div>

              {showExamForm && <ExamForm form={examForm} series={series} editing={Boolean(editingExam)} busy={busy} onChange={setExamForm} onSave={saveExam} onCancel={cancelExam} />}

              {!selectedSeriesId ? <EmptyState title="Select an exam series" description="Your examinations will appear here after you select a series." /> : !visibleExams.length ? <EmptyState title="No examinations in this series" description="Add the first examination to continue." /> : (
                <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                  {visibleExams.map(exam => <div className="card" key={exam.id} style={{ padding: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                      <div><strong>{exam.name}</strong><div style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem', marginTop: '.2rem' }}>{exam.exam_date || 'Date not set'} · {exam.total_marks} marks · Pass {exam.passing_marks}</div></div>
                      <Badge tone={exam.status === 'published' ? 'success' : exam.status === 'locked' ? 'info' : 'warning'}>{exam.status}</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                      {exam.status === 'draft' && <button className="button button--secondary button--sm" disabled={busy} onClick={() => editExam(exam)}>Edit</button>}
                      {exam.status === 'draft' && <button className="button button--primary button--sm" disabled={busy} onClick={() => void changeStatus(exam, 'active')}>Open for Marks</button>}
                      {exam.status === 'active' && <button className="button button--primary button--sm" disabled={busy} onClick={() => void changeStatus(exam, 'published')}>Publish Results</button>}
                      {exam.status === 'published' && <button className="button button--secondary button--sm" disabled={busy} onClick={() => void changeStatus(exam, 'locked')}>Lock</button>}
                    </div>
                  </div>)}
                </div>
              )}
            </div>
          </section>

          <section className="section">
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h2 className="section__title" style={{ marginBottom: '.25rem' }}>3. Continue</h2>
              <p style={{ color: 'var(--color-ink-muted)', marginTop: 0 }}>After creating the examination, configure its subjects and Grade/Stream scope, then enter marks and publish results.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(13rem,1fr))', gap: 'var(--space-2)' }}>
                <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><strong>Subjects</strong><p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>Use existing subjects. Do not create duplicate subjects here.</p></div>
                <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><strong>Grade & Stream</strong><p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>Grade is required. Stream is optional where the school does not use streams.</p></div>
                <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><strong>Marks & Results</strong><p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>Open marks, enter scores, publish results, then lock the examination.</p></div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function SeriesForm({ form, years, terms, busy, onChange, onSave, onCancel }: { form: SeriesForm; years: AcademicYear[]; terms: Term[]; busy: boolean; onChange: (form: SeriesForm) => void; onSave: () => void; onCancel: () => void }) {
  return <div className="card" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
    <h3 style={{ marginTop: 0 }}>Register exam series</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(14rem,1fr))', gap: 'var(--space-2)' }}>
      <label className="field"><span className="field__label">Series name</span><input className="input" autoFocus placeholder="e.g. Term 2 Assessment" value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} /></label>
      <label className="field"><span className="field__label">Academic year</span><select className="input" value={form.academic_year_id} onChange={e => onChange({ ...form, academic_year_id: Number(e.target.value), term_id: 0 })}><option value={0}>Select academic year</option>{years.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span className="field__label">Term</span><select className="input" value={form.term_id} onChange={e => onChange({ ...form, term_id: Number(e.target.value) })} disabled={!form.academic_year_id}><option value={0}>Select term</option>{terms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}><button className="button button--primary button--sm" disabled={busy} onClick={onSave}>Register Series</button><button className="button button--secondary button--sm" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </div>
}

function ExamForm({ form, series, editing, busy, onChange, onSave, onCancel }: { form: ExamForm; series: ExamSeries[]; editing: boolean; busy: boolean; onChange: (form: ExamForm) => void; onSave: () => void; onCancel: () => void }) {
  return <div className="card" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
    <h3 style={{ marginTop: 0 }}>{editing ? 'Edit examination' : 'Add examination'}</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))', gap: 'var(--space-2)' }}>
      <label className="field"><span className="field__label">Exam name</span><input className="input" autoFocus placeholder="e.g. Mathematics Paper 1" value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} /></label>
      <label className="field"><span className="field__label">Date</span><input className="input" type="date" value={form.exam_date} onChange={e => onChange({ ...form, exam_date: e.target.value })} /></label>
      <label className="field"><span className="field__label">Total marks</span><input className="input" type="number" min="1" value={form.total_marks} onChange={e => onChange({ ...form, total_marks: Number(e.target.value) })} /></label>
      <label className="field"><span className="field__label">Pass marks</span><input className="input" type="number" min="0" value={form.passing_marks} onChange={e => onChange({ ...form, passing_marks: Number(e.target.value) })} /></label>
      <label className="field"><span className="field__label">Series</span><select className="input" disabled={editing} value={form.series_id} onChange={e => onChange({ ...form, series_id: Number(e.target.value) })}>{series.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}><button className="button button--primary button--sm" disabled={busy} onClick={onSave}>{editing ? 'Save Changes' : 'Create Examination'}</button><button className="button button--secondary button--sm" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </div>
}
