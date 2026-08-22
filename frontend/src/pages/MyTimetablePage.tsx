import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { PublishedTimetableGridWithEvents } from '../components/PublishedTimetableGridWithEvents'
import { CalendarIcon } from '../components/icons'
import { friendlyApiError } from '../lib/api'
import { cachedFetch, formatSavedAt } from '../lib/offline'
import { Link } from '../lib/router'
import { scheduling, type Calendar, type Event, type SchoolClass, type Teacher, type TimetableView } from '../lib/scheduling'

type Scope = 'class' | 'teacher'

function buildView(
  calendar: Calendar,
  version: NonNullable<TimetableView['version']>,
  lessons: Array<{ day_index: number; period_index: number; subject_id: number; teacher_id: number; class_id: number }>,
  subjects: Array<{ id: number; name: string }>,
  teachers: Array<{ id: number; name: string }>,
  classes: Array<{ id: number; name: string }>,
  scope: Scope,
  targetId: number,
): TimetableView {
  const subjectName = new Map(subjects.map((item) => [item.id, item.name]))
  const teacherName = new Map(teachers.map((item) => [item.id, item.name]))
  const className = new Map(classes.map((item) => [item.id, item.name]))
  const target = scope === 'teacher' ? teacherName.get(targetId) : className.get(targetId)
  return {
    version,
    target_name: target,
    days: calendar.days.filter((day) => day.is_active).map((day) => ({ index: day.index, name: day.name })),
    periods: calendar.periods.map((period) => ({ index: period.index, name: period.name, start_time: period.start_time, end_time: period.end_time, is_teaching: period.is_teaching })),
    lessons: lessons.map((lesson) => ({
      day: lesson.day_index,
      period: lesson.period_index,
      subject: subjectName.get(lesson.subject_id) ?? 'Unknown subject',
      teacher: teacherName.get(lesson.teacher_id) ?? null,
      class: className.get(lesson.class_id) ?? 'Unknown class',
    })),
  }
}

export function MyTimetablePage() {
  const [scope, setScope] = useState<Scope>('class')
  const [targetId, setTargetId] = useState<number | null>(null)
  const [options, setOptions] = useState<{ classes: SchoolClass[]; teachers: Teacher[] } | null>(null)
  const [view, setView] = useState<TimetableView | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState<number | null>(null)
  const [isTeacher, setIsTeacher] = useState(false)
  const [canReviewDraft, setCanReviewDraft] = useState(false)

  useEffect(() => {
    let active = true
    cachedFetch('mytt:options', async () => {
      const [classes, teachers, me] = await Promise.all([scheduling.classes(), scheduling.teachers(), scheduling.me()])
      return { classes, teachers, me }
    }).then((result) => {
      if (!active) return
      const { classes, teachers, me } = result.data
      setOptions({ classes, teachers })
      setCanReviewDraft(['admin', 'scheduler'].includes(String(me.role ?? '').toLowerCase()))
      if (me.teacher_id) {
        setIsTeacher(true)
        setScope('teacher')
        setTargetId(me.teacher_id)
      } else if (me.class_id) {
        setScope('class')
        setTargetId(me.class_id)
      } else {
        setTargetId(classes[0]?.id ?? null)
      }
    }).catch(() => { if (active) setError('Could not load your school data.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!targetId) return
    let active = true
    setLoading(true)
    setError(null)
    const load = async () => {
      if (!canReviewDraft) {
        const [result, eventRows] = await Promise.all([
          cachedFetch(`mytt:${scope}:${targetId}`, () => scheduling.view(scope, targetId)),
          scheduling.events(),
        ])
        return { view: result.data, events: eventRows, savedAt: result.stale ? result.savedAt : null }
      }

      const [calendar, versions, subjects, teachers, classes, eventRows] = await Promise.all([
        scheduling.calendar(),
        scheduling.versions(),
        scheduling.subjects(),
        scheduling.teachers(),
        scheduling.classes(),
        scheduling.events(),
      ])
      const version = [...versions].sort((a, b) => (b.number ?? b.id) - (a.number ?? a.id))[0]
      if (!version) return { view: null, events: eventRows, savedAt: null }
      const allLessons = await scheduling.lessons(version.id)
      const lessons = allLessons.filter((lesson) => scope === 'teacher' ? lesson.teacher_id === targetId : lesson.class_id === targetId)
      return {
        view: buildView(calendar, version, lessons, subjects, teachers, classes, scope, targetId),
        events: eventRows,
        savedAt: null,
      }
    }
    load().then((result) => {
      if (!active) return
      setView(result.view)
      setEvents(result.events)
      setStale(result.savedAt)
    }).catch((err) => { if (active) setError(friendlyApiError(err, 'load the timetable')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [scope, targetId, canReviewDraft])

  const targets = scope === 'class' ? (options?.classes ?? []) : (options?.teachers ?? [])
  const isDraft = view?.version?.status === 'draft'

  if (loading && !view) return <><PageHeader title="My timetable" description="Your personal school timetable." /><div className="card section"><LoadingBlock label="Loading your timetable" rows={6} /></div></>
  if (error && !view) return <><PageHeader title="My timetable" /><ErrorState title="Timetable could not load" message={error} /></>

  return <>
    <PageHeader
      title={scope === 'teacher' ? `Teacher ${view?.target_name ?? ''}` : 'My timetable'}
      description="Your current generated timetable."
      breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'My timetable' }]}
      actions={view?.version && canReviewDraft && isDraft ? <Link className="button button--secondary button--sm" to={`/timetable?version=${view.version.id}`}>Edit timetable</Link> : undefined}
    />
    {stale && <Alert tone="info" title="Offline copy">Saved on this device {formatSavedAt(stale)}. It will refresh when you reconnect.</Alert>}
    {view?.version && <section className="card section"><div className="toolbar"><div><h2 className="section__title">Timetable</h2><p className="section__description">Version {view.version.number ?? view.version.id}</p></div><Badge tone={isDraft ? 'neutral' : 'success'}>{isDraft ? 'Draft' : 'Published'}</Badge></div></section>}
    <section className="card section">
      <div className="toolbar">
        <div className="field field--inline">
          <label className="field__label" htmlFor="my-scope">Show</label>
          <select id="my-scope" className="input input--select" value={scope} disabled={isTeacher} onChange={(event) => { const next = event.target.value as Scope; setScope(next); setTargetId(next === 'class' ? (options?.classes[0]?.id ?? null) : (options?.teachers[0]?.id ?? null)) }}>
            <option value="teacher">My teacher timetable</option><option value="class">A class timetable</option>
          </select>
        </div>
        {!isTeacher && <div className="field field--inline"><label className="field__label" htmlFor="my-target">{scope === 'class' ? 'Class' : 'Teacher'}</label><select id="my-target" className="input input--select" value={targetId ?? ''} onChange={(event) => setTargetId(Number(event.target.value))}>{targets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
      </div>
    </section>
    {view?.version ? <section className="card section"><PublishedTimetableGridWithEvents view={view} mode={scope} events={events} /></section> : <section className="card section"><EmptyState title="No timetable generated yet" description="Generate a timetable first. Once generated, it will appear here for review." icon={<CalendarIcon width={22} height={22} />} /></section>}
  </>
}
