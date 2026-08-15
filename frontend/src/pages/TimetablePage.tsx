import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { Alert } from '../components/Alert'
import { TimetableGrid, type LessonMeta } from '../components/TimetableGrid'
import { CalendarIcon, CloseIcon, AlertIcon, CheckIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { Link, useNavigate } from '../lib/router'
import { ApiError, friendlyApiError } from '../lib/api'
import { cachedFetch, formatSavedAt } from '../lib/offline'
import {
  activeDays,
  scheduling,
  type Alternative,
  type Calendar,
  type Conflict,
  type Explanation,
  type Lesson,
  type Room,
  type SchoolClass,
  type Subject,
  type Teacher,
  type Version,
} from '../lib/scheduling'

type Bundle = {
  calendar: Calendar
  version: Version | null
  lessons: Lesson[]
  teachers: Teacher[]
  subjects: Subject[]
  rooms: Room[]
  classes: SchoolClass[]
  conflicts: Conflict[]
}

async function loadBundle(): Promise<Bundle> {
  const [calendar, version, teachers, subjects, rooms, classes] = await Promise.all([
    scheduling.calendar(),
    scheduling.currentVersion(),
    scheduling.teachers(),
    scheduling.subjects(),
    scheduling.rooms(),
    scheduling.classes(),
  ])
  const [lessons, conflicts] = version
    ? await Promise.all([scheduling.lessons(version.id), scheduling.conflicts(version.id)])
    : [[], []]
  return { calendar, version, lessons, teachers, subjects, rooms, classes, conflicts }
}

type Filter = { scope: 'all' | 'class' | 'teacher' | 'room'; id: number | null }

export function TimetablePage() {
  const { notify } = useToast()
  const navigate = useNavigate()

  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>({ scope: 'all', id: null })
  const [selected, setSelected] = useState<Lesson | null>(null)
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await cachedFetch('timetable:workspace', loadBundle)
      setBundle(result.data)
      setStale(result.stale ? result.savedAt : null)
    } catch (err) {
      setError(friendlyApiError(err, 'load the timetable'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const meta: LessonMeta = useMemo(
    () => ({
      subjects: new Map((bundle?.subjects ?? []).map((s) => [s.id, s])),
      teachers: new Map((bundle?.teachers ?? []).map((t) => [t.id, t])),
      rooms: new Map((bundle?.rooms ?? []).map((r) => [r.id, r])),
      classes: new Map((bundle?.classes ?? []).map((c) => [c.id, c])),
    }),
    [bundle],
  )

  const conflicted = useMemo(() => {
    const ids = new Set<number>()
    for (const conflict of bundle?.conflicts ?? []) {
      if (conflict.severity === 'hard') conflict.lesson_ids.forEach((id) => ids.add(id))
    }
    return ids
  }, [bundle])

  const visible = useMemo(() => {
    const all = bundle?.lessons ?? []
    if (filter.scope === 'all' || filter.id === null) return all
    const key = { class: 'class_id', teacher: 'teacher_id', room: 'room_id' }[filter.scope] as
      | 'class_id'
      | 'teacher_id'
      | 'room_id'
    return all.filter((lesson) => lesson[key] === filter.id)
  }, [bundle, filter])

  const hardCount = (bundle?.conflicts ?? []).filter((c) => c.severity === 'hard').length
  const softCount = (bundle?.conflicts ?? []).filter((c) => c.severity === 'soft').length
  const readOnly = bundle?.version?.status === 'published'

  async function handleMove(lesson: Lesson, day: number, period: number) {
    if (busy) return
    setBusy(true)
    setExplanation(null)
    try {
      await scheduling.moveLesson(lesson.id, { day_index: day, period_index: period })
      notify('Lesson moved.', 'success')
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.detail) {
        const detail = err.detail as { reasons?: Explanation['reasons']; alternatives?: Alternative[] }
        setSelected(lesson)
        setExplanation({
          allowed: false,
          reasons: detail.reasons ?? [],
          alternatives: detail.alternatives ?? [],
        })
        notify('That move creates a conflict.', 'error')
      } else {
        notify(friendlyApiError(err, 'move the lesson'), 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  async function askWhy(lesson: Lesson, day: number, period: number) {
    try {
      setExplanation(await scheduling.explain(lesson.id, day, period))
    } catch (err) {
      notify(friendlyApiError(err, 'explain that slot'), 'error')
    }
  }

  async function applyAlternative(alt: Alternative) {
    if (!selected) return
    await handleMove(selected, alt.day, alt.period)
  }

  async function handlePublish() {
    if (!bundle?.version || publishing) return
    setPublishing(true)
    try {
      await scheduling.publish(bundle.version.id)
      notify('Timetable published.', 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'publish the timetable'), 'error')
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Timetable" description="The current working timetable." />
        <div className="card section">
          <LoadingBlock label="Loading the timetable" rows={8} />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <PageHeader title="Timetable" />
        <ErrorState title="Timetable could not load" message={error} onRetry={load} />
      </>
    )
  }

  const version = bundle?.version
  const days = activeDays(bundle?.calendar.days ?? [])

  return (
    <>
      <PageHeader
        title="Timetable"
        description={
          version
            ? `Version ${version.number} · ${version.status}`
            : 'No timetable has been generated yet.'
        }
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable' }]}
        actions={
          <>
            <Link className="button button--secondary button--sm" to="/scheduling/generate">
              Generate
            </Link>
            {version && version.status !== 'published' && (
              <button
                type="button"
                className="button button--primary button--sm"
                onClick={handlePublish}
                disabled={publishing || hardCount > 0}
                title={hardCount > 0 ? 'Resolve hard conflicts first' : undefined}
              >
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            )}
          </>
        }
      />

      {stale && (
        <Alert tone="info" title="Offline copy">
          Showing the timetable saved on this device {formatSavedAt(stale)}. It will refresh when
          you are back online.
        </Alert>
      )}

      {!version ? (
        <div className="card section">
          <EmptyState
            title="No timetable yet"
            description="Add your teachers, subjects, classes and rooms, then generate a timetable."
            icon={<CalendarIcon width={22} height={22} />}
            action={
              <Link className="button button--primary button--sm" to="/scheduling/generate">
                Generate a timetable
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="toolbar timetable-toolbar">
            <div className="field field--inline">
              <label className="field__label" htmlFor="tt-scope">
                View
              </label>
              <select
                id="tt-scope"
                className="input input--select"
                value={filter.scope}
                onChange={(event) =>
                  setFilter({ scope: event.target.value as Filter['scope'], id: null })
                }
              >
                <option value="all">Whole school</option>
                <option value="class">By class</option>
                <option value="teacher">By teacher</option>
                <option value="room">By room</option>
              </select>
            </div>

            {filter.scope !== 'all' && (
              <div className="field field--inline">
                <label className="field__label" htmlFor="tt-target">
                  {filter.scope === 'class' ? 'Class' : filter.scope === 'teacher' ? 'Teacher' : 'Room'}
                </label>
                <select
                  id="tt-target"
                  className="input input--select"
                  value={filter.id ?? ''}
                  onChange={(event) =>
                    setFilter((current) => ({
                      ...current,
                      id: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                >
                  <option value="">Choose…</option>
                  {(filter.scope === 'class'
                    ? bundle!.classes
                    : filter.scope === 'teacher'
                      ? bundle!.teachers
                      : bundle!.rooms
                  ).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="timetable-toolbar__status">
              {hardCount > 0 ? (
                <Badge tone="danger">{hardCount} hard conflicts</Badge>
              ) : (
                <Badge tone="success">No hard conflicts</Badge>
              )}
              {softCount > 0 && <Badge tone="warning">{softCount} warnings</Badge>}
              {version.quality?.overall !== undefined && (
                <Badge>Quality {version.quality.overall}/100</Badge>
              )}
            </div>
          </div>

          {readOnly && (
            <Alert tone="info" title="Published timetable">
              Published versions are read-only so everyone sees the same schedule. Restore it as a
              draft from <Link to="/versions">Versions</Link> to make changes.
            </Alert>
          )}

          <div className="workspace">
            <div className="card section workspace__grid">
              <TimetableGrid
                days={days}
                periods={bundle!.calendar.periods}
                lessons={visible}
                meta={meta}
                conflicted={conflicted}
                selectedId={selected?.id ?? null}
                readOnly={readOnly || busy}
                onSelect={(lesson) => {
                  setSelected(lesson)
                  setExplanation(null)
                }}
                onMove={handleMove}
                secondary={(lesson) =>
                  filter.scope === 'class'
                    ? null
                    : (meta.classes.get(lesson.class_id)?.name ?? null)
                }
              />
            </div>

            <aside className="workspace__panel" aria-label="Lesson details">
              {selected ? (
                <div className="card section">
                  <div className="panel__head">
                    <h2 className="section__title">
                      {meta.subjects.get(selected.subject_id)?.name ?? 'Lesson'}
                    </h2>
                    <button
                      type="button"
                      className="icon-button icon-button--subtle"
                      onClick={() => {
                        setSelected(null)
                        setExplanation(null)
                      }}
                      aria-label="Close lesson details"
                    >
                      <CloseIcon width={16} height={16} />
                    </button>
                  </div>
                  <dl className="detail-list">
                    <div>
                      <dt>Class</dt>
                      <dd>{meta.classes.get(selected.class_id)?.name ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Teacher</dt>
                      <dd>
                        {selected.teacher_id
                          ? (meta.teachers.get(selected.teacher_id)?.name ?? '—')
                          : 'Unassigned'}
                      </dd>
                    </div>
                    <div>
                      <dt>Room</dt>
                      <dd>
                        {selected.room_id ? (meta.rooms.get(selected.room_id)?.name ?? '—') : 'None'}
                      </dd>
                    </div>
                    <div>
                      <dt>Slot</dt>
                      <dd>
                        {days.find((d) => d.index === selected.day_index)?.name},{' '}
                        {
                          bundle!.calendar.periods.find((p) => p.index === selected.period_index)
                            ?.name
                        }
                      </dd>
                    </div>
                  </dl>

                  {!readOnly && (
                    <>
                      <h3 className="panel__subtitle">Move this lesson</h3>
                      <p className="form__note">
                        Drag the card, or select a cell and press Enter. Ask why a slot is blocked
                        before moving.
                      </p>
                      <MoveExplorer
                        days={days}
                        periods={bundle!.calendar.periods}
                        onAsk={(day, period) => askWhy(selected, day, period)}
                      />
                    </>
                  )}

                  {explanation && (
                    <div className="explain">
                      <h3 className="panel__subtitle">
                        {explanation.allowed ? (
                          <>
                            <CheckIcon width={16} height={16} /> That slot is free
                          </>
                        ) : (
                          <>
                            <AlertIcon width={16} height={16} /> Why it cannot move there
                          </>
                        )}
                      </h3>
                      {explanation.reasons.length > 0 && (
                        <ul className="explain__list">
                          {explanation.reasons.map((reason, index) => (
                            <li key={index}>
                              <strong>{reason.factor}:</strong> {reason.detail}
                            </li>
                          ))}
                        </ul>
                      )}
                      {explanation.alternatives.length > 0 && (
                        <>
                          <h4 className="explain__alt-title">Suggested alternatives</h4>
                          <ul className="explain__alts">
                            {explanation.alternatives.map((alt) => (
                              <li key={`${alt.day}:${alt.period}`}>
                                <button
                                  type="button"
                                  className="button button--secondary button--sm"
                                  onClick={() => applyAlternative(alt)}
                                  disabled={busy || readOnly}
                                >
                                  {alt.day_name} {alt.period_name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="card section">
                  <EmptyState
                    title="No lesson selected"
                    description="Choose a lesson in the grid to see its details, move it, or ask why a slot is blocked."
                    icon={<CalendarIcon width={22} height={22} />}
                  />
                </div>
              )}

              {(bundle?.conflicts.length ?? 0) > 0 && (
                <div className="card section">
                  <h2 className="section__title">Conflicts</h2>
                  <ul className="conflict-list">
                    {bundle!.conflicts.slice(0, 12).map((conflict, index) => (
                      <li key={index} className={`conflict conflict--${conflict.severity}`}>
                        <Badge tone={conflict.severity === 'hard' ? 'danger' : 'warning'}>
                          {conflict.severity === 'hard' ? 'Blocking' : 'Warning'}
                        </Badge>
                        <span>{conflict.message}</span>
                      </li>
                    ))}
                  </ul>
                  {bundle!.conflicts.length > 12 && (
                    <p className="form__note">
                      Showing 12 of {bundle!.conflicts.length}.{' '}
                      <button
                        type="button"
                        className="link"
                        onClick={() => navigate('/scheduling/generate')}
                      >
                        Re-generate to resolve them
                      </button>
                      .
                    </p>
                  )}
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </>
  )
}

/** Small day/period picker used to ask "why can't it go here?". */
function MoveExplorer({
  days,
  periods,
  onAsk,
}: {
  days: { index: number; name: string }[]
  periods: { index: number; name: string; is_teaching: boolean }[]
  onAsk: (day: number, period: number) => void
}) {
  const teaching = periods.filter((p) => p.is_teaching)
  const [day, setDay] = useState(days[0]?.index ?? 0)
  const [period, setPeriod] = useState(teaching[0]?.index ?? 0)

  return (
    <div className="move-explorer">
      <div className="field field--inline">
        <label className="field__label" htmlFor="why-day">
          Day
        </label>
        <select
          id="why-day"
          className="input input--select"
          value={day}
          onChange={(event) => setDay(Number(event.target.value))}
        >
          {days.map((d) => (
            <option key={d.index} value={d.index}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field field--inline">
        <label className="field__label" htmlFor="why-period">
          Period
        </label>
        <select
          id="why-period"
          className="input input--select"
          value={period}
          onChange={(event) => setPeriod(Number(event.target.value))}
        >
          {teaching.map((p) => (
            <option key={p.index} value={p.index}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="button button--secondary button--sm" onClick={() => onAsk(day, period)}>
        Why?
      </button>
    </div>
  )
}
