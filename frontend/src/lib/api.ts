import { supabase } from './supabase'
import type {
  School, SchoolUpdate, SchoolContactUpdate,
  Department, DepartmentCreate,
  Subject, SubjectCreate, SubjectUpdate,
  Teacher, TeacherCreate,
  Student, StudentCreate,
  AcademicYear, Term, Level,
  Examination, AssessmentComponent,
  ClassRegister,
  TimetableEntry,
} from './types'

// Same-origin by default: the backend serves this frontend, so a relative URL
// reaches the API on the same domain (no CORS). Set VITE_API_URL only if the
// frontend is ever hosted on a different origin than the API.
const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (authenticated) {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session) {
      throw new ApiError('Please sign in again.', 401)
    }
    headers.set('Authorization', `Bearer ${data.session.access_token}`)
  }

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(payload?.detail || `Request failed (${response.status})`, response.status)
  }

  // 204 No Content
  if (response.status === 204) return undefined as T

  return response.json() as Promise<T>
}

// ── Helpers ──
function get<T>(path: string) {
  return apiFetch<T>(path)
}
function post<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) })
}
function patch<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}
function del<T>(path: string) {
  return apiFetch<T>(path, { method: 'DELETE' })
}

// ── API Methods ──
export const api = {
  // Health
  health: () => apiFetch<{ status: string; environment: string }>('/health', {}, false),
  me: () => apiFetch<{ id: string; email: string | null; role: string | null }>('/api/v1/auth/me'),

  // School
  getSchool: () => get<School>('/api/v1/school/'),
  updateSchool: (data: SchoolUpdate) => patch<School>('/api/v1/school/', data),
  updateSchoolContact: (data: SchoolContactUpdate) => patch<School>('/api/v1/school/contact', data),

  // Departments
  getDepartments: () => get<Department[]>('/api/v1/departments/'),
  createDepartment: (data: DepartmentCreate) => post<Department>('/api/v1/departments/', data),
  getDepartment: (id: number) => get<Department>(`/api/v1/departments/${id}`),

  // Subjects
  getSubjects: () => get<Subject[]>('/api/v1/subjects/'),
  getSubject: (id: number) => get<Subject>(`/api/v1/subjects/${id}`),
  createSubject: (data: SubjectCreate) => post<Subject>('/api/v1/subjects/', data),
  updateSubject: (id: number, data: SubjectUpdate) => patch<Subject>(`/api/v1/subjects/${id}`, data),

  // Teachers
  getTeachers: () => get<Teacher[]>('/api/v1/teachers/'),
  getTeacher: (id: number) => get<Teacher>(`/api/v1/teachers/${id}`),
  createTeacher: (data: TeacherCreate) => post<Teacher>('/api/v1/teachers/', data),
  updateTeacher: (id: number, data: TeacherCreate) => patch<Teacher>(`/api/v1/teachers/${id}`, data),
  deleteTeacher: (id: number) => del<Teacher>(`/api/v1/teachers/${id}`),

  // Students
  getStudents: () => get<Student[]>('/api/v1/students/'),
  createStudent: (data: StudentCreate) => post<Student>('/api/v1/students/', data),

  // Class Registers
  getClassRegisters: () => get<ClassRegister[]>('/api/v1/class-register/'),
  createClassRegister: (data: Omit<ClassRegister, 'id'>) => post<ClassRegister>('/api/v1/class-register/', data),

  // Academics
  getAcademicYears: () => get<AcademicYear[]>('/api/v1/academics/years'),
  createAcademicYear: (data: Omit<AcademicYear, 'id' | 'school_id' | 'created_at' | 'updated_at'>) =>
    post<AcademicYear>('/api/v1/academics/years', data),
  getTerms: () => get<Term[]>('/api/v1/academics/terms'),
  createTerm: (data: Omit<Term, 'id' | 'school_id'>) => post<Term>('/api/v1/academics/terms', data),
  getLevels: () => get<Level[]>('/api/v1/academics/levels'),

  // Examinations
  getExaminations: () => get<Examination[]>('/api/v1/examinations/'),
  createExamination: (data: Omit<Examination, 'id'>) => post<Examination>('/api/v1/examinations/create', data),
  createAssessmentComponent: (data: Omit<AssessmentComponent, 'id'>) =>
    post<AssessmentComponent>('/api/v1/examinations/components/create', data),

  // Timetable
  getTimetableEntries: () => get<TimetableEntry[]>('/api/v1/timetable/'),
  generateClassTimetable: (classRegisterId: number, academicYearId: number) =>
    post(`/api/v1/timetable/generate/class/${classRegisterId}?academic_year_id=${academicYearId}`, {}),
}
