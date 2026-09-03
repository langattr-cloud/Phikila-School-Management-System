import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { PublishedTimetableGridWithEvents } from '../components/PublishedTimetableGridWithEvents'
import { CalendarIcon } from '../components/icons'
import { friendlyApiError } from '../lib/api'
import { formatSavedAt } from '../lib/offline'
import { scheduling, type Event, type SchoolClass, type Teacher, type TimetableAmendment, type TimetableView } from '../lib/scheduling'

type Scope = 'teacher' | 'class'

export function MyTimetablePage() {
  const [scope, setScope] = useState<Scope>('teacher')
  const [teacherId, setTeacherId] = useState<number | null>(null)
  const [classTeacherClassId, setClassTeacherClassId] = useState<number | null>(null)
  const [options, setOptions] = useState<{ classes: SchoolClass[]; teachers: Teacher[] } | null>(null)
  const [view, setView] = useState<TimetableView | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [amendments, setAmendments] = useState<TimetableAmendment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState<number | null>(null)
  const [isTeacher, setIsTeacher] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([scheduling.classes(), scheduling.teachers(), scheduling.me()])
      .then(([classes, teachers, me]) => {
        if (!active) return
        setOptions({ classes, teachers })
        if (me.teacher_id) {
          setIsTeacher(true)
          setTeacherId(me.teacher_id)
          setScope('teacher')
          setClassTeacherClassId(classes.find(item => item.class_teacher_id === me.teacher_id)?.id ?? null)
        } else if (me.class_id) {
          setScope('class')
          setClassTeacherClassId(me.class_id)
        }
      })
      .catch(err => { if (active) setError(friendlyApiError(err, 'load your school data')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!options) return
    const targetId = scope === 'teacher' ? teacherId : classTeacherClassId
    if (!targetId) return
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([
      scheduling.view(scope, targetId),
      scheduling.events(),
      scheduling.amendments(),
    ])
      .then(([nextView, eventRows, amendmentRows]) => {
        if (!active) return
        setView(nextView)
        setEvents(eventRows)
        setAmendments(amendmentRows)
        setStale(null)
      })
      .catch(err => { if (active) setError(friendlyApiError(err, 'load the current timetable')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [scope, teacherId, classTeacherClassId, options])

  const canViewAssignedClass = isTeacher && classTeacherClassId !== null
  const currentType = (view as any)?.timetable_type as { name?: string } | undefined
  const isOfficial = view?.version?.status === 'published'
  const title = currentType?.name || 'Current timetable'

  if (loading && !view) return <><PageHeader title="My timetable" description="Your current timetable." /><div className="card section"><LoadingBlock label="Loading your timetable" rows={6} /></div></>
  if (error && !view) return <><PageHeader title="My timetable" /><ErrorState title="Timetable could not load" message={error} /></>

  return <>
    <PageHeader title="My timetable" description="Your current timetable and, when you are a Class Teacher, your assigned class timetable." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'My timetable' }]} />
    <section className="card section timetable-type-selector">
      <div className="toolbar">
        <div><p className="eyebrow">Current Timetable Type</p><h2 className="section__title">{title}</h2><p className="section__description">The timetable type saved by the Timetabler is the source of truth for the days and periods shown below.</p></div>
        {view?.periods && <Badge tone="info">{view.periods.length} periods · {view.days.length} days</Badge>}
      </div>
    </section>
    <section className="card section timetable-view-tabs" aria-label="Timetable view"><div className="timetable-tabs" role="tablist"><button type="button" role="tab" aria-selected={scope === 'teacher'} className={`button ${scope === 'teacher' ? 'button--primary' : 'button--secondary'}`} onClick={() => setScope('teacher')}>My Timetable</button>{canViewAssignedClass && <button type="button" role="tab" aria-selected={scope === 'class'} className={`button ${scope === 'class' ? 'button--primary' : 'button--secondary'}`} onClick={() => setScope('class')}>My Class</button>}</div></section>
    {isOfficial && <section className="card section timetable-official-indicator" aria-label="Official timetable status"><div className="toolbar"><div><p className="eyebrow">Official timetable</p><h2 className="section__title">This timetable is officially in force</h2><p className="section__description">Effective from {view?.version?.effective_from ? new Date(view.version.effective_from).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'the published date'}.</p></div><Badge tone="success">IN FORCE</Badge></div></section>}
    {amendments.length > 0 && <section className="card section timetable-amendments" aria-label="Timetable amendments"><div className="toolbar"><div><h2 className="section__title">Timetable amendments</h2><p className="section__description">Official timetable changes are shown here.</p></div><Badge tone="info">{amendments.length} new</Badge></div><div className="amendment-list">{amendments.map(amendment => <div className="amendment-item" key={amendment.id}><div><strong>{amendment.title}</strong><p>{amendment.message}</p></div><span className="amendment-meta">{amendment.at ? new Date(amendment.at).toLocaleString() : ''}</span></div>)}</div></section>}
    {stale && <Alert tone="info" title="Offline copy">Saved on this device {formatSavedAt(stale)}. It will refresh when you reconnect.</Alert>}
    {view?.version ? <section className="card section"><div className="toolbar"><div><h2 className="section__title">{scope === 'teacher' ? 'My Timetable' : 'My Class'}</h2><p className="section__description">{title}{view.target_name ? ` · ${view.target_name}` : ''}</p></div><Badge tone="success">Published</Badge></div></section> : <section className="card section"><EmptyState title="No current timetable available" description="There is no published timetable for the current timetable type. Generate and save a timetable using the current configuration." icon={<CalendarIcon width={22} height={22} />} /></section>}
    {view?.version && <section className="card section"><PublishedTimetableGridWithEvents view={view} mode={scope} events={events} /></section>}
  </>
}
