import { apiFetch } from './api'

const BASE = '/api/v1/scheduling'

/* ------------------------------------------------------------------ types */
export type Role = 'viewer' | 'student' | 'teacher' | 'scheduler' | 'admin' | 'super_admin'

export type Principal = {
  user_id: string
  email: string | null
  school_id: number
  role: Role
  teacher_id: number | null
  class_id: number | null
  solver_available: boolean
}

export type Slots = Record<string, number[]>

export type Day = { id: number; index: number; name: string; is_active: boolean }
export type Period = {
  id: number
  index: number
  name: string
  start_time: string
  end_time: string
  is_teaching: boolean
}
export type Calendar = { days: Day[]; periods: Period[] }

export type Teacher = {
  id: number
  name: string
  code: string
  email: string | null
  department: string | null
  max_lessons_per_day: number
  max_consecutive: number
  workload_target: number | null
  unavailable: Slots
  is_active: boolean
}

export type Subject = {
  id: number
  name: string
  code: string
  colour: string
  prefers_morning: boolean
  prefers_double: boolean
  spread_across_week: boolean
  required_room_type: string | null
}

export type Room = {
  id: number
  name: string
  code: string
  building: string | null
  capacity: number
  room_type: string
  is_accessible: boolean
  unavailable: Slots
}

export type SchoolClass = {
  id: number
  name: string
  code: string
  grade: string | null
  student_count: number
  home_room_id: number | null
  unavailable: Slots
}

export type Requirement = {
  id: number
  class_id: number
  subject_id: number
  teacher_id: number | null
  room_id: number | null
  periods_per_week: number
  double_periods: number
  class_name: string | null
  subject_name: string | null
  teacher_name: string | null
  room_name: string | null
}

export type SolverCheck = {
  key: string
  label: string
  group: 'hard' | 'soft'
  state: 'pending' | 'passed' | 'warning' | 'failed'
}

export type Quality = {
  overall: number
  breakdown: Record<string, number>
}

export type Job = {
  id: number
  status: 'queued' | 'running' | 'optimizing' | 'validating' | 'completed' | 'failed' | 'cancelled'
  progress: number
  stage: string | null
  checks: SolverCheck[]
  result_version_id: number | null
  quality: Partial<Quality>
  message: string | null
}

export type Version = {
  id: number
  number: number
  label: string | null
  status: 'draft' | 'published' | 'archived'
  quality: Partial<Quality>
  stats: Record<string, number | string>
  created_by: string | null
  created_at: string | null
  published_at: string | null
}

export type Lesson = {
  id: number
  version_id: number
  requirement_id: number | null
  class_id: number
  subject_id: number
  teacher_id: number | null
  room_id: number | null
  day_index: number
  period_index: number
  duration: number
  is_locked: boolean
}

export type LessonPatch = {
  day_index?: number
  period_index?: number
  duration?: number
  teacher_id?: number | null
  class_id?: number | null
  subject_id?: number | null
  room_id?: number | null
  is_locked?: boolean
}

export type Unassigned = {
  requirement_id: number
  subject_id: number
  subject_name: string
  subject_colour: string
  class_id: number
  class_name: string
  teacher_id: number | null
  teacher_name: string | null
  room_id: number | null
  room_name: string | null
  periods_per_week: number
  placed: number
  remaining: number
  requires_double: boolean
}

export type Conflict = {
  severity: 'hard' | 'soft'
  kind: string
  message: string
  lesson_ids: number[]
  day: number | null
  period: number | null
}

export type Alternative = {
  day: number
  period: number
  day_name: string
  period_name: string
}

export type Explanation = {
  allowed: boolean
  reasons: { factor: string; detail: string }[]
  alternatives: Alternative[]
}

export type Dashboard = {
  counts: { teachers: number; subjects: number; classes: number; rooms: number }
  lessons: { required: number; scheduled: number; unassigned: number }
  conflicts: { hard: number; soft: number }
  version: Version | null
  quality: Partial<Quality>
  recent: { at: string | null; actor: string | null; action: string; summary: string }[]
  solver_available: boolean
}

