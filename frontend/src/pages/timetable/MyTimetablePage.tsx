import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { Alert } from '../../components/Alert'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../../components/States'
import { PublishedTimetableGridWithEvents } from '../../components/PublishedTimetableGridWithEvents'
import { CalendarIcon } from '../../components/icons'
import { friendlyApiError } from '../../lib/api'
import { scheduling, type Event, type SchoolClass, type Teacher, type TimetableAmendment, type TimetableType, type TimetableView } from '../../lib/scheduling'

type ViewKind = 'teacher' | 'class'

export function MyTimetablePage() {
  const [kind, setKind] = useState<ViewKind>('teacher')
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('')
  const [teacherId, setTeacherId] = useState<number | null>(null)
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [timetableTypes, setTimetableTypes] = useState<TimetableType[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<number | ''>('')
  const [view, setView] = useState<TimetableView | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [amendments, setAmendments] = useState<TimetableAmendment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      scheduling.me(),
      scheduling.classes(),
      scheduling.teachers(),
      scheduling.timetableTypes(),
      scheduling.events(),
      scheduling.amendments(),
    ])
      .then(([principal, classRows, teacherRows, typeRows, eventRows, amendmentRows]) => {
        if (!active) return
        const currentTeacherId = principal.teacher_id ?? null
        const currentTeacher = currentTeacherId === null
          ? null
          : teacherRows.find(row => row.id === currentTeacherId) ?? null

        setTeacherId(currentTeacherId)
        setTeacher(currentTeacher)
        setClasses(classRows)
        setTimetableTypes(typeRows)
        setEvents(eventRows)
        setAmendments(amendmentRows)
      })
      .catch(err => {
        if (active) setError(friendlyApiError(err, 'load your timetable options'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [])

  const myClassTeacherClasses = useMemo(() => {
    if (teacherId === null) return []
    return classes.filter(item => item.class_teacher_id === teacherId)
  }, [classes, teacherId])

  const targetId = kind === 'teacher'
    ? teacherId
    : selectedClassId === ''
      ? null
      : selectedClassId

  useEffect(() => {
    if (targetId === null) {
      setView(null)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    scheduling.view(kind, targetId)
      .then(next => {
        if (active) setView(next)
      })
      .catch(err => {
        if (active) setError(friendlyApiError(err, 'load the timetable'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [kind, targetId])

  function chooseKind(next: ViewKind) {
    setKind(next)
    setError(null)
    if (next === 'teacher') {
      setSelectedClassId('')
    } else if (selectedClassId === '' && myClassTeacherClasses.length > 0) {
      setSelectedClassId(myClassTeacherClasses[0].id)
    }
  }

  function resetFilters() {
    setKind('teacher')
    setSelectedClassId('')
    setSelectedTypeId('')
    setError(null)
  }

  const currentTypeId = view?.version?.timetable_type_id ?? view?.timetable_type?.id ?? null
  const typeMatchesCurrent = selectedTypeId === '' || selectedTypeId === currentTypeId
  const official = view?.version?.status === 'published'
  const typeName = view?.timetable_type?.name ?? 'Current timetable'
  const teacherName = teacher?.name ?? ([teacher?.first_name, teacher?.last_name].filter(Boolean).join(' ') || teacher?.email || 'Current user')
  const targetName = view?.target_name ?? (kind === 'teacher' ? teacherName : '')

  if (loading && !view) {
    return <>
      <PageHeader title="My Timetable" description="View your timetable and classes where you are the assigned class teacher." />
      <div className="card section"><LoadingBlock label="Loading your timetable" rows={7} /></div>
    </>
  }

  if (error && !view) {
    return <>
      <PageHeader title="My Timetable" />
      <ErrorState title="Timetable could not load" message={error} />
    </>
  }

  return <>
    <PageHeader
      title="My Timetable"
      description="Use the filters to view your timetable or a class timetable assigned to you."
      breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'My Timetable' }]}
    />

    <section className="card section">
      <div className="toolbar">
        <div>
          <p className="eyebrow">FILTERS</p>
          <h2 className="section__title">Timetable view</h2>
          <p className="section__description">Name is fixed to your signed-in teacher account. Class choices only include classes where you are the class teacher.</p>
        </div>
        <button type="button" className="button button--secondary" onClick={resetFilters}>Reset</button>
      </div>

      <div className="timetable-controls-row">
        <div className="timetable-control-group">
          <label className="field__label" htmlFor="my-timetable-view">View</label>
          <select
            id="my-timetable-view"
            className="input input--select"
            value={kind}
            onChange={event => chooseKind(event.target.value as ViewKind)}
          >
            <option value="teacher">My timetable</option>
            <option value="class" disabled={myClassTeacherClasses.length === 0}>Class timetable</option>
          </select>
        </div>

        <div className="timetable-control-group">
          <label className="field__label" htmlFor="my-timetable-type">Type</label>
          <select
            id="my-timetable-type"
            className="input input--select"
            value={selectedTypeId}
            onChange={event => setSelectedTypeId(event.target.value ? Number(event.target.value) : '')}
          >
            <option value="">All types</option>
            {timetableTypes.filter(item => item.is_active).map(item => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="timetable-control-group">
          <label className="field__label" htmlFor="my-timetable-name">Name</label>
          <select id="my-timetable-name" className="input input--select" value={teacherId ?? ''} disabled>
            <option value={teacherId ?? ''}>{teacherName}</option>
          </select>
        </div>

        {kind === 'class' && (
          <div className="timetable-control-group">
            <label className="field__label" htmlFor="my-timetable-class">Class</label>
            <select
              id="my-timetable-class"
              className="input input--select"
              value={selectedClassId}
              onChange={event => setSelectedClassId(event.target.value ? Number(event.target.value) : '')}
            >
              <option value="">Choose class…</option>
              {myClassTeacherClasses.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </section>

    {official && <Alert tone="info" title="Published timetable">This is the timetable currently in force for the school.</Alert>}

    {!typeMatchesCurrent && (
      <section className="card section">
        <EmptyState
          title="No timetable for this type"
          description="The school currently has one active timetable in force. Select its type, or choose All types, to display it."
          icon={<CalendarIcon width={22} height={22} />}
        />
      </section>
    )}

    {amendments.length > 0 && (
      <section className="card section timetable-amendments">
        <div className="toolbar">
          <div>
            <h2 className="section__title">Timetable amendments</h2>
            <p className="section__description">Official timetable changes are shown here.</p>
          </div>
          <Badge tone="info">{amendments.length}</Badge>
        </div>
        <div className="amendment-list">
          {amendments.map(item => (
            <div className="amendment-item" key={item.id}>
              <div><strong>{item.title}</strong><p>{item.message}</p></div>
              <span className="amendment-meta">{item.at ? new Date(item.at).toLocaleString() : ''}</span>
            </div>
          ))}
        </div>
      </section>
    )}

    {view?.version && targetId !== null && typeMatchesCurrent ? (
      <section className="card section">
        <div className="toolbar">
          <div>
            <h2 className="section__title">{kind === 'teacher' ? 'My Timetable' : 'Class Timetable'}</h2>
            <p className="section__description">{typeName}{targetName ? ` · ${targetName}` : ''}</p>
          </div>
          <Badge tone="success">Published</Badge>
        </div>
        <PublishedTimetableGridWithEvents view={view} mode={kind} events={events} />
      </section>
    ) : typeMatchesCurrent ? (
      <section className="card section">
        <EmptyState
          title={kind === 'class' ? 'No class selected' : 'No timetable available'}
          description={kind === 'class' ? 'Select one of the classes where you are the assigned class teacher.' : 'If the published timetable is missing, generate and publish one from the timetable builder.'}
          icon={<CalendarIcon width={22} height={22} />}
        />
      </section>
    ) : null}
  </>
}
