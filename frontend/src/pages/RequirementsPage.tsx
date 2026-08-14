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

type Data = {
  requirements: Requirement[]
  classes: SchoolClass[]
  subjects: Subject[]
  teachers: Teacher[]
  rooms: Room[]
}

/**
 * Lesson requirements are the actual input to the solver: "this class studies
 * this subject with this teacher N times a week".
 */
export function RequirementsPage() {
  const { notify } = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    class_id: '',
    subject_id: '',
    teacher_id: '',
    room_id: '',
    periods_per_week: 4,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [requirements, classes, subjects, teachers, rooms] = await Promise.all([
        scheduling.requirements(),
        scheduling.classes(),
        scheduling.subjects(),
        scheduling.teachers(),
        scheduling.rooms(),
      ])
      setData({ requirements, classes, subjects, teachers, rooms })
    } catch (err) {
      setError(friendlyApiError(err, 'load lesson requirements'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const rows = data?.requirements ?? []
    if (!term) return rows
    return rows.filter((row) =>
      [row.class_name, row.subject_name, row.teacher_name, row.room_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [data, query])

  const totals = useMemo(() => {
    const perClass = new Map<string, number>()
    for (const row of data?.requirements ?? []) {
      const key = row.class_name ?? 'Unknown'
      perClass.set(key, (perClass.get(key) ?? 0) + row.periods_per_week)
    }
    return perClass
  }, [data])

  async function add(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!form.class_id || !form.subject_id) {
      notify('Choose a class and a subject.', 'error')
      return
    }
    setSaving(true)
    try {
      await scheduling.createRequirement({
        class_id: Number(form.class_id),
        subject_id: Number(form.subject_id),
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
        room_id: form.room_id ? Number(form.room_id) : null,
        periods_per_week: Number(form.periods_per_week),
      })
      notify('Lesson requirement added.', 'success')
      setForm((current) => ({ ...current, subject_id: '' }))
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'add that requirement'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(row: Requirement) {
    try {
      await scheduling.deleteRequirement(row.id)
      notify('Requirement removed.', 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'remove that requirement'), 'error')
    }
  }

  const columns: Column<Requirement>[] = [
    { key: 'class', header: 'Class', render: (row) => row.class_name ?? '—' },
    { key: 'subject', header: 'Subject', render: (row) => row.subject_name ?? '—' },
    {
      key: 'teacher',
      header: 'Teacher',
      render: (row) =>
        row.teacher_name ?? <Badge tone="warning">Unassigned</Badge>,
    },
    { key: 'room', header: 'Room', render: (row) => row.room_name ?? 'Any' },
    { key: 'freq', header: 'Per week', render: (row) => row.periods_per_week },
  ]

  const ready = (data?.classes.length ?? 0) > 0 && (data?.subjects.length ?? 0) > 0

  return (
    <>
      <PageHeader
        title="Lesson requirements"
        description="What each class must study every week. This is what the solver schedules."
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Scheduling' },
          { label: 'Requirements' },
        ]}
      />

      {error ? (
        <ErrorState title="Requirements could not load" message={error} onRetry={load} />
      ) : (
        <>
          {!ready && !loading && (
            <Alert tone="info" title="Add classes and subjects first">
              Lesson requirements link a class to a subject, so you need at least one of each.
            </Alert>
          )}

          {ready && (
            <section className="card section">
              <h2 className="section__title">Add a requirement</h2>
              <form className="form form--grid" onSubmit={add}>
                <div className="field">
                  <label className="field__label" htmlFor="req-class">
                    Class <span className="field__required">(required)</span>
                  </label>
                  <select
                    id="req-class"
                    className="input input--select"
                    value={form.class_id}
                    onChange={(event) => setForm({ ...form, class_id: event.target.value })}
                    required
                  >
                    <option value="">Choose…</option>
                    {data!.classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="req-subject">
                    Subject <span className="field__required">(required)</span>
                  </label>
                  <select
                    id="req-subject"
                    className="input input--select"
                    value={form.subject_id}
                    onChange={(event) => setForm({ ...form, subject_id: event.target.value })}
                    required
                  >
                    <option value="">Choose…</option>
                    {data!.subjects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="req-teacher">
                    Teacher
                  </label>
                  <select
                    id="req-teacher"
                    className="input input--select"
                    value={form.teacher_id}
                    onChange={(event) => setForm({ ...form, teacher_id: event.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {data!.teachers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="req-room">
                    Room
                  </label>
                  <select
                    id="req-room"
                    className="input input--select"
                    value={form.room_id}
                    onChange={(event) => setForm({ ...form, room_id: event.target.value })}
                  >
                    <option value="">Any</option>
                    {data!.rooms.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.room_type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="req-freq">
                    Lessons per week <span className="field__required">(required)</span>
                  </label>
                  <input
                    id="req-freq"
                    className="input"
                    type="number"
                    min={1}
                    max={40}
                    value={form.periods_per_week}
                    onChange={(event) =>
                      setForm({ ...form, periods_per_week: Number(event.target.value) })
                    }
                    required
                  />
                </div>

                <div className="form__row form--grid__full">
                  <button className="button button--primary" type="submit" disabled={saving}>
                    {saving ? 'Adding…' : 'Add requirement'}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="card section">
            <div className="toolbar">
              <div className="search">
                <SearchIcon className="search__icon" width={18} height={18} />
                <label className="visually-hidden" htmlFor="req-search">
                  Search requirements
                </label>
                <input
                  id="req-search"
                  className="input input--search"
                  type="search"
                  placeholder="Search by class, subject or teacher"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {query && (
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  onClick={() => setQuery('')}
                >
                  Clear search
                </button>
              )}
            </div>

            <DataTable
              caption="Lesson requirements"
              columns={columns}
              rows={filtered}
              rowKey={(row) => row.id}
              loading={loading}
              loadingLabel="Loading requirements"
              empty={
                <EmptyState
                  title={query ? 'No matching requirements' : 'No requirements yet'}
                  description={
                    query
                      ? 'Nothing matches your search.'
                      : 'Add what each class studies each week, then generate a timetable.'
                  }
                  icon={<CalendarIcon width={22} height={22} />}
                />
              }
              rowActions={(row) => (
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  onClick={() => remove(row)}
                >
                  Delete
                </button>
              )}
            />

            {totals.size > 0 && (
              <>
                <h3 className="panel__subtitle">Weekly load per class</h3>
                <ul className="chip-list">
                  {[...totals.entries()].map(([name, count]) => (
                    <li key={name}>
                      <Badge>
                        {name}: {count} lessons
                      </Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </>
  )
}
