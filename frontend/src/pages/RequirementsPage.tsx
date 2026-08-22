import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { CalendarIcon, SearchIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { apiFetch, friendlyApiError } from '../lib/api'
import { scheduling, type Requirement, type Room, type SchoolClass, type Subject, type Teacher } from '../lib/scheduling'

type Grade = { id: number; name: string; code: string }
type Data = { requirements: Requirement[]; grades: Grade[]; classes: SchoolClass[]; subjects: Subject[]; teachers: Teacher[]; rooms: Room[] }
type ViewMode = 'grade' | 'teacher'

const academicsGrades = () => apiFetch<Grade[]>('/api/v1/academics/grades')

export function RequirementsPage() {
  const { notify } = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grade')
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState({ grade_id: '', subject_id: '', teacher_id: '', room_id: '', periods_per_week: 4, double_periods: 0 })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [requirements, grades, classes, subjects, teachers, rooms] = await Promise.all([scheduling.requirements(), academicsGrades(), scheduling.classes(), scheduling.subjects(), scheduling.teachers(), scheduling.rooms()])
      setData({ requirements, grades, classes, subjects, teachers, rooms })
    } catch (err) { setError(friendlyApiError(err, 'load teaching allocations')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!selectedId && data) {
      const first = viewMode === 'grade' ? data.grades[0]?.id : data.teachers[0]?.id
      if (first) setSelectedId(String(first))
    }
  }, [data, selectedId, viewMode])

  const selectedGrade = useMemo(() => data?.grades.find((item) => String(item.id) === selectedId), [data, selectedId])
  const classForGrade = useMemo(() => {
    if (!data || !selectedGrade) return undefined
    return data.classes.find((item) => item.grade === selectedGrade.name || item.grade === selectedGrade.code || item.name === selectedGrade.name)
  }, [data, selectedGrade])

  const selectedName = useMemo(() => {
    if (!data || !selectedId) return ''
    return viewMode === 'grade' ? selectedGrade?.name ?? '' : data.teachers.find((item) => String(item.id) === selectedId)?.name ?? ''
  }, [data, selectedId, selectedGrade, viewMode])

  const visibleRequirements = useMemo(() => {
    const rows = data?.requirements ?? []
    if (!selectedId) return rows
    if (viewMode === 'teacher') return rows.filter((row) => String(row.teacher_id) === selectedId)
    if (!classForGrade) return []
    return rows.filter((row) => String(row.class_id) === String(classForGrade.id))
  }, [data, selectedId, viewMode, classForGrade])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return visibleRequirements
    return visibleRequirements.filter((row) => [row.class_name, row.subject_name, row.teacher_name, row.room_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)))
  }, [query, visibleRequirements])

  const totalWorkload = useMemo(() => visibleRequirements.reduce((total, row) => total + row.periods_per_week, 0), [visibleRequirements])

  async function resolveGradeClass(grade: Grade): Promise<SchoolClass> {
    const existing = data?.classes.find((item) => item.grade === grade.name || item.grade === grade.code || item.name === grade.name)
    if (existing) return existing
    // Compatibility record is created automatically and never exposed as a user-facing choice.
    return scheduling.createClass({ name: grade.name, code: `GRADE-${grade.id}`, grade: grade.name })
  }

  async function add(event: FormEvent) {
    event.preventDefault(); if (saving) return
    if (!form.grade_id || !form.subject_id || !form.teacher_id) { notify('Choose a grade, subject and teacher.', 'error'); return }
    if (form.double_periods * 2 > form.periods_per_week) { notify('Double periods cannot exceed half of the weekly lesson count.', 'error'); return }
    setSaving(true)
    try {
      const grade = data?.grades.find((item) => String(item.id) === form.grade_id)
      if (!grade) throw new Error('Selected grade was not found.')
      const compatibilityClass = await resolveGradeClass(grade)
      await scheduling.createRequirement({ class_id: compatibilityClass.id, subject_id: Number(form.subject_id), teacher_id: Number(form.teacher_id), room_id: form.room_id ? Number(form.room_id) : null, periods_per_week: Number(form.periods_per_week), double_periods: Number(form.double_periods) })
      notify('Grade lesson allocation added.', 'success'); setForm((current) => ({ ...current, subject_id: '', double_periods: 0 })); await load()
    } catch (err) { notify(friendlyApiError(err, 'add that grade lesson allocation'), 'error') }
    finally { setSaving(false) }
  }

  async function remove(row: Requirement) {
    try { await scheduling.deleteRequirement(row.id); notify('Lesson allocation removed.', 'success'); await load() }
    catch (err) { notify(friendlyApiError(err, 'remove that allocation'), 'error') }
  }

  const columns: Column<Requirement>[] = [
    ...(viewMode === 'teacher' ? [{ key: 'grade', header: 'Grade', render: (row: Requirement) => data?.classes.find((item) => item.id === row.class_id)?.grade ?? row.class_name ?? '—' }] : []),
    { key: 'subject', header: 'Learning area / Subject', render: (row) => row.subject_name ?? '—' },
    ...(viewMode === 'grade' ? [{ key: 'teacher', header: 'Teacher', render: (row: Requirement) => row.teacher_name ?? '—' }] : []),
    { key: 'room', header: 'Room', render: (row) => row.room_name ?? 'Any' },
    { key: 'freq', header: 'Lessons / week', render: (row) => row.periods_per_week },
    { key: 'double', header: 'Doubles', render: (row) => row.double_periods ? <Badge>{row.double_periods} double</Badge> : '—' },
  ]
  const ready = (data?.grades.length ?? 0) > 0 && (data?.subjects.length ?? 0) > 0

  return <>
    <PageHeader title="Teaching allocations" description="Define learning areas by grade, teacher, room and weekly lesson frequency. Class selection is not used here." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Teaching Allocations' }]} />
    {error ? <ErrorState title="Teaching allocations could not load" message={error} onRetry={load} /> : <>
      {!ready && !loading && <Alert tone="info" title="Add grades and learning areas first">Teaching allocations are attached to an academic grade, so you need at least one grade and learning area.</Alert>}
      {ready && data && <>
        <section className="card section">
          <div className="toolbar"><div><h2 className="section__title">Allocate by</h2><p className="section__description">Build requirements by grade, or inspect a teacher's workload.</p></div><div className="form__row"><button type="button" className={`button button--sm ${viewMode === 'grade' ? 'button--primary' : 'button--ghost'}`} onClick={() => { setViewMode('grade'); setSelectedId(data.grades[0] ? String(data.grades[0].id) : '') }}>Grade</button><button type="button" className={`button button--sm ${viewMode === 'teacher' ? 'button--primary' : 'button--ghost'}`} onClick={() => { setViewMode('teacher'); setSelectedId(data.teachers[0] ? String(data.teachers[0].id) : '') }}>Teacher</button></div></div>
          <div className="field" style={{ maxWidth: 420 }}><label className="field__label" htmlFor="allocation-owner">{viewMode === 'grade' ? 'Grade' : 'Teacher'}</label><select id="allocation-owner" className="input input--select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{(viewMode === 'grade' ? data.grades : data.teachers).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="panel__subtitle">{viewMode === 'grade' ? 'Learning areas and teachers for' : 'Current workload for'} {selectedName}</div><div className="chip-list"><Badge>{totalWorkload} lessons / week</Badge>{viewMode === 'grade' && <Badge>Generator-ready lesson cards</Badge>}</div>
        </section>
        <section className="card section"><h2 className="section__title">Add lesson allocation</h2><p className="section__description">Select a grade and learning area, then assign the weekly lesson frequency. Previous class selection is not required.</p><form className="form form--grid" onSubmit={add}>
          <div className="field"><label className="field__label" htmlFor="req-grade">Grade</label><select id="req-grade" className="input input--select" value={form.grade_id} onChange={(event) => setForm({ ...form, grade_id: event.target.value })} required><option value="">Choose…</option>{data.grades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label className="field__label" htmlFor="req-subject">Learning area / Subject</label><select id="req-subject" className="input input--select" value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} required><option value="">Choose…</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label className="field__label" htmlFor="req-teacher">Teacher</label><select id="req-teacher" className="input input--select" value={form.teacher_id} onChange={(event) => setForm({ ...form, teacher_id: event.target.value })} required><option value="">Choose…</option>{data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label className="field__label" htmlFor="req-freq">Lessons per week</label><input id="req-freq" className="input" type="number" min={1} max={40} value={form.periods_per_week} onChange={(event) => setForm({ ...form, periods_per_week: Number(event.target.value), double_periods: Math.min(form.double_periods, Math.floor(Number(event.target.value) / 2)) })} required /></div>
          <div className="field"><label className="field__label" htmlFor="req-double">Double lessons / week</label><input id="req-double" className="input" type="number" min={0} max={Math.floor(form.periods_per_week / 2)} value={form.double_periods} onChange={(event) => setForm({ ...form, double_periods: Number(event.target.value) })} /><span className="form__note">Each double occupies two consecutive teaching periods.</span></div>
          <div className="field"><label className="field__label" htmlFor="req-room">Preferred / fixed room</label><select id="req-room" className="input input--select" value={form.room_id} onChange={(event) => setForm({ ...form, room_id: event.target.value })}><option value="">Any compatible room</option>{data.rooms.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.room_type})</option>)}</select></div>
          <div className="form__row form--grid__full"><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add grade allocation'}</button></div>
        </form></section>
      </>}
      <section className="card section"><div className="toolbar"><div className="search"><SearchIcon className="search__icon" width={18} height={18} /><label className="visually-hidden" htmlFor="req-search">Search allocations</label><input id="req-search" className="input input--search" type="search" placeholder="Search subject or teacher" value={query} onChange={(event) => setQuery(event.target.value)} /></div>{query && <button type="button" className="button button--ghost button--sm" onClick={() => setQuery('')}>Clear search</button>}</div><DataTable caption="Grade lesson allocations" columns={columns} rows={filtered} rowKey={(row) => row.id} loading={loading} loadingLabel="Loading grade lesson allocations" empty={<EmptyState title={query ? 'No matching allocations' : `No allocations for ${selectedName || 'this selection'}`} description={query ? 'Nothing matches your search.' : 'Allocate a learning area with a teacher and lessons per week above.'} icon={<CalendarIcon width={22} height={22} />} />} rowActions={(row) => <button type="button" className="button button--ghost button--sm" onClick={() => remove(row)}>Delete</button>} /></section>
    </>}
  </>
}
