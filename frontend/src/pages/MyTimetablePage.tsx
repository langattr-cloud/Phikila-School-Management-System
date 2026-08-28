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
type SubjectOption = { id: number; name: string; code?: string; colour?: string }

function canReviewGeneratedDraft(role?: string) {
  const order = ['viewer', 'student', 'teacher', 'scheduler', 'admin', 'super_admin']
  const index = order.indexOf(String(role ?? '').toLowerCase())
  return index >= order.indexOf('scheduler')
}

function validSubjectColour(value: string | undefined) { return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : undefined }

function buildView(calendar: Calendar, version: NonNullable<TimetableView['version']>, lessons: Array<{ day_index: number; period_index: number; subject_id: number; teacher_id: number; class_id: number }>, subjects: SubjectOption[], teachers: Array<{ id: number; name: string; code?: string; staff_number?: string }>, classes: Array<{ id: number; name: string; code?: string }>, scope: Scope, targetId: number): TimetableView {
  const subjectCode = new Map<number, string>(subjects.map((item): [number, string] => [item.id, item.code?.trim() || item.name]))
  const subjectColour = new Map<number, string | undefined>(subjects.map((item): [number, string | undefined] => [item.id, validSubjectColour(item.colour)]))
  const teacherCode = new Map<number, string>(teachers.map((item): [number, string] => [item.id, item.code?.trim() || item.staff_number?.trim() || item.name]))
  const classCode = new Map<number, string>(classes.map((item): [number, string] => [item.id, item.code?.trim() || item.name]))
  const target = scope === 'teacher' ? teachers.find((item) => item.id === targetId)?.name : classes.find((item) => item.id === targetId)?.name
  return {
    version,
    target_name: target,
    days: calendar.days.filter((day) => day.is_active).map((day) => ({ index: day.index, name: day.name })),
    periods: calendar.periods.map((period) => ({ index: period.index, name: period.name, start_time: period.start_time, end_time: period.end_time, is_teaching: period.is_teaching })),
    lessons: lessons.map((lesson) => ({ day: lesson.day_index, period: lesson.period_index, subject: subjectCode.get(lesson.subject_id) ?? 'Unknown subject', subject_colour: subjectColour.get(lesson.subject_id), teacher: teacherCode.get(lesson.teacher_id) ?? null, class: classCode.get(lesson.class_id) ?? 'Unknown class' })),
  }
}

function normalisePublishedView(view: TimetableView, subjects: SubjectOption[], teachers: Teacher[], classes: SchoolClass[]): TimetableView {
  const subjectByName = new Map<string, SubjectOption>(subjects.map((item): [string, SubjectOption] => [item.name.trim().toLowerCase(), item]))
  const subjectByCode = new Map<string, SubjectOption>(subjects.filter((item) => Boolean(item.code?.trim())).map((item): [string, SubjectOption] => [item.code!.trim().toLowerCase(), item]))
  const teacherByName = new Map<string, string>(teachers.map((item): [string, string] => [item.name.trim().toLowerCase(), item.code?.trim() || item.staff_number?.trim() || item.name]))
  const teacherByCode = new Set(teachers.flatMap((item) => [item.code?.trim(), item.staff_number?.trim()]).filter(Boolean))
  const classByName = new Map<string, string>(classes.map((item): [string, string] => [item.name.trim().toLowerCase(), item.code?.trim() || item.name]))
  const classByCode = new Set(classes.map((item) => item.code?.trim()).filter(Boolean))
  return {
    ...view,
    lessons: view.lessons.map((lesson) => {
      const rawSubject = lesson.subject?.trim() ?? ''
      const subject = subjectByCode.get(rawSubject.toLowerCase()) ?? subjectByName.get(rawSubject.toLowerCase())
      return {
        ...lesson,
        subject: subject?.code?.trim() || subject?.name || lesson.subject,
        subject_colour: validSubjectColour(subject?.colour) ?? validSubjectColour(lesson.subject_colour),
        teacher: lesson.teacher ? (teacherByCode.has(lesson.teacher.trim()) ? lesson.teacher.trim() : teacherByName.get(lesson.teacher.trim().toLowerCase()) ?? lesson.teacher) : null,
        class: classByCode.has(lesson.class.trim()) ? lesson.class.trim() : classByName.get(lesson.class.trim().toLowerCase()) ?? lesson.class,
      }
    }),
  }
}

export function MyTimetablePage() {
  const [scope, setScope] = useState<Scope>('class')
  const [targetId, setTargetId] = useState<number | null>(null)
  const [options, setOptions] = useState<{ classes: SchoolClass[]; teachers: Teacher[]; subjects: SubjectOption[] } | null>(null)
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
      const [classes, teachers, subjects, me] = await Promise.all([scheduling.classes(), scheduling.teachers(), scheduling.subjects(), scheduling.me()])
      return { classes, teachers, subjects, me }
    }).then((result) => {
      if (!active) return
      const { classes, teachers, subjects, me } = result.data
      setOptions({ classes, teachers, subjects })
      setIsTeacher(String(me.role ?? '').toLowerCase() === 'teacher')
      setCanReviewDraft(canReviewGeneratedDraft(me.role))
      setTargetId((current) => current ?? (me.role === 'teacher' ? teachers.find((teacher) => teacher.id === Number(me.id))?.id ?? null : classes[0]?.id ?? null))
      setStale(result.staleAt)
    }).catch((err) => { if (active) setError(friendlyApiError(err, 'load timetable options')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!targetId || !options) return
    let active = true
    setError(null)
    Promise.all([scheduling.view(scope, targetId), scheduling.calendar(), scheduling.versions(), scheduling.lessons((options.classes[0] as any)?.version_id ?? 0)]).then(([serverView]) => { if (active) setView(normalisePublishedView(serverView, options.subjects, options.teachers, options.classes)) }).catch((err) => { if (active) setError(friendlyApiError(err, 'load timetable')) })
    return () => { active = false }
  }, [scope, targetId, options])

  useEffect(() => { scheduling.events().then(setEvents).catch(() => undefined) }, [])

  const selected = scope === 'teacher' ? options?.teachers.find((item) => item.id === targetId) : options?.classes.find((item) => item.id === targetId)
  return <><PageHeader title="My timetable" description="View the published timetable for a class or teacher." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'My timetable' }]} />{loading ? <LoadingBlock label="Loading timetable" rows={4} /> : error ? <ErrorState title="Timetable unavailable" message={error} /> : !view ? <EmptyState icon={<CalendarIcon width={22} height={22} />} title="No timetable published" message="There is no published timetable to display yet." /> : <section className="card section"><div className="panel__head"><div><h2 className="section__title">{selected?.name ?? view.target_name ?? 'Timetable'}</h2><p className="form__note">Published timetable</p></div><Badge tone="success">Published</Badge></div><PublishedTimetableGridWithEvents view={view} events={events} /></section>}</>
}
