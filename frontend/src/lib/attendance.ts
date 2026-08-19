import { apiFetch } from './api'

const BASE = '/api/v1'

export interface AttendanceSession {
  id: number; school_id: number; class_id?: number | null; level_id?: number | null; grade_id?: number | null; stream_id?: number | null; academic_year_id?: number | null
  date: string; period_index?: number; opened_by?: string; status: string; records: AttendanceRecord[]; created_at?: string
}
export interface AttendanceRecord { id: number; session_id: number; student_id: number; status: string; reason?: string; marked_by?: string; created_at?: string }
export interface AttendanceSummary { student_id: number; student_name: string; total_days: number; present: number; absent: number; late: number; excused: number; attendance_rate: number }

const get = <T,>(path: string) => apiFetch<T>(path)
const send = <T,>(path: string, method: string, body?: unknown) => apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const attendance = {
  openSession: (payload: { academic_year_id: number; level_id: number; grade_id: number; stream_id: number; date: string; period_index?: number }) =>
    send<AttendanceSession>(`${BASE}/attendance/sessions`, 'POST', payload),
  listSessions: (params?: { academic_year_id?: number; level_id?: number; grade_id?: number; stream_id?: number; class_id?: number; date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(params || {})) if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
    const q = qs.toString(); return get<AttendanceSession[]>(`${BASE}/attendance/sessions${q ? `?${q}` : ''}`)
  },
  mark: (sessionId: number, studentId: number, status: string, reason?: string) => send<AttendanceRecord>(`${BASE}/attendance/sessions/${sessionId}/records`, 'POST', { student_id: studentId, status, reason }),
  bulkMark: (sessionId: number, studentIds: number[], status: string) => send<{ marked: number }>(`${BASE}/attendance/sessions/${sessionId}/bulk`, 'POST', { student_ids: studentIds, status }),
  updateRecord: (recordId: number, status: string, reason?: string) => send<AttendanceRecord>(`${BASE}/attendance/records/${recordId}`, 'PATCH', { status, reason }),
  studentSummary: (studentId: number, academicYearId?: number) => get<AttendanceSummary>(`${BASE}/attendance/students/${studentId}/summary${academicYearId ? `?academic_year_id=${academicYearId}` : ''}`),
}
