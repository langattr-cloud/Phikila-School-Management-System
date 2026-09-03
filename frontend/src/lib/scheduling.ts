import { apiFetch } from './api'
const SCHEDULING_API_PREFIX = '/api/v1/scheduling'
const schedulingPath = (path: string) => `${SCHEDULING_API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`
const get = <T>(path: string) => apiFetch<T>(schedulingPath(path))
const send = <T>(path: string, method = 'POST', body?: unknown) => apiFetch<T>(schedulingPath(path), { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
type Loose = Record<string, any>
export type Slots = Record<string, number[]>
export interface Principal extends Loose { id?: number | string; school_id?: number; role?: string; teacher_id?: number | null; class_id?: number | null }
export interface Day extends Loose { id: number; index: number; name: string; short_form: string; date_value?: string | null; is_active: boolean }
export type DayInput = Pick<Day, 'index'|'name'|'short_form'|'date_value'|'is_active'>
export interface Period extends Loose { id: number; index: number; name: string; short_form: string; start_time: string; end_time: string; is_teaching: boolean }
export type PeriodInput = Pick<Period, 'index'|'name'|'short_form'|'start_time'|'end_time'|'is_teaching'>
export interface Calendar extends Loose { days: Day[]; periods: Period[]; display_mode?: 'day'|'date' }
export interface Event extends Loose { id: number; name: string; start_time: string; end_time: string; day_indexes: number[]; event_type: string; note: string | null; day_index?: number; period_index?: number }
export interface EventInput extends Loose {}
export interface Teacher extends Loose { id: number; name: string; code?: string; staff_number?: string; first_name?: string; last_name?: string; email?: string; phone?: string; department?: string; role?: string; role_assignment?: Loose; unavailable?: Slots }
export interface TeacherInput extends Loose {}
export interface Subject extends Loose { id: number; name: string; code?: string; colour?: string; unavailable?: Slots }
export interface SubjectInput extends Loose {}
export interface Room extends Loose { id: number; name: string; code?: string; room_type?: string }
export interface RoomInput extends Loose {}
export interface SchoolClass extends Loose { id: number; name: string; code: string; student_count?: number; home_room_id?: number | null; class_teacher_id?: number | null; level_id?: number | null; academic_year_id?: number | null; unavailable?: Slots }
export interface SchoolClassInput extends Loose { name: string; code: string; student_count?: number; home_room_id?: number | null; class_teacher_id?: number | null; unavailable?: Slots; level_id?: number | null; academic_year_id?: number | null }
export interface Requirement extends Loose { id: number; class_id: number; class_name?: string; subject_id: number; subject_name?: string; teacher_id: number | null; teacher_name?: string | null; room_id?: number | null; room_name?: string | null; periods_per_week: number; double_periods?: number }
export interface RequirementInput extends Loose { class_id: number; subject_id: number; teacher_id: number | null; room_id?: number | null; periods_per_week: number; double_periods?: number }
export interface Constraint extends Loose { id: number; kind?: string; scope?: string; target_id?: number | null; is_hard?: boolean; weight?: number | null; params?: Loose; enabled?: boolean; note?: string | null }
export interface ConstraintInput extends Loose {}
export interface Conflict extends Loose { severity: string; kind: string; message: string; lesson_ids: number[]; day?: number | null; period?: number | null }
export interface Quality { overall?: number; breakdown?: Record<string, number> }
export interface Alternative extends Loose {}
export interface Explanation extends Loose {}
export interface Unassigned extends Loose {}
export interface CopilotCommand extends Loose {}
export interface Dashboard extends Loose {}
export interface Analytics extends Loose {}
export interface TimetableType { id: number; name: string; code: string; display_mode: 'day'|'date'; day_indexes: number[]; period_indexes: number[]; is_active: boolean; is_system: boolean }
export interface GenerateIn extends Loose { max_seconds?: number; timetable_type_id?: number | null; class_ids?: number[] | null; teacher_ids?: number[] | null; period_indexes?: number[] | null }
export interface GenerateProfileInput extends GenerateIn { label?: string; day_indexes?: number[] | null; day_names?: Record<number,string> | null }
export interface JobCheck { key: string; label: string; state: string; group?: 'hard'|'soft'|string }
export interface JobQuality extends Quality {}
export interface Job extends Loose { id: number; status: string; stage?: string; progress: number; message?: string|null; checks: JobCheck[]; quality?: JobQuality; result_version_id?: number|null }
export interface Version extends Loose { id: number; number?: number; status: string; effective_from?: string|null; published_at?: string|null; timetable_type_id?: number|null; timetable_type_name?: string|null; display_mode?: 'day'|'date'; day_indexes?: number[]; day_names?: string[]; period_indexes?: number[] }
export interface Lesson extends Loose { id:number; day_index:number; period_index:number; subject_id:number; teacher_id:number; room_id:number|null; class_id:number; version_id:number; duration:number; is_locked?:boolean }
export interface TimetableAmendment { id:number; title:string; message:string; at:string|null; actor:string|null }
export interface TimetableDisplayDay { index:number; name:string }
export interface TimetableDisplayPeriod { index:number; name:string; start_time:string; end_time:string; is_teaching:boolean }
export interface TimetableDisplayLesson { day:number; period:number; subject:string; subject_colour?:string; teacher:string|null; class:string }
export interface TimetableView extends Loose { days:TimetableDisplayDay[]; periods:TimetableDisplayPeriod[]; lessons:TimetableDisplayLesson[]; target_name?:string; version?:Version|null; timetable_type?:TimetableType|null }
export const scheduling = {
 me:()=>get<Principal>('/me'), calendar:()=>get<Calendar>('/calendar'), saveCalendar:(p:{days:DayInput[];periods:PeriodInput[];display_mode:'day'|'date'})=>send<Calendar>('/calendar','PUT',p),
 events:()=>get<Event[]>('/events'), createEvent:(p:EventInput)=>send<Event>('/events','POST',p), updateEvent:(id:number,p:EventInput)=>send<Event>(`/events/${id}`,'PUT',p), deleteEvent:(id:number)=>send<void>(`/events/${id}`,'DELETE'),
 teachers:()=>get<Teacher[]>('/teachers'), createTeacher:(p:TeacherInput)=>send<Teacher>('/teachers','POST',p), updateTeacher:(id:number,p:TeacherInput)=>send<Teacher>(`/teachers/${id}`,'PUT',p), deleteTeacher:(id:number)=>send<void>(`/teachers/${id}`,'DELETE'),
 subjects:()=>get<Subject[]>('/subjects'), createSubject:(p:SubjectInput)=>send<Subject>('/subjects','POST',p), updateSubject:(id:number,p:SubjectInput)=>send<Subject>(`/subjects/${id}`,'PUT',p), deleteSubject:(id:number)=>send<void>(`/subjects/${id}`,'DELETE'),
 rooms:()=>get<Room[]>('/rooms'), createRoom:(p:RoomInput)=>send<Room>('/rooms','POST',p), updateRoom:(id:number,p:RoomInput)=>send<Room>(`/rooms/${id}`,'PUT',p), deleteRoom:(id:number)=>send<void>(`/rooms/${id}`,'DELETE'),
 classes:()=>get<SchoolClass[]>('/classes').then(cs=>cs.map(c=>({...c,code:String(c.code??'').trim().toUpperCase()}))), createClass:(p:SchoolClassInput)=>send<SchoolClass>('/classes','POST',p), updateClass:(id:number,p:SchoolClassInput)=>send<SchoolClass>(`/classes/${id}`,'PUT',p), deleteClass:(id:number)=>send<void>(`/classes/${id}`,'DELETE'), assignClassTeacher:(classId:number,teacherId:number)=>send<SchoolClass>(`/classes/${classId}/teacher`,'PUT',{teacher_id:teacherId}),
 requirements:()=>get<Requirement[]>('/requirements'), createRequirement:(p:RequirementInput)=>send<Requirement>('/requirements','POST',p), deleteRequirement:(id:number)=>send<void>(`/requirements/${id}`,'DELETE'), constraints:()=>get<Constraint[]>('/constraints'), createConstraint:(p:ConstraintInput)=>send<Constraint>('/constraints','POST',p), deleteConstraint:(id:number)=>send<void>(`/constraints/${id}`,'DELETE'),
 timetableTypes:()=>get<TimetableType[]>('/timetable-types'), createTimetableType:(p:Omit<TimetableType,'id'>)=>send<TimetableType>('/timetable-types','POST',p), updateTimetableType:(id:number,p:Omit<TimetableType,'id'>)=>send<TimetableType>(`/timetable-types/${id}`,'PUT',p), deleteTimetableType:(id:number)=>send<void>(`/timetable-types/${id}`,'DELETE'),
 generate:(maxSeconds=30,p:GenerateIn={})=>send<Job>('/solver/generate-async','POST',{max_seconds:maxSeconds,...p}), generateAsync:(maxSeconds=30,p:GenerateIn={})=>send<Job>('/solver/generate-async','POST',{max_seconds:maxSeconds,...p}), activeJob:()=>get<Job|null>('/solver/jobs/active'), generateProfile:(p:GenerateProfileInput)=>send<Job>('/solver/generate-profile','POST',p), job:(id:number)=>get<Job>(`/solver/jobs/${id}`), cancelJob:(id:number)=>send<Job>(`/solver/jobs/${id}/cancel`,'POST'),
 versions:()=>get<Version[]>('/versions'), currentVersion:async()=>{try{return await get<Version|null>('/versions/current')}catch(e){if(e instanceof Error&&/404|not found/i.test(e.message))return null;throw e}}, lessons:(versionId:number)=>get<Lesson[]>(`/versions/${versionId}/lessons`), conflicts:async(versionId:number)=>(await get<Conflict[]>(`/versions/${versionId}/conflicts`)).filter(c=>c.kind!=='no_room'), publish:(versionId:number)=>send<Version>(`/versions/${versionId}/publish`,'POST'), restore:(versionId:number)=>send<Version>(`/versions/${versionId}/restore`,'POST'), deleteVersion:(versionId:number)=>send<void>(`/versions/${versionId}`,'DELETE'), moveLesson:(id:number,p:{day_index:number;period_index:number;room_id?:number|null})=>send<Lesson>(`/lessons/${id}`,'PATCH',p), patchLesson:(id:number,p:Loose)=>send<Lesson>(`/lessons/${id}`,'PATCH',p), duplicateLesson:(id:number)=>send<Lesson>(`/lessons/${id}/duplicate`,'POST'), deleteLesson:(id:number,p?:Loose)=>send<void>(`/lessons/${id}/delete`,'POST',p), createLesson:(versionId:number,p:Loose)=>send<Lesson>(`/versions/${versionId}/lessons`,'POST',p), unassigned:(versionId:number)=>get<Unassigned[]>(`/versions/${versionId}/unassigned`), assignRooms:(versionId:number)=>send<{assigned:number}>(`/versions/${versionId}/assign-rooms`,'POST'), explain:(id:number,day_index:number,period_index:number)=>send<Explanation>(`/lessons/${id}/explain?day_index=${day_index}&period_index=${period_index}`,'POST'), suggestions:(id:number)=>get<Alternative[]>(`/lessons/${id}/suggestions`), dashboard:()=>get<Dashboard>('/dashboard'), analytics:()=>get<Analytics>('/analytics'), audit:(limit=50)=>get<Loose[]>(`/audit?limit=${limit}`), amendments:(limit=5)=>get<TimetableAmendment[]>(`/amendments?limit=${limit}`), view:(scope:'class'|'teacher'|'room',targetId:number)=>get<TimetableView>(`/timetable/view?scope=${scope}&target_id=${targetId}`), interpret:(text:string)=>send<CopilotCommand>('/copilot/interpret','POST',{text}), applyCommand:(command:CopilotCommand)=>send<Loose>('/copilot/apply','POST',{command})
}
export function teachingPeriods(periods:Period[]):Period[]{return periods.filter(p=>p.is_teaching)}
export function activeDays(days:Day[]):Day[]{return days.filter(d=>d.is_active)}