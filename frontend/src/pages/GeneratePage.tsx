import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, ErrorState, LoadingBlock } from '../components/States'
import { AlertIcon, CheckIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { useNavigate } from '../lib/router'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Dashboard, type Job, type SolverCheck } from '../lib/scheduling'
import { QualityBars } from '../components/QualityBars'

const ACTIVE = new Set(['queued', 'running', 'optimizing', 'validating'])
const JOB_STORAGE_KEY = 'phikila.active-timetable-job'

function CheckRow({ check }: { check: SolverCheck }) {
  const icon =
    check.state === 'passed' ? (
      <CheckIcon width={16} height={16} />
    ) : check.state === 'failed' || check.state === 'warning' ? (
      <AlertIcon width={16} height={16} />
    ) : (
      <span className="check-row__dot" aria-hidden="true" />
    )
  const label =
    check.state === 'passed'
      ? 'Passed'
      : check.state === 'failed'
        ? 'Failed'
        : check.state === 'warning'
          ? 'Needs attention'
          : 'Pending'

  return (
    <li className={`check-row check-row--${check.state}`}>
      <span className="check-row__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="check-row__label">{check.label}</span>
      <span className="check-row__state">{label}</span>
    </li>
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
  const [seconds, setSeconds] = useState(30)
  const timer = useRef<number | null>(null)

  const rememberJob = useCallback((next: Job | null) => {
    setJob(next)
    if (typeof window === 'undefined') return
    if (next) window.localStorage.setItem(JOB_STORAGE_KEY, String(next.id))
    else window.localStorage.removeItem(JOB_STORAGE_KEY)
  }, [])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const [dashboard, currentVersion, activeJob] = await Promise.all([
        scheduling.dashboard(),
        scheduling.currentVersion(),
        scheduling.activeJob(),
      ])
      setSummary(dashboard)
      setHasTimetable(currentVersion !== null)

      if (activeJob) {
        rememberJob(activeJob)
      } else if (typeof window !== 'undefined') {
        const storedId = Number(window.localStorage.getItem(JOB_STORAGE_KEY))
        if (Number.isInteger(storedId) && storedId > 0) {
          try {
            const storedJob = await scheduling.job(storedId)
            rememberJob(storedJob)
          } catch {
            window.localStorage.removeItem(JOB_STORAGE_KEY)
            rememberJob(null)
          }
        } else {
          rememberJob(null)
        }
      } else {
        rememberJob(null)
      }
      setError(null)
    } catch (err) {
      setError(friendlyApiError(err, 'load your school setup'))
    } finally {
      setLoading(false)
    }
  }, [rememberJob])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

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
            try {
              const currentVersion = await scheduling.currentVersion()
              if (!cancelled) setHasTimetable(currentVersion !== null)
            } catch {
              // The completed job already carries result_version_id, so keep the ready state.
            }
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
      } catch {
        if (!cancelled) timer.current = window.setTimeout(poll, 2000)
      }
    }

    timer.current = window.setTimeout(poll, 0)
    return () => {
      cancelled = true
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [job?.id, job?.status, notify, rememberJob])

  async function start() {
    if (starting || running) return
    setStarting(true)
    try {
      const next = await scheduling.generate(seconds)
      rememberJob(next)
    } catch (err) {
      notify(friendlyApiError(err, 'start generation'), 'error')
    } finally {
      setStarting(false)
    }
  }

  async function cancel() {
    if (!job || !running) return
    try {
      rememberJob(await scheduling.cancelJob(job.id))
      notify('Cancelling generation…', 'info')
    } catch (err) {
      notify(friendlyApiError(err, 'cancel generation'), 'error')
    }
  }

  const running = job !== null && ACTIVE.has(job.status)
  const ready =
    (summary?.counts.teachers ?? 0) > 0 &&
    (summary?.counts.classes ?? 0) > 0 &&
    (summary?.lessons.required ?? 0) > 0

  return (
    <>
      <PageHeader
        title="Generate timetable"
        description="The scheduling engine places every required lesson without breaking a hard constraint."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Generate' }]}
      />

      {loading ? (
        <div className="card section">
          <LoadingBlock label="Checking your school setup" rows={3} />
        </div>
      ) : error ? (
        <ErrorState title="Setup could not load" message={error} onRetry={loadSummary} />
      ) : (
        <>
          {summary && !summary.solver_available && (
            <Alert tone="error" title="Scheduling engine unavailable">
              The optimisation engine is not installed on this server, so timetables cannot be
              generated here.
            </Alert>
          )}

          {!ready && (
            <Alert tone="info" title="Finish your setup first">
              Add teachers, classes and lesson requirements before generating. You have{' '}
              {summary?.counts.teachers ?? 0} teachers, {summary?.counts.classes ?? 0} classes and{' '}
              {summary?.lessons.required ?? 0} weekly lessons defined.
            </Alert>
          )}

          <section className="card section">
            <div className="panel__head">
              <div>
                <h2 className="section__title">What will be scheduled</h2>
                <p className="form__note">Generate a new timetable or open the latest saved timetable.</p>
              </div>
              {hasTimetable && !running && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => navigate('/timetable')}
                >
                  View timetable
                </button>
              )}
            </div>

            <dl className="detail-list detail-list--two">
              <div>
                <dt>Weekly lessons</dt>
                <dd>{summary?.lessons.required ?? 0}</dd>
              </div>
              <div>
                <dt>Classes</dt>
                <dd>{summary?.counts.classes ?? 0}</dd>
              </div>
              <div>
                <dt>Teachers</dt>
                <dd>{summary?.counts.teachers ?? 0}</dd>
              </div>
              <div>
                <dt>Rooms</dt>
                <dd>{summary?.counts.rooms ?? 0}</dd>
              </div>
            </dl>

            {!running && (
              <div className="generate-controls">
                <div className="field field--inline">
                  <label className="field__label" htmlFor="budget">
                    Optimisation time
                  </label>
                  <select
                    id="budget"
                    className="input input--select"
                    value={seconds}
                    onChange={(event) => setSeconds(Number(event.target.value))}
                  >
                    <option value={10}>Quick (10s)</option>
                    <option value={30}>Balanced (30s)</option>
                    <option value={60}>Thorough (60s)</option>
                    <option value={120}>Maximum (2 min)</option>
                  </select>
                </div>
                <p className="form__note">
                  Longer runs improve preferences like teacher gaps and morning lessons. Hard
                  constraints are always satisfied.
                </p>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={start}
                  disabled={starting || !ready || !summary?.solver_available}
                >
                  {starting ? 'Starting…' : 'Generate timetable'}
                </button>
              </div>
            )}
          </section>

          {job && (
            <section className="card section" aria-live="polite">
              <div className="panel__head">
                <h2 className="section__title">
                  {running
                    ? 'Generating timetable'
                    : job.status === 'completed'
                      ? 'Generation complete'
                      : job.status === 'cancelled'
                        ? 'Generation cancelled'
                        : 'Generation failed'}
                </h2>
                <Badge
                  tone={
                    job.status === 'completed'
                      ? 'success'
                      : job.status === 'failed'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {job.status}
                </Badge>
              </div>

              <div
                className="progress"
                role="progressbar"
                aria-valuenow={job.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Generation progress"
              >
                <div className="progress__bar" style={{ width: `${job.progress}%` }} />
              </div>
              <p className="progress__caption">
                <strong>{job.progress}%</strong> · {job.stage}
              </p>

              <div className="check-groups">
                <div>
                  <h3 className="panel__subtitle">Hard constraints</h3>
                  <ul className="check-list">
                    {job.checks
                      .filter((c) => c.group === 'hard')
                      .map((c) => (
                        <CheckRow key={c.key} check={c} />
                      ))}
                  </ul>
                </div>
                <div>
                  <h3 className="panel__subtitle">Optimisation</h3>
                  <ul className="check-list">
                    {job.checks
                      .filter((c) => c.group === 'soft')
                      .map((c) => (
                        <CheckRow key={c.key} check={c} />
                      ))}
                  </ul>
                </div>
              </div>

              {job.status === 'failed' && job.message && (
                <Alert tone="error" title="No timetable could be produced">
                  {job.message}
                </Alert>
              )}

              {job.status === 'completed' && job.quality?.overall !== undefined && (
                <>
                  <h3 className="panel__subtitle">Quality score</h3>
                  <QualityBars quality={job.quality} />
                </>
              )}

              <div className="form__row">
                {running && (
                  <button type="button" className="button button--secondary" onClick={cancel}>
                    Cancel generation
                  </button>
                )}
                {job.status === 'completed' && (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => navigate('/timetable')}
                  >
                    View timetable
                  </button>
                )}
                {(job.status === 'failed' || job.status === 'cancelled') && (
                  <button type="button" className="button button--primary" onClick={start}>
                    Try again
                  </button>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}
