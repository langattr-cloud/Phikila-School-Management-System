import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { CalendarIcon, SearchIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { apiFetch, friendlyApiError } from '../lib/api'
import { scheduling, type Requirement, type SchoolClass, type Subject, type Teacher } from '../lib/scheduling'

type Data = { requirements: Requirement[]; classes: SchoolClass[]; subjects: Subject[]; teachers: Teacher[] }
type DraftAllocation = { id: string; teacher_id: string; class_id: string; subject_id: string; periods_per_week: number; double_periods: number }

const academicsGrades = () => apiFetch<Array<{ id: number; name: string; code: string }>>('/api/v1/academics/grades')

export function RequirementsPage() {
  const { notify } = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [drafts, setDrafts] = useState<DraftAllocation[]>([])
  const [form, setForm] = useState({ teacher_id: '', class_id: '', subject_id: '', periods_per_week: 4, double_lesson: false })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [requirements, grades, classes, subjects, teachers] = await Promise.all([
        scheduling.requirements(),
        academicsGrades(),
        scheduling.classes(),
        scheduling.subjects(),
        scheduling.teachers(),
      ])
      // Keep the academic grades endpoint in the loading contract, but use actual classes
      // for allocations so choices such as "Grade 8 Red" and "6E" remain distinct.
      void grades
      setData({ requirements, classes, subjects, teachers })
    } catch (err) { setError(friendlyApiError(err, 'load teaching allocations')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const ready = Boolean(data && data.classes.length && data.subjects.length && data.teachers.length)
  const filtered = useMemo(() => {
    const rows = data?.requirements ?? []
    const term = query.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.class_name, row.subject_name, row.teacher_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)))
  }, [data, query])

  const draftRows = useMemo(() => drafts.map((draft) => ({
    ...draft,
    teacher_name: data?.teachers.find((item) => String(item.id) === draft.teacher_id)?.name ?? '—',
    class_name: data?.classes.find((item) => String(item.id) === draft.class_id)?.name ?? '—',
    subject_name: data?.subjects.find((item) => String(item.id) === draft.subject_id)?.name ?? '—',
  })), [drafts, data])

  function addDraft(event: FormEvent) {
    event.preventDefault()
    if (!form.teacher_id || !form.class_id || !form.subject_id) {
      notify('Select a teacher, class and subject.', 'error')
      return
    }
    const duplicate = drafts.some((item) => item.teacher_id === form.teacher_id && item.class_id === form.class_id && item.subject_id === form.subject_id)
    if (duplicate) {
      notify('That teacher, class and subject allocation is already in the list.', 'error')
      return
    }
    setDrafts((current) => [...current, {
      id: `${Date.now()}-${Math.random()}`,
      teacher_id: form.teacher_id,
      class_id: form.class_id,
      subject_id: form.subject_id,
      periods_per_week: Number(form.periods_per_week),
      double_periods: form.double_lesson ? 1 : 0,
    }])
    setForm((current) => ({ ...current, subject_id: '', double_lesson: false }))
    notify('Allocation added to the list. Save when finished.', 'success')
  }

  async function saveAllocations() {
    if (!drafts.length || saving) return
    setSaving(true)
    try {
      for (const draft of drafts) {
        await scheduling.createRequirement({
          class_id: Number(draft.class_id),
          subject_id: Number(draft.subject_id),
          teacher_id: Number(draft.teacher_id),
          periods_per_week: draft.periods_per_week,
          double_periods: draft.double_periods,
        })
      }
      setDrafts([])
      notify(`${drafts.length} teaching allocation${drafts.length === 1 ? '' : 's'} saved.`, 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'save teaching allocations'), 'error')
    } finally { setSaving(false) }
  }

  async function remove(row: Requirement) {
    try { await scheduling.deleteRequirement(row.id); notify('Teaching allocation removed.', 'success'); await load() }
    catch (err) { notify(friendlyApiError(err, 'remove that allocation'), 'error') }
  }

  const columns: Column<Requirement>[] = [
    { key: 'teacher', header: 'Teacher', render: (row) => row.teacher_name ?? '—' },
    { key: 'class', header: 'Grade / Class', render: (row) => row.class_name ?? '—' },
    { key: 'subject', header: 'Subject', render: (row) => row.subject_name ?? '—' },
    { key: 'workload', header: 'Workload', render: (row) => `${row.periods_per_week} lesson${row.periods_per_week === 1 ? '' : 's'} / week` },
    { key: 'double', header: 'Double lesson', render: (row) => row.double_periods ? <Badge>Yes</Badge> : 'No' },
  ]

  const draftColumns: Column<(typeof draftRows)[number]>[] = [
    { key: 'teacher', header: 'Teacher', render: (row) => row.teacher_name },
    { key: 'class', header: 'Grade / Class', render: (row) => row.class_name },
    { key: 'subject', header: 'Subject', render: (row) => row.subject_name },
    { key: 'workload', header: 'Workload', render: (row) => `${row.periods_per_week} lesson${row.periods_per_week === 1 ? '' : 's'} / week` },
    { key: 'double', header: 'Double lesson', render: (row) => row.double_periods ? <Badge>Yes</Badge> : 'No' },
  ]

  return <>
    <PageHeader
      title="Teaching allocations"
      description="Assign each teacher to a grade/class and subject, set the subject workload, then save all allocations together."
      breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Teaching Allocations' }]}
    />

    {error ? <ErrorState title="Teaching allocations could not load" message={error} onRetry={load} /> : <>
      {!ready && !loading && <Alert tone="info" title="Set up teachers, classes and subjects first">Teaching allocations need at least one teacher, grade/class and subject.</Alert>}

      {ready && data && <section className="card section">
        <div className="toolbar">
          <div>
            <h2 className="section__title">Add teaching allocation</h2>
            <p className="section__description">Complete the four fields, add the allocation, then save the list when you are done.</p>
          </div>
          {drafts.length > 0 && <Badge>{drafts.length} unsaved</Badge>}
        </div>

        <form className="form form--grid" onSubmit={addDraft}>
          <div className="field">
            <label className="field__label" htmlFor="allocation-teacher">Teacher</label>
            <select id="allocation-teacher" className="input input--select" value={form.teacher_id} onChange={(event) => setForm({ ...form, teacher_id: event.target.value })} required>
              <option value="">Select a teacher</option>
              {data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="allocation-class">Grade / Class</label>
            <select id="allocation-class" className="input input--select" value={form.class_id} onChange={(event) => setForm({ ...form, class_id: event.target.value })} required>
              <option value="">Select a grade / class</option>
              {data.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <span className="form__note">Examples: Grade 8 Red, 6E</span>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="allocation-subject">Subject</label>
            <select id="allocation-subject" className="input input--select" value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} required>
              <option value="">Select a subject</option>
              {data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="allocation-workload">Workload for this subject</label>
            <select id="allocation-workload" className="input input--select" value={form.periods_per_week} onChange={(event) => setForm({ ...form, periods_per_week: Number(event.target.value) })} required>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} lesson{value === 1 ? '' : 's'} / week</option>)}
            </select>
          </div>

          <div className="field form--grid__full">
            <label className="field__label" htmlFor="allocation-double">Lesson format</label>
            <label className="form__check" htmlFor="allocation-double">
              <input id="allocation-double" type="checkbox" checked={form.double_lesson} onChange={(event) => setForm({ ...form, double_lesson: event.target.checked })} />
              <span>Include a double lesson</span>
            </label>
            <span className="form__note">A double lesson uses two consecutive teaching periods for this subject.</span>
          </div>

          <div className="form__row form--grid__full">
            <button className="button button--primary" type="submit">+ Add allocation</button>
          </div>
        </form>
      </section>}

      {ready && draftRows.length > 0 && <section className="card section">
        <div className="toolbar">
          <div>
            <h2 className="section__title">Allocations to save</h2>
            <p className="section__description">Review the teacher, class, subject and workload before saving.</p>
          </div>
          <div className="form__row">
            <button type="button" className="button button--ghost" onClick={() => setDrafts([])} disabled={saving}>Clear</button>
            <button type="button" className="button button--primary" onClick={saveAllocations} disabled={saving}>{saving ? 'Saving…' : `Save ${draftRows.length} allocation${draftRows.length === 1 ? '' : 's'}`}</button>
          </div>
        </div>
        <DataTable caption="Allocations to save" columns={draftColumns} rows={draftRows} rowKey={(row) => row.id} />
      </section>}

      <section className="card section">
        <div className="toolbar">
          <div>
            <h2 className="section__title">Saved teaching allocations</h2>
            <p className="section__description">Existing allocations already saved in the timetable requirements.</p>
          </div>
          <div className="search">
            <SearchIcon className="search__icon" width={18} height={18} />
            <label className="visually-hidden" htmlFor="allocation-search">Search allocations</label>
            <input id="allocation-search" className="input input--search" type="search" placeholder="Search teacher, class or subject" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        <DataTable
          caption="Saved teaching allocations"
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          loading={loading}
          loadingLabel="Loading teaching allocations"
          empty={<EmptyState title={query ? 'No matching allocations' : 'No teaching allocations yet'} description={query ? 'Nothing matches your search.' : 'Add an allocation above, then save it.'} icon={<CalendarIcon width={22} height={22} />} />}
          rowActions={(row) => <button type="button" className="button button--ghost button--sm" onClick={() => remove(row)}>Delete</button>}
        />
      </section>
    </>}
  </>
}
