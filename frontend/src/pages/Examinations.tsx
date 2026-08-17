import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { friendlyApiError } from '../lib/api'
import { examinations, type ExamSeries, type Examination, type StudentResult, type ResultsAnalysis } from '../lib/examinations'

export default function ExaminationsPage() {
  const [series, setSeries] = useState<ExamSeries[]>([])
  const [exams, setExams] = useState<Examination[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedExam, setSelectedExam] = useState<Examination | null>(null)
  const [results, setResults] = useState<StudentResult[]>([])
  const [analysis, setAnalysis] = useState<ResultsAnalysis | null>(null)
  const [showNewSeries, setShowNewSeries] = useState(false)
  const [showNewExam, setShowNewExam] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, e] = await Promise.all([examinations.listSeries(), examinations.list()])
      setSeries(s)
      setExams(e)
    } catch (err) {
      setError(friendlyApiError(err, 'load examinations'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadResults(examId: number) {
    try {
      const [r, a] = await Promise.all([
        examinations.generateResults(examId),
        examinations.resultsAnalysis(examId),
      ])
      setResults(r)
      setAnalysis(a)
      setSelectedExam(exams.find((e) => e.id === examId) || null)
    } catch (err) {
      setError(friendlyApiError(err, 'generate results'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Examinations"
        description="Manage exam series, score entry, and results."
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="button button--secondary button--sm" onClick={() => setShowNewSeries(!showNewSeries)}>+ Series</button>
            <button className="button button--primary button--sm" onClick={() => setShowNewExam(!showNewExam)}>+ Exam</button>
          </div>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {showNewSeries && <NewSeriesForm onCreated={() => { setShowNewSeries(false); load() }} onCancel={() => setShowNewSeries(false)} />}
      {showNewExam && <NewExamForm series={series} onCreated={() => { setShowNewExam(false); load() }} onCancel={() => setShowNewExam(false)} />}

      {selectedExam && results.length > 0 && (
        <ResultsTable exam={selectedExam} results={results} analysis={analysis} onClose={() => { setSelectedExam(null); setResults([]); setAnalysis(null) }} />
      )}

      {loading ? (
        <LoadingBlock label="Loading examinations" rows={4} />
      ) : (
        <>
          {/* Series */}
          {series.length > 0 && (
            <section className="section" style={{ marginBottom: 'var(--space-4)' }}>
              <h2 className="section__title">Exam Series</h2>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                 {series.map((s) => (
                   <div key={s.id} className="card" style={{ padding: 'var(--space-3)', flex: '1 1 14rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                     <strong>{s.name}</strong>
                     <Badge tone={s.status === 'active' ? 'success' : 'warning'}>{s.status}</Badge>
                   </div>
                 ))}
               </div>
             </section>
           )}

           {/* Exams */}
           <section className="section">
             <h2 className="section__title">Examinations</h2>
             {!exams.length ? (
               <EmptyState title="No examinations" description="Create an exam series and add examinations to get started." />
             ) : (
               <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                 {exams.map((e) => (
                   <div key={e.id} className="card" style={{ padding: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                     <div>
                       <strong>{e.name}</strong>
                       <span style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem', marginLeft: 'var(--space-2)' }}>
                         {e.total_marks} marks · Pass: {e.passing_marks}
                         {e.exam_date ? ` · ${e.exam_date}` : ''}
                       </span>
                     </div>
                     <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                       <Badge tone={e.status === 'active' ? 'success' : 'warning'}>{e.status}</Badge>
                       <button className="button button--ghost button--sm" onClick={() => loadResults(e.id)}>Results</button>
                     </div>
                   </div>
                 ))}
               </div>
             )}
           </section>
         </>
       )}
     </div>
   )
 }

 function NewSeriesForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
   const [name, setName] = useState('')
   const [submitting, setSubmitting] = useState(false)
   return (
     <div className="card section" style={{ marginBottom: 'var(--space-4)' }}>
       <h2 className="section__title">New Exam Series</h2>
       <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
         <div className="field" style={{ flex: 1 }}>
           <label className="field__label">Series Name</label>
           <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2026 Mid-Term" />
         </div>
         <button className="button button--primary" disabled={!name || submitting}
           onClick={async () => { setSubmitting(true); await examinations.createSeries({ name }); setSubmitting(false); onCreated() }}>
           Create
         </button>
         <button className="button button--secondary" onClick={onCancel}>Cancel</button>
       </div>
     </div>
   )
 }

 function NewExamForm({ series, onCreated, onCancel }: { series: ExamSeries[]; onCreated: () => void; onCancel: () => void }) {
   const [form, setForm] = useState({ series_id: series[0]?.id || 0, name: '', total_marks: 100, passing_marks: 50 })
   const [submitting, setSubmitting] = useState(false)
   return (
     <div className="card section" style={{ marginBottom: 'var(--space-4)' }}>
       <h2 className="section__title">New Examination</h2>
       <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
         <div className="field">
           <label className="field__label">Series</label>
           <select className="input" value={form.series_id} onChange={(e) => setForm({ ...form, series_id: Number(e.target.value) })}>
             {series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
           </select>
         </div>
         <div className="field" style={{ flex: 1 }}>
           <label className="field__label">Exam Name *</label>
           <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mathematics Mid-Term" />
         </div>
         <div className="field"><label className="field__label">Total</label><input className="input" type="number" value={form.total_marks} onChange={(e) => setForm({ ...form, total_marks: Number(e.target.value) })} /></div>
         <div className="field"><label className="field__label">Pass</label><input className="input" type="number" value={form.passing_marks} onChange={(e) => setForm({ ...form, passing_marks: Number(e.target.value) })} /></div>
         <button className="button button--primary" disabled={!form.name || submitting}
           onClick={async () => { setSubmitting(true); await examinations.create(form); setSubmitting(false); onCreated() }}>
           Create
         </button>
         <button className="button button--secondary" onClick={onCancel}>Cancel</button>
       </div>
     </div>
   )
 }

 const CBC_BAND_LEGEND = [
   { code: 'EE', label: 'Exceeding Expectations', range: '80–100%' },
   { code: 'ME', label: 'Meeting Expectations', range: '50–79%' },
   { code: 'AE', label: 'Approaching Expectations', range: '40–49%' },
   { code: 'BE', label: 'Below Expectations', range: '0–39%' },
 ]

 function ResultsTable({ exam, results, analysis, onClose }: { exam: Examination; results: StudentResult[]; analysis: ResultsAnalysis | null; onClose: () => void }) {
   const cbcResults = results.filter((r) => r.education_level === 'primary' || r.education_level === 'junior')
   return (
     <div className="card section" style={{ marginBottom: 'var(--space-4)' }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
         <h2 className="section__title" style={{ marginBottom: 0 }}>Results — {exam.name}</h2>
         <button className="button button--ghost button--sm" onClick={onClose}>✕ Close</button>
       </div>
       <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.875rem', marginBottom: 'var(--space-3)' }}>
         {results.length} students · Total: {exam.total_marks} · Pass: {exam.passing_marks}
       </p>

       {analysis && (
         <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
           {analysis.cohort_mean !== undefined && analysis.cohort_mean !== null && (
             <span className="badge badge--info" title="Cohort mean percentage">Cohort mean: {analysis.cohort_mean}%</span>
           )}
           {Object.entries(analysis.band_distribution).map(([band, count]) => (
             <span key={band} className="badge" title={CBC_BAND_LEGEND.find((b) => b.code === band)?.label}>
               {band}: {count}
             </span>
           ))}
           {analysis.progress_summary.improved !== undefined && (
             <span className="badge badge--success" title="Students who improved on the previous exam in this series">
               Improved: {analysis.progress_summary.improved}
             </span>
           )}
           {analysis.progress_summary.declined !== undefined && (
             <span className="badge badge--warning" title="Students whose mean dropped since the previous exam">
               Declined: {analysis.progress_summary.declined}
             </span>
           )}
         </div>
       )}

       {cbcResults.length > 0 && (
         <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--color-ink-muted)', marginBottom: 'var(--space-3)' }}>
           <strong>CBC / KPSEA / KJSEA bands:</strong>
           {CBC_BAND_LEGEND.map((b) => (
             <span key={b.code}><Badge tone="success">{b.code}</Badge> {b.label} ({b.range})</span>
           ))}
         </div>
       )}

       {results.length > 0 && (
         <div style={{ overflowX: 'auto' }}>
           <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
             <thead>
               <tr style={{ borderBottom: '2px solid var(--color-line)' }}>
                 <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>#</th>
                 <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Name</th>
                 <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Adm No</th>
                 <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Total</th>
                 <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Average</th>
                 <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Mean %</th>
                 <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Band</th>
                 <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Deviation</th>
                 <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Progress</th>
                 <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Position</th>
               </tr>
             </thead>
             <tbody>
               {results.map((r, i) => (
                 <tr key={r.student_id} style={{ borderBottom: '1px solid var(--color-line)' }}>
                   <td style={{ padding: 'var(--space-2)' }}>{i + 1}</td>
                   <td style={{ padding: 'var(--space-2)', fontWeight: 600 }}>{r.student_name}</td>
                   <td style={{ padding: 'var(--space-2)' }}>{r.admission_number}</td>
                   <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 700 }}>{r.total_score}</td>
                   <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{r.average}</td>
                   <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{r.percentage !== undefined && r.percentage !== null ? `${r.percentage}%` : '—'}</td>
                   <td style={{ padding: 'var(--space-2)' }}>
                     {r.band ? <Badge tone="success">{r.band}</Badge> : '—'}
                     {r.band_label ? <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)', marginLeft: 'var(--space-1)' }}>{r.band_label}</span> : null}
                   </td>
                   <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>
                     {r.deviation !== undefined && r.deviation !== null
                       ? `${r.deviation > 0 ? '+' : ''}${r.deviation}`
                       : '—'}
                   </td>
                   <td style={{ padding: 'var(--space-2)', textAlign: 'right', color: r.progress && r.progress > 0 ? 'var(--color-success, #0a7d3c)' : r.progress && r.progress < 0 ? 'var(--color-danger, #b3261e)' : undefined }}>
                     {r.progress !== undefined && r.progress !== null ? `${r.progress > 0 ? '+' : ''}${r.progress}` : '—'}
                   </td>
                   <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{r.position}</td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
       )}
     </div>
   )
 }
