import { apiFetch } from './api'

const BASE = '/api/v1'

/* ---- Types ---- */
export interface Guardian {
  id: number
  student_id: number
  full_name: string
  relationship: string
  phone: string
  alt_phone?: string
  email?: string
  address?: string
  occupation?: string
  is_emergency_contact: boolean
}

export interface Student {
  id: number
  school_id: number
  admission_number: string
  first_name: string
  middle_name?: string
  last_name: string
  preferred_name?: string
  date_of_birth?: string
  gender?: string
  email?: string
  phone?: string
  address?: string
  nationality?: string
  national_id?: string
  photo_url?: string
  admission_date?: string
  current_class_id?: number
  level_id?: number
  stream_id?: number
  status: string
  status_reason?: string
  status_date?: string
  created_at?: string
  updated_at?: string
  guardians: Guardian[]
}

export interface StudentListResponse {
  items: Student[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface Enrollment {
  id: number
  student_id: number
  academic_year_id: number
  term_id?: number
  class_id: number
  level_id?: number
  stream_id?: number
  status: string
  enrollment_date?: string
}

export interface StudentDocument {
  id: number
  student_id: number
  document_type: string
  title: string
  description?: string
  file_url?: string
  file_size?: number
  mime_type?: string
  created_at?: string
}

/* ---- API ---- */
const get = <T,>(path: string) => apiFetch<T>(path)
const send = <T,>(path: string, method: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const students = {
  list: (params?: { page?: number; page_size?: number; search?: string; status?: string; class_id?: number; level_id?: number; stream_id?: number }) => {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.page_size) qs.set('page_size', String(params.page_size))
    if (params?.search) qs.set('search', params.search)
    if (params?.status) qs.set('status', params.status)
    if (params?.class_id) qs.set('class_id', String(params.class_id))
    if (params?.level_id) qs.set('level_id', String(params.level_id))
    if (params?.stream_id) qs.set('stream_id', String(params.stream_id))
    const q = qs.toString()
    return get<StudentListResponse>(`${BASE}/students${q ? `?${q}` : ''}`)
  },

  get: (id: number) => get<Student>(`${BASE}/students/${id}`),

  create: (payload: Partial<Student> & { guardians?: Partial<Guardian>[] }) =>
    send<Student>(`${BASE}/students`, 'POST', payload),

  update: (id: number, payload: Partial<Student>) =>
    send<Student>(`${BASE}/students/${id}`, 'PATCH', payload),

  delete: (id: number) => send<void>(`${BASE}/students/${id}`, 'DELETE'),

  guardians: (studentId: number) => get<Guardian[]>(`${BASE}/students/${studentId}/guardians`),

  addGuardian: (studentId: number, payload: Partial<Guardian>) =>
    send<Guardian>(`${BASE}/students/${studentId}/guardians`, 'POST', payload),

  enrollment: (studentId: number) => get<Enrollment[]>(`${BASE}/students/${studentId}/enrollment`),

  documents: (studentId: number) => get<StudentDocument[]>(`${BASE}/students/${studentId}/documents`),

  addDocument: (studentId: number, payload: Partial<StudentDocument>) =>
    send<StudentDocument>(`${BASE}/students/${studentId}/documents`, 'POST', payload),
}
