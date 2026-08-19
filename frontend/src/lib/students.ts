import { apiFetch } from './api'

const BASE = '/api/v1'

export interface Guardian { id: number; student_id: number; full_name: string; relationship: string; phone: string; alt_phone: string | null; email: string | null; address: string | null; occupation: string | null; is_emergency_contact: boolean }
export interface GuardianCreate { full_name: string; relationship: string; phone: string; alt_phone?: string | null; email?: string | null; address?: string | null; occupation?: string | null; is_emergency_contact?: boolean }
export interface Student { id: number; school_id: number; admission_number: string; first_name: string; middle_name: string | null; last_name: string; preferred_name: string | null; date_of_birth: string | null; gender: string | null; email: string | null; phone: string | null; address: string | null; nationality: string | null; national_id: string | null; photo_url: string | null; admission_date: string | null; status: string; status_reason: string | null; status_date: string | null; created_at: string | null; updated_at: string | null; guardians: Guardian[] }
export interface StudentCreate { admission_number: string; first_name: string; middle_name?: string | null; last_name: string; preferred_name?: string | null; date_of_birth?: string | null; gender?: string | null; email?: string | null; phone?: string | null; address?: string | null; nationality?: string; national_id?: string | null; photo_url?: string | null; admission_date?: string | null; academic_year_id: number; level_id: number; grade_id: number; stream_id: number; status?: string; guardians?: GuardianCreate[] }
export interface StudentUpdate { first_name?: string; middle_name?: string | null; last_name?: string; preferred_name?: string | null; date_of_birth?: string | null; gender?: string | null; email?: string | null; phone?: string | null; address?: string | null; nationality?: string | null; national_id?: string | null; photo_url?: string | null; status?: string | null; status_reason?: string | null }
export interface StudentListResponse { items: Student[]; total: number; page: number; page_size: number; pages: number }
export interface Enrollment { id: number; school_id: number; student_id: number; academic_year_id: number; term_id?: number | null; level_id: number; grade_id: number; stream_id: number; status: string; enrollment_date?: string; created_at?: string }
export interface StudentDocument { id: number; student_id: number; document_type: string; title: string; description?: string; file_url?: string; file_size?: number; mime_type?: string; created_at?: string }

const get = <T,>(path: string) => apiFetch<T>(path)
const send = <T,>(path: string, method: string, body?: unknown) => apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const students = {
  list: (params?: { page?: number; page_size?: number; search?: string; status?: string; academic_year_id?: number; level_id?: number; grade_id?: number; stream_id?: number }) => {
    const qs = new URLSearchParams()
    if (params?.page != null) qs.set('page', String(params.page))
    if (params?.page_size != null) qs.set('page_size', String(params.page_size))
    if (params?.search) qs.set('search', params.search)
    if (params?.status) qs.set('status', params.status)
    if (params?.academic_year_id != null) qs.set('academic_year_id', String(params.academic_year_id))
    if (params?.level_id != null) qs.set('level_id', String(params.level_id))
    if (params?.grade_id != null) qs.set('grade_id', String(params.grade_id))
    if (params?.stream_id != null) qs.set('stream_id', String(params.stream_id))
    const q = qs.toString()
    return get<StudentListResponse>(`${BASE}/students${q ? `?${q}` : ''}`)
  },
  get: (id: number) => get<Student>(`${BASE}/students/${id}`),
  create: (payload: StudentCreate) => send<Student>(`${BASE}/students`, 'POST', payload),
  update: (id: number, payload: StudentUpdate) => send<Student>(`${BASE}/students/${id}`, 'PATCH', payload),
  delete: (id: number) => send<void>(`${BASE}/students/${id}`, 'DELETE'),
  guardians: (studentId: number) => get<Guardian[]>(`${BASE}/students/${studentId}/guardians`),
  addGuardian: (studentId: number, payload: GuardianCreate) => send<Guardian>(`${BASE}/students/${studentId}/guardians`, 'POST', payload),
  enrollment: (studentId: number) => get<Enrollment[]>(`${BASE}/students/${studentId}/enrollment`),
  documents: (studentId: number) => get<StudentDocument[]>(`${BASE}/students/${studentId}/documents`),
  addDocument: (studentId: number, payload: Partial<StudentDocument>) => send<StudentDocument>(`${BASE}/students/${studentId}/documents`, 'POST', payload),
}
