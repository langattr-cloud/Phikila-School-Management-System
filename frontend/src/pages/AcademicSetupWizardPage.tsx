import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge } from '../components/States'
import { useToast } from '../components/Toast'
import { api, friendlyApiError, type AcademicYear, type Grade, type Level } from '../lib/api'
import { scheduling } from '../lib/scheduling'
import { useNavigate } from '../lib/router'

const steps = ['Academic Year', 'Level', 'Class', 'Class Code']

type FormState = {
  yearId: string
  yearName: string
  startDate: string
  endDate: string
  levelId: string
  className: string
  classCode: string
}

const initialForm: FormState = { yearId: '', yearName: '', startDate: '', endDate: '', levelId: '', className: '', classCode: '' }

export function AcademicSetupWizardPage() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [years, setYears] = useState<AcademicYear[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [form, setForm] = useState<FormState>(initialForm)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [yearOptions, levelOptions] = await Promise.all([api.academicYears(), api.levels()])
      setYears(yearOptions)
      setLevels(levelOptions)
    } catch (e) {
      setError(friendlyApiError(e, 'load academic setup data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (!form.levelId) {
      setGrades([])
      return
    }
    void api.grades(Number(form.levelId)).then(setGrades).catch(e => setError(friendlyApiError(e, 'load classes')))
  }, [form.levelId])

  function selectYear(id: string) {
    const year = years.find(x => String(x.id) === id)
    setForm(v => year
      ? { ...v, yearId: String(year.id), yearName: year.name, startDate: year.start_date, endDate: year.end_date }
      : { ...v, yearId: '', yearName: '', startDate: '', endDate: '' })
  }

  function selectLevel(id: string) {
    const level = levels.find(x => String(x.id) === id)
    setForm(v => ({ ...v, levelId: level ? String(level.id) : '', className: '', classCode: '' }))
  }

  function validateStep() {
    if (step === 0 && (!form.yearId && (!form.yearName.trim() || !form.startDate || !form.endDate))) throw Error('Select an academic year or enter the year and its dates.')
    if (step === 1 && !form.levelId) throw Error('Select a level.')
    if (step === 2 && !form.className.trim()) throw Error('Enter the class name, for example Grade 5R.')
    if (step === 3 && !form.classCode.trim()) throw Error('Enter the class code, for example 5R.')
  }

  async function saveYearIfNeeded() {
    if (form.yearId) return
    const year = await api.createAcademicYear({ name: form.yearName.trim(), start_date: form.startDate, end_date: form.endDate, is_current: false, status: 'ACTIVE' })
    setYears(v => [...v, year])
    setForm(v => ({ ...v, yearId: String(year.id) }))
  }

  async function finish() {
    setSaving(true)
    setError(null)
    try {
      await saveYearIfNeeded()
      const yearId = Number(form.yearId || years.find(y => y.name === form.yearName.trim())?.id)
      if (!yearId) throw Error('The academic year could not be resolved.')
      const levelId = Number(form.levelId)
      const className = form.className.trim()
      const classCode = form.classCode.trim().toUpperCase()
      const gradeCode = className.replace(/^grade\s*/i, '').match(/^[A-Za-z0-9-]+/)?.[0] || classCode

      let grade = grades.find(g => g.name.trim().toLowerCase() === className.toLowerCase() || g.code.trim().toLowerCase() === gradeCode.toLowerCase())
      if (!grade) grade = await api.createGrade({ level_id: levelId, name: className, code: gradeCode, status: true })

      const existingStreams = await api.streams(yearId, grade.id)
      const streamName = classCode
      let stream = existingStreams.find(s => (s.code || '').toUpperCase() === classCode || s.name.toUpperCase() === streamName)
      if (!stream) stream = await api.createStream({ academic_year_id: yearId, level_id: levelId, grade_id: grade.id, name: streamName, code: classCode, status: 'ACTIVE' })

      const existingClasses = await scheduling.classes()
      const existingClass = existingClasses.find(c => String(c.code || '').toUpperCase() === classCode && String(c.grade || '').toLowerCase() === className.toLowerCase())
      if (!existingClass) await scheduling.createClass({ name: className, code: classCode, grade: className, stream: streamName })

      notify('Academic setup saved.', 'success')
      navigate('/academics')
    } catch (e) {
      setError(friendlyApiError(e, 'save academic setup'))
    } finally {
      setSaving(false)
    }
  }

  async function next() {
    if (saving) return
    setError(null)
    try {
      validateStep()
      if (step < steps.length - 1) {
        if (step === 0) await saveYearIfNeeded()
        setStep(v => v + 1)
      } else {
        await finish()
      }
    } catch (e) {
      setError(friendlyApiError(e, 'continue academic setup'))
    }
  }

  const selectedYear = years.find(y => String(y.id) === form.yearId)
  const selectedLevel = levels.find(l => String(l.id) === form.levelId)

  return <>
    <PageHeader title="Academic setup" description="Set up Academic Year → Level → Class → Class Code. The class code is the common business identifier used by downstream academic workflows." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Academic setup' }]} />
    {error && <Alert tone="error" title="Setup could not continue">{error}</Alert>}
    <section className="card section">
      <div className="chip-list" aria-label="Setup progress">
        {steps.map((label, i) => <Badge key={label} tone={i === step ? 'success' : undefined}>{i + 1}. {label}</Badge>)}
      </div>
      {loading ? <p>Loading setup options…</p> : <form className="form" onSubmit={e => { e.preventDefault(); void next() }}>
        <h2 className="section__title">Step {step + 1}: {steps[step]}</h2>

        {step === 0 && <>
          <label className="label">Academic year</label>
          <select className="input" value={form.yearId} onChange={e => selectYear(e.target.value)}>
            <option value="">Create new…</option>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          {!form.yearId && <div className="form form--grid">
            <input className="input" placeholder="2026/2027" value={form.yearName} onChange={e => setForm(v => ({ ...v, yearName: e.target.value }))} />
            <input className="input" type="date" value={form.startDate} onChange={e => setForm(v => ({ ...v, startDate: e.target.value }))} />
            <input className="input" type="date" value={form.endDate} onChange={e => setForm(v => ({ ...v, endDate: e.target.value }))} />
          </div>}
        </>}

        {step === 1 && <>
          <label className="label">Level</label>
          <select className="input" value={form.levelId} onChange={e => selectLevel(e.target.value)}>
            <option value="">Select level…</option>
            {levels.filter(l => l.name !== 'Primary').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <small>Levels: Pre Primary, Primary School, Junior School, Senior School.</small>
        </>}

        {step === 2 && <>
          <label className="label">Class</label>
          <input className="input" placeholder="Grade 5R" value={form.className} onChange={e => setForm(v => ({ ...v, className: e.target.value }))} list="existing-classes" />
          <datalist id="existing-classes">{grades.map(g => <option key={g.id} value={g.name}>{g.code}</option>)}</datalist>
          <small>Use the name staff should see throughout Phikila.</small>
        </>}

        {step === 3 && <>
          <label className="label">Class code</label>
          <input className="input" placeholder="5R" value={form.classCode} onChange={e => setForm(v => ({ ...v, classCode: e.target.value.toUpperCase() }))} />
          <small>This code is the class business identifier for timetabling, examinations, student enrollment and finance. Do not change it casually after transactions exist.</small>
          <div className="card" style={{ padding: '1rem' }}>
            <p><strong>Academic year:</strong> {selectedYear?.name || form.yearName}</p>
            <p><strong>Level:</strong> {selectedLevel?.name}</p>
            <p><strong>Class:</strong> {form.className}</p>
            <p><strong>Class code:</strong> {form.classCode.toUpperCase()}</p>
          </div>
        </>}

        <div className="form__row">
          <button type="button" className="button button--ghost" disabled={step === 0 || saving} onClick={() => setStep(v => Math.max(0, v - 1))}>Previous</button>
          <button className="button button--primary" disabled={saving}>{saving ? 'Saving…' : step === steps.length - 1 ? 'Save Academic Setup' : 'Save & Next'}</button>
        </div>
      </form>}
    </section>
  </>
}
