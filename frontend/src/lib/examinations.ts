import { apiFetch } from './api'

const BASE = '/api/v1'

export interface ExamSeries {
  id: number
  school_id: number
  name: string
  academic_year_id: number | null
  term_id: number | null
  status: string
  created_at: string | null
}

export interface SeriesCreate {
  name: string
  academic_year_id?: number | null
  term_id?: number | null
}

export interface Examination {
  id: number
  school_id: number
  series_id: number
  name: string
  description: string | null
  exam_date: string | null
  total_marks: number
  passing_marks: number
  status: string
  created_at: string | null
}

export interface ExaminationCreate {
  series_id: number
  name: string
  description?: string | null
  exam_date?: string | null
  total_marks?: number
  passing_marks?: number
}

export interface ExamSubject {
  id: number
  exam_id: number
  subject_id: number
  academic_year_id: number
  level_id: number
  grade_id: number
  stream_id: number
  teacher_id: number | null
  total_marks: number
}

export interface ExamSubjectCreate {
  subject_id: number
  academic_year_id: number
  level_id: number
  grade_id: number
  stream_id: number
  teacher_id?: number | null
  total_marks?: number
}

export interface ExamEntry {
  id: number
  exam_id: number
  student_id: number
  subject_id: number
  score: number | null
  grade: string | null
  position: number | null
  remarks: string | null
  percentage: number | null
}

export interface ScoreEntry {
  student_id: number
  subject_id: number
  score: number
  grade?: string | null
  position?: number | null
  remarks?: string | null
}

export interface SubjectScore {
  subject_id: number
  score: number
  grade?: string
  percentage?: number
  band?: string
  band_label?: string
}

export interface StudentResult {
  student_id: number
  student_name: string
  admission_number: string
  subject_scores: SubjectScore[]
  total_score: number
  average: number
  position?: number
  grade?: string
  education_level?: 'primary' | 'junior' | 'senior' | null
  percentage?: number
  band?: string
  band_label?: string
  deviation?: number
  progress?: number
}

export interface ResultsAnalysis {
  exam_id: number
  exam_name: string
  cohort_size: number
  education_levels: Record<string, number>
  cohort_mean?: number
  band_distribution: Record<string, number>
  subject_analysis: {
    subject_id: number
    entries: number
    mean_percentage?: number
    band_distribution: Record<string, number>
  }[]
  progress_summary: Record<string, number>
}

export interface GradeScale {
  id: number
  school_id: number
  grade: string
  min_score: number
  max_score: number
  points: number | null
  description: string | null
  education_level: 'primary' | 'junior' | 'senior' | null
}

export interface GradeScaleCreate {
  grade: string
  min_score: number
  max_score: number
  points?: number | null
  description?: string | null
  education_level?: 'primary' | 'junior' | 'senior' | null
}

type AcademicContext = {
  academic_year_id?: number
  level_id?: number
  grade_id?: number
  stream_id?: number
}

const get = <T,>(path: string) => apiFetch<T>(path)
const send = <T,>(path: string, method: string, body?: unknown) =>
  apiFetch<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const contextQuery = (context: AcademicContext) => {
  const q = new URLSearchParams()
  if (context.academic_year_id != null) q.set('academic_year_id', String(context.academic_year_id))
  if (context.level_id != null) q.set('level_id', String(context.level_id))
  if (context.grade_id != null) q.set('grade_id', String(context.grade_id))
  if (context.stream_id != null) q.set('stream_id', String(context.stream_id))
  return q.toString()
}

export const examinations = {
  listSeries: () => get<ExamSeries[]>(`${BASE}/examinations/series`),
  createSeries: (payload: SeriesCreate) =>
    send<ExamSeries>(`${BASE}/examinations/series`, 'POST', payload),

  list: (seriesId?: number) =>
    get<Examination[]>(`${BASE}/examinations${seriesId != null ? `?series_id=${seriesId}` : ''}`),
  get: (id: number) => get<Examination>(`${BASE}/examinations/${id}`),
  create: (payload: ExaminationCreate) =>
    send<Examination>(`${BASE}/examinations`, 'POST', payload),
  delete: (id: number) => send<void>(`${BASE}/examinations/${id}`, 'DELETE'),

  listSubjects: (examId: number) =>
    get<ExamSubject[]>(`${BASE}/examinations/${examId}/subjects`),
  assignSubject: (examId: number, payload: ExamSubjectCreate) =>
    send<ExamSubject>(`${BASE}/examinations/${examId}/subjects`, 'POST', payload),
  updateSubject: (examId: number, assignmentId: number, payload: ExamSubjectCreate) =>
    send<ExamSubject>(`${BASE}/examinations/${examId}/subjects/${assignmentId}`, 'PATCH', payload),

  enterScores: (examId: number, entries: ScoreEntry[]) =>
    send<{ created: number; updated: number }>(
      `${BASE}/examinations/${examId}/entries`,
      'POST',
      { entries },
    ),
  listEntries: (examId: number, subjectId?: number, studentId?: number) => {
    const q = new URLSearchParams()
    if (subjectId != null) q.set('subject_id', String(subjectId))
    if (studentId != null) q.set('student_id', String(studentId))
    const s = q.toString()
    return get<ExamEntry[]>(`${BASE}/examinations/${examId}/entries${s ? `?${s}` : ''}`)
  },
  generateResults: (examId: number, context: AcademicContext = {}) => {
    const q = contextQuery(context)
    return get<StudentResult[]>(`${BASE}/examinations/${examId}/results${q ? `?${q}` : ''}`)
  },
  resultsAnalysis: (examId: number) =>
    get<ResultsAnalysis>(`${BASE}/examinations/${examId}/results/analysis`),

  listGradeScale: () => get<GradeScale[]>(`${BASE}/examinations/grade-scale`),
  createGradeScale: (payload: GradeScaleCreate) =>
    send<GradeScale>(`${BASE}/examinations/grade-scale`, 'POST', payload),
}
