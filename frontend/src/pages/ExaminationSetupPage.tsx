import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { examinations, type ExamSeries, type Examination } from '../lib/examinations'
import { friendlyApiError } from '../lib/api'

type Form = { series_id: number; name: string; exam_date: string; total_marks: number; passing_marks: number }

const emptyForm = (seriesId = 0): Form => ({ series_id: seriesId, name: '', exam_date: '', total_marks: 100, passing_marks: 50 })

export default function ExaminationSetupPage() {
  const [series, setSeries] = useState<ExamSeries[]>([])
  const [exams, setExams] = useState<Examination[]>([])
  const [selected, setSelected] = useState<Examination | null>(null)
  const [editing, setEditing] = useState<Examination | null>(null)
  const [form, setForm] = useState<Form>(emptyForm())
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSeries, nextExams] = await Promise.all([examinations.listSeries(), examinations.list()])
      setSeries(nextSeries)
      setExams(nextExams)
      setSelected(current => current ? nextExams.find(item => item.id === current.id) ?? null : null)
    } catch (err) {
      setError(friendlyApiError(err, 'load examinations'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function startCreate() {
    setEditing(null)
    setForm(emptyForm(series[0]?.id ?? 0))
    setShowCreate(true)
    setMessage(null)
  }

  function startEdit(exam: Examination) {
    setShowCreate(false)
    setEditing(exam)
    setSelected(exam)
    setForm({ series_id: exam.series_id, name: exam.name, exam_date: exam.exam_date ?? '', total_marks: exam.total_marks, passing_marks: exam.passing_marks })
    setMessage(null)
  }

  function cancelForm() {
    setEditing(null)
    setShowCreate(false)
  }

  async function save() {
    if (!form.name.trim()) return setError('Examination name is required.')
    if (form.passing_marks > form.total_marks) return setError('Passing marks cannot exceed total marks.')
    if (!form.series_id) return setError('Select an examination series.')
    setBusy(true)
    setError(null)
    try {
      if (editing) {
        await examinations.update(editing.id, { name: form.name.trim(), description: editing.description, exam_date: form.exam_date || null, total_marks: form.total_marks, passing_marks: form.passing_marks })
        setMessage(`${form.name.trim()} updated.`)
      } else {
        await examinations.create({ series_id: form.series_id, name: form.name.trim(), exam_date: form.exam_date || null, total_marks: form.total_marks, passing_marks: form.passing_marks })
        setMessage(`${form.name.trim()} created.`)
      }
      cancelForm()
      await load()
    } catch (err) {
      setError(friendlyApiError(err, editing ? 'update examination' : 'create examination'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(exam: Examination) {
    if (exam.status !== 'draft') {
      setMessage('Only draft examinations can be deleted. Published or locked examinations are protected.')
      return
    }
    if (!window.confirm(`Delete “${exam.name}” dated ${exam.exam_date || 'without a date'}? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      await examinations.delete(exam.id)
      if (selected?.id === exam.id) setSelected(null)
      if (editing?.id === exam.id) cancelForm()
      setMessage(`${exam.name} deleted.`)
      await load()
    } catch (err) {
      setError(friendlyApiError(err, 'delete examination'))
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(exam: Examination, status: 'active' | 'published' | 'locked') {
    setBusy(true)
    setError(null)
    try {
      await examinations.setStatus(exam.id, status)
      setMessage(`${exam.name} is now ${status}.`)
      await load()
    } catch (err) {
      setError(friendlyApiError(err, 'change examination status'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Examination Setup" description="Manage examination records and configure one examination at a time." />
      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="info">{message}</Alert>}

      <section className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <div><h2 className="section__title">Examinations</h2><p style={{ color: 'var(--color-ink-muted)' }}>Edit and delete draft records. Published and locked records remain protected.</p></div>
          <button className="button button--primary button--sm" disabled={!series.length || busy} onClick={startCreate}>+ Examination</button>
        </div>

        {(showCreate || editing) && <ExamForm form={form} series={series} editing={Boolean(editing)} busy={busy} onChange={setForm} onSave={save} onCancel={cancelForm} />}

        {loading ? <LoadingBlock label="Loading examinations" rows={5} /> : !exams.length ? <EmptyState title="No examinations" description="Create an examination to begin configuration." /> : (
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {exams.map(exam => {
              const canEdit = exam.status === 'draft'
              const canDelete = exam.status === 'draft'
              return <div className="card" key={exam.id} style={{ padding: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <div><strong>{exam.name}</strong><div style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>{exam.exam_date || 'No date'} · {exam.total_marks} marks · Pass {exam.passing_marks}</div></div>
                  <Badge tone={exam.status === 'published' ? 'success' : exam.status === 'locked' ? 'info' : 'warning'}>{exam.status}</Badge>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                  <button className="button button--secondary button--sm" disabled={busy} onClick={() => setSelected(exam)}>{selected?.id === exam.id ? 'Selected' : 'Configure'}</button>
                  <button className="button button--secondary button--sm" disabled={busy || !canEdit} title={canEdit ? 'Edit examination' : 'Only draft examinations can be edited'} onClick={() => startEdit(exam)}>Edit</button>
                  <button className="button button--secondary button--sm" disabled={busy || !canDelete} title={canDelete ? 'Delete examination' : 'Only draft examinations can be deleted'} onClick={() => void remove(exam)}>Delete</button>
                  {exam.status === 'draft' && <button className="button button--secondary button--sm" disabled={busy} onClick={() => void changeStatus(exam, 'active')}>Open for marks</button>}
                  {exam.status === 'active' && <button className="button button--secondary button--sm" disabled={busy} onClick={() => void changeStatus(exam, 'published')}>Publish</button>}
                  {exam.status === 'published' && <button className="button button--secondary button--sm" disabled={busy} onClick={() => void changeStatus(exam, 'locked')}>Lock</button>}
                </div>
              </div>
            })}
          </div>
        )}
      </section>

      {selected && <ConfigurationSummary exam={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function ExamForm({ form, series, editing, busy, onChange, onSave, onCancel }: { form: Form; series: ExamSeries[]; editing: boolean; busy: boolean; onChange: (form: Form) => void; onSave: () => void; onCancel: () => void }) {
  return <div className="card" style={{ padding: 'var(--space-3)', margin: 'var(--space-3) 0' }}>
    <h3>{editing ? 'Edit examination' : 'Create examination'}</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))', gap: 'var(--space-2)' }}>
      <label className="field"><span className="field__label">Series</span><select className="input" value={form.series_id} disabled={editing} onChange={e => onChange({ ...form, series_id: Number(e.target.value) })}>{series.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span className="field__label">Exam name</span><input className="input" value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} /></label>
      <label className="field"><span className="field__label">Date</span><input className="input" type="date" value={form.exam_date} onChange={e => onChange({ ...form, exam_date: e.target.value })} /></label>
      <label className="field"><span className="field__label">Total marks</span><input className="input" type="number" min="1" value={form.total_marks} onChange={e => onChange({ ...form, total_marks: Number(e.target.value) })} /></label>
      <label className="field"><span className="field__label">Pass marks</span><input className="input" type="number" min="0" value={form.passing_marks} onChange={e => onChange({ ...form, passing_marks: Number(e.target.value) })} /></label>
    </div>
    <div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-2)' }}><button className="button button--primary button--sm" disabled={busy} onClick={onSave}>{editing ? 'Save changes' : 'Create'}</button><button className="button button--secondary button--sm" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </div>
}

function ConfigurationSummary({ exam, onClose }: { exam: Examination; onClose: () => void }) {
  return <section className="section"><div className="card" style={{ padding: 'var(--space-3)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}><div><h2 className="section__title">Configure {exam.name}</h2><p style={{ color: 'var(--color-ink-muted)' }}>Configure subjects, teachers and academic context for this examination. Existing Classes, Subjects and Teachers remain the source of truth.</p></div><button className="button button--ghost button--sm" onClick={onClose}>Close</button></div><div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', border: '1px solid var(--color-line,#ddd)', borderRadius: 8 }}><strong>Configuration workspace</strong><p style={{ color: 'var(--color-ink-muted)' }}>Select this examination to work with its existing assignments. No Classes, Subjects or Teachers are duplicated here.</p></div></div></section>
}
