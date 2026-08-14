import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { CalendarIcon } from '../components/icons'
import { friendlyApiError } from '../lib/api'
import { cachedFetch, formatSavedAt } from '../lib/offline'
import { scheduling, type SchoolClass, type Teacher, type TimetableView } from '../lib/scheduling'

type Scope = 'class' | 'teacher'

/**
 * The teacher / student view. Deliberately simple: today first, then the week.
 * The payload is cached so it still opens with no connection.
 */
export function MyTimetablePage() {
  const [scope, setScope] = useState<Scope>('class')
  const [targetId, setTargetId] = useState<number | null>(null)
  const [options, setOptions] = useState<{ classes: SchoolClass[]; teachers: Teacher[] } | null>(null)
  const [view, setView] = useState<TimetableView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState<number | null>(null)
  const [tab, setTab] = useState<'today' | 'week'>('today')

  useEffect(() => {
    let active = true
    cachedFetch('mytt:options', async () => {
      const [classes, teachers] = await Promise.all([scheduling.classes(), scheduling.teachers()])
      return { classes, teachers }
    })
      .then((result) => {
        if (!active) return
        setOptions(result.data)
        const first = result.data.classes[0]?.id ?? null
        setTargetId((current) => current ?? first)
      })
      .catch(() => {
        if (active) setError('Could not load your school data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!targetId) return
    setLoading(true)
    setError(null)
    try {
      const result = await cachedFetch(`mytt:${scope}:${targetId}`, () =>
        scheduling.view(scope, targetId),
      )
      setView(result.data)
      setStale(result.stale ? result.savedAt : null)
    } catch (err) {
      setError(friendlyApiError(err, 'load the timetable'))
    } finally {
      setLoading(false)
    }
  }, [scope, targetId])

  useEffect(() => {
    void load()
  }, [load])

  // Map the real weekday onto the school's configured working days.
  const todayIndex = useMemo(() => {
    const weekday = new Date().getDay() // 0 = Sunday
    const mondayBased = weekday === 0 ? 6 : weekday - 1
    return view?.days.some((d) => d.index === mondayBased) ? mondayBased : null
  }, [view])

  const periodsById = useMemo(
    () => new Map((view?.periods ?? []).map((p) => [p.index, p])),
    [view],
  )

  const todayLessons = useMemo(() => {
    if (todayIndex === null) return []
    return (view?.lessons ?? [])
      .filter((lesson) => lesson.day === todayIndex)
      .sort((a, b) => a.period - b.period)
  }, [view, todayIndex])

  // "Now" / "Next" only make sense against real clock time.
  const nowLabel = useMemo(() => {
    if (todayIndex === null) return null
    const now = new Date()
    const minutes = now.getHours() * 60 + now.getMinutes()
    for (const lesson of todayLessons) {
      const period = periodsById.get(lesson.period)
      if (!period) continue
      const [sh, sm] = period.start_time.split(':').map(Number)
      const [eh, em] = period.end_time.split(':').map(Number)
      const start = sh * 60 + sm
      const end = eh * 60 + em
      if (minutes >= start && minutes < end) return { state: 'now' as const, lesson }
      if (minutes < start) return { state: 'next' as const, lesson }
    }
    return null
  }, [todayLessons, periodsById, todayIndex])

  const targets = scope === 'class' ? (options?.classes ?? []) : (options?.teachers ?? [])

  return (
    <>
      <PageHeader
        title="My timetable"
        description="Your personal schedule. Available offline once loaded."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'My timetable' }]}
      />

      {stale && (
        <Alert tone="info" title="Offline copy">
          Saved on this device {formatSavedAt(stale)}. It will refresh when you reconnect.
        </Alert>
      )}

      <section className="card section">
        <div className="toolbar">
          <div className="field field--inline">
            <label className="field__label" htmlFor="my-scope">
              Show
            </label>
            <select
              id="my-scope"
              className="input input--select"
              value={scope}
              onChange={(event) => {
                const next = event.target.value as Scope
                setScope(next)
                setTargetId(
                  next === 'class' ? (options?.classes[0]?.id ?? null) : (options?.teachers[0]?.id ?? null),
                )
              }}
            >
              <option value="class">A class timetable</option>
              <option value="teacher">A teacher timetable</option>
            </select>
          </div>
          <div className="field field--inline">
            <label className="field__label" htmlFor="my-target">
              {scope === 'class' ? 'Class' : 'Teacher'}
            </label>
            <select
              id="my-target"
              className="input input--select"
              value={targetId ?? ''}
              onChange={(event) => setTargetId(Number(event.target.value))}
            >
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error ? (
        <ErrorState title="Timetable could not load" message={error} onRetry={load} />
      ) : loading ? (
        <div className="card section">
          <LoadingBlock label="Loading your timetable" rows={5} />
        </div>
      ) : !view?.version ? (
        <div className="card section">
          <EmptyState
            title="No published timetable"
            description="Your timetable will appear here once the school publishes one."
            icon={<CalendarIcon width={22} height={22} />}
          />
        </div>
      ) : (
        <>
          {nowLabel && (
            <section className="card section now-card">
              <p className="now-card__label">
                {nowLabel.state === 'now' ? 'Happening now' : 'Up next'}
              </p>
              <h2 className="now-card__subject">{nowLabel.lesson.subject}</h2>
              <p className="now-card__meta">
                {periodsById.get(nowLabel.lesson.period)?.start_time} ·{' '}
                {scope === 'class' ? nowLabel.lesson.teacher : nowLabel.lesson.class} ·{' '}
                {nowLabel.lesson.room ?? 'No room'}
              </p>
            </section>
          )}

          <div className="tabs" role="tablist" aria-label="Timetable range">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'today'}
              className={`tab ${tab === 'today' ? 'tab--active' : ''}`}
              onClick={() => setTab('today')}
            >
              Today
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'week'}
              className={`tab ${tab === 'week' ? 'tab--active' : ''}`}
              onClick={() => setTab('week')}
            >
              Week
            </button>
          </div>

          {tab === 'today' ? (
            <section className="card section">
              <h2 className="section__title">
                {todayIndex === null
                  ? 'Not a school day'
                  : (view.days.find((d) => d.index === todayIndex)?.name ?? 'Today')}
              </h2>
              {todayLessons.length === 0 ? (
                <EmptyState
                  title="No lessons today"
                  description="Enjoy the free day. Switch to the week view to see what is coming."
                  icon={<CalendarIcon width={22} height={22} />}
                />
              ) : (
                <ul className="agenda-list">
                  {todayLessons.map((lesson) => {
                    const period = periodsById.get(lesson.period)
                    return (
                      <li className="agenda-row" key={lesson.id}>
                        <div className="agenda-row__time">
                          <span className="agenda-row__clock">{period?.start_time}</span>
                          <span className="agenda-row__period">{period?.name}</span>
                        </div>
                        <div className="agenda-row__body">
                          <div
                            className="lesson-card lesson-card--compact"
                            style={{ '--subject-colour': lesson.colour } as React.CSSProperties}
                          >
                            <span className="lesson-card__subject">{lesson.subject}</span>
                            <span className="lesson-card__line">
                              {scope === 'class' ? lesson.teacher : lesson.class}
                            </span>
                            {lesson.room && (
                              <span className="lesson-card__line lesson-card__room">{lesson.room}</span>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ) : (
            <section className="card section">
              <div className="panel__head">
                <h2 className="section__title">{view.target_name}</h2>
                <Badge tone={view.version.status === 'published' ? 'success' : 'warning'}>
                  v{view.version.number} {view.version.status}
                </Badge>
              </div>
              {view.days.map((day) => {
                const dayLessons = view.lessons
                  .filter((lesson) => lesson.day === day.index)
                  .sort((a, b) => a.period - b.period)
                return (
                  <section className="agenda-day" key={day.index}>
                    <h3 className="agenda-day__title">{day.name}</h3>
                    {dayLessons.length === 0 ? (
                      <p className="agenda-day__empty">No lessons.</p>
                    ) : (
                      <ul className="agenda-list">
                        {dayLessons.map((lesson) => {
                          const period = periodsById.get(lesson.period)
                          return (
                            <li className="agenda-row" key={lesson.id}>
                              <div className="agenda-row__time">
                                <span className="agenda-row__clock">{period?.start_time}</span>
                                <span className="agenda-row__period">{period?.name}</span>
                              </div>
                              <div className="agenda-row__body">
                                <div
                                  className="lesson-card lesson-card--compact"
                                  style={{ '--subject-colour': lesson.colour } as React.CSSProperties}
                                >
                                  <span className="lesson-card__subject">{lesson.subject}</span>
                                  <span className="lesson-card__line">
                                    {scope === 'class' ? lesson.teacher : lesson.class}
                                  </span>
                                  {lesson.room && (
                                    <span className="lesson-card__line lesson-card__room">
                                      {lesson.room}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                )
              })}
            </section>
          )}
        </>
      )}
    </>
  )
}
