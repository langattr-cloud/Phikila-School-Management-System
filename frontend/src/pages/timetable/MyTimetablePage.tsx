import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { PublishedTimetableGridWithEvents } from '../components/PublishedTimetableGridWithEvents'
import { CalendarIcon } from '../components/icons'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Event, type Requirement, type Room, type SchoolClass, type Subject, type Teacher, type TimetableAmendment, type TimetableView } from '../lib/scheduling'

type ViewKind = 'teacher' | 'my-classes' | 'class' | 'room' | 'subject'

export function MyTimetablePage() {
  const [kind, setKind] = useState<ViewKind>('teacher')
  const [targetId, setTargetId] = useState<number | null>(null)
  const [me, setMe] = useState<{ teacher_id?: number | null; class_id?: number | null } | null>(null)
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [view, setView] = useState<TimetableView | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [amendments, setAmendments] = useState<TimetableAmendment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      scheduling.me(), scheduling.classes(), scheduling.teachers(), scheduling.rooms(), scheduling.subjects(), scheduling.requirements(), scheduling.events(), scheduling.amendments(),
    ]).then(([principal, classRows, teacherRows, roomRows, subjectRows, requirementRows, eventRows, amendmentRows]) => {
      if (!active) return
      setMe(principal)
      setClasses(classRows)
      setTeachers(teacherRows)
      setRooms(roomRows)
      setSubjects(subjectRows)
      setRequirements(requirementRows)
      setEvents(eventRows)
      setAmendments(amendmentRows)
      setTargetId(principal.teacher_id ?? principal.class_id ?? null)
      setKind(principal.teacher_id ? 'teacher' : principal.class_id ? 'class' : 'teacher')
    }).catch(err => { if (active) setError(friendlyApiError(err, 'load your timetable options')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // A teacher's "My Classes" means classes where they are the class teacher,
  // not every class in which they teach a subject.
  const myClasses = useMemo(() => {
    const teacherId = me?.teacher_id
    if (!teacherId) return []
    return classes.filter(row => row.class_teacher_id === teacherId)
  }, [classes, me])

  const teacherOptions = useMemo(() => teachers, [teachers])
  const selectedKindScope: 'teacher' | 'class' | 'room' | 'subject' | null = kind === 'my-classes' ? 'class' : kind === 'teacher' || kind === 'class' || kind === 'room' || kind === 'subject' ? kind : null

  useEffect(() => {
    if (!selectedKindScope || targetId === null) return
    let active = true
    setLoading(true)
    setError(null)
    scheduling.view(selectedKindScope, targetId)
      .then(next => { if (active) setView(next) })
      .catch(err => { if (active) setError(friendlyApiError(err, 'load the timetable')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [selectedKindScope, targetId])

  function chooseKind(next: ViewKind) {
    setKind(next)
    if (next === 'teacher') setTargetId(me?.teacher_id ?? null)
    else if (next === 'my-classes') setTargetId(myClasses[0]?.id ?? null)
    else setTargetId(null)
  }

  function optionsFor(kindValue: ViewKind) {
    if (kindValue === 'teacher') return teacherOptions
    if (kindValue === 'class' || kindValue === 'my-classes') return kindValue === 'my-classes' ? myClasses : classes
    if (kindValue === 'room') return rooms
    return subjects
  }

  const official = view?.version?.status === 'published'
  const typeName = view?.timetable_type?.name ?? 'Current timetable'
  const targetLabel = kind === 'teacher' ? 'Teacher' : kind === 'class' || kind === 'my-classes' ? 'Class' : kind === 'room' ? 'Room' : 'Subject'

  if (loading && !view) return <><PageHeader title="My Timetable" description="Your timetable and approved timetable views." /><div className="card section"><LoadingBlock label="Loading your timetable" rows={7} /></div></>
  if (error && !view) return <><PageHeader title="My Timetable" /><ErrorState title="Timetable could not load" message={error} /></>

  return <>
    <PageHeader title="My Timetable" description="Day-based timetable views. There is no week selector or weekly navigation." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'My Timetable' }]} />

    <section className="card section timetable-type-selector">
      <div className="toolbar">
        <div><p className="eyebrow">TIMETABLE TYPE</p><h2 className="section__title">{typeName}</h2><p className="section__description">The published timetable configuration controls the school days and daily periods shown below.</p></div>
        {view && <Badge tone="info">{view.days.length} days · {view.periods.length} periods</Badge>}
      </div>
    </section>

    <section className="card section" aria-label="Timetable views">
      <div className="timetable-controls-row">
        <div className="timetable-control-group">
          <label className="field__label" htmlFor="my-timetable-view">View</label>
          <select id="my-timetable-view" className="input input--select" value={kind} onChange={event => chooseKind(event.target.value as ViewKind)}>
            <option value="teacher" disabled={!me?.teacher_id}>My Timetable</option>
            <option value="my-classes" disabled={!me?.teacher_id || myClasses.length === 0}>My Classes</option>
            <option value="class">Class</option>
            <option value="room">Room</option>
            <option value="subject">Subject</option>
          </select>
        </div>
        {kind !== 'my-classes' && <div className="timetable-control-group">
          <label className="field__label" htmlFor="my-timetable-target">{targetLabel}</label>
          <select id="my-timetable-target" className="input input--select" value={targetId ?? ''} onChange={event => setTargetId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Choose…</option>
            {optionsFor(kind).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>}
        {kind === 'my-classes' && <div className="timetable-control-group">
          <label className="field__label" htmlFor="my-class-target">My Class</label>
          <select id="my-class-target" className="input input--select" value={targetId ?? ''} onChange={event => setTargetId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Choose…</option>{myClasses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>}
      </div>
    </section>

    {official && <Alert tone="info" title="Published timetable">This is the timetable currently in force for the school.</Alert>}
    {amendments.length > 0 && <section className="card section timetable-amendments"><div className="toolbar"><div><h2 className="section__title">Timetable amendments</h2><p className="section__description">Official timetable changes are shown here.</p></div><Badge tone="info">{amendments.length}</Badge></div><div className="amendment-list">{amendments.map(item => <div className="amendment-item" key={item.id}><div><strong>{item.title}</strong><p>{item.message}</p></div><span className="amendment-meta">{item.at ? new Date(item.at).toLocaleString() : ''}</span></div>)}</div></section>}

    {view?.version && targetId !== null ? <section className="card section"><div className="toolbar"><div><h2 className="section__title">{kind === 'teacher' ? 'My Timetable' : kind === 'my-classes' ? 'My Classes' : `${targetLabel} Timetable`}</h2><p className="section__description">{typeName}{view.target_name ? ` · ${view.target_name}` : ''}</p></div><Badge tone="success">Published</Badge></div><PublishedTimetableGridWithEvents view={view} mode={selectedKindScope === 'teacher' ? 'teacher' : 'class'} events={events} /></section> : <section className="card section"><EmptyState title="No timetable available" description="Choose a timetable view and target. If the published timetable is missing, generate and publish one from the timetable builder." icon={<CalendarIcon width={22} height={22} />} /></section>}
  </>
}
