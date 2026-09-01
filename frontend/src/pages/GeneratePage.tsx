import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Calendar, type Job, type TimetableType } from '../lib/scheduling'
import { useNavigate } from '../lib/router'

const RUNNING = new Set(['queued', 'running', 'optimizing', 'validating'])

export function GeneratePage(){
 const { notify } = useToast(); const navigate = useNavigate()
 const [calendar,setCalendar]=useState<Calendar|null>(null); const [types,setTypes]=useState<TimetableType[]>([]); const [typeId,setTypeId]=useState<number|null>(null); const [days,setDays]=useState<number[]>([]); const [labels,setLabels]=useState<Record<number,string>>({}); const [periods,setPeriods]=useState<number[]>([]); const [job,setJob]=useState<Job|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null); const [starting,setStarting]=useState(false); const [editor,setEditor]=useState(false); const [editingTypeId,setEditingTypeId]=useState<number|null>(null); const [name,setName]=useState(''); const [code,setCode]=useState(''); const [typeDays,setTypeDays]=useState<number[]>([])

 async function load(){
  setLoading(true); setError(null)
  try{
   const [cal,tt,active]=await Promise.all([scheduling.calendar(),scheduling.timetableTypes(),scheduling.activeJob().catch(()=>null)])
   setCalendar(cal); setTypes(tt); setJob(active)
   const dayTypes=tt.filter(t=>t.is_active&&t.display_mode==='day')
   const first=dayTypes[0]??null
   if(first){
    setTypeId(first.id); setDays(first.day_indexes); setPeriods(cal.periods.filter(p=>p.is_teaching).map(p=>p.index))
    setLabels(Object.fromEntries(cal.days.map(d=>[d.index,d.name])))
   }else{setTypeId(null);setDays([]);setPeriods([]);setLabels(Object.fromEntries(cal.days.map(d=>[d.index,d.name])))}
  }catch(e){setError(friendlyApiError(e,'load timetable configuration'))}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[])

 const configuredDays=useMemo(()=>calendar?.days.filter(d=>d.is_active).slice().sort((a,b)=>a.index-b.index)??[],[calendar]); const teachingPeriods=useMemo(()=>calendar?.periods.filter(p=>p.is_teaching).slice().sort((a,b)=>a.index-b.index)??[],[calendar]); const selectedType=types.find(t=>t.id===typeId); const editingType=types.find(t=>t.id===editingTypeId); const running=!!job&&RUNNING.has(job.status)
 function toggle(list:number[],value:number,setter:(v:number[])=>void){setter(list.includes(value)?list.filter(v=>v!==value):[...list,value].sort((a,b)=>a-b))}
 function selectType(id:number){const t=types.find(x=>x.id===id);if(!t||t.display_mode!=='day')return;setTypeId(id);setDays(t.day_indexes);setPeriods(teachingPeriods.map(p=>p.index));setLabels(Object.fromEntries(configuredDays.map(d=>[d.index,d.name])))}
 function beginNew(){setEditingTypeId(null);setName('');setCode('');setTypeDays(configuredDays.map(d=>d.index));setEditor(true)}
 function beginEdit(){if(!selectedType||selectedType.is_system||selectedType.display_mode!=='day')return;setEditingTypeId(selectedType.id);setName(selectedType.name);setCode(selectedType.code);setTypeDays(selectedType.day_indexes);setEditor(true)}
 async function saveType(){if(!name.trim()||!code.trim()||!typeDays.length)return;try{const payload={name:name.trim(),code:code.trim(),display_mode:'day' as const,day_indexes:typeDays,is_active:true,is_system:false};const saved=editingTypeId!==null?await scheduling.updateTimetableType(editingTypeId,payload):await scheduling.createTimetableType(payload);setTypes(v=>editingTypeId!==null?v.map(t=>t.id===saved.id?saved:t):[...v,saved]);setTypeId(saved.id);setDays(saved.day_indexes);setPeriods(teachingPeriods.map(p=>p.index));setLabels(Object.fromEntries(configuredDays.map(d=>[d.index,d.name])));setEditor(false);setEditingTypeId(null);notify(editingType?'Timetable type updated.':'Timetable type created.','success')}catch(e){notify(friendlyApiError(e,'save timetable type'),'error')}}
 async function generate(){if(!typeId||!days.length||!periods.length||running||starting)return;setStarting(true);try{const selectedPeriodIndexes=periods.filter(index=>teachingPeriods.some(p=>p.index===index));const next=await scheduling.generateProfile({timetable_type_id:typeId,period_indexes:selectedPeriodIndexes,day_indexes:days,day_names:Object.fromEntries(days.map(i=>[i,(labels[i]??configuredDays.find(d=>d.index===i)?.name??String(i)).trim()])),max_seconds:30});setJob(next);notify('Timetable generation started.','success')}catch(e){notify(friendlyApiError(e,'generate timetable'),'error')}finally{setStarting(false)}}
 useEffect(()=>{
  if(!job||!RUNNING.has(job.status))return
  let timer:number|undefined
  let stopped=false
  const poll=async()=>{
   if(stopped||document.visibilityState==='hidden')return
   try{const next=await scheduling.job(job.id);if(!stopped)setJob(next)}catch{/* transient polling failures should not terminate the job UI */}
  }
  const schedule=()=>{if(!stopped){timer=window.setTimeout(async()=>{await poll();schedule()},2000)}}
  schedule()
  return()=>{stopped=true;if(timer)window.clearTimeout(timer)}
 },[job?.id,job?.status])

 if(loading)return <><PageHeader title="Generate timetable" description="Generate a draft from configured scheduling data." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'Timetable',to:'/timetable'},{label:'Generate'}]}/><div className="card section"><LoadingBlock label="Loading timetable configuration" rows={5}/></div></>
 if(error)return <><PageHeader title="Generate timetable" description="Generate a draft from configured scheduling data." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'Timetable',to:'/timetable'},{label:'Generate'}]}/><Alert tone="error" title="Configuration unavailable">{error}</Alert></>
 return <>
  <PageHeader title="Generate timetable" description="Choose the timetable type, rename the days if needed, select teaching periods, and generate a draft." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'Timetable',to:'/timetable'},{label:'Generate'}]}/>
  {job&&<section className="card section"><div className="panel__head"><div><h2 className="section__title">Generation {running?'in progress':'result'}</h2><p className="form__note">{job.message||job.stage||'Solver job'}</p></div><Badge tone={job.status==='completed'?'success':job.status==='failed'?'danger':'neutral'}>{job.status}</Badge></div><div className="progress" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><div className="progress__bar" style={{width:`${Math.max(0,Math.min(100,job.progress))}%`}}/></div>{job.result_version_id&&<div className="form__row" style={{marginTop:10}}><p className="form__note">Draft version #{job.result_version_id} is available.</p>{job.status==='completed'&&<button className="button button--secondary" type="button" onClick={()=>navigate(`/timetable?version=${job.result_version_id}`)}>Review draft</button>}</div>}</section>}
  <section className="card section"><div className="panel__head"><div><p className="form__note">TIMETABLE CONFIGURATION</p><h2 className="section__title">Build a timetable</h2><p className="form__note">Days remain tied to the school's configured calendar, while their timetable display labels can be changed for this generation.</p></div><Badge tone="neutral">Draft</Badge></div>
   <div className="form form--grid">
    <div className="field form--grid__full"><label className="field__label">Timetable type</label><div className="form__row"><select className="input input--select" value={typeId??''} onChange={e=>selectType(Number(e.target.value))}><option value="">Select a configured type</option>{types.filter(t=>t.is_active&&t.display_mode==='day').map(t=><option key={t.id} value={t.id}>{t.name} · {t.code}</option>)}</select><button className="button button--secondary" type="button" disabled={!selectedType||selectedType.is_system} onClick={beginEdit}>Edit</button><button className="button button--secondary" type="button" onClick={beginNew}>New type</button></div></div>
    {selectedType&&<div className="field form--grid__full"><label className="field__label">Schedule days</label><div className="chip-toggles">{configuredDays.filter(d=>selectedType.day_indexes.includes(d.index)).map(d=><label key={d.index} className={`chip-toggle ${days.includes(d.index)?'chip-toggle--on':''}`}><input type="checkbox" checked={days.includes(d.index)} onChange={()=>toggle(days,d.index,setDays)}/><span>{labels[d.index]||d.name}</span></label>)}</div></div>}
    {selectedType&&<div className="field form--grid__full"><label className="field__label">Display labels</label><p className="form__note">Rename any selected day to whatever you want, such as <strong>Day 1</strong>, <strong>Term A</strong>, <strong>1/9/27</strong>, or another label. These labels are used on the generated timetable.</p><div className="form form--grid">{configuredDays.filter(d=>selectedType.day_indexes.includes(d.index)).map(d=><div className="field" key={d.index}><label className="field__label" htmlFor={`schedule-label-${d.index}`}>{d.name}</label><input id={`schedule-label-${d.index}`} type="text" className="input" value={labels[d.index]??d.name} onChange={e=>setLabels(v=>({...v,[d.index]:e.target.value}))} placeholder={d.name}/></div>)}</div></div>}
    <div className="field form--grid__full"><label className="field__label">Teaching periods</label><div className="chip-toggles">{teachingPeriods.map(p=><label key={p.index} className={`chip-toggle ${periods.includes(p.index)?'chip-toggle--on':''}`}><input type="checkbox" checked={periods.includes(p.index)} onChange={()=>toggle(periods,p.index,setPeriods)}/><span>{p.name} · {p.start_time}–{p.end_time}</span></label>)}</div>{!teachingPeriods.length&&<p className="form__note">No teaching periods are configured.</p>}</div>
   </div>
   <div className="form__row" style={{marginTop:20}}><button className="button button--primary" type="button" disabled={!typeId||!days.length||!periods.length||running||starting} onClick={()=>void generate()}>{starting?'Starting…':running?`Generating… ${job?.progress??0}%`:'Generate timetable'}</button></div>
  </section>
  {editor&&<section className="card section"><div className="panel__head"><div><h2 className="section__title">{editingType?'Edit timetable type':'Create timetable type'}</h2><p className="form__note">Timetable types are day-based. Date mode is not used in this generation flow.</p></div></div><div className="form form--grid"><div className="field"><label className="field__label">Name</label><input className="input" value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label className="field__label">Code</label><input className="input" value={code} onChange={e=>setCode(e.target.value)}/></div><div className="field form--grid__full"><label className="field__label">Default schedule days</label><div className="chip-toggles">{configuredDays.map(d=><label key={d.index} className={`chip-toggle ${typeDays.includes(d.index)?'chip-toggle--on':''}`}><input type="checkbox" checked={typeDays.includes(d.index)} onChange={()=>toggle(typeDays,d.index,setTypeDays)}/><span>{d.name}</span></label>)}</div></div></div><div className="form__row" style={{marginTop:16}}><button className="button button--primary" type="button" disabled={!name.trim()||!code.trim()||!typeDays.length} onClick={()=>void saveType()}>Save type</button><button className="button button--secondary" type="button" onClick={()=>{setEditor(false);setEditingTypeId(null)}}>Cancel</button></div></section>}
 </>
}
