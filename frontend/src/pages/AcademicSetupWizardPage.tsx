import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge } from '../components/States'
import { useToast } from '../components/Toast'
import { api, friendlyApiError, type AcademicYear, type Grade, type Level, type Stream, type Term, uniqueEducationLevels } from '../lib/api'

const steps = ['Academic Year', 'Term', 'Level', 'Grade', 'Stream (optional)']
type FormState = { yearId:string; yearName:string; startDate:string; endDate:string; termId:string; termName:string; termStartDate:string; termEndDate:string; levelId:string; gradeId:string; gradeName:string; gradeCode:string; streamName:string; streamCode:string }
const initialForm:FormState={yearId:'',yearName:'',startDate:'',endDate:'',termId:'',termName:'',termStartDate:'',termEndDate:'',levelId:'',gradeId:'',gradeName:'',gradeCode:'',streamName:'',streamCode:''}
const allowedLevels = ['Pre Primary','Pre-Primary School','Primary','Primary School','Junior School','Senior School']
const levelRank = (name:string, order?:number|null) => Number.isFinite(Number(order)) ? Number(order) : (allowedLevels.findIndex(x=>x.toLowerCase()===name.trim().toLowerCase())+100)

export function AcademicSetupWizardPage(){
 const {notify}=useToast()
 const [step,setStep]=useState(0)
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState<string|null>(null)
 const [years,setYears]=useState<AcademicYear[]>([])
 const [terms,setTerms]=useState<Term[]>([])
 const [levels,setLevels]=useState<Level[]>([])
 const [grades,setGrades]=useState<Grade[]>([])
 const [streams,setStreams]=useState<Stream[]>([])
 const [form,setForm]=useState<FormState>(initialForm)

 async function load(){
  setLoading(true);setError(null)
  try{
   const [y,t,l,g]=await Promise.all([api.academicYears(),api.terms(),api.levels(),api.grades()])
   const orderedLevels=uniqueEducationLevels(l.filter(x=>allowedLevels.includes(x.name)))
   setYears(y);setTerms(t);setLevels(orderedLevels);setGrades(g)
   const currentYear=y.find(x=>x.is_current)||y[0]
   const loadedStreams=currentYear?(await Promise.all(g.map(grade=>api.streams(currentYear.id,grade.id)))).flat():[]
   setStreams(loadedStreams)
  }catch(e){setError(friendlyApiError(e,'load academic setup data'))}
  finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[])

 function selectYear(id:string){
  const y=years.find(x=>String(x.id)===id)
  setForm(v=>y?{...v,yearId:String(y.id),yearName:y.name,startDate:y.start_date,endDate:y.end_date,termId:'',termName:'',termStartDate:'',termEndDate:'',streamName:'',streamCode:''}:{...v,yearId:'',yearName:'',startDate:'',endDate:'',termId:'',termName:'',termStartDate:'',termEndDate:'',streamName:'',streamCode:''})
 }
 function selectTerm(id:string){const t=terms.find(x=>String(x.id)===id);setForm(v=>t?{...v,termId:String(t.id),termName:t.name,termStartDate:t.start_date||'',termEndDate:t.end_date||''}:{...v,termId:'',termName:'',termStartDate:'',termEndDate:''})}
 function selectLevel(id:string){setForm(v=>({...v,levelId:id,gradeId:'',gradeName:'',gradeCode:'',streamName:'',streamCode:''}))}
 function selectGrade(id:string){const grade=grades.find(g=>String(g.id)===id);setForm(v=>({...v,gradeId:id,gradeName:grade?.name||'',gradeCode:grade?.code||'',streamName:'',streamCode:''}))}
 function validate(){
  if(step===0&&!form.yearId&&(!form.yearName.trim()||!form.startDate||!form.endDate))throw Error('Select an academic year or enter the year and its dates.')
  if(step===1&&!form.termId&&(!form.termName.trim()||!form.termStartDate||!form.termEndDate))throw Error('Select a term or enter the term and its dates.')
  if(step===2&&!form.levelId)throw Error('Select a level.')
  if(step===3&&!form.gradeId&&(!form.gradeName.trim()||!form.gradeCode.trim()))throw Error('Select an existing grade or enter a grade name and code.')
 }
 async function saveYear():Promise<AcademicYear|null>{
  if(form.yearId)return years.find(y=>String(y.id)===form.yearId)||null
  const y=await api.createAcademicYear({name:form.yearName.trim(),start_date:form.startDate,end_date:form.endDate,is_current:false,status:'ACTIVE'})
  setYears(v=>[...v,y]);setForm(v=>({...v,yearId:String(y.id)}));return y
 }
 async function saveTerm(yearId:number):Promise<Term|null>{
  if(form.termId)return terms.find(t=>String(t.id)===form.termId)||null
  const t=await api.createTerm({name:form.termName.trim(),start_date:form.termStartDate,end_date:form.termEndDate,is_current:false,academic_year_id:yearId})
  setTerms(v=>[...v,t]);setForm(v=>({...v,termId:String(t.id)}));return t
 }
 async function finish(){
  setSaving(true);setError(null)
  try{
   const year=await saveYear();const yearId=Number(form.yearId||year?.id)
   if(!yearId)throw Error('The academic year could not be resolved.')
   await saveTerm(yearId)
   const levelId=Number(form.levelId)
   let grade=grades.find(g=>String(g.id)===form.gradeId)
   if(!grade){
    const duplicate=grades.find(g=>g.level_id===levelId&&(g.name.trim().toLowerCase()===form.gradeName.trim().toLowerCase()||g.code.trim().toLowerCase()===form.gradeCode.trim().toLowerCase()))
    if(duplicate)throw Error(`A grade named "${duplicate.name}" or code "${duplicate.code}" already exists in this level. Select the existing grade instead.`)
    grade=await api.createGrade({level_id:levelId,name:form.gradeName.trim(),code:form.gradeCode.trim(),status:true})
    setGrades(v=>[...v,grade!])
   }
   const streamName=form.streamName.trim()
   if(streamName){
    const existingStreams=await api.streams(yearId,grade.id)
    if(existingStreams.some(s=>s.name.trim().toLowerCase()===streamName.toLowerCase()||(form.streamCode.trim()&&String(s.code||'').trim().toLowerCase()===form.streamCode.trim().toLowerCase())))throw Error('That stream name or code already exists for this grade and academic year.')
    const created=await api.createStream({academic_year_id:yearId,level_id:levelId,grade_id:grade.id,name:streamName,code:form.streamCode.trim()||undefined})
    setStreams(v=>[...v,created])
   }
   notify(streamName?'Grade and stream saved.': 'Grade saved without a stream.','success')
   await load();setStep(0);setForm(initialForm)
  }catch(e){setError(friendlyApiError(e,'save academic setup'))}
  finally{setSaving(false)}
 }
 async function next(){
  if(saving)return
  setError(null)
  try{
   validate()
   if(step<steps.length-1){
    if(step===0){const year=await saveYear();if(!year&&!form.yearId)throw Error('The academic year could not be resolved.')}
    if(step===1){const yearId=Number(form.yearId);if(!yearId)throw Error('Select an academic year first.');await saveTerm(yearId)}
    setStep(v=>v+1)
   }else await finish()
  }catch(e){setError(friendlyApiError(e,'continue academic setup'))}
 }
 const selectedYear=years.find(y=>String(y.id)===form.yearId)
 const selectedTerm=terms.find(t=>String(t.id)===form.termId)
 const selectedLevel=levels.find(l=>String(l.id)===form.levelId)
 const selectedGrade=grades.find(g=>String(g.id)===form.gradeId)
 const levelName=(levelId?:number|null)=>levels.find(l=>Number(l.id)===Number(levelId))?.name||'—'
 const yearName=(yearId?:number|null)=>years.find(y=>Number(y.id)===Number(yearId))?.name||'—'
 const termsForYear=(yearId?:number|null)=>terms.filter(t=>Number(t.academic_year_id)===Number(yearId)).map(t=>t.name).join(', ')||'—'
 const visibleGrades=[...grades].filter(g=>!form.levelId||g.level_id===Number(form.levelId)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}))
 return <><PageHeader title="Academic setup" description="Configure Academic Year → Term → Level → Grade. Add a stream only when your school uses streams." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'Academic setup'}]}/>{error&&<Alert tone="error" title="Setup could not continue">{error}</Alert>}<section className="card section"><div className="chip-list" aria-label="Setup progress">{steps.map((label,i)=><Badge key={label} tone={i===step?'success':undefined}>{i+1}. {label}</Badge>)}</div>{loading?<p>Loading setup options…</p>:<form className="form" onSubmit={e=>{e.preventDefault();void next()}}><h2 className="section__title">Step {step+1}: {steps[step]}</h2>
 {step===0&&<><label className="label">Academic year</label><select className="input" value={form.yearId} onChange={e=>selectYear(e.target.value)}><option value="">Create new…</option>{years.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}</select>{!form.yearId&&<div className="form form--grid"><input className="input" placeholder="2026/2027" value={form.yearName} onChange={e=>setForm(v=>({...v,yearName:e.target.value}))}/><input className="input" type="date" value={form.startDate} onChange={e=>setForm(v=>({...v,startDate:e.target.value}))}/><input className="input" type="date" value={form.endDate} onChange={e=>setForm(v=>({...v,endDate:e.target.value}))}/></div>}</>}
 {step===1&&<><label className="label">Term</label><select className="input" value={form.termId} onChange={e=>selectTerm(e.target.value)}><option value="">Create new…</option>{terms.filter(t=>Number(t.academic_year_id)===Number(form.yearId)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>{!form.termId&&<div className="form form--grid"><input className="input" placeholder="Term 1" value={form.termName} onChange={e=>setForm(v=>({...v,termName:e.target.value}))}/><input className="input" type="date" value={form.termStartDate} onChange={e=>setForm(v=>({...v,termStartDate:e.target.value}))}/><input className="input" type="date" value={form.termEndDate} onChange={e=>setForm(v=>({...v,termEndDate:e.target.value}))}/></div>}</>}
 {step===2&&<><label className="label">Education level</label><select className="input" value={form.levelId} onChange={e=>selectLevel(e.target.value)}><option value="">Select level…</option>{levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select><small>Choose the level that owns the grade.</small></>}
 {step===3&&<><label className="label">Existing grade (optional)</label><select className="input" value={form.gradeId} onChange={e=>selectGrade(e.target.value)}><option value="">Create a new grade…</option>{visibleGrades.map(g=><option key={g.id} value={g.id}>{g.name} ({g.code})</option>)}</select>{!form.gradeId&&<div className="form form--grid"><label className="form-field"><span className="label">Grade name</span><input className="input" placeholder="Grade 5" value={form.gradeName} onChange={e=>setForm(v=>({...v,gradeName:e.target.value}))}/></label><label className="form-field"><span className="label">Grade code</span><input className="input" placeholder="G5" value={form.gradeCode} onChange={e=>setForm(v=>({...v,gradeCode:e.target.value.toUpperCase()}))}/></label></div>}<small>Grades belong to an education level and do not need a stream.</small></>}
 {step===4&&<><label className="label">Stream name <span>(optional)</span></label><input className="input" placeholder="A — leave blank if this grade has no streams" value={form.streamName} onChange={e=>setForm(v=>({...v,streamName:e.target.value}))}/>{form.streamName.trim()&&<><label className="label">Stream code <span>(optional)</span></label><input className="input" placeholder="A" value={form.streamCode} onChange={e=>setForm(v=>({...v,streamCode:e.target.value.toUpperCase()}))}/></>}<small>Leave both fields empty to save the grade without creating a stream.</small><div className="card" style={{padding:'1rem'}}><p><strong>Academic year:</strong> {selectedYear?.name||form.yearName}</p><p><strong>Term:</strong> {selectedTerm?.name||form.termName}</p><p><strong>Level:</strong> {selectedLevel?.name||'—'}</p><p><strong>Grade:</strong> {selectedGrade?.name||form.gradeName}</p><p><strong>Stream:</strong> {form.streamName.trim()||'None (optional)'}</p></div></>}
 <div className="form__row"><button type="button" className="button button--ghost" disabled={step===0||saving} onClick={()=>setStep(v=>Math.max(0,v-1))}>Previous</button><button className="button button--primary" disabled={saving}>{saving?'Saving…':step===steps.length-1?'Save Academic Setup':'Save & Next'}</button></div></form>}</section>
 <section className="card section" aria-labelledby="created-academic-structure"><div className="section__header"><div><h2 id="created-academic-structure" className="section__title">Registered academic structure</h2><p>Levels contain grades. Streams are shown only when configured and are not required.</p></div><button type="button" className="button button--ghost button--sm" onClick={()=>void load()} disabled={loading}>Refresh</button></div>{loading?<p>Loading registered academic structure…</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Academic year</th><th>Term(s)</th><th>Level</th><th>Grade</th><th>Stream</th></tr></thead><tbody>{grades.length===0?<tr><td colSpan={5}>No grades have been created yet.</td></tr>:<>{grades.map(grade=>{const gradeStreams=streams.filter(s=>s.grade_id===grade.id);return (gradeStreams.length?gradeStreams:[null]).map((stream,index)=><tr key={stream?.id??`grade-${grade.id}-no-stream`}><td>{stream?yearName(stream.academic_year_id):'—'}</td><td>{stream?termsForYear(stream.academic_year_id):'—'}</td><td>{levelName(grade.level_id)}</td><td><strong>{grade.name}</strong></td><td>{stream?<Badge tone="success">{stream.name}{stream.code? ` (${stream.code})`:''}</Badge>:<span>—</span>}</td></tr>)})}</>}</tbody></table></div>}</section></>
}
