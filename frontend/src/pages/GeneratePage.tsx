import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, ErrorState, LoadingBlock } from '../components/States'
import { AlertIcon, CheckIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { useNavigate } from '../lib/router'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Dashboard, type Job, type SolverCheck, type Conflict, type Calendar, type Lesson, type Teacher, type Subject, type SchoolClass, type Room } from '../lib/scheduling'
import { QualityBars } from '../components/QualityBars'

const ACTIVE = new Set(['queued', 'running', 'optimizing', 'validating'])
const JOB_STORAGE_KEY = 'phikila.active-timetable-job'

function CheckRow({ check }: { check: SolverCheck }) {
  const icon = check.state === 'passed' ? <CheckIcon width={16} height={16} /> : check.state === 'failed' || check.state === 'warning' ? <AlertIcon width={16} height={16} /> : <span className="check-row__dot" aria-hidden="true" />
  const label = check.state === 'passed' ? 'Passed' : check.state === 'failed' ? 'Failed' : check.state === 'warning' ? 'Needs attention' : 'Pending'
  return <li className={`check-row check-row--${check.state}`}><span className="check-row__icon" aria-hidden="true">{icon}</span><span className="check-row__label">{check.label}</span><span className="check-row__state">{label}</span></li>
}

function ConflictList({ conflicts, calendar, lessons, teachers, subjects, classes, rooms }: { conflicts: Conflict[]; calendar: Calendar | null; lessons: Lesson[]; teachers: Teacher[]; subjects: Subject[]; classes: SchoolClass[]; rooms: Room[] }) {
  const dayName = (index: number | null | undefined) => calendar?.days.find((d) => d.index === index)?.name ?? (index == null ? 'Unknown day' : `Day ${index + 1}`)
  const period = (index: number | null | undefined) => calendar?.periods.find((p) => p.index === index)
  const name = (items: Array<{ id: number; name: string }>, id: number | null | undefined) => items.find((item) => item.id === id)?.name ?? 'Unknown'
  const lessonText = (id: number) => {
    const lesson = lessons.find((item) => item.id === id)
    if (!lesson) return null
    return `${name(subjects, lesson.subject_id)} · ${name(classes, lesson.class_id)}${lesson.teacher_id ? ` · ${name(teachers, lesson.teacher_id)}` : ''}${lesson.room_id ? ` · ${name(rooms, lesson.room_id)}` : ''}`
  }
  if (!conflicts.length) return null
  return (
    <div className="conflict-list" role="alert">
      <h3 className="panel__subtitle">Where the conflicts are</h3>
      <ol className="check-list">
        {conflicts.map((conflict, index) => {
          const slot = period(conflict.period)
          const lessonsText = conflict.lesson_ids.map(lessonText).filter(Boolean)
          return (
            <li key={`${conflict.kind}-${index}`} className="check-row check-row--failed" style={{ display: 'block', padding: '12px 0' }}>
              <strong>{conflict.kind.replaceAll('_', ' ')}</strong>
              <div>{conflict.message}</div>
              {(conflict.day != null || conflict.period != null) && <div className="form__note">Location: {dayName(conflict.day)}{slot ? ` · ${slot.name} (${slot.start_time}–${slot.end_time})` : conflict.period != null ? ` · Period ${conflict.period}` : ''}</div>}
              {lessonsText.length > 0 && <div className="form__note">Lessons: {lessonsText.join(' | ')}</div>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function LessonPreview({ calendar, lessons, subjects, classes }: { calendar: Calendar | null; lessons: Lesson[]; subjects: Subject[]; classes: SchoolClass[] }) {
  const activeDaysList = calendar?.days.filter((day) => day.is_active) ?? []
  const teachingPeriods = calendar?.periods.filter((period) => period.is_teaching) ?? []
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]))
  const classMap = new Map(classes.map((schoolClass) => [schoolClass.id, schoolClass]))
  const lessonAt = (day: number, period: number) => lessons.find((lesson) => lesson.day_index === day && lesson.period_index === period)

  return (
    <section className="card section">
      <div className="panel__head">
        <div>
          <h2 className="section__title">Lesson preview</h2>
          <p className="form__note">Your established working days and periods, with the accumulated subjects and grades visible before generation.</p>
        </div>
        <Badge tone="neutral">{lessons.length} lessons</Badge>
      </div>

      <div className="lesson-preview__subjects" aria-label="Subjects">
        {subjects.map((subject) => (
          <span key={subject.id} className="lesson-preview__subject">
            <span className="lesson-preview__swatch" style={{ backgroundColor: subject.color || '#64748b' }} aria-hidden="true" />
            {subject.name}
          </span>
        ))}
      </div>

      <div className="lesson-preview__grid-wrap">
        <table className="lesson-preview__grid">
          <thead>
            <tr><th>Period</th>{activeDaysList.map((day) => <th key={day.index}>{day.name}</th>)}</tr>
          </thead>
          <tbody>
            {teachingPeriods.map((period) => (
              <tr key={period.index}>
                <th>{period.name}<span>{period.start_time}–{period.end_time}</span></th>
                {activeDaysList.map((day) => {
                  const lesson = lessonAt(day.index, period.index)
                  const subject = lesson ? subjectMap.get(lesson.subject_id) : null
                  const schoolClass = lesson ? classMap.get(lesson.class_id) : null
                  return <td key={`${day.index}-${period.index}`}>
                    {lesson && subject ? <div className="lesson-preview__card" style={{ borderLeftColor: subject.color || '#64748b' }}><strong>{subject.name}</strong>{schoolClass && <span>{schoolClass.name}</span>}</div> : <span className="lesson-preview__empty">—</span>}
                  </td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lesson-preview__grades">
        <h3 className="panel__subtitle">Grades / classes</h3>
        <div className="lesson-preview__grade-list">
          {classes.map((schoolClass) => <span key={schoolClass.id} className="badge">{schoolClass.name}</span>)}
        </div>
      </div>
    </section>
  )
}

export function GeneratePage() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const [summary, setSummary] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [hasTimetable, setHasTimetable] = useState(false)
  const [starting, setStarting] = useState(false)
  const [seconds] = useState(30)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [conflictContext, setConflictContext] = useState<{ calendar: Calendar | null; lessons: Lesson[]; teachers: Teacher[]; subjects: Subject[]; classes: SchoolClass[]; rooms: Room[] }>({ calendar: null, lessons: [], teachers: [], subjects: [], classes: [], rooms: [] })
  const [preview, setPreview] = useState<{ calendar: Calendar; lessons: Lesson[]; subjects: Subject[]; classes: SchoolClass[] } | null>(null)
  const timer = useRef<number | null>(null)

  const rememberJob = useCallback((next: Job | null) => { setJob(next); if (typeof window === 'undefined') return; if (next) window.localStorage.setItem(JOB_STORAGE_KEY, String(next.id)); else window.localStorage.removeItem(JOB_STORAGE_KEY) }, [])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const [dashboard, currentVersion, activeJob, calendar, lessons, subjects, classes] = await Promise.all([
        scheduling.dashboard(), scheduling.currentVersion(), scheduling.activeJob(), scheduling.calendar(), scheduling.lessons(), scheduling.subjects(), scheduling.classes(),
      ])
      setSummary(dashboard); setHasTimetable(currentVersion !== null)
      setPreview({ calendar, lessons, subjects, classes })
      if (activeJob) rememberJob(activeJob)
      else if (typeof window !== 'undefined') {
        const storedId = Number(window.localStorage.getItem(JOB_STORAGE_KEY))
        if (Number.isInteger(storedId) && storedId > 0) { try { rememberJob(await scheduling.job(storedId)) } catch { window.localStorage.removeItem(JOB_STORAGE_KEY); rememberJob(null) } } else rememberJob(null)
      } else rememberJob(null)
      setError(null)
    } catch (err) { setError(friendlyApiError(err, 'load your school setup')) } finally { setLoading(false) }
  }, [rememberJob])

  useEffect(() => { void loadSummary() }, [loadSummary])

  const loadConflicts = useCallback(async (versionId: number) => {
    try {
      const [found, calendar, lessons, teachers, subjects, classes, rooms] = await Promise.all([
        scheduling.conflicts(versionId), scheduling.calendar(), scheduling.lessons(versionId), scheduling.teachers(), scheduling.subjects(), scheduling.classes(), scheduling.rooms(),
      ])
      setConflicts(found.filter((conflict) => conflict.severity === 'hard'))
      setConflictContext({ calendar, lessons, teachers, subjects, classes, rooms })
    } catch { setConflicts([]) }
  }, [])

  useEffect(() => {
    if (job?.status === 'failed' && job.result_version_id) void loadConflicts(job.result_version_id)
    else if (job?.status !== 'failed') setConflicts([])
  }, [job?.status, job?.result_version_id, loadConflicts])

  useEffect(() => {
    if (!job || !ACTIVE.has(job.status)) return
    let cancelled = false
    const poll = async () => {
      try {
        const next = await scheduling.job(job.id)
        if (cancelled) return
        rememberJob(next)
        if (!ACTIVE.has(next.status)) {
          if (next.status === 'completed') {
            setHasTimetable(true)
            try { const currentVersion = await scheduling.currentVersion(); if (!cancelled) setHasTimetable(currentVersion !== null) } catch { /* result_version_id is enough */ }
            notify('Timetable generated. Use View timetable to open it.', 'success')
            if (typeof window !== 'undefined') window.localStorage.removeItem(JOB_STORAGE_KEY)
          } else if (next.status === 'failed') {
            notify(next.message || 'Generation could not finish.', 'error')
            if (typeof window !== 'undefined') window.localStorage.removeItem(JOB_STORAGE_KEY)
          } else if (next.status === 'cancelled') {
            notify('Timetable generation was cancelled.', 'info')
            if (typeof window !== 'undefined') window.localStorage.removeItem(JOB_STORAGE_KEY)
          }
          return
        }
        timer.current = window.setTimeout(poll, 900)
      } catch { if (!cancelled) timer.current = window.setTimeout(poll, 2000) }
    }
    timer.current = window.setTimeout(poll, 0)
    return () => { cancelled = true; if (timer.current) window.clearTimeout(timer.current); timer.current = null }
  }, [job?.id, job?.status, notify, rememberJob])

  async function start() { if (starting || running) return; setStarting(true); setConflicts([]); try { rememberJob(await scheduling.generate(seconds)) } catch (err) { notify(friendlyApiError(err, 'start generation'), 'error') } finally { setStarting(false) } }
  async function cancel() { if (!job || !running) return; try { rememberJob(await scheduling.cancelJob(job.id)); notify('Cancelling generation…', 'info') } catch (err) { notify(friendlyApiError(err, 'cancel generation'), 'error') } }

  const running = job !== null && ACTIVE.has(job.status)
  const ready = (summary?.counts.teachers ?? 0) > 0 && (summary?.counts.classes ?? 0) > 0 && (summary?.lessons.required ?? 0) > 0

  return (
    <>
      <PageHeader title="Generate timetable" description="Review the established timetable structure and accumulated lessons before generation." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Generate' }]} />
      {loading ? <div className="card section"><LoadingBlock label="Checking your school setup" rows={3} /></div> : error ? <ErrorState title="Setup could not load" message={error} onRetry={loadSummary} /> : <>
        {summary && !summary.solver_available && <Alert tone="error" title="Scheduling engine unavailable">The optimisation engine is not installed on this server, so timetables cannot be generated here.</Alert>}
        {!ready && <Alert tone="info" title="Finish your setup first">Add teachers, classes and lesson requirements before generating. You have {summary?.counts.teachers ?? 0} teachers, {summary?.counts.classes ?? 0} classes and {summary?.lessons.required ?? 0} weekly lessons defined.</Alert>}
        {preview && <LessonPreview {...preview} />}
        <section className="card section">
          <div className="panel__head"><div><h2 className="section__title">Generate from this setup</h2><p className="form__note">The timetable will be generated from the lessons shown above.</p></div>{hasTimetable && !running && <button type="button" className="button button--secondary" onClick={() => navigate('/timetable')}>View timetable</button>}</div>
          {!running && <div className="generate-controls"><p className="form__note">Weekly lessons: {summary?.lessons.required ?? 0} · Classes: {summary?.counts.classes ?? 0}</p><button type="button" className="button button--primary" onClick={start} disabled={starting || !ready || !summary?.solver_available}>{starting ? 'Starting…' : 'Generate timetable'}</button></div>}
        </section>
        {job && <section className="card section" aria-live="polite">
          <div className="panel__head"><h2 className="section__title">{running ? 'Generating timetable' : job.status === 'completed' ? 'Generation complete' : job.status === 'cancelled' ? 'Generation cancelled' : 'Generation failed'}</h2><Badge tone={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'neutral'}>{job.status}</Badge></div>
          <div className="progress" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Generation progress"><div className="progress__bar" style={{ width: `${job.progress}%` }} /></div>
          <p className="progress__caption"><strong>{job.progress}%</strong> · {job.stage}</p>
          <div className="check-groups"><div><h3 className="panel__subtitle">Hard constraints</h3><ul className="check-list">{job.checks.filter((c) => c.group === 'hard').map((c) => <CheckRow key={c.key} check={c} />)}</ul></div><div><h3 className="panel__subtitle">Optimisation</h3><ul className="check-list">{job.checks.filter((c) => c.group === 'soft').map((c) => <CheckRow key={c.key} check={c} />)}</ul></div></div>
          {job.status === 'failed' && job.message && <Alert tone="error" title="No timetable could be published">{job.message}</Alert>}
          {job.status === 'failed' && conflicts.length > 0 && <ConflictList conflicts={conflicts} {...conflictContext} />}
          {job.status === 'completed' && job.quality?.overall !== undefined && <><h3 className="panel__subtitle">Quality score</h3><QualityBars quality={job.quality} /></>}
          <div className="form__row">{running && <button type="button" className="button button--secondary" onClick={cancel}>Cancel generation</button>}{job.status === 'completed' && <button type="button" className="button button--primary" onClick={() => navigate('/timetable')}>View timetable</button>}{(job.status === 'failed' || job.status === 'cancelled') && <button type="button" className="button button--primary" onClick={start}>Try again</button>}</div>
        </section>}
      </>}
    </>
  )
}
