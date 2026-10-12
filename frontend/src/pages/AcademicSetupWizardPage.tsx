import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge } from '../components/States'
import { useToast } from '../components/Toast'
import { api, friendlyApiError, type AcademicYear, type Grade, type Level, type Stream, type Term, uniqueEducationLevels } from '../lib/api'

const steps = ['Academic Year', 'Level', 'Grade', 'Stream (optional)']
type FormState = { yearId:string; yearName:string; startDate:string; endDate:string; termId:string; termName:string; termStartDate:string; termEndDate:string; levelId:string; newLevelName:string; newLevelCode:string; gradeId:string; gradeName:string; gradeCode:string; streamChoices:string[]; streamName:string; streamCode:string }
const initialForm:FormState={yearId:'',yearName:'',startDate:'',endDate:'',termId:'',termName:'',termStartDate:'',termEndDate:'',levelId:'',newLevelName:'',newLevelCode:'',gradeId:'',gradeName:'',gradeCode:'',streamChoices:[],streamName:'',streamCode:''}

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
   const activeLevels=uniqueEducationLevels(l.filter(level=>level.status==null||level.status===true||String(level.status).toUpperCase()==='ACTIVE'))
   const activeGrades=g.filter(grade=>grade.status==null||grade.status===true)
   setYears(y);setTerms(t);setLevels(activeLevels);setGrades(activeGrades)
   const currentYear=y.find(x=>x.is_current)||y[0]
   const loadedStreams=currentYear?(await Promise.all(g.map(grade=>api.streams(currentYear.id,grade.id)))).flat():[]
   setStreams(loadedStreams)
  }catch(e){setError(friendlyApiError(e,'load academic setup data'))}
  finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[])

 function selectYear(id:string){
  const y=years.find(x=>String(x.id)===id)
  setForm(v=>y?{...v,yearId:String(y.id),yearName:y.name,startDate:y.start_date,endDate:y.end_date,termId:'',termName:'',termStartDate:'',termEndDate:'',streamChoices:[],streamName:'',streamCode:''}:{...v,yearId:'',yearName:'',startDate:'',endDate:'',termId:'',termName:'',termStartDate:'',termEndDate:'',streamChoices:[],streamName:'',streamCode:''})
 }
 function selectTerm(id:string){const t=terms.find(x=>String(x.id)===id);setForm(v=>t?{...v,termId:String(t.id),termName:t.name,termStartDate:t.start_date||'',termEndDate:t.end_date||''}:{...v,termId:'',termName:'',termStartDate:'',termEndDate:''})}
 function selectLevel(id:string){setForm(v=>({...v,levelId:id,newLevelName:'',newLevelCode:'',gradeId:'',gradeName:'',gradeCode:'',streamChoices:[],streamName:'',streamCode:''}))}
 function selectGrade(id:string){const grade=grades.find(g=>String(g.id)===id);setForm(v=>({...v,gradeId:id,gradeName:grade?.name||'',gradeCode:grade?.code||'',streamChoices:[],streamName:'',streamCode:''}))}
 function validate(){
  if(step===0&&!form.yearId&&(!form.yearName.trim()||!form.startDate||!form.endDate))throw Error('Select an academic year or enter the year and its dates.')
  if(step===1&&!form.levelId&&(!form.newLevelName.trim()||!form.newLevelCode.trim()))throw Error('Select an existing level or enter a level name and code.')
  if(step===2&&!form.gradeId&&(!form.gradeName.trim()||!form.gradeCode.trim()))throw Error('Select an existing grade or enter a grade name and code.')
  if(step===3&&form.streamChoices.includes('__custom__')&&!form.streamName.trim())throw Error('Enter a name for the custom stream, or uncheck Customize.')
 }
 async function saveYear():Promise<AcademicYear|null>{
  if(form.yearId)return years.find(y=>String(y.id)===form.yearId)||null
  const y=await api.createAcademicYear({name:form.yearName.trim(),start_date:form.startDate,end_date:form.endDate,is_current:false,status:'ACTIVE'})
  setYears(v=>[...v,y]);setForm(v=>({...v,yearId:String(y.id)}));return y
 }
 async function saveLevel():Promise<Level>{
  if(form.levelId){const existing=levels.find(l=>String(l.id)===form.levelId);if(existing)return existing;throw Error('The selected level could not be found.')}
  const name=form.newLevelName.trim();const code=form.newLevelCode.trim().toUpperCase()
  const duplicate=levels.find(l=>l.name.trim().toLowerCase()===name.toLowerCase()||l.code.trim().toLowerCase()===code.toLowerCase())
  if(duplicate)throw Error(`A level named "${duplicate.name}" or code "${duplicate.code}" already exists. Select the existing level instead.`)
  const created=await api.createLevel({name,code,display_order:levels.length+1,status:'ACTIVE'})
  setLevels(v=>uniqueEducationLevels([...v,created]));setForm(v=>({...v,levelId:String(created.id),newLevelName:'',newLevelCode:''}));return created
 }
 async function finish(){
  setSaving(true);setError(null)
  try{
   const year=await saveYear();const yearId=Number(form.yearId||year?.id)
   if(!yearId)throw Error('The academic year could not be resolved.')
   const level=await saveLevel()
   const levelId=Number(level.id)
   let grade=grades.find(g=>String(g.id)===form.gradeId)
   if(!grade){
    const duplicate=grades.find(g=>g.level_id===levelId&&(g.name.trim().toLowerCase()===form.gradeName.trim().toLowerCase()||g.code.trim().toLowerCase()===form.gradeCode.trim().toLowerCase()))
    if(duplicate)throw Error(`A grade named "${duplicate.name}" or code "${duplicate.code}" already exists in this level. Select the existing grade instead.`)
    grade=await api.createGrade({level_id:levelId,name:form.gradeName.trim(),code:form.gradeCode.trim(),status:true})
    setGrades(v=>[...v,grade!])
   }
   const streamNames=[...form.streamChoices.filter(choice=>choice!=='__custom__'),...(form.streamChoices.includes('__custom__')&&form.streamName.trim()?[form.streamName.trim()]:[])]
   const existingStreams=await api.streams(yearId,grade.id)
   const pendingStreams=streamNames.map(name=>({name,code:name===form.streamName.trim()&&form.streamChoices.includes('__custom__')?form.streamCode.trim():name}))
   const duplicate=pendingStreams.find((item,index)=>pendingStreams.findIndex(other=>other.name.toLowerCase()===item.name.toLowerCase()||(item.code&&other.code.toLowerCase()===item.code.toLowerCase()))!==index||existingStreams.some(existing=>existing.name.trim().toLowerCase()===item.name.toLowerCase()||(item.code&&String(existing.code||'').trim().toLowerCase()===item.code.toLowerCase())))
   if(duplicate)throw Error(`Stream "${duplicate.name}" or its code already exists for this grade and academic year.`)
   const createdStreams=[] as Stream[]
   for(const item of pendingStreams){const created=await api.createStream({academic_year_id:yearId,level_id:levelId,grade_id:grade.id,name:item.name,code:item.code||undefined});createdStreams.push(created)}
   setStreams(v=>[...v,...createdStreams])
   notify(createdStreams.length?`Grade and ${createdStreams.length} stream${createdStreams.length===1?'':'s'} saved.`:'Grade saved without a stream.','success')
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
    setStep(v=>v+1)
   }else await finish()
  }catch(e){setError(friendlyApiError(e,'continue academic setup'))}
 }
 const selectedYear=years.find(y=>String(y.id)===form.yearId)
 const selectedLevel=levels.find(l=>String(l.id)===form.levelId)
 const selectedGrade=grades.find(g=>String(g.id)===form.gradeId)
 const levelName=(levelId?:number|null)=>levels.find(l=>Number(l.id)===Number(levelId))?.name||'—'
 const yearName=(yearId?:number|null)=>years.find(y=>Number(y.id)===Number(yearId))?.name||'—'
 const termsForYear=(yearId?:number|null)=>terms.filter(t=>Number(t.academic_year_id)===Number(yearId)).map(t=>t.name).join(', ')||'—'
 const visibleGrades=[...grades].filter(g=>g.level_id===Number(form.levelId)&&(g.status==null||g.status===true)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}))
 const normalizedLevelName=(selectedLevel?.name||'').trim().toLowerCase()
 const streamPresets=normalizedLevelName.includes('primary')?['E','W','S','N']:normalizedLevelName.includes('junior')?['R','B','Y','G']:[]
 return <><PageHeader title="Academic setup" description="Configure Academic Year → Level → Grade → optional Streams. Existing grades are filtered by level; streams are scoped to the academic year and grade." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'Academic setup'}]}/>{error&&<Alert tone="error" title="Setup could not continue">{error}</Alert>}<section className="card section"><div className="chip-list" aria-label="Setup progress">{steps.map((label,i)=><Badge key={label} tone={i===step?'success':undefined}>{i+1}. {label}</Badge>)}</div>{loading?<p>Loading setup options…</p>:<form className="form" onSubmit={e=>{e.preventDefault();void next()}}><h2 className="section__title">Step {step+1}: {steps[step]}</h2>
 {step===0&&<><label className="label">Academic year</label><select className="input" value={form.yearId} onChange={e=>selectYear(e.target.value)}><option value="">Create new…</option>{years.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}</select>{!form.yearId&&<div className="form form--grid"><input className="input" placeholder="2026/2027" value={form.yearName} onChange={e=>setForm(v=>({...v,yearName:e.target.value}))}/><input className="input" type="date" value={form.startDate} onChange={e=>setForm(v=>({...v,startDate:e.target.value}))}/><input className="input" type="date" value={form.endDate} onChange={e=>setForm(v=>({...v,endDate:e.target.value}))}/></div>}</>}
 {step===1&&<><label className="label">Education level</label><select className="input" value={form.levelId} onChange={e=>selectLevel(e.target.value)}><option value="">Create a new level…</option>{levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>{!form.levelId&&<div className="form form--grid"><label className="form-field"><span className="label">Level name</span><input className="input" placeholder="Primary School" value={form.newLevelName} onChange={e=>setForm(v=>({...v,newLevelName:e.target.value}))}/></label><label className="form-field"><span className="label">Level code</span><input className="input" placeholder="PRI" value={form.newLevelCode} onChange={e=>setForm(v=>({...v,newLevelCode:e.target.value.toUpperCase()}))}/></label></div>}<small>Select an existing level or create one. The grade will be attached to this level.</small></>}
 {step===2&&<><label className="label">Existing grade (optional)</label><select className="input" value={form.gradeId} onChange={e=>selectGrade(e.target.value)}><option value="">Create a new grade…</option>{visibleGrades.map(g=><option key={g.id} value={g.id}>{g.name} ({g.code})</option>)}</select>{!form.gradeId&&<div className="form form--grid"><label className="form-field"><span className="label">Grade name</span><input className="input" placeholder="Grade 5" value={form.gradeName} onChange={e=>setForm(v=>({...v,gradeName:e.target.value}))}/></label><label className="form-field"><span className="label">Grade code</span><input className="input" placeholder="G5" value={form.gradeCode} onChange={e=>setForm(v=>({...v,gradeCode:e.target.value.toUpperCase()}))}/></label></div>}<small>Grades belong to an education level and do not need a stream.</small></>}
 {step===3&&<><label className="label">Streams <span>(optional — select any that apply)</span></label>{streamPresets.map(code=><label key={code} className="form-field" style={{display:'flex',alignItems:'center',gap:'.5rem'}}><input type="checkbox" checked={form.streamChoices.includes(code)} onChange={e=>setForm(v=>({...v,streamChoices:e.target.checked?[...v.streamChoices,code]:v.streamChoices.filter(item=>item!==code)}))}/><span>{code}</span></label>)}<label className="form-field" style={{display:'flex',alignItems:'center',gap:'.5rem'}}><input type="checkbox" checked={form.streamChoices.includes('__custom__')} onChange={e=>setForm(v=>({...v,streamChoices:e.target.checked?[...v.streamChoices,'__custom__']:v.streamChoices.filter(item=>item!=='__custom__'),streamName:e.target.checked?v.streamName:'',streamCode:e.target.checked?v.streamCode:''}))}/><span>Customize</span></label>{form.streamChoices.includes('__custom__')&&<><label className="label">Custom stream name</label><input className="input" placeholder="Enter stream name" value={form.streamName} onChange={e=>setForm(v=>({...v,streamName:e.target.value}))}/><label className="label">Stream code <span>(optional)</span></label><input className="input" placeholder="Optional code" value={form.streamCode} onChange={e=>setForm(v=>({...v,streamCode:e.target.value.toUpperCase()}))}/></>}<small>{streamPresets.length?`Suggested streams for ${selectedLevel?.name}: ${streamPresets.join(', ')}. Select multiple streams, Customize for a different stream, or leave everything unchecked if streams are not used.`:'Select Customize to add a stream for this level, or leave everything unchecked if streams are not used.'}</small><div className="card" style={{padding:'1rem'}}><p><strong>Academic year:</strong> {selectedYear?.name||form.yearName}</p><p><strong>Level:</strong> {selectedLevel?.name||'—'}</p><p><strong>Grade:</strong> {selectedGrade?.name||form.gradeName}</p><p><strong>Streams:</strong> {[...form.streamChoices.filter(choice=>choice!=='__custom__'),...(form.streamChoices.includes('__custom__')&&form.streamName.trim()?[form.streamName.trim()]:[])].join(', ')||'None (optional)'}</p></div></>}
 <div className="form__row"><button type="button" className="button button--ghost" disabled={step===0||saving} onClick={()=>setStep(v=>Math.max(0,v-1))}>Previous</button><button className="button button--primary" disabled={saving}>{saving?'Saving…':step===steps.length-1?'Save Academic Setup':'Save & Next'}</button></div></form>}</section>
 <section className="card section" aria-labelledby="created-academic-structure"><div className="section__header"><div><h2 id="created-academic-structure" className="section__title">Registered academic structure</h2><p>Levels contain grades. Streams are shown only when configured and are not required.</p></div><button type="button" className="button button--ghost button--sm" onClick={()=>void load()} disabled={loading}>Refresh</button></div>{loading?<p>Loading registered academic structure…</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Academic year</th><th>Term(s)</th><th>Level</th><th>Grade</th><th>Stream</th></tr></thead><tbody>{grades.length===0?<tr><td colSpan={5}>No grades have been created yet.</td></tr>:<>{grades.map(grade=>{const gradeStreams=streams.filter(s=>s.grade_id===grade.id);return (gradeStreams.length?gradeStreams:[null]).map((stream,index)=><tr key={stream?.id??`grade-${grade.id}-no-stream`}><td>{stream?yearName(stream.academic_year_id):'—'}</td><td>{stream?termsForYear(stream.academic_year_id):'—'}</td><td>{levelName(grade.level_id)}</td><td><strong>{grade.name}</strong></td><td>{stream?<Badge tone="success">{stream.name}{stream.code? ` (${stream.code})`:''}</Badge>:<span>—</span>}</td></tr>)})}</>}</tbody></table></div>}</section></>
}
