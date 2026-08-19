import { apiFetch } from './api'

const BASE = '/api/v1'
export interface ExamSeries { id:number; school_id:number; name:string; academic_year_id?:number; term_id?:number; status:string; created_at?:string }
export interface Examination { id:number; school_id:number; series_id:number; name:string; description?:string; exam_date?:string; total_marks:number; passing_marks:number; status:string; created_at?:string }
export interface ExamEntry { id:number; exam_id:number; student_id:number; subject_id:number; score?:number; grade?:string; position?:number; remarks?:string; percentage?:number }
export interface SubjectScore { subject_id:number; score:number; grade?:string; percentage?:number; band?:string; band_label?:string }
export interface StudentResult { student_id:number; student_name:string; admission_number:string; subject_scores:SubjectScore[]; total_score:number; average:number; position?:number; grade?:string; education_level?:'primary'|'junior'|'senior'; percentage?:number; band?:string; band_label?:string; deviation?:number; progress?:number }
export interface ResultsAnalysis { exam_id:number; exam_name:string; cohort_size:number; education_levels:Record<string,number>; cohort_mean?:number; band_distribution:Record<string,number>; subject_analysis:{subject_id:number;entries:number;mean_percentage?:number;band_distribution:Record<string,number>}[]; progress_summary:Record<string,number> }
export interface GradeScale { id:number; school_id:number; grade:string; min_score:number; max_score:number; points?:number; description?:string; education_level?:'primary'|'junior'|'senior'|null }
const get=<T,>(path:string)=>apiFetch<T>(path)
const send=<T,>(path:string,method:string,body?:unknown)=>apiFetch<T>(path,{method,body:body===undefined?undefined:JSON.stringify(body)})
const contextQuery=(context:{academic_year_id?:number;level_id?:number;grade_id?:number;stream_id?:number})=>{const q=new URLSearchParams(); if(context.academic_year_id)q.set('academic_year_id',String(context.academic_year_id)); if(context.level_id)q.set('level_id',String(context.level_id)); if(context.grade_id)q.set('grade_id',String(context.grade_id)); if(context.stream_id)q.set('stream_id',String(context.stream_id)); return q.toString()}
export const examinations={
 listSeries:()=>get<ExamSeries[]>(`${BASE}/examinations/series`),
 createSeries:(payload:Partial<ExamSeries>)=>send<ExamSeries>(`${BASE}/examinations/series`,'POST',payload),
 list:(seriesId?:number)=>get<Examination[]>(`${BASE}/examinations${seriesId?`?series_id=${seriesId}`:''}`),
 get:(id:number)=>get<Examination>(`${BASE}/examinations/${id}`),
 create:(payload:Partial<Examination>)=>send<Examination>(`${BASE}/examinations`,'POST',payload),
 delete:(id:number)=>send<void>(`${BASE}/examinations/${id}`,'DELETE'),
 enterScores:(examId:number,entries:{student_id:number;subject_id:number;score:number;grade?:string;remarks?:string}[])=>send<{created:number;updated:number}>(`${BASE}/examinations/${examId}/entries`,'POST',{entries}),
 listEntries:(examId:number,subjectId?:number,studentId?:number)=>{const q=new URLSearchParams();if(subjectId)q.set('subject_id',String(subjectId));if(studentId)q.set('student_id',String(studentId));const s=q.toString();return get<ExamEntry[]>(`${BASE}/examinations/${examId}/entries${s?`?${s}`:''}`)},
 generateResults:(examId:number,context:Parameters<typeof contextQuery>[0]={})=>{const q=contextQuery(context);return get<StudentResult[]>(`${BASE}/examinations/${examId}/results${q?`?${q}`:''}`)},
 resultsAnalysis:(examId:number,context:Parameters<typeof contextQuery>[0]={})=>{const q=contextQuery(context);return get<ResultsAnalysis>(`${BASE}/examinations/${examId}/results/analysis${q?`?${q}`:''}`)},
 listGradeScale:()=>get<GradeScale[]>(`${BASE}/examinations/grade-scale`),
 createGradeScale:(payload:Partial<GradeScale>)=>send<GradeScale>(`${BASE}/examinations/grade-scale`,'POST',payload),
}
