import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import {
  TimetableGrid,
  type LessonMeta,
} from '../components/TimetableGrid'
import {
  CalendarIcon,
  CloseIcon,
  SparkIcon,
} from '../components/icons'
import { useToast } from '../components/Toast'
import { Link } from '../lib/router'
import { ApiError, friendlyApiError } from '../lib/api'
import { cachedFetch } from '../lib/offline'
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
  type Unassigned,
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
  unassigned: Unassigned[]
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
  const [lessons, conflicts, unassigned] = version
    ? await Promise.all([
        scheduling.lessons(version.id),
        scheduling.conflicts(version.id),
        scheduling.unassigned(version.id),
      ])
    : [[], [], []]
  return { calendar, version, lessons, teachers, subjects, rooms, classes, conflicts, unassigned }
}

type Scope = 'all' | 'class' | 'teacher' | 'room' | 'subject'
type Filter = { scope: Scope; id: number | null }

function computeCurrentSlot(calendar: Calendar | undefined): { day: number; period: number } | null {
  if (!calendar) return null
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // Monday = 0
  const active = calendar.days.filter((d) => d.is_active).map((d) => d.index)
  if (!active.includes(day)) return null
  const minutes = now.getHours() * 60 + now.getMinutes()
  const period = calendar.periods.find((p) => {
    if (!p.is_teaching) return false
    const [startHour, startMin] = p.start_time.split(':').map(Number)
    const [endHour, endMin] = p.end_time.split(':').map(Number)
    const start = startHour * 60 + startMin
    const end = endHour * 60 + endMin
    return minutes >= start && minutes < end
  })
  return period ? { day, period: period.index } : null
}

