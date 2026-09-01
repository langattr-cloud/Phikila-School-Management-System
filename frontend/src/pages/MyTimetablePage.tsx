import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { PublishedTimetableGridWithEvents } from '../components/PublishedTimetableGridWithEvents'
import { CalendarIcon } from '../components/icons'
import { friendlyApiError } from '../lib/api'
import { cachedFetch, formatSavedAt } from '../lib/offline'
import { Link } from '../lib/router'
import { scheduling, type Calendar, type Event, type SchoolClass, type Teacher, type TimetableType, type TimetableView, type TimetableAmendment, type Version } from '../lib/scheduling'

type Scope = 'teacher' | 'class'
type SubjectOption = { id: number; name: string; code?: string; colour?: string }

function validSubjectColour(value: string | undefined) { return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : undefined }
function buildView(calendar: Calendar, version: Version, lessons: Array<{ day_index: number; period_index: number; subject_id: number; teacher_id: number; class_id: number }>, subjects: SubjectOption[], teachers: Array<{ id: number; name: string; code?: string; staff_number?: string }>, classes: Array<{ id: number; name: string; code?: string }>, scope: Scope, targetId: number): TimetableView {
  const subjectCode = new Map(subjects.map(item => [item.id, item.code?.trim() || item.name] as [number,string]))
  const subjectColour = new Map(subjects.map(item => [item.id, validSubjectColour(item.colour)] as [number,string|undefined]))
  const teacherCode = new Map(teachers.map(item => [item.id, item.code?.trim() || item.staff_number?.trim() || item.name] as [number,string]))
  const classCode = new Map(classes.map(item => [item.id, item.code?.trim() || item.name] as [number,string]))
  const target = scope === 'teacher' ? teachers.find(item => item.id === targetId)?.name : classes.find(item => item.id === targetId)?.name
  return { version, target_name: target, days: calendar.days.filter(day => day.is_active).map(day => ({ index: day.index, name: day.name })), periods: calendar.periods.map(period => ({ index: period.index, name: period.name, start_time: period.start_time, end_time: period.end_time, is_teaching: period.is_teaching })), lessons: lessons.map(lesson => ({ day: lesson.day_index, period: lesson.period_index, subject: subjectCode.get(lesson.subject_id) ?? 'Unknown subject', subject_colour: subjectColour.get(lesson.subject_id), teacher: teacherCode.get(lesson.teacher_id) ?? null, class: classCode.get(lesson.class_id) ?? 'Unknown class' })) }
}

