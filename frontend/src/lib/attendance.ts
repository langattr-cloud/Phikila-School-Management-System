import { apiFetch } from './api'

const BASE = '/api/v1'

export interface AttendanceSession {
  id: number
  school_id: number
  academic_year_id: number
  level_id: number
  grade_id: number
  stream_id: number
  date: string
  period_index?: number | null
  opened_by?: string | null
  status: string
  records: AttendanceRecord[]
  created_at?: string
}

export interface AttendanceRecord {
  id: number
  session_id: number
  student_id: number
  status: string
  reason?: string | null
  marked_by?: string | null
  created_at?: string
}

export interface AttendanceSummary {
  student_id: number
  student_name: string
  total_days: number
  present: number
  absent: number
  late: number
  excused: number
  attendance_rate: number
}

export interface AttendanceContext {
  academic_year_id: number
  level_id: number
  grade_id: number
  stream_id: number
}

const get = <T,>(path: string) => apiFetch<T>(path)
const send = <T,>(path: string, method: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const attendance = {
  openSession: (context: AttendanceContext, date: string, periodIndex?: number) =>
    send<AttendanceSession>(`${BASE}/attendance/sessions`, 'POST', {
      ...context,
      date,
      period_index: periodIndex,
    }),

  listSessions: (params?: Partial<AttendanceContext> & { date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams()
    if (params?.academic_year_id) qs.set('academic_year_id', String(params.academic_year_id))
    if (params?.level_id) qs.set('level_id', String(params.level_id))
    if (params?.grade_id) qs.set('grade_id', String(params.grade_id))
    if (params?.stream_id) qs.set('stream_id', String(params.stream_id))
    if (params?.date_from) qs.set('date_from', params.date_from)
    if (params?.date_to) qs.set('date_to', params.date_to)
    const q = qs.toString()
    return get<AttendanceSession[]>(`${BASE}/attendance/sessions${q ? `?${q}` : ''}`)
  },

  mark: (sessionId: number, studentId: number, status: string, reason?: string) =>
    send<AttendanceRecord>(`${BASE}/attendance/sessions/${sessionId}/records`, 'POST', { student_id: studentId, status, reason }),

  bulkMark: (sessionId: number, studentIds: number[], status: string) =>
    send<{ marked: number }>(`${BASE}/attendance/sessions/${sessionId}/bulk`, 'POST', { student_ids: studentIds, status }),

  updateRecord: (recordId: number, status: string, reason?: string) =>
    send<AttendanceRecord>(`${BASE}/attendance/records/${recordId}`, 'PATCH', { status, reason }),

  studentSummary: (studentId: number, academicYearId?: number) => {
    const qs = academicYearId ? `?academic_year_id=${academicYearId}` : ''
    return get<AttendanceSummary>(`${BASE}/attendance/students/${studentId}/summary${qs}`)
  },
}