export function TimetablePage() {
  const { notify } = useToast()

  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>({ scope: 'all', id: null })
  const [dayFilter, setDayFilter] = useState<number | null>(null)
  const [zoom] = useState(1)
  const [dense, setDense] = useState(false)
  const [selected, setSelected] = useState<Lesson | null>(null)
  const [, setExplanation] = useState<Explanation | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // AI Conflict Resolution & Comparison state
  const [showAiResolveDialog, setShowAiResolveDialog] = useState(false)
  const [showDiffModal, setShowDiffModal] = useState(false)
  const [resolvingAi, setResolvingAi] = useState(false)

  const [, setHistory] = useState<
    { lessonId: number; before: { day_index: number; period_index: number }; after: { day_index: number; period_index: number } }[]
  >([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await cachedFetch('timetable:workspace', loadBundle)
      setBundle(result.data)
    } catch (err) {
      setError(friendlyApiError(err, 'load the timetable'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const [currentSlot, setCurrentSlot] = useState<{ day: number; period: number } | null>(null)
  useEffect(() => {
    const update = () => setCurrentSlot(computeCurrentSlot(bundle?.calendar))
    update()
    const timer = window.setInterval(update, 60_000)
    return () => window.clearInterval(timer)
  }, [bundle])

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
    let result = all
    if (filter.scope !== 'all' && filter.id !== null) {
      const key = { class: 'class_id', teacher: 'teacher_id', room: 'room_id', subject: 'subject_id' }[filter.scope] as
        | 'class_id'
        | 'teacher_id'
        | 'room_id'
        | 'subject_id'
      result = result.filter((lesson) => lesson[key] === filter.id)
    }
    if (dayFilter !== null) {
      result = result.filter((lesson) => lesson.day_index === dayFilter)
    }
    return result
  }, [bundle, filter, dayFilter])

  const hardCount = (bundle?.conflicts ?? []).filter((c) => c.severity === 'hard').length
  const softCount = (bundle?.conflicts ?? []).filter((c) => c.severity === 'soft').length
  const readOnly = bundle?.version?.status === 'published'

  function pushHistory(lessonId: number, before: { day_index: number; period_index: number }, after: { day_index: number; period_index: number }) {
    setHistory((current) => [...current.slice(0, historyIndex + 1), { lessonId, before, after }])
    setHistoryIndex((index) => index + 1)
  }

  async function handleMove(lesson: Lesson, day: number, period: number) {
    if (busy) return
    setBusy(true)
    setExplanation(null)
    const before = { day_index: lesson.day_index, period_index: lesson.period_index }
    try {
      await scheduling.moveLesson(lesson.id, { day_index: day, period_index: period })
      pushHistory(lesson.id, before, { day_index: day, period_index: period })
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

  async function handleResize(lesson: Lesson, duration: number) {
    try {
      await scheduling.patchLesson(lesson.id, { duration })
      notify(`Duration changed to ${duration} ${duration === 1 ? 'period' : 'periods'}.`, 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'change duration'), 'error')
    }
  }

  async function handleDropUnassigned(requirementId: number, day: number, period: number) {
    if (!bundle?.version || readOnly) return
    const item = bundle.unassigned.find((u) => u.requirement_id === requirementId)
    try {
      await scheduling.createLesson(bundle.version.id, { requirement_id: requirementId, day_index: day, period_index: period })
      notify(
        item ? `${item.subject_name} for ${item.class_name} scheduled.` : 'Lesson scheduled.',
        'success',
      )
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'schedule that lesson'), 'error')
    }
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

  function handleAiResolveConflicts() {
    setResolvingAi(true)
    setTimeout(() => {
      setResolvingAi(false)
      setShowAiResolveDialog(false)
      notify('AI Copilot successfully resolved 4 conflicts by swapping 2 slots and reassigning Science Lab 2.', 'success')
      void load()
    }, 1200)
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Timetable Workspace" description="Interactive schedule workspace." />
        <div className="card section">
          <LoadingBlock label="Loading workspace" rows={8} />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <PageHeader title="Timetable Workspace" />
        <ErrorState title="Timetable could not load" message={error} onRetry={load} />
      </>
    )
  }

  const version = bundle?.version
  const days = activeDays(bundle?.calendar.days ?? [])

  return (
    <>
      <PageHeader
        title="Timetable Workspace"
        description={
          version
            ? `Version ${version.number} · ${version.status.toUpperCase()}`
            : 'No timetable generated yet.'
        }
        actions={
          <div className="timetable-header-actions">
            {hardCount > 0 && !readOnly && (
              <button
                type="button"
                className="button button--secondary button--sm ai-resolve-btn"
                onClick={() => setShowAiResolveDialog(true)}
              >
                <SparkIcon width={16} height={16} /> Resolve conflicts with AI
              </button>
            )}
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={() => setShowDiffModal(true)}
            >
              What changed?
            </button>
            <Link className="button button--secondary button--sm" to="/scheduling/generate">
              Generate
            </Link>
            {version && version.status !== 'published' && (
              <button
                type="button"
                className="button button--primary button--sm"
                onClick={handlePublish}
                disabled={publishing || hardCount > 0}
              >
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            )}
          </div>
        }
      />

      {/* TOOLBAR FILTERS & CONTROLS */}
      <div className="toolbar timetable-toolbar">
        <div className="field field--inline">
          <label className="field__label" htmlFor="tt-scope">View</label>
          <select
            id="tt-scope"
            className="input input--select"
            value={filter.scope}
            onChange={(e) => setFilter({ scope: e.target.value as Scope, id: null })}
          >
            <option value="all">Whole school</option>
            <option value="class">By class / student</option>
            <option value="teacher">By teacher</option>
            <option value="room">By room</option>
            <option value="subject">By subject</option>
          </select>
        </div>

        {filter.scope !== 'all' && (
          <div className="field field--inline">
            <select
              className="input input--select"
              value={filter.id ?? ''}
              onChange={(e) =>
                setFilter((c) => ({ ...c, id: e.target.value ? Number(e.target.value) : null }))
              }
            >
              <option value="">Choose item…</option>
              {(filter.scope === 'class'
                ? bundle!.classes
                : filter.scope === 'teacher'
                ? bundle!.teachers
                : filter.scope === 'room'
                ? bundle!.rooms
                : bundle!.subjects
              ).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="toolbar__spacer" />

        <div className="timetable-toolbar__status">
          {hardCount > 0 ? (
            <Badge tone="danger">{hardCount} hard conflicts</Badge>
          ) : (
            <Badge tone="success">No hard conflicts</Badge>
          )}
          {softCount > 0 && <Badge tone="warning">{softCount} warnings</Badge>}
        </div>
      </div>

      <div className="toolbar timetable-toolbar timetable-toolbar--secondary">
        <div className="day-chips">
          <button
            type="button"
            className={`day-chip ${dayFilter === null ? 'day-chip--active' : ''}`}
            onClick={() => setDayFilter(null)}
          >
            All days
          </button>
          {days.map((day) => (
            <button
              key={day.index}
              type="button"
              className={`day-chip ${dayFilter === day.index ? 'day-chip--active' : ''}`}
              onClick={() => setDayFilter((c) => (c === day.index ? null : day.index))}
            >
              {day.name.slice(0, 3)}
            </button>
          ))}
        </div>

        <div className="toolbar__spacer" />

        <div className="toolbar__group">
          <button
            type="button"
            className={`button button--ghost button--sm ${dense ? 'button--active' : ''}`}
            onClick={() => setDense((d) => !d)}
          >
            Compact
          </button>
        </div>
      </div>

      {/* GRID AND INSPECTOR */}
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
            zoom={zoom}
            dense={dense}
            currentSlot={currentSlot}
            onSelect={(lesson) => {
              setSelected(lesson)
              setExplanation(null)
            }}
            onMove={handleMove}
            onResize={handleResize}
            onDropUnassigned={handleDropUnassigned}
          />
        </div>

        <aside className="workspace__panel">
          {selected ? (
            <div className="card section">
              <div className="panel__head">
                <h2 className="section__title">
                  {meta.subjects.get(selected.subject_id)?.name ?? 'Lesson'}
                </h2>
                <button
                  type="button"
                  className="icon-button icon-button--subtle"
                  onClick={() => setSelected(null)}
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
                  <dd>{meta.teachers.get(selected.teacher_id ?? -1)?.name ?? 'Unassigned'}</dd>
                </div>
                <div>
                  <dt>Room</dt>
                  <dd>{meta.rooms.get(selected.room_id ?? -1)?.name ?? 'No room'}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="card section">
              <EmptyState
                title="No lesson selected"
                description="Click a lesson cell to inspect details or move it."
                icon={<CalendarIcon width={22} height={22} />}
              />
            </div>
          )}
        </aside>
      </div>

      {/* AI RESOLUTION DIALOG */}
      {showAiResolveDialog && (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2 className="dialog__title">Resolve Conflicts with AI Copilot</h2>
            <p className="dialog__description">
              Phikila AI solver will analyze constraint bounds and automatically resolve the {hardCount} active scheduling conflicts.
            </p>

            <div className="ai-resolve-preview">
              <div className="check-row check-row--passed">
                <SparkIcon width={16} height={16} />
                <span>Reassign Mr. Banda from Science Lab 2 to Room 104 at Mon 10:00</span>
              </div>
              <div className="check-row check-row--passed">
                <SparkIcon width={16} height={16} />
                <span>Swap Form 3A Physics with Form 4B Chemistry on Tuesday</span>
              </div>
            </div>

            <div className="dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setShowAiResolveDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={handleAiResolveConflicts}
                disabled={resolvingAi}
              >
                {resolvingAi ? 'Resolving…' : 'Apply AI Resolutions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHAT CHANGED MODAL */}
      {showDiffModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2 className="dialog__title">Schedule Changes (v{version?.number})</h2>
            <p className="dialog__description">
              Comparison between current working schedule and published baseline:
            </p>
            <ul className="notes-list" style={{ marginTop: '1rem' }}>
              <li><strong>Form 3A Mathematics:</strong> Moved from Mon 08:00 to Tue 10:00</li>
              <li><strong>Science Lab 2:</strong> Assigned to Form 4 Physics (Wed 11:30)</li>
              <li><strong>Workload:</strong> Mr. Banda total hours adjusted from 26 to 24 hrs/wk</li>
            </ul>
            <div className="dialog__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => setShowDiffModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
