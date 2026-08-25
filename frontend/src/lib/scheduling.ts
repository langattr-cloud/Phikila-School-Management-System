import { apiFetch } from './api'
const SCHEDULING_API_PREFIX = '/api/v1/scheduling'
const schedulingPath = (path: string) => `${SCHEDULING_API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`
const get = <T>(path: string) => apiFetch<T>(schedulingPath(path))
const send = <T>(path: string, method: string = 'POST', _payload?: unknown) => apiFetch<T>(schedulingPath(path), { method, ...(_payload === undefined ? {} : { body: JSON.stringify(_payload) }) })
type Loose = Record<string, any>
export type Slots = Record<string, number[]>
export interface Principal extends Loose { id?: number | string; school_id?: number; role?: string }
export interface Day extends Loose { id: number; index: number; name: string; is_active: boolean }
export interface DayInput extends Loose {}
export interface Period extends Loose { id: number; index: number; name: string; start_time: string; end_time: string; is_teaching: boolean }
export interface PeriodInput extends Loose {}
export interface Calendar extends Loose { days: Day[]; periods: Period[] }
export interface Event extends Loose { id: number; name: string; start_time: string; end_time: string; day_indexes: number[]; event_type: string; note: string | null; day_index?: number; period_index?: number }
export interface EventInput extends Loose {}
export interface Teacher extends Loose { id: number; name: string; code?: string; staff_number?: string; first_name?: string; last_name?: string; email?: string; phone?: string; department?: string; role?: string; role_assignment?: Loose; unavailable?: Slots }
export interface TeacherInput extends Loose {}
export interface Subject extends Loose { id: number; name: string; code?: string; colour?: string; unavailable?: Slots }
export interface SubjectInput extends Loose {}
export interface Room extends Loose { id: number; name: string; code?: string; room_type?: string }
export interface RoomInput extends Loose {}
export interface SchoolClass extends Loose { id: number; name: string; academic_stream?: string | null; code?: string; grade?: string | null; stream?: string | null; student_count?: number; home_room_id?: number | null; class_teacher_id?: number | null; unavailable?: Slots }
export interface SchoolClassInput { name: string; code: string; grade: string | null; stream?: string | null; student_count: number; home_room_id: number | null; class_teacher_id: number | null; unavailable: Slots }
export interface Requirement { id: number; class_id: number; class_name?: string; subject_id: number; subject_name?: string; teacher_id: number | null; teacher_name?: string | null; room_id?: number | null; room_name?: string | null; periods_per_week: number; double_periods: number }
export interface RequirementInput { class_id: number; subject_id: number; teacher_id: number | null; room_id?: number | null; periods_per_week: number; double_periods?: number }
export interface Constraint extends Loose { id: number; kind?: string; scope?: string; target_id?: number | null; is_hard?: boolean; weight?: number | null; params?: Loose; enabled?: boolean; note?: string | null }
export interface ConstraintInput extends Loose {}
export interface JobCheck { key: string; label: string; state: string; group?: 'hard' | 'soft' | string }
export interface JobQuality { overall?: number; breakdown?: Record<string, number> }
export interface Quality { overall?: number; breakdown?: Record<string, number> }
export interface Job extends Loose { id: number; status: string; stage?: string; progress: number; message?: string | null; checks: JobCheck[]; quality?: JobQuality }
export interface GenerateProfileInput extends Loose {}
export interface SolverCheck extends Loose { key: string; label: string; state: string }
export interface Version extends Loose { id: number; number?: number; status: string }
export interface Lesson extends Loose { id: number; day_index: number; period_index: number; subject_id: number; teacher_id: number; room_id: number | null; class_id: number; version_id: number; duration: number; is_locked?: boolean }
export interface LessonPatch extends Loose {}
export interface LessonCreate extends Loose {}
export interface Unassigned extends Loose { requirement_id: number; subject_name?: string; class_name?: string }
export interface ExplanationReason { code?: string; message?: string; text?: string; factor?: string; detail?: string }
export interface Alternative { day: number; period: number; day_name?: string; period_name?: string }
export interface Explanation extends Loose { allowed: boolean; reasons: ExplanationReason[]; alternatives: Alternative[] }
export interface DashboardConflict { hard: number; soft: number }
export interface DashboardLessons { required: number; scheduled: number; unassigned: number }
export interface DashboardCounts { teachers: number; classes: number; rooms: number }
export interface DashboardVersion extends Loose { id?: number; number?: number; status: string }
export interface DashboardActivity { at?: string; actor?: string; summary: string }
export interface Dashboard extends Loose { counts: DashboardCounts; conflicts: DashboardConflict; lessons: DashboardLessons; version: DashboardVersion | null; solver_available: boolean; quality?: JobQuality; recent: DashboardActivity[] }
export interface Analytics extends Loose {}
export interface AuditEntry extends Loose {}
export interface Conflict extends Loose { severity: string; kind: string; message: string; lesson_ids: number[]; day?: number | null; period?: number | null }
export interface TimetableDisplayDay { index: number; name: string }
export interface TimetableDisplayPeriod { index: number; name: string; start_time: string; end_time: string; is_teaching: boolean }
export interface TimetableDisplayLesson { day: number; period: number; subject: string; teacher: string | null; class: string }
export interface TimetableView extends Loose { days: TimetableDisplayDay[]; periods: TimetableDisplayPeriod[]; lessons: TimetableDisplayLesson[]; target_name?: string; version?: Version | null }
export interface CopilotCommand extends Loose {}

