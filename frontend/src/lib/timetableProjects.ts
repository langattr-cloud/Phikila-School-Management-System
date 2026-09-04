import { apiFetch } from './api'
const prefix='/api/v1/scheduling/projects'
const req=<T>(path:string,options:RequestInit={})=>apiFetch<T>(`${prefix}${path}`,options)
export interface TimetableProject { id:number; name:string; description:string|null; academic_year_id:number|null; term_id:number|null; status:string; current_version_id:number|null; created_by:string|null; created_at:string; updated_at:string }
export interface ProjectInput { name:string; description?:string|null; academic_year_id?:number|null; term_id?:number|null }
export const timetableProjects={
 list:()=>req<TimetableProject[]>(''),
 create:(p:ProjectInput)=>req<TimetableProject>('',{method:'POST',body:JSON.stringify(p)}),
 update:(id:number,p:Partial<ProjectInput>&{status?:string})=>req<TimetableProject>(`/${id}`,{method:'PUT',body:JSON.stringify(p)}),
 remove:(id:number)=>req<void>(`/${id}`,{method:'DELETE'}),
 clone:(id:number,p:ProjectInput)=>req<TimetableProject>(`/${id}/clone`,{method:'POST',body:JSON.stringify(p)}),
 current:(id:number)=>req<any>(`/${id}/current`),
 versions:(id:number)=>req<any[]>(`/${id}/versions`),
 generate:(id:number,p:Record<string,unknown>={})=>req<any>(`/${id}/generate`,{method:'POST',body:JSON.stringify(p)})
}
