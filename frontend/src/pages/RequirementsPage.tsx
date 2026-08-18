import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { CalendarIcon, SearchIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import {
  scheduling,
  type Requirement,
  type Room,
  type SchoolClass,
  type Subject,
  type Teacher,
} from '../lib/scheduling'

type Data = { requirements: Requirement[]; classes: SchoolClass[]; subjects: Subject[]; teachers: Teacher[]; rooms: Room[] }
type ViewMode = 'class' | 'teacher'

export function RequirementsPage() {
  const { notify } = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('class')
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState({ class_id: '', subject_id: '', teacher_id: '', room_id: '', periods_per_week: 4 })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [requirements, classes, subjects, teachers, rooms] = await Promise.all([scheduling.requirements(), scheduling.classes(), scheduling.subjects(), scheduling.teachers(), scheduling.rooms()])
      setData({ requirements, classes, subjects, teachers, rooms })
    } catch (err) { setError(friendlyApiError(err, 'load teaching allocations')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!selectedId && data) {
      const first = viewMode === 'class' ? data.classes[0]?.id : data.teachers[0]?.id
      if (first) setSelectedId(String(first))
    }
  }, [data, selectedId, viewMode])

  const selectedName = useMemo(() => {
    if (!data || !selectedId) return ''
    return viewMode === 'class'
      ? data.classes.find((item) => String(item.id) === selectedId)?.name ?? ''
      : data.teachers.find((item) => String(item.id) === selectedId)?.name ?? ''
  }, [data, selectedId, viewMode])

  const visibleRequirements = useMemo(() => {
    const rows = data?.requirements ?? []
    if (!selectedId) return rows
    return rows.filter((row) => viewMode === 'class' ? String(row.class_id) === selectedId : String(row.teacher_id) === selectedId)
  }, [data, selectedId, viewMode])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return visibleRequirements
    return visibleRequirements.filter((row) => [row.class_name, row.subject_name, row.teacher_name, row.room_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)))
  }, [query, visibleRequirements])

  const totalWorkload = useMemo(() => visibleRequirements.reduce((total, row) => total + row.periods_per_week, 0), [visibleRequirements])
  const totals = useMemo(() => {
    const perClass = new Map<string, number>()
    for (const row of data?.requirements ?? []) { const key = row.class_name ?? 'Unknown'; perClass.set(key, (perClass.get(key) ?? 0) + row.periods_per_week) }
    return perClass
  }, [data])

  async function add(event: FormEvent) {
    event.preventDefault(); if (saving) return
    if (!form.class_id || !form.subject_id || !form.teacher_id) { notify('Choose a class, subject and teacher.', 'error'); return }
    setSaving(true)
    try {
      await scheduling.createRequirement({ class_id: Number(form.class_id), subject_id: Number(form.subject_id), teacher_id: Number(form.teacher_id), room_id: form.room_id ? Number(form.room_id) : null, periods_per_week: Number(form.periods_per_week) })
      notify('Teaching allocation added.', 'success'); setForm((current) => ({ ...current, subject_id: '' })); await load()
    } catch (err) { notify(friendlyApiError(err, 'add that teaching allocation'), 'error') }
    finally { setSaving(false) }
  }

  async function remove(row: Requirement) {
    try { await scheduling.deleteRequirement(row.id); notify('Teaching allocation removed.', 'success'); await load() }
    catch (err) { notify(friendlyApiError(err, 'remove that allocation'), 'error') }
  }

  const columns: Column<Requirement>[] = [
    ...(viewMode === 'teacher' ? [{ key: 'class', header: 'Class', render: (row: Requirement) => row.class_name ?? '—' }] : []),
    { key: 'subject', header: 'Subject', render: (row) => row.subject_name ?? '—' },
    ...(viewMode === 'class' ? [{ key: 'teacher', header: 'Teacher', render: (row: Requirement) => row.teacher_name ?? '—' }] : []),
    { key: 'room', header: 'Room', render: (row) => row.room_name ?? 'Any' },
    { key: 'freq', header: 'Lessons / week', render: (row) => row.periods_per_week },
  ]
  const ready = (data?.classes.length ?? 0) > 0 && (data?.subjects.length ?? 0) > 0

  return (
    <>
      <PageHeader title="Teaching allocations" description="Assign subjects to teachers for each class and set the required lessons per week." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Teaching Allocations' }]} />
      {error ? <ErrorState title="Teaching allocations could not load" message={error} onRetry={load} /> : <>
        {!ready && !loading && <Alert tone="info" title="Add classes and subjects first">Teaching allocations link a class to a subject and teacher, so you need at least one class and subject.</Alert>}
        {ready && data && <>
          <section className="card section">
            <div className="toolbar"><div><h2 className="section__title">Allocate by</h2><p className="section__description">Choose a grade/class to build its timetable requirements, or choose a teacher to review their workload.</p></div><div className="form__row">
              <button type="button" className={`button button--sm ${viewMode === 'class' ? 'button--primary' : 'button--ghost'}`} onClick={() => { setViewMode('class'); setSelectedId(data.classes[0] ? String(data.classes[0].id) : '') }}>Grade / Class</button>
              <button type="button" className={`button button--sm ${viewMode === 'teacher' ? 'button--primary' : 'button--ghost'}`} onClick={() => { setViewMode('teacher'); setSelectedId(data.teachers[0] ? String(data.teachers[0].id) : '') }}>Teacher</button>
            </div></div>
            <div className="field" style={{ maxWidth: 420 }}><label className="field__label" htmlFor="allocation-owner">{viewMode === 'class' ? 'Grade / Class' : 'Teacher'}</label><select id="allocation-owner" className="input input--select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{(viewMode === 'class' ? data.classes : data.teachers).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div className="panel__subtitle">{viewMode === 'class' ? 'Subjects and teachers for' : 'Current workload for'} {selectedName}</div>
            <div className="chip-list"><Badge>{totalWorkload} lessons / week</Badge>{viewMode === 'teacher' && <Badge>{visibleRequirements.length} allocations</Badge>}</div>
          </section>
          <section className="card section"><h2 className="section__title">Add allocation</h2><form className="form form--grid" onSubmit={add}>
            <div className="field"><label className="field__label" htmlFor="req-class">Grade / Class</label><select id="req-class" className="input input--select" value={form.class_id} onChange={(event) => setForm({ ...form, class_id: event.target.value })} required><option value="">Choose…</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div className="field"><label className="field__label" htmlFor="req-subject">Subject</label><select id="req-subject" className="input input--select" value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} required><option value="">Choose…</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div className="field"><label className="field__label" htmlFor="req-teacher">Teacher</label><select id="req-teacher" className="input input--select" value={form.teacher_id} onChange={(event) => setForm({ ...form, teacher_id: event.target.value })} required><option value="">Choose…</option>{data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div className="field"><label className="field__label" htmlFor="req-freq">Lessons per week</label><input id="req-freq" className="input" type="number" min={1} max={40} value={form.periods_per_week} onChange={(event) => setForm({ ...form, periods_per_week: Number(event.target.value) })} required /></div>
            <div className="field"><label className="field__label" htmlFor="req-room">Room</label><select id="req-room" className="input input--select" value={form.room_id} onChange={(event) => setForm({ ...form, room_id: event.target.value })}><option value="">Any</option>{data.rooms.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.room_type})</option>)}</select></div>
            <div className="form__row form--grid__full"><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Allocate subject'}</button></div>
          </form></section>
        </>}
        <section className="card section"><div className="toolbar"><div className="search"><SearchIcon className="search__icon" width={18} height={18} /><label className="visually-hidden" htmlFor="req-search">Search allocations</label><input id="req-search" className="input input--search" type="search" placeholder="Search subject, class or teacher" value={query} onChange={(event) => setQuery(event.target.value)} /></div>{query && <button type="button" className="button button--ghost button--sm" onClick={() => setQuery('')}>Clear search</button>}</div>
          <DataTable caption="Teaching allocations" columns={columns} rows={filtered} rowKey={(row) => row.id} loading={loading} loadingLabel="Loading teaching allocations" empty={<EmptyState title={query ? 'No matching allocations' : `No allocations for ${selectedName || 'this selection'}`} description={query ? 'Nothing matches your search.' : 'Allocate a subject with a teacher and lessons per week above.'} icon={<CalendarIcon width={22} height={22} />} />} rowActions={(row) => <button type="button" className="button button--ghost button--sm" onClick={() => remove(row)}>Delete</button>} />
          {viewMode === 'class' && totals.size > 0 && <><h3 className="panel__subtitle">Weekly load per class</h3><ul className="chip-list">{[...totals.entries()].map(([name, count]) => <li key={name}><Badge>{name}: {count} lessons</Badge></li>)}</ul></>}
        </section>
      </>}
    </>
  )
}