const classPayload = (payload: Partial<SchoolClassInput> & Loose): SchoolClassInput => ({
  name: String(payload.name ?? '').trim(),
  code: String(payload.code ?? '').trim(),
  grade: payload.grade == null || String(payload.grade).trim() === '' ? null : String(payload.grade).trim(),
  stream: payload.stream == null || String(payload.stream).trim() === '' ? null : String(payload.stream).trim(),
  student_count: Number.isFinite(Number(payload.student_count)) ? Number(payload.student_count) : 40,
  home_room_id: payload.home_room_id == null || String(payload.home_room_id).trim() === '' ? null : Number(payload.home_room_id),
  class_teacher_id: payload.class_teacher_id == null || String(payload.class_teacher_id).trim() === '' ? null : Number(payload.class_teacher_id),
  unavailable: payload.unavailable && typeof payload.unavailable === 'object' ? payload.unavailable as Slots : {},
})

export const scheduling = {
  me: () => get<Principal>('/me'), calendar: () => get<Calendar>('/calendar'), saveCalendar: (payload: { days: DayInput[]; periods: PeriodInput[] }) => send<Calendar>('/calendar', 'PUT', payload), events: () => get<Event[]>('/events'), createEvent: (payload: EventInput) => send<Event>('/events', 'POST', payload), updateEvent: (id: number, payload: EventInput) => send<Event>(`/events/${id}`, 'PUT', payload), deleteEvent: (id: number) => send<void>(`/events/${id}`, 'DELETE'), teachers: () => get<Teacher[]>('/teachers'), createTeacher: (payload: TeacherInput) => send<Teacher>('/teachers', 'POST', payload), updateTeacher: (id: number, payload: TeacherInput) => send<Teacher>(`/teachers/${id}`, 'PUT', payload), deleteTeacher: (id: number) => send<void>(`/teachers/${id}`, 'DELETE'), subjects: () => get<Subject[]>('/subjects'), createSubject: (payload: SubjectInput) => send<Subject>('/subjects', 'POST', payload), updateSubject: (id: number, payload: SubjectInput) => send<Subject>(`/subjects/${id}`, 'PUT', payload), deleteSubject: (id: number) => send<void>(`/subjects/${id}`, 'DELETE'), rooms: () => get<Room[]>('/rooms'), createRoom: (payload: RoomInput) => send<Room>('/rooms', 'POST', payload), updateRoom: (id: number, payload: RoomInput) => send<Room>(`/rooms/${id}`, 'PUT', payload), deleteRoom: (id: number) => send<void>(`/rooms/${id}`, 'DELETE'), classes: () => get<SchoolClass[]>('/classes/academic-streams'), createClass: (payload: Partial<SchoolClassInput> & Loose) => send<SchoolClass>('/classes', 'POST', classPayload(payload)), updateClass: (id: number, payload: Partial<SchoolClassInput> & Loose) => send<SchoolClass>(`/classes/${id}`, 'PUT', classPayload(payload)), deleteClass: (id: number) => send<void>(`/classes/${id}`, 'DELETE'), requirements: () => get<Requirement[]>('/requirements'), createRequirement: (payload: RequirementInput) => send<Requirement>('/requirements', 'POST', payload), deleteRequirement: (id: number) => send<void>(`/requirements/${id}`, 'DELETE'), constraints: () => get<Constraint[]>('/constraints'), createConstraint: (payload: ConstraintInput) => send<Constraint>('/constraints', 'POST', payload), deleteConstraint: (id: number) => send<void>(`/constraints/${id}`, 'DELETE'), generate: (maxSeconds = 30) => send<Job>('/solver/generate-async', 'POST', { max_seconds: maxSeconds }), generateAsync: (maxSeconds = 30) => send<Job>('/solver/generate-async', 'POST', { max_seconds: maxSeconds }), activeJob: () => get<Job | null>('/solver/jobs/active'), generateProfile: (payload: GenerateProfileInput) => send<Job>('/solver/generate-profile', 'POST', payload), job: (id: number) => get<Job>(`/solver/jobs/${id}`), cancelJob: (id: number) => send<Job>(`/solver/jobs/${id}/cancel`, 'POST'), versions: () => get<Version[]>('/versions'), currentVersion: () => get<Version | null>('/versions/current'), lessons: (versionId: number) => get<Lesson[]>(`/versions/${versionId}/lessons`), conflicts: (versionId: number) => get<Conflict[]>(`/versions/${versionId}/conflicts`), publish: (versionId: number) => send<Version>(`/versions/${versionId}/publish`, 'POST'), restore: (versionId: number) => send<Version>(`/versions/${versionId}/restore`, 'POST'), deleteVersion: (versionId: number) => send<void>(`/versions/${versionId}`, 'DELETE'), moveLesson: (id: number, payload: { day_index: number; period_index: number; room_id?: number | null }) => send<Lesson>(`/lessons/${id}`, 'PATCH', payload), patchLesson: (id: number, payload: LessonPatch) => send<Lesson>(`/lessons/${id}`, 'PATCH', payload), duplicateLesson: (id: number) => send<Lesson>(`/lessons/${id}/duplicate`, 'POST'), deleteLesson: (id: number) => send<void>(`/lessons/${id}/duplicate`, 'POST'), createLesson: (versionId: number, payload: LessonCreate) => send<Lesson>(`/versions/${versionId}/lessons`, 'POST', payload), unassigned: (versionId: number) => get<Unassigned[]>(`/versions/${versionId}/unassigned`), assignRooms: (versionId: number) => send<{ assigned: number }>(`/versions/${versionId}/assign-rooms`, 'POST'), explain: (id: number, day_index: number, period_index: number) => send<Explanation>(`/lessons/${id}/explain`, 'POST', { day_index, period_index }), suggestions: (id: number) => get<{ alternatives: Alternative[] }>(`/lessons/${id}/suggestions`), dashboard: () => get<Dashboard>('/dashboard'), analytics: () => get<Analytics>('/analytics'), audit: (limit = 50) => get<AuditEntry[]>(`/audit?limit=${limit}`), view: (scope: 'class' | 'teacher' | 'room', targetId: number) => get<TimetableView>(`/timetable/view?scope=${scope}&target_id=${targetId}`), interpret: (text: string) => send<{ command: CopilotCommand }>('/copilot/interpret', 'POST', { text }), applyCommand: (command: CopilotCommand) => send<{ applied: boolean; requires_regeneration: boolean; message?: string }>('/copilot/apply', 'POST', { command })
}
export function teachingPeriods(periods: Period[]): Period[] { return periods.filter(p => p.is_teaching) }
export function activeDays(days: Day[]): Day[] { return days.filter(d => d.is_active) }