export function MyTimetablePage() {
  const [scope, setScope] = useState<Scope>('teacher')
  const [teacherId, setTeacherId] = useState<number | null>(null)
  const [classTeacherClassId, setClassTeacherClassId] = useState<number | null>(null)
  const [options, setOptions] = useState<{ classes: SchoolClass[]; teachers: Teacher[]; subjects: SubjectOption[] } | null>(null)
  const [types, setTypes] = useState<TimetableType[]>([])
  const [typeId, setTypeId] = useState<number | null>(null)
  const [view, setView] = useState<TimetableView | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [amendments, setAmendments] = useState<TimetableAmendment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState<number | null>(null)
  const [isTeacher, setIsTeacher] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([scheduling.classes(), scheduling.teachers(), scheduling.subjects(), scheduling.me(), scheduling.timetableTypes()])
      .then(([classes, teachers, subjects, me, timetableTypes]) => {
        if (!active) return
        setOptions({ classes, teachers, subjects }); setTypes(timetableTypes)
        const defaultType = timetableTypes.find(type => type.code === 'WEEKDAYS') ?? timetableTypes[0]
        setTypeId(defaultType?.id ?? null)
        if (me.teacher_id) {
          setIsTeacher(true); setTeacherId(me.teacher_id); setScope('teacher')
          setClassTeacherClassId(classes.find(item => item.class_teacher_id === me.teacher_id)?.id ?? null)
        } else if (me.class_id) { setScope('class'); setClassTeacherClassId(me.class_id) }
      })
      .catch(err => { if (active) setError(friendlyApiError(err, 'load your school data')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!typeId || !options) return
    const targetId = scope === 'teacher' ? teacherId : classTeacherClassId
    if (!targetId) return
    let active = true
    setLoading(true); setError(null)
    const load = async () => {
      const [calendar, versions, subjects, teachers, classes, eventRows, amendmentRows] = await Promise.all([scheduling.calendar(), scheduling.versions(), scheduling.subjects(), scheduling.teachers(), scheduling.classes(), scheduling.events(), scheduling.amendments()])
      const matching = versions.filter(v => v.timetable_type_id === typeId).sort((a,b) => (b.number ?? b.id) - (a.number ?? a.id))
      const version = matching.find(v => v.status === 'published') ?? matching[0]
      if (!version) return { view: null, events: eventRows, amendments: amendmentRows, savedAt: null }
      const allLessons = await scheduling.lessons(version.id)
      const lessons = allLessons.filter(lesson => scope === 'teacher' ? lesson.teacher_id === targetId : lesson.class_id === targetId)
      return { view: buildView(calendar, version, lessons, subjects, teachers, classes, scope, targetId), events: eventRows, amendments: amendmentRows, savedAt: null }
    }
    load().then(result => { if (!active) return; setView(result.view); setEvents(result.events); setAmendments(result.amendments); setStale(result.savedAt) }).catch(err => { if (active) setError(friendlyApiError(err, 'load the timetable')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [typeId, scope, teacherId, classTeacherClassId, options])

  const selectedType = types.find(type => type.id === typeId)
  const canViewAssignedClass = isTeacher && classTeacherClassId !== null
  const isOfficial = view?.version?.status === 'published'
  const isDraft = view?.version?.status === 'draft'

  if (loading && !view) return <><PageHeader title="My timetable" description="Your current timetable." /><div className="card section"><LoadingBlock label="Loading your timetable" rows={6} /></div></>
  if (error && !view) return <><PageHeader title="My timetable" /><ErrorState title="Timetable could not load" message={error} /></>

  return <>
    <PageHeader title="My timetable" description="Your timetable and, when you are a Class Teacher, your assigned class timetable." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'My timetable' }]} />

    <section className="card section timetable-type-selector">
      <div className="toolbar">
        <div><p className="eyebrow">Timetable Type</p><h2 className="section__title">{selectedType?.name ?? 'Timetable'}</h2></div>
        <select aria-label="Timetable Type" className="input input--select" value={typeId ?? ''} onChange={event => setTypeId(Number(event.target.value))}>
          {types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select>
      </div>
    </section>

    <section className="card section timetable-view-tabs" aria-label="Timetable view">
      <div className="timetable-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={scope === 'teacher'} className={`button ${scope === 'teacher' ? 'button--primary' : 'button--secondary'}`} onClick={() => { setScope('teacher'); setTeacherId(teacherId) }}>My Timetable</button>
        {canViewAssignedClass && <button type="button" role="tab" aria-selected={scope === 'class'} className={`button ${scope === 'class' ? 'button--primary' : 'button--secondary'}`} onClick={() => setScope('class')}>My Class</button>}
      </div>
    </section>

    {isOfficial && <section className="card section timetable-official-indicator" aria-label="Official timetable status"><div className="toolbar"><div><p className="eyebrow">Official timetable</p><h2 className="section__title">✓ This timetable is officially in force</h2><p className="section__description">Effective from {view?.version?.effective_from ? new Date(view.version.effective_from).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'the published date'}.</p></div><Badge tone="success">IN FORCE</Badge></div></section>}

    {amendments.length > 0 && <section className="card section timetable-amendments" aria-label="Timetable amendments"><div className="toolbar"><div><h2 className="section__title">Timetable amendments</h2><p className="section__description">Official timetable changes are shown here.</p></div><Badge tone="info">{amendments.length} new</Badge></div><div className="amendment-list">{amendments.map(amendment => <div className="amendment-item" key={amendment.id}><div><strong>{amendment.title}</strong><p>{amendment.message}</p></div><span className="amendment-meta">{amendment.at ? new Date(amendment.at).toLocaleString() : ''}</span></div>)}</div></section>}

    {stale && <Alert tone="info" title="Offline copy">Saved on this device {formatSavedAt(stale)}. It will refresh when you reconnect.</Alert>}

    {view?.version && <section className="card section"><div className="toolbar"><div><h2 className="section__title">{scope === 'teacher' ? 'My Timetable' : 'My Class'}</h2><p className="section__description">{selectedType?.name ?? 'Timetable'}{view.target_name ? ` · ${view.target_name}` : ''}</p></div><Badge tone={isDraft ? 'neutral' : 'success'}>{isDraft ? 'Draft' : 'Published'}</Badge></div></section>}

    {view?.version ? <section className="card section"><PublishedTimetableGridWithEvents view={view} mode={scope} events={events} /></section> : <section className="card section"><EmptyState title={`No ${selectedType?.name ?? 'timetable'} available`} description="There is no timetable of this type in force yet." icon={<CalendarIcon width={22} height={22} />} /></section>}
  </>
}
