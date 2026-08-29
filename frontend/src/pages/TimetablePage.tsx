import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { Alert } from '../components/Alert'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  TimetableGrid,
  UNASSIGNED_DRAG_TYPE,
  type LessonMeta,
} from '../components/TimetableGrid'
import {
  CalendarIcon,
  CloseIcon,
  AlertIcon,
  CheckIcon,
  DuplicateIcon,
  TrashIcon,
  LockIcon,
  UnlockIcon,
  PrintIcon,
  DownloadIcon,
  MinusIcon,
  PlusIcon,
} from '../components/icons'
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

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Which school day/period is happening right now, from the device clock. */
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
  const navigate = useNavigate()

  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>({ scope: 'all', id: null })
  const [dayFilter, setDayFilter] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [dense, setDense] = useState(false)
  const [selected, setSelected] = useState<Lesson | null>(null)
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState<Lesson | null>(null)
  const [history, setHistory] = useState<
    { lessonId: number; before: { day_index: number; period_index: number }; after: { day_index: number; period_index: number } }[]
  >([])
  const [historyIndex, setHistoryIndex] = useState(-1)
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

  // Re-compute the live highlight once a minute so it stays honest.
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

  async function applyUndoRedo(
    entry: { lessonId: number; before: { day_index: number; period_index: number }; after: { day_index: number; period_index: number } },
    direction: 'undo' | 'redo',
  ) {
    const target = direction === 'undo' ? entry.before : entry.after
    try {
      await scheduling.moveLesson(entry.lessonId, target)
      await load()
      notify(direction === 'undo' ? 'Move undone.' : 'Move redone.', 'success')
    } catch (err) {
      notify(friendlyApiError(err, 'undo that move'), 'error')
    }
  }

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      const mod = event.metaKey || event.ctrlKey
      if (typing && !mod) return

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          if (historyIndex < history.length - 1) {
            const entry = history[historyIndex + 1]
            setHistoryIndex((index) => index + 1)
            void applyUndoRedo(entry, 'redo')
          }
        } else if (historyIndex >= 0) {
          const entry = history[historyIndex]
          setHistoryIndex((index) => index - 1)
          void applyUndoRedo(entry, 'undo')
        }
        return
      }
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (!typing && (event.key === 'Delete' || event.key === 'Backspace') && selected && !readOnly) {
        event.preventDefault()
        setConfirmingDelete(selected)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, historyIndex, selected, readOnly])

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
      showConflict(err, 'change the duration', lesson)
    }
  }

  function showConflict(err: unknown, action: string, lesson: Lesson) {
    if (err instanceof ApiError && err.status === 409 && err.detail) {
      const detail = err.detail as { reasons?: Explanation['reasons']; alternatives?: Alternative[] }
      setSelected(lesson)
      setExplanation({ allowed: false, reasons: detail.reasons ?? [], alternatives: detail.alternatives ?? [] })
      notify(`That change to ${action} creates a conflict.`, 'error')
    } else {
      notify(friendlyApiError(err, action), 'error')
    }
  }

  async function handlePatch(lesson: Lesson, patch: Parameters<typeof scheduling.patchLesson>[1], success: string) {
    if (busy) return
    setBusy(true)
    setExplanation(null)
    try {
      const updated = await scheduling.patchLesson(lesson.id, patch)
      setSelected(updated)
      notify(success, 'success')
      await load()
    } catch (err) {
      showConflict(err, success, lesson)
    } finally {
      setBusy(false)
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

  async function handleDuplicate() {
    if (!selected) return
    try {
      await scheduling.duplicateLesson(selected.id)
      notify('Lesson duplicated. Drag the copy where you need it.', 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'duplicate the lesson'), 'error')
    }
  }

  async function handleDelete() {
    if (!confirmingDelete) return
    const target = confirmingDelete
    setConfirmingDelete(null)
    try {
      await scheduling.deleteLesson(target.id)
      if (selected?.id === target.id) {
        setSelected(null)
        setExplanation(null)
      }
      notify('Lesson deleted.', 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'delete the lesson'), 'error')
    }
  }

  async function handleAssignRooms() {
    if (!bundle?.version) return
    try {
      const result = await scheduling.assignRooms(bundle.version.id)
      notify(`Assigned rooms to ${result.assigned} lessons.`, 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'assign rooms'), 'error')
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

  /* ---------------- exports ---------------- */

  function exportCsv() {
    if (!bundle) return
    const rows = [
      ['Day', 'Period', 'Start', 'Subject', 'Class', 'Teacher', 'Room', 'Duration', 'Locked'],
      ...visible.map((lesson) => {
        const period = bundle.calendar.periods.find((p) => p.index === lesson.period_index)
        return [
          DAY_NAMES[lesson.day_index] ?? lesson.day_index,
          period?.name ?? lesson.period_index,
          period?.start_time ?? '',
          meta.subjects.get(lesson.subject_id)?.name ?? '',
          meta.classes.get(lesson.class_id)?.name ?? '',
          lesson.teacher_id ? (meta.teachers.get(lesson.teacher_id)?.name ?? '') : '',
          lesson.room_id ? (meta.rooms.get(lesson.room_id)?.name ?? '') : '',
          String(lesson.duration),
          lesson.is_locked ? 'yes' : 'no',
        ]
      }),
    ]
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    downloadText(csv, 'timetable.csv', 'text/csv')
  }

  function exportIcs() {
    if (!bundle) return
    // Anchor to the current week's Monday so the file opens in any calendar.
    const nowDate = new Date()
    const monday = new Date(nowDate)
    monday.setDate(nowDate.getDate() - ((nowDate.getDay() + 6) % 7))
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Phikila School Management System//Timetable//EN',
      'X-WR-CALNAME:School Timetable',
    ]
    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`
    for (const lesson of visible) {
      const period = bundle.calendar.periods.find((p) => p.index === lesson.period_index)
      if (!period) continue
      const end = bundle.calendar.periods.find(
        (p) => p.index === lesson.period_index + (lesson.duration ?? 1) - 1,
      )
      const startDate = new Date(monday)
      startDate.setDate(monday.getDate() + lesson.day_index)
      const [sh, sm] = period.start_time.split(':').map(Number)
      startDate.setHours(sh, sm, 0, 0)
      const endDate = new Date(startDate)
      const [eh, em] = (end?.end_time ?? period.end_time).split(':').map(Number)
      endDate.setHours(eh, em, 0, 0)
      const summary = `${meta.subjects.get(lesson.subject_id)?.name ?? 'Lesson'} — ${meta.classes.get(lesson.class_id)?.name ?? ''}`
      lines.push(
        'BEGIN:VEVENT',
        `UID:phikila-lesson-${lesson.id}@phikila`,
        `DTSTART:${fmt(startDate)}`,
        `DTEND:${fmt(endDate)}`,
        `SUMMARY:${summary}`,
        `LOCATION:${lesson.room_id ? (meta.rooms.get(lesson.room_id)?.name ?? '') : 'No room'}`,
        `DESCRIPTION:${lesson.teacher_id ? (meta.teachers.get(lesson.teacher_id)?.name ?? '') : 'Unassigned'}`,
        'END:VEVENT',
      )
    }
    lines.push('END:VCALENDAR')
    downloadText(lines.join('\r\n'), 'timetable.ics', 'text/calendar')
  }

  function exportPng() {
    if (!bundle) return
    const days = activeDays(bundle.calendar.days)
    const teaching = bundle.calendar.periods.filter((p) => p.is_teaching)
    const cellW = 170
    const cellH = 64
    const timeW = 90
    const headH = 40
    const canvas = document.createElement('canvas')
    canvas.width = timeW + days.length * cellW
    canvas.height = headH + teaching.length * cellH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0F2A47'
    ctx.font = '600 15px system-ui, sans-serif'
    days.forEach((day, index) => {
      ctx.fillText(day.name, timeW + index * cellW + 10, 26)
    })
    const bySlot = new Map<string, Lesson[]>()
    for (const lesson of visible) {
      const key = `${lesson.day_index}:${lesson.period_index}`
      const bucket = bySlot.get(key)
      if (bucket) bucket.push(lesson)
      else bySlot.set(key, [lesson])
    }
    teaching.forEach((period, row) => {
      const y = headH + row * cellH
      ctx.fillStyle = '#33475B'
      ctx.font = '500 12px system-ui, sans-serif'
      ctx.fillText(`${period.name} ${period.start_time}`, 8, y + 24)
      ctx.strokeStyle = '#E4EAF0'
      ctx.strokeRect(0, y, canvas.width, cellH)
      days.forEach((day, col) => {
        const cell = bySlot.get(`${day.index}:${period.index}`) ?? []
        const x = timeW + col * cellW
        ctx.strokeStyle = '#E4EAF0'
        ctx.strokeRect(x, y, cellW, cellH)
        cell.forEach((lesson, index) => {
          const subject = meta.subjects.get(lesson.subject_id)
          ctx.fillStyle = subject?.colour ?? '#0F2A47'
          ctx.fillRect(x + 4, y + 6 + index * 24, cellW - 8, 20)
          ctx.fillStyle = '#ffffff'
          ctx.font = '600 11px system-ui, sans-serif'
          ctx.fillText(
            `${subject?.name ?? 'Lesson'} · ${meta.classes.get(lesson.class_id)?.name ?? ''}`,
            x + 10,
            y + 20 + index * 24,
          )
        })
      })
    })
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'timetable.png'
      anchor.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function downloadText(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  /* ---------------- palette ---------------- */

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const paletteItems = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase()
    const nav = [
      { label: 'Dashboard', to: '/' },
      { label: 'Timetable', to: '/timetable' },
      { label: 'My timetable', to: '/my-timetable' },
      { label: 'Days & periods', to: '/setup/periods' },
      { label: 'Teachers', to: '/setup/teachers' },
      { label: 'Subjects', to: '/setup/subjects' },
      { label: 'Classes', to: '/setup/classes' },
      { label: 'Rooms', to: '/setup/rooms' },
      { label: 'Lesson requirements', to: '/scheduling/requirements' },
      { label: 'Generate timetable', to: '/scheduling/generate' },
      { label: 'Copilot', to: '/scheduling/copilot' },
      { label: 'Analytics', to: '/analytics' },
      { label: 'Versions', to: '/versions' },
    ]
    const people: { label: string; action: () => void }[] = [
      ...(bundle?.teachers ?? []).map((t) => ({
        label: `Show teacher: ${t.name}`,
        action: () => setFilter({ scope: 'teacher', id: t.id }),
      })),
      ...(bundle?.classes ?? []).map((c) => ({
        label: `Show class: ${c.name}`,
        action: () => setFilter({ scope: 'class', id: c.id }),
      })),
      ...(bundle?.rooms ?? []).map((r) => ({
        label: `Show room: ${r.name}`,
        action: () => setFilter({ scope: 'room', id: r.id }),
      })),
      ...(bundle?.subjects ?? []).map((s) => ({
        label: `Show subject: ${s.name}`,
        action: () => setFilter({ scope: 'subject', id: s.id }),
      })),
    ]
    const filtered = [
      ...nav.filter((item) => item.label.toLowerCase().includes(query)).map((item) => ({
        label: `Go to ${item.label}`,
        action: () => navigate(item.to),
      })),
      ...people.filter((item) => item.label.toLowerCase().includes(query)).slice(0, 10),
    ]
    return filtered.slice(0, 12)
  }, [paletteQuery, bundle, navigate])

  useEffect(() => {
    if (!paletteOpen) return
    setPaletteQuery('')
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen])

  /* ---------------- render ---------------- */

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
  const selectedIsConflicted = selected ? conflicted.has(selected.id) : false

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
                  setFilter({ scope: event.target.value as Scope, id: null })
                }
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
                <label className="field__label" htmlFor="tt-target">
                  {filter.scope === 'class'
                    ? 'Class'
                    : filter.scope === 'teacher'
                      ? 'Teacher'
                      : filter.scope === 'room'
                        ? 'Room'
                        : 'Subject'}
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
              {version.quality?.overall !== undefined && (
                <Badge>Quality {version.quality.overall}/100</Badge>
              )}
            </div>
          </div>

          <div className="toolbar timetable-toolbar timetable-toolbar--secondary">
            <div className="day-chips" role="group" aria-label="Filter by day">
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
                  onClick={() => setDayFilter((current) => (current === day.index ? null : day.index))}
                >
                  {day.name.slice(0, 3)}
                </button>
              ))}
            </div>

            <div className="toolbar__spacer" />

            <div className="toolbar__group" aria-label="Zoom and density">
              <button
                type="button"
                className="icon-button icon-button--subtle"
                title="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                disabled={zoom <= 0.75}
              >
                <MinusIcon width={16} height={16} />
              </button>
              <span className="toolbar__zoom-label">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="icon-button icon-button--subtle"
                title="Zoom in"
                onClick={() => setZoom((z) => Math.min(1.25, Number((z + 0.25).toFixed(2))))}
                disabled={zoom >= 1.25}
              >
                <PlusIcon width={16} height={16} />
              </button>
              <button
                type="button"
                className={`button button--ghost button--sm ${dense ? 'button--active' : ''}`}
                onClick={() => setDense((d) => !d)}
                title="Toggle compact density"
              >
                Compact
              </button>
            </div>

            <div className="toolbar__group" aria-label="Export">
              <button type="button" className="button button--ghost button--sm" onClick={() => window.print()} title="Print or save as PDF">
                <PrintIcon width={14} height={14} /> Print
              </button>
              <button type="button" className="button button--ghost button--sm" onClick={exportCsv} title="Download CSV">
                CSV
              </button>
              <button type="button" className="button button--ghost button--sm" onClick={exportIcs} title="Download calendar file (.ics)">
                Calendar
              </button>
              <button type="button" className="button button--ghost button--sm" onClick={exportPng} title="Download PNG image">
                <DownloadIcon width={14} height={14} /> PNG
              </button>
            </div>
          </div>

          {readOnly && (
            <Alert tone="info" title="Published timetable">
              Published versions are read-only so everyone sees the same schedule. Restore it as a
              draft from <Link to="/versions">Versions</Link> to make changes.
            </Alert>
          )}

          {!readOnly && bundle!.unassigned.length > 0 && (
            <div className="card section unassigned">
              <div className="unassigned__head">
                <h2 className="section__title">Unassigned lessons</h2>
                <p className="form__note">
                  Drag a chip onto the grid to schedule it. {bundle!.unassigned.length} remaining.
                </p>
              </div>
              <ul className="unassigned__list">
                {bundle!.unassigned.map((item) => (
                  <li key={item.requirement_id}>
                    <button
                      type="button"
                      className="unassigned-chip"
                      draggable
                      style={{ '--subject-colour': item.subject_colour } as React.CSSProperties}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'copy'
                        event.dataTransfer.setData(UNASSIGNED_DRAG_TYPE, String(item.requirement_id))
                        event.dataTransfer.setData('text/plain', `${item.subject_name} ${item.class_name}`)
                      }}
                      title={`${item.subject_name} for ${item.class_name} — ${item.remaining} of ${item.periods_per_week} left to schedule`}
                    >
                      <span className="unassigned-chip__subject">{item.subject_name}</span>
                      <span className="unassigned-chip__class">{item.class_name}</span>
                      {item.teacher_name && (
                        <span className="unassigned-chip__meta">{item.teacher_name}</span>
                      )}
                      <span className="unassigned-chip__count">
                        {item.remaining}/{item.periods_per_week}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="workspace">
            <div className="card section workspace__grid">
              <TimetableGrid
                days={days}
                periods={bundle!.calendar.periods}
                lessons={visible}
                meta={meta}
                view={filter.scope === 'class' ? 'class' : filter.scope === 'teacher' ? 'teacher' : 'whole-school'}
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
                      <span
                        className="subject-swatch"
                        style={{ background: meta.subjects.get(selected.subject_id)?.colour ?? '#0F2A47' }}
                        aria-hidden="true"
                      />
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

                  {selectedIsConflicted && (
                    <Alert tone="error" title="This lesson has a conflict">
                      See the conflicts list below for the exact reason.
                    </Alert>
                  )}
                  {selected.is_locked && (
                    <Alert tone="info" title="Locked">
                      This lesson stays in its slot when the timetable is regenerated.
                    </Alert>
                  )}

                  <dl className="detail-list">
                    <div>
                      <dt>Slot</dt>
                      <dd>
                        {days.find((d) => d.index === selected.day_index)?.name},{' '}
                        {
                          bundle!.calendar.periods.find((p) => p.index === selected.period_index)
                            ?.name
                        }
                        {selected.duration > 1 && ` · ${selected.duration} periods`}
                      </dd>
                    </div>
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
                        {selected.room_id ? (meta.rooms.get(selected.room_id)?.name ?? '—') : 'No room'}
                      </dd>
                    </div>
                  </dl>

                  {readOnly ? (
                    <p className="form__note">Published timetables are read-only.</p>
                  ) : (
                    <>
                      <h3 className="panel__subtitle">Edit lesson</h3>

                      <div className="field field--inline">
                        <label className="field__label" htmlFor="edit-day">
                          Day
                        </label>
                        <select
                          id="edit-day"
                          className="input input--select"
                          value={selected.day_index}
                          onChange={(event) =>
                            handlePatch(selected, { day_index: Number(event.target.value) }, 'Lesson moved.')
                          }
                        >
                          {days.map((d) => (
                            <option key={d.index} value={d.index}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field field--inline">
                        <label className="field__label" htmlFor="edit-period">
                          Period
                        </label>
                        <select
                          id="edit-period"
                          className="input input--select"
                          value={selected.period_index}
                          onChange={(event) =>
                            handlePatch(selected, { period_index: Number(event.target.value) }, 'Lesson moved.')
                          }
                        >
                          {bundle!.calendar.periods
                            .filter((p) => p.is_teaching)
                            .map((p) => (
                              <option key={p.index} value={p.index}>
                                {p.name} ({p.start_time})
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="field field--inline">
                        <label className="field__label" htmlFor="edit-duration">
                          Duration
                        </label>
                        <select
                          id="edit-duration"
                          className="input input--select"
                          value={selected.duration}
                          onChange={(event) =>
                            handlePatch(selected, { duration: Number(event.target.value) }, 'Duration updated.')
                          }
                        >
                          {[1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>
                              {n} {n === 1 ? 'period' : 'periods'}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field field--inline">
                        <label className="field__label" htmlFor="edit-teacher">
                          Teacher
                        </label>
                        <select
                          id="edit-teacher"
                          className="input input--select"
                          value={selected.teacher_id ?? ''}
                          onChange={(event) =>
                            handlePatch(
                              selected,
                              { teacher_id: event.target.value ? Number(event.target.value) : null },
                              'Teacher updated.',
                            )
                          }
                        >
                          <option value="">Unassigned</option>
                          {bundle!.teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field field--inline">
                        <label className="field__label" htmlFor="edit-room">
                          Room
                        </label>
                        <select
                          id="edit-room"
                          className="input input--select"
                          value={selected.room_id ?? ''}
                          onChange={(event) =>
                            handlePatch(
                              selected,
                              { room_id: event.target.value ? Number(event.target.value) : null },
                              'Room updated.',
                            )
                          }
                        >
                          <option value="">No room</option>
                          {bundle!.rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="panel__actions">
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          onClick={() =>
                            handlePatch(
                              selected,
                              { is_locked: !selected.is_locked },
                              selected.is_locked ? 'Lesson unlocked.' : 'Lesson locked.',
                            )
                          }
                        >
                          {selected.is_locked ? <UnlockIcon width={14} height={14} /> : <LockIcon width={14} height={14} />}
                          {selected.is_locked ? 'Unlock' : 'Lock'}
                        </button>
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          onClick={handleDuplicate}
                          disabled={busy}
                        >
                          <DuplicateIcon width={14} height={14} /> Duplicate
                        </button>
                        <button
                          type="button"
                          className="button button--danger button--sm"
                          onClick={() => setConfirmingDelete(selected)}
                          disabled={busy}
                        >
                          <TrashIcon width={14} height={14} /> Delete
                        </button>
                      </div>

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
                            <AlertIcon width={16} height={16} /> Why it cannot go there
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
                  <div className="unassigned__head">
                    <h2 className="section__title">Conflicts</h2>
                    {!readOnly && (
                      <button type="button" className="button button--ghost button--sm" onClick={handleAssignRooms}>
                        Assign rooms
                      </button>
                    )}
                  </div>
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
                      <Link className="link" to="/analytics">
                        See the full analysis
                      </Link>
                      .
                    </p>
                  )}
                </div>
              )}
            </aside>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmingDelete !== null}
        title="Delete this lesson?"
        description={
          confirmingDelete
            ? `${meta.subjects.get(confirmingDelete.subject_id)?.name ?? 'This lesson'} for ${
                meta.classes.get(confirmingDelete.class_id)?.name ?? 'its class'
              } will be removed from the timetable. Its requirement period becomes unscheduled and can be placed again from the unassigned panel.`
            : ''
        }
        confirmLabel="Delete lesson"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(null)}
      />

      {paletteOpen && (
        <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
          <div className="palette__panel">
            <input
              className="input palette__input"
              placeholder="Search pages, teachers, classes, rooms…"
              value={paletteQuery}
              onChange={(event) => setPaletteQuery(event.target.value)}
              autoFocus
            />
            <ul className="palette__list">
              {paletteItems.length === 0 && <li className="palette__empty">No matches</li>}
              {paletteItems.map((item, index) => (
                <li key={index}>
                  <button
                    type="button"
                    className="palette__item"
                    onClick={() => {
                      item.action()
                      setPaletteOpen(false)
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            <p className="palette__hint">Type to filter · Enter to open · Esc to close</p>
          </div>
        </div>
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
