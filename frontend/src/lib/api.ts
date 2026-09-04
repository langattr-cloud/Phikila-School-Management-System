import { getLocalSession } from './localAuth'
import { supabase } from './supabase'

const configuredApiUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '')
const sameOriginApiUrl = typeof window !== 'undefined' ? window.location.origin : ''
const productionApiUrl = 'https://phikila-school-management-system.onrender.com'
const isProductionHost = typeof window !== 'undefined' && (
  window.location.hostname === 'phikila.com' ||
  window.location.hostname === 'www.phikila.com' ||
  window.location.hostname.endsWith('.vercel.app')
)
const apiUrl = isProductionHost ? sameOriginApiUrl : (configuredApiUrl || sameOriginApiUrl)

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly detail?: unknown) { super(message) }
}
export function friendlyApiError(error: unknown, action: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return `We could not ${action} because the API could not be reached. Please refresh and try again.`
    if (error.status === 401) return 'Your sign-in could not be verified. Please sign in again.'
    if (error.status === 403) return `You do not have permission to ${action}.`
    if (error.status === 404) return 'That information has not been set up yet.'
    if (error.status === 409) return error.message || `We could not ${action} because it conflicts with existing data.`
    if (error.status === 422 || error.status === 400) return error.message || 'Some details were not accepted. Check the form and try again.'
    if (error.status >= 500) return error.message ? `The server could not ${action}: ${error.message}` : `The server had a problem and could not ${action}.`
    return error.message || `We could not ${action}. Please try again.`
  }
  return error instanceof Error && error.message ? `We could not ${action}: ${error.message}` : `We could not ${action}. Check your connection and try again.`
}
async function currentAccessToken(): Promise<string | null> {
  if (!supabase) return getLocalSession()?.access_token ?? null
  const { data, error } = await supabase.auth.getSession(); return error ? null : data.session?.access_token ?? null
}
async function refreshSessionToken(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.refreshSession(); return !error && data.session?.access_token ? data.session.access_token : currentAccessToken()
}
function requestUrl(baseUrl: string, path: string): string { if (/^https?:\/\//i.test(path)) return path; return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}` }
async function fetchApi(url: string, init: RequestInit): Promise<Response> { try { return await fetch(url, { ...init, cache: init.cache || 'no-store' }) } catch (error) { throw new ApiError(`API could not be reached: ${error instanceof Error ? error.message : 'Network request failed'}`, 0) } }
export async function apiFetch<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const baseHeaders = new Headers(init.headers); baseHeaders.set('Accept', 'application/json'); if (init.body && !baseHeaders.has('Content-Type') && !(init.body instanceof FormData)) baseHeaders.set('Content-Type', 'application/json')
  const request = async (token: string | null) => { const headers = new Headers(baseHeaders); if (authenticated && token) headers.set('Authorization', `Bearer ${token}`); const response = await fetchApi(requestUrl(apiUrl, path), { ...init, headers }); if (!response.ok) { const payload = await response.json().catch(() => null); const raw = payload?.detail; const message = typeof raw === 'string' ? raw : typeof raw?.message === 'string' ? raw.message : `Request failed (${response.status})`; throw new ApiError(message, response.status, typeof raw === 'object' ? raw : undefined) } if (response.status === 204) return undefined as T; return response.json() as Promise<T> }
  let token = authenticated ? await currentAccessToken() : null; if (authenticated && !token) throw new ApiError('Please sign in again.', 401)
  try { return await request(token) } catch (error) { if (authenticated && error instanceof ApiError && error.status === 401 && supabase) { token = await refreshSessionToken(); if (token) return await request(token) } throw error }
}
export type Identity={id:string;email:string|null;role:string|null;app_metadata?:Record<string,unknown>}
export type SchoolProfile={id:number;name:string;code?:string|null;county?:string|null;sub_county?:string|null;email?:string|null;phone?:string|null;motto?:string|null;principal_name?:string|null;established_year?:number|null;is_active?:boolean|null}
export type AcademicYear={id:number;name:string;start_date:string;end_date:string;is_current?:boolean|null;status?:string|null;school_id:number}
export type Term={id:number;name:string;start_date?:string|null;end_date?:string|null;is_current:boolean;academic_year_id:number;school_id:number}
export type Level={id:number;name:string;code:string;display_order:number;status?:boolean|null;school_id:number}
export type Grade={id:number;name:string;code:string;status?:boolean|null;school_id:number;level_id:number}
export type SchoolClassSetup={id:number;school_id:number;name:string;code:string;level_id?:number|null;academic_year_id?:number|null;status?:string|null}
export type StreamStatus='ACTIVE'|'INACTIVE'|'ARCHIVED'
export type Stream={id:number;school_id:number;academic_year_id?:number|null;level_id:number;grade_id?:number|null;name:string;code?:string|null;class_teacher_id?:number|null;status:StreamStatus;created_at?:string;updated_at?:string|null}
export type StudentListItem={id:number;admission_number:string;first_name:string;middle_name?:string|null;last_name:string;preferred_name?:string|null;date_of_birth?:string|null;gender?:string|null;email?:string|null;phone?:string|null;address?:string|null;nationality?:string|null;national_id?:string|null;photo_url?:string|null;admission_date?:string|null;status:string;status_reason?:string|null;status_date?:string|null;school_id?:number;created_at?:string|null;updated_at?:string|null;guardians?:unknown[]}
export type StudentListResponse={items:StudentListItem[];total:number;page:number;page_size:number;pages:number}
export type StreamStudent={id:number;admission_number:string;first_name:string;middle_name?:string|null;last_name:string;current_class_id?:number|null;level_id?:number|null;stream_id?:number|null;status:string}
export type BulkStreamItem={name:string;code?:string|null;status?:StreamStatus}
export const api={health:()=>apiFetch<{status:string;environment:string}>('/health',{},false),me:()=>apiFetch<Identity>('/api/v1/auth/me'),school:()=>apiFetch<SchoolProfile>('/api/v1/school/'),academicYears:()=>apiFetch<AcademicYear[]>('/api/v1/academics/years'),createAcademicYear:(payload:{name:string;start_date:string;end_date:string;is_current?:boolean;status?:string})=>apiFetch<AcademicYear>('/api/v1/academics/years',{method:'POST',body:JSON.stringify(payload)}),updateAcademicYear:(id:number,payload:Partial<Pick<AcademicYear,'name'|'start_date'|'end_date'|'is_current'|'status'>>)=>apiFetch<AcademicYear>(`/api/v1/academics/years/${id}`,{method:'PATCH',body:JSON.stringify(payload)}),terms:()=>apiFetch<Term[]>('/api/v1/academics/terms'),createTerm:(payload:{name:string;start_date?:string|null;end_date?:string|null;is_current?:boolean;academic_year_id:number})=>apiFetch<Term>('/api/v1/academics/terms',{method:'POST',body:JSON.stringify(payload)}),updateTerm:(id:number,payload:Partial<Pick<AcademicYear,'name'|'start_date'|'end_date'|'is_current'|'status'>>)=>apiFetch<Term>(`/api/v1/academics/terms/${id}`,{method:'PATCH',body:JSON.stringify(payload)}),levels:()=>apiFetch<Level[]>('/api/v1/academics/levels'),createLevel:(payload:{level_id?:number;name:string;code:string;display_order:number;status?:boolean})=>apiFetch<Level>('/api/v1/academics/levels',{method:'POST',body:JSON.stringify(payload)}),updateLevel:(id:number,payload:Partial<Pick<AcademicYear,'name'|'code'|'display_order'|'status'>>)=>apiFetch<Level>(`/api/v1/academics/levels/${id}`,{method:'PATCH',body:JSON.stringify(payload)}),grades:(levelId?:number)=>apiFetch<Grade[]>(`/api/v1/academics/grades${levelId!=null?`?level_id=${levelId}`:''}`),createGrade:(payload:{level_id:number;name:string;code:string;status?:boolean})=>apiFetch<Grade>('/api/v1/academics/grades',{method:'POST',body:JSON.stringify(payload)}),updateGrade:(id:number,payload:Partial<Pick<Grade,'name'|'code'|'status'>> & {level_id?:number})=>apiFetch<Grade>(`/api/v1/academics/grades/${id}`,{method:'PATCH',body:JSON.stringify(payload)}),streams:(academicYearId:number,gradeId:number)=>apiFetch<Stream[]>(`/api/v1/academics/years/${academicYearId}/grades/${gradeId}/streams`),createStream:(payload:{academic_year_id:number;level_id:number;grade_id:number;name:string;code?:string|null;status?:StreamStatus})=>apiFetch<Stream>('/api/v1/academics/streams',{method:'POST',body:JSON.stringify(payload)}),createStreamsBulk:(payload:{academic_year_id:number;level_id:number;grade_id:number;streams:BulkStreamItem[]})=>apiFetch<{streams:Stream[];created_count:number}>('/api/v1/academics/streams/bulk',{method:'POST',body:JSON.stringify(payload)}),updateStream:(streamId:number,payload:Partial<Pick<Stream,'name'|'code'|'status'|'class_teacher_id'>>)=>apiFetch<Stream>(`/api/v1/academics/streams/${streamId}`,{method:'PATCH',body:JSON.stringify(payload)}),streamStudents:(streamId:number)=>apiFetch<StreamStudent[]>(`/api/v1/academics/streams/${streamId}/students`),assignStudentToStream:(streamId:number,studentId:number)=>apiFetch<StreamStudent[]>(`/api/v1/academics/streams/${streamId}/students`),schoolClasses:()=>apiFetch<SchoolClassSetup[]>('/api/v1/academics/classes'),students:()=>apiFetch<StudentListResponse>('/api/v1/students')}
