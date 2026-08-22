import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge } from '../components/States'
import { useToast } from '../components/Toast'
import { Link, useNavigate } from '../lib/router'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type Job, type Conflict, type Lesson, type Teacher, type Subject, type SchoolClass, type Room } from '../lib/scheduling'
import { QualityBars } from '../components/QualityBars'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ACTIVE = new Set(['queued', 'running', 'optimizing', 'validating'])
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])
const normaliseStatus = (status?: string) => (status ?? '').toLowerCase()

function ConflictList({ conflicts, calendar, lessons, teachers, subjects, classes, rooms }: { conflicts: Conflict[]; calendar: Calendar | null; lessons: Lesson[]; teachers: Teacher[]; subjects: Subject[]; classes: SchoolClass[]; rooms: Room[] }) {
  const dayName = (index: number | null | undefined) => calendar?.days.find((day) => day.index === index)?.name ?? (index == null ? 'Unknown day' : DAY_NAMES[index] ?? `Day ${index + 1}`)
  const period = (index: number | null | undefined) => calendar?.periods.find((item) => item.index === index)
  const name = (items: Array<{ id: number; name: string }>, id: number | null | undefined) => items.find((item) => item.id === id)?.name ?? 'Unknown'
  const lessonText = (id: number) => {
    const lesson = lessons.find((item) => item.id === id)
    if (!lesson) return null
    return `${name(subjects, lesson.subject_id)} · ${name(classes, lesson.class_id)}${lesson.teacher_id ? ` · ${name(teachers, lesson.teacher_id)}` : ''}${lesson.room_id ? ` · ${name(rooms, lesson.room_id)}` : ''}`
  }
  if (!conflicts.length) return null
  return <div className="conflict-list" role="alert"><h3 className="panel__subtitle">Where the conflicts are</h3><ol className="check-list">{conflicts.map((conflict, index) => { const slot = period(conflict.period); const affected = conflict.lesson_ids.map(lessonText).filter(Boolean); return <li key={`${conflict.kind}-${index}`} className="check-row check-row--failed" style={{ display: 'block', padding: '12px 0' }}><strong>{conflict.kind.replaceAll('_', ' ')}</strong><div>{conflict.message}</div>{(conflict.day != null || conflict.period != null) && <div className="form__note">Location: {dayName(conflict.day)}{slot ? ` · ${slot.name} (${slot.start_time}–${slot.end_time})` : conflict.period != null ? ` · Period ${conflict.period}` : ''}</div>}{affected.length > 0 && <div className="form__note">Lessons: {affected.join(' | ')}</div>}</li> })}</ol></div>
}

export function GenerateProfilePage() {
  const { notify } = useToast(); const navigate = useNavigate()
  const [calendar, setCalendar] = useState<Calendar | null>(null); const [label, setLabel] = useState('Weekdays Timetable'); const [days, setDays] = useState<number[]>([]); const [seconds, setSeconds] = useState(30); const [job, setJob] = useState<Job | null>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<{ requirements: number; constraints: number; teachers: number; classes: number; rooms: number } | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [conflictContext, setConflictContext] = useState<{ lessons: Lesson[]; teachers: Teacher[]; subjects: Subject[]; classes: SchoolClass[]; rooms: Room[] }>({ lessons: [], teachers: [], subjects: [], classes: [], rooms: [] })

  useEffect(() => { let mounted = true; Promise.all([scheduling.calendar(), scheduling.requirements(), scheduling.constraints(), scheduling.teachers(), scheduling.classes(), scheduling.rooms()]).then(([week, requirements, constraints, teachers, classes, rooms]) => { if (!mounted) return; setCalendar(week); setDays(week.days.filter((day) => day.is_active).map((day) => day.index)); setSummary({ requirements: requirements.length, constraints: constraints.length, teachers: teachers.length, classes: classes.length, rooms: rooms.length }) }).catch((error) => notify(friendlyApiError(error, 'load timetable generation setup'), 'error')).finally(() => { if (mounted) setLoading(false) }); return () => { mounted = false } }, [notify])

  useEffect(() => {
    const status = normaliseStatus(job?.status)
    if (!job || TERMINAL.has(status)) return
    const timer = window.setInterval(() => { void scheduling.job(job.id).then((next) => setJob(next)).catch(() => undefined) }, 900)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  useEffect(() => {
    const status = normaliseStatus(job?.status)
    if (status === 'failed' && job?.result_version_id) {
      void Promise.all([scheduling.conflicts(job.result_version_id), scheduling.lessons(job.result_version_id), scheduling.teachers(), scheduling.subjects(), scheduling.classes(), scheduling.rooms()]).then(([found, lessons, teachers, subjects, classes, rooms]) => {
        setConflicts(found.filter((conflict) => conflict.severity === 'hard'))
        setConflictContext({ lessons, teachers, subjects, classes, rooms })
      }).catch(() => setConflicts([]))
    } else if (status !== 'failed') setConflicts([])
  }, [job?.status, job?.result_version_id])

  useEffect(() => {
    const status = normaliseStatus(job?.status)
    if (status === 'completed' && job?.result_version_id) {
      notify('Timetable generated and published successfully.', 'success')
    }
  }, [job?.status, job?.result_version_id, notify])

  const teachingPeriods = calendar?.periods.filter((period) => period.is_teaching).length ?? 0
  const selectedDays = useMemo(() => days.map((index) => calendar?.days.find((day) => day.index === index)?.name ?? DAY_NAMES[index]).join(', '), [calendar, days])
  const status = normaliseStatus(job?.status)
  const active = Boolean(job && ACTIVE.has(status)); const canGenerate = !loading && !busy && !active && Boolean(label.trim()) && days.length > 0 && Boolean(summary?.requirements)
  const progress = Math.max(0, Math.min(100, job?.progress ?? 0))

  function toggle(day: number) { setDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b)) }
  async function generate() { if (!canGenerate) return; setBusy(true); setConflicts([]); try { const result = await scheduling.generateProfile({ max_seconds: seconds, label: label.trim(), day_indexes: days }); setJob(result); notify('Timetable generation started.', 'success') } catch (error) { notify(friendlyApiError(error, 'generate the timetable'), 'error') } finally { setBusy(false) } }
  async function cancel() { if (!job || !active) return; try { setJob(await scheduling.cancelJob(job.id)); notify('Generation cancellation requested.', 'info') } catch (error) { notify(friendlyApiError(error, 'cancel generation'), 'error') } }

  return <>
    <PageHeader title="Generate timetable" description="Configure the generation run, monitor progress, and publish a valid timetable automatically." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable', to: '/timetable' }, { label: 'Generate' }]} actions={<Link className="button button--secondary button--sm" to="/timetable">Open timetable</Link>} />
    <section className="card section"><div className="toolbar"><div><h2 className="section__title">1. Timetable profile</h2><p className="section__description">Choose the working days and optimisation effort for this generation.</p></div>{calendar && <Badge>{days.length} days · {teachingPeriods} teaching periods/day</Badge>}</div><div className="form form--grid"><div className="field form--grid__full"><label className="field__label" htmlFor="timetable-name">Timetable name</label><input id="timetable-name" className="input" value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Term 1 Master Timetable" /></div><div className="field form--grid__full"><label className="field__label">Working days</label><p className="form__note">Select the days available to this generated timetable.</p><div className="chip-toggles">{DAY_NAMES.map((name, index) => <label key={name} className={`chip-toggle ${days.includes(index) ? 'chip-toggle--on' : ''}`}><input type="checkbox" checked={days.includes(index)} onChange={() => toggle(index)} />{name}</label>)}</div>{days.length > 0 && <span className="form__note">Selected: {selectedDays}</span>}</div><div className="field"><label className="field__label" htmlFor="optimisation-time">Optimisation effort</label><select id="optimisation-time" className="input input--select" value={seconds} onChange={(event) => setSeconds(Number(event.target.value))}><option value={10}>Quick — 10 seconds</option><option value={30}>Balanced — 30 seconds</option><option value={60}>Thorough — 60 seconds</option><option value={120}>Maximum — 2 minutes</option></select><span className="form__note">More time gives the optimiser more opportunity to improve soft preferences.</span></div></div></section>
    <section className="card section"><div className="toolbar"><div><h2 className="section__title">2. Generation inputs</h2><p className="section__description">These resources and rules are used by the solver.</p></div></div>{summary ? <div className="chip-list"><Badge>{summary.requirements} lesson requirements</Badge><Badge>{summary.teachers} teachers</Badge><Badge>{summary.classes} classes</Badge><Badge>{summary.rooms} rooms</Badge><Badge>{summary.constraints} scheduling rules</Badge></div> : <p className="form__note">Loading generation inputs…</p>}{summary && summary.requirements === 0 && <Alert tone="info" title="No lesson requirements">Add teaching allocations before generating a timetable. <Link to="/scheduling/requirements">Open lesson requirements</Link>.</Alert>}<div className="form__row" style={{ marginTop: 16 }}><Link className="button button--ghost button--sm" to="/scheduling/requirements">Lesson requirements</Link><Link className="button button--ghost button--sm" to="/scheduling/constraints">Generation rules</Link><Link className="button button--ghost button--sm" to="/scheduling/time-off">Time Off / availability</Link></div></section>
    <section className="card section"><div className="toolbar"><div><h2 className="section__title">3. Generate</h2><p className="section__description">Hard conflicts block automatic publication. Soft preferences are optimisation goals.</p></div></div><div className="chip-list"><Badge tone={days.length ? 'success' : 'neutral'}>{days.length ? `${days.length} working days` : 'Select at least one day'}</Badge><Badge tone={summary?.requirements ? 'success' : 'neutral'}>{summary?.requirements ? 'Lesson requirements ready' : 'Lesson requirements missing'}</Badge><Badge>Teacher/class/room conflicts checked</Badge><Badge>Automatic publication on success</Badge></div><div className="form__row" style={{ marginTop: 18 }}><button type="button" className="button button--primary" onClick={() => void generate()} disabled={!canGenerate}>{busy ? 'Starting…' : active ? 'Generating…' : 'Create and generate timetable'}</button>{active && <button type="button" className="button button--secondary" onClick={() => void cancel()}>Cancel generation</button>}</div></section>
    {job && <section className="card section" aria-live="polite"><div className="toolbar"><div><h2 className="section__title">Generation monitor</h2><p className="section__description">Job #{job.id} · {job.stage ?? status}</p></div><Badge tone={status === 'completed' ? 'success' : status === 'failed' ? 'danger' : 'neutral'}>{status || 'unknown'}</Badge></div><div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Generation progress"><div className="progress__bar" style={{ width: `${progress}%` }} /></div><p className="progress__caption"><strong>{progress}%</strong> · {job.stage ?? status}{job.message ? ` · ${job.message}` : ''}</p>{job.checks.length > 0 && <div className="check-groups"><div><h3 className="panel__subtitle">Hard constraints</h3><ul className="check-list">{job.checks.filter((check) => check.group === 'hard').map((check) => <li key={check.key} className={`check-row check-row--${check.state}`}><span className="check-row__label">{check.label}</span><span className="check-row__state">{check.state}</span></li>)}</ul></div><div><h3 className="panel__subtitle">Optimisation</h3><ul className="check-list">{job.checks.filter((check) => check.group === 'soft').map((check) => <li key={check.key} className={`check-row check-row--${check.state}`}><span className="check-row__label">{check.label}</span><span className="check-row__state">{check.state}</span></li>)}</ul></div></div>}{status === 'failed' && <Alert tone="error" title="Generation failed">{job.message ?? 'Hard conflicts prevented automatic publication.'}</Alert>}{status === 'failed' && conflicts.length > 0 && <ConflictList conflicts={conflicts} calendar={calendar} {...conflictContext} />}{status === 'failed' && conflicts.length === 0 && job.result_version_id && <p className="form__note">A generated version is available for inspection, but no detailed hard-conflict records could be loaded.</p>}{status === 'completed' && <Alert tone="success" title="Timetable generated and published">The valid timetable has been published automatically. <Link to="/my-timetable">Open My Timetable</Link>.</Alert>}{status === 'completed' && job.quality?.overall !== undefined && <><h3 className="panel__subtitle">Quality score</h3><QualityBars quality={job.quality} /></>}{status === 'cancelled' && <Alert tone="info" title="Generation cancelled">No new timetable was published.</Alert>}<div className="form__row">{active && <button type="button" className="button button--secondary" onClick={() => void cancel()}>Cancel generation</button>}{status === 'completed' && <button type="button" className="button button--primary" onClick={() => navigate('/my-timetable')}>View My Timetable</button>}{(status === 'failed' || status === 'cancelled') && <button type="button" className="button button--primary" onClick={() => void generate()}>Try again</button>}</div></section>}
  </>
}