export type Analytics = {
  teachers: {
    id: number
    name: string
    lessons: number
    free_periods: number
    gaps: number
    target: number | null
    utilisation: number
  }[]
  rooms: { id: number; name: string; type: string; used: number; utilisation: number }[]
  classes: {
    id: number
    name: string
    lessons: number
    free_periods: number
    busiest_day: number
    quietest_day: number
  }[]
  quality: Partial<Quality>
}

export type AuditEntry = {
  id: number
  at: string | null
  actor: string | null
  action: string
  entity: string | null
  entity_id: number | null
  summary: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export type TimetableView = {
  version: { id: number; number: number; status: string } | null
  scope?: 'class' | 'teacher' | 'room'
  target_id?: number
  target_name?: string | null
  days: { index: number; name: string }[]
  periods: Period[]
  lessons: {
    id: number
    day: number
    period: number
    subject: string
    colour: string
    class: string | null
    teacher: string | null
    room: string | null
  }[]
}

export type CopilotCommand = {
  action: string
  target: string | null
  target_kind: string | null
  target_id: number | null
  day: number | null
  day_name: string | null
  periods: number[]
  period_names: string[]
  priority: 'soft' | 'hard'
  weight: number | null
  weight_key: string | null
  confidence: number
  explanation: string
  source: string
  needs_confirmation: boolean
  params?: Record<string, number | string | null>
}

/* ------------------------------------------------------------------ client */
const get = <T,>(path: string) => apiFetch<T>(`${BASE}${path}`)
const send = <T,>(path: string, method: string, body?: unknown) =>
  apiFetch<T>(`${BASE}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

export const scheduling = {
  me: () => get<Principal>('/me'),

  calendar: () => get<Calendar>('/calendar'),
  saveCalendar: (payload: { days: Omit<Day, 'id'>[]; periods: Omit<Period, 'id'>[] }) =>
    send<Calendar>('/calendar', 'PUT', payload),

  teachers: () => get<Teacher[]>('/teachers'),
  createTeacher: (payload: Partial<Teacher>) => send<Teacher>('/teachers', 'POST', payload),
  updateTeacher: (id: number, payload: Partial<Teacher>) =>
    send<Teacher>(`/teachers/${id}`, 'PUT', payload),
  deleteTeacher: (id: number) => send<void>(`/teachers/${id}`, 'DELETE'),

  subjects: () => get<Subject[]>('/subjects'),
  createSubject: (payload: Partial<Subject>) => send<Subject>('/subjects', 'POST', payload),
  updateSubject: (id: number, payload: Partial<Subject>) =>
    send<Subject>(`/subjects/${id}`, 'PUT', payload),
  deleteSubject: (id: number) => send<void>(`/subjects/${id}`, 'DELETE'),

  rooms: () => get<Room[]>('/rooms'),
  createRoom: (payload: Partial<Room>) => send<Room>('/rooms', 'POST', payload),
  updateRoom: (id: number, payload: Partial<Room>) => send<Room>(`/rooms/${id}`, 'PUT', payload),
  deleteRoom: (id: number) => send<void>(`/rooms/${id}`, 'DELETE'),

  classes: () => get<SchoolClass[]>('/classes'),
  createClass: (payload: Partial<SchoolClass>) => send<SchoolClass>('/classes', 'POST', payload),
  updateClass: (id: number, payload: Partial<SchoolClass>) =>
    send<SchoolClass>(`/classes/${id}`, 'PUT', payload),
  deleteClass: (id: number) => send<void>(`/classes/${id}`, 'DELETE'),

  requirements: () => get<Requirement[]>('/requirements'),
  createRequirement: (payload: Partial<Requirement>) =>
    send<Requirement>('/requirements', 'POST', payload),
  deleteRequirement: (id: number) => send<void>(`/requirements/${id}`, 'DELETE'),

  constraints: () => get<Record<string, unknown>[]>('/constraints'),
  createConstraint: (payload: Record<string, unknown>) =>
    send<Record<string, unknown>>('/constraints', 'POST', payload),
  deleteConstraint: (id: number) => send<void>(`/constraints/${id}`, 'DELETE'),

  generate: (maxSeconds = 30) => send<Job>('/solver/generate', 'POST', { max_seconds: maxSeconds }),
  job: (id: number) => get<Job>(`/solver/jobs/${id}`),
  cancelJob: (id: number) => send<Job>(`/solver/jobs/${id}/cancel`, 'POST'),

  versions: () => get<Version[]>('/versions'),
  currentVersion: () => get<Version | null>('/versions/current'),
  lessons: (versionId: number) => get<Lesson[]>(`/versions/${versionId}/lessons`),
  conflicts: (versionId: number) => get<Conflict[]>(`/versions/${versionId}/conflicts`),
  publish: (versionId: number) => send<Version>(`/versions/${versionId}/publish`, 'POST'),
  restore: (versionId: number) => send<Version>(`/versions/${versionId}/restore`, 'POST'),
  deleteVersion: (versionId: number) => send<void>(`/versions/${versionId}`, 'DELETE'),

  moveLesson: (id: number, payload: { day_index: number; period_index: number; room_id?: number }) =>
    send<Lesson>(`/lessons/${id}`, 'PATCH', payload),
  patchLesson: (id: number, payload: LessonPatch) => send<Lesson>(`/lessons/${id}`, 'PATCH', payload),
  duplicateLesson: (id: number) => send<Lesson>(`/lessons/${id}/duplicate`, 'POST'),
  deleteLesson: (id: number) => send<void>(`/lessons/${id}`, 'DELETE'),
  createLesson: (
    versionId: number,
    payload: { requirement_id: number; day_index: number; period_index: number; duration?: number },
  ) => send<Lesson>(`/versions/${versionId}/lessons`, 'POST', payload),
  unassigned: (versionId: number) => get<Unassigned[]>(`/versions/${versionId}/unassigned`),
  assignRooms: (versionId: number) =>
    send<{ assigned: number }>(`/versions/${versionId}/assign-rooms`, 'POST'),
  explain: (id: number, day_index: number, period_index: number) =>
    send<Explanation>(`/lessons/${id}/explain`, 'POST', { day_index, period_index }),
  suggestions: (id: number) => get<{ alternatives: Alternative[] }>(`/lessons/${id}/suggestions`),

  dashboard: () => get<Dashboard>('/dashboard'),
  analytics: () => get<Analytics>('/analytics'),
  audit: (limit = 50) => get<AuditEntry[]>(`/audit?limit=${limit}`),

  view: (scope: 'class' | 'teacher' | 'room', targetId: number) =>
    get<TimetableView>(`/timetable/view?scope=${scope}&target_id=${targetId}`),

  interpret: (text: string) =>
    send<{ command: CopilotCommand }>('/copilot/interpret', 'POST', { text }),
  applyCommand: (command: CopilotCommand) =>
    send<{ applied: boolean; requires_regeneration: boolean; message?: string }>(
      '/copilot/apply',
      'POST',
      { command },
    ),
}

/* ------------------------------------------------------- derived helpers */
export function teachingPeriods(periods: Period[]): Period[] {
  return periods.filter((p) => p.is_teaching)
}

export function activeDays(days: Day[]): Day[] {
  return days.filter((d) => d.is_active)
}

/** Index lessons by "day:period" for O(1) grid lookup. */
export function indexLessons<T extends { day_index: number; period_index: number }>(
  lessons: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const lesson of lessons) {
    const key = `${lesson.day_index}:${lesson.period_index}`
    const bucket = map.get(key)
    if (bucket) bucket.push(lesson)
    else map.set(key, [lesson])
  }
  return map
}
