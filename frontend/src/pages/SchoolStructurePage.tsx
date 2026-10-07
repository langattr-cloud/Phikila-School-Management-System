import { useCallback, useEffect, useMemo, useState } from 'react'
import './school-structure.css'
import { PageHeader } from '../components/PageHeader'
import { Badge, ErrorState } from '../components/States'
import { LayersIcon } from '../components/icons'
import { api, friendlyApiError, type AcademicYear, type Grade, type Level, type Stream } from '../lib/api'
import { useToast } from '../components/Toast'

const STRUCTURE = [
  { name:'Primary School', code:'PRI', order:20, grades:[
    { name:'Grade 4', code:'G4', streams:[] },
    { name:'Grade 5', code:'G5', streams:[['E','5E'],['W','5W']] },
  ]},
  { name:'Junior School', code:'JUN', order:30, grades:[
    { name:'Grade 7', code:'G7', streams:[['R','7R'],['B','7B']] },
    { name:'Grade 8', code:'G8', streams:[['R','8R'],['B','8B']] },
  ]},
] as const

type LoadedGrade = Grade & { streams: Stream[] }

export function SchoolStructurePage() {
  const { notify } = useToast()
  const [years,setYears] = useState<AcademicYear[]>([])
  const [levels,setLevels] = useState<Level[]>([])
  const [grades,setGrades] = useState<LoadedGrade[]>([])
  const [yearId,setYearId] = useState<number|null>(null)
  const [loading,setLoading] = useState(true)
  const [applying,setApplying] = useState(false)
  const [error,setError] = useState<string|null>(null)
  const activeYears = useMemo(() => [...years].sort((a,b)=>Number(b.name)-Number(a.name)),[years])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [ys,ls,gs] = await Promise.all([api.academicYears(),api.levels(),api.grades()])
      setYears(ys); setLevels(ls)
      setGrades(await Promise.all(gs.map(async g => ({...g,streams:yearId===null?[]:await api.streams(yearId,g.id)}))))
    } catch (e) { setError(friendlyApiError(e,'load the school structure')) }
    finally { setLoading(false) }
  },[yearId])

  useEffect(()=>{ if(yearId===null){const y=activeYears.find(x=>x.is_current)||activeYears[0]; if(y)setYearId(y.id)} },[activeYears,yearId])
  useEffect(()=>{ if(yearId!==null) void load() },[load,yearId])

  const levelMap = useMemo(()=>new Map(levels.map(x=>[x.code.toUpperCase(),x])),[levels])
  const gradeMap = useMemo(()=>new Map(grades.map(x=>[x.code.toUpperCase(),x])),[grades])

  async function applyStructure() {
    if(!yearId || applying) return
    setApplying(true); setError(null)
    try {
      const resolvedLevels = new Map<string,Level>()
      for(const d of STRUCTURE){
        let level = levelMap.get(d.code)
        if(!level) level = await api.createLevel({name:d.name,code:d.code,display_order:d.order,status:'ACTIVE'})
        resolvedLevels.set(d.code,level)
      }
      const allGrades = await api.grades()
      const resolvedGrades = new Map<string,Grade>()
      for(const l of STRUCTURE) for(const d of l.grades){
        const level=resolvedLevels.get(l.code)!
        let grade=allGrades.find(x=>x.code.toUpperCase()===d.code && x.level_id===level.id)
        if(!grade) grade=await api.createGrade({level_id:level.id,name:d.name,code:d.code,status:true})
        resolvedGrades.set(d.code,grade)
      }
      let added=0
      for(const l of STRUCTURE) for(const d of l.grades){
        if(!d.streams.length) continue
        const level=resolvedLevels.get(l.code)!, grade=resolvedGrades.get(d.code)!
        const existing=await api.streams(yearId,grade.id)
        const codes=new Set(existing.map(x=>(x.code||'').toUpperCase()))
        const missing=d.streams.filter(x=>!codes.has(x[1]))
        if(missing.length){
          await api.createStreamsBulk({academic_year_id:yearId,level_id:level.id,grade_id:grade.id,streams:missing.map(x=>({name:x[0],code:x[1],status:'ACTIVE'}))})
          added+=missing.length
        }
      }
      notify(added ? 'School structure applied. Streams were added.' : 'School structure is already configured.','success')
      await load()
    } catch(e) { setError(friendlyApiError(e,'apply the school structure')) }
    finally { setApplying(false) }
  }

  return <>
    <PageHeader title="School Structure" description="Manage the canonical Level → Grade → Stream hierarchy while preserving existing Classes workflows." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'School Structure'}]}/>
    {error && <ErrorState title="School structure could not be updated" message={error} onRetry={load}/>}
    <section className="card section school-structure__hero">
      <div><p className="eyebrow">Phikila academic structure</p><h2 className="section__title">Primary and Junior School</h2><p className="section__description">Grade 4 has no stream. Grade 5 uses 5E and 5W. Grade 7 uses 7R and 7B. Grade 8 uses 8R and 8B.</p></div>
      <div className="school-structure__actions"><label className="label" htmlFor="structure-year">Academic year</label><select id="structure-year" className="input" value={yearId??''} onChange={e=>setYearId(Number(e.target.value)||null)}><option value="">Select academic year</option>{activeYears.map(y=><option key={y.id} value={y.id}>{y.name}{y.is_current?' (Current)':''}</option>)}</select><button type="button" className="button button--primary" onClick={()=>void applyStructure()} disabled={!yearId||applying||loading}>{applying?'Applying…':'Apply school structure'}</button></div>
    </section>
    <section className="card section"><div className="section__header"><div><p className="eyebrow">Canonical hierarchy</p><h2 className="section__title">Level → Grade → Stream</h2><p className="section__description">Streams are created only where the school has defined them. Existing Classes, timetable, examinations and enrollment workflows remain available.</p></div></div>
      {loading?<p>Loading registered school structure…</p>:<div className="school-structure__tree">{STRUCTURE.map(level=>{const lv=levelMap.get(level.code);return <article className="school-structure__level" key={level.code}><div className="school-structure__level-head"><div><span className="school-structure__code">{level.code}</span><h3>{level.name}</h3></div><Badge tone={lv?'success':'warning'}>{lv?'Configured':'Missing'}</Badge></div><div className="school-structure__grades">{level.grades.map(g=>{const grade=gradeMap.get(g.code);return <div className="school-structure__grade" key={g.code}><div className="school-structure__grade-head"><strong>{g.name}</strong><Badge tone={grade?'success':'warning'}>{grade?'Configured':'Missing'}</Badge></div>{g.streams.length?<div className="school-structure__streams">{g.streams.map(s=>{const ok=grade?.streams.some(x=>x.code===s[1]);return <span className="school-structure__stream" key={s[1]}><strong>{s[1]}</strong><Badge tone={ok?'success':'warning'}>{ok?'Active':'Missing'}</Badge></span>})}</div>:<span className="school-structure__no-stream">No stream</span>}</div>})}</div></article>})}</div>}
    </section>
    <section className="card section"><div className="section__header"><div><p className="eyebrow">Rules</p><h2 className="section__title">School structure</h2></div></div><ul className="school-structure__notes"><li>Primary → Grade 4 (no stream) and Grade 5 → 5E, 5W.</li><li>Junior → Grade 7 → 7R, 7B and Grade 8 → 8R, 8B.</li><li>5E, 5W, 7R, 7B, 8R and 8B are streams, not grades.</li><li>Student assignment continues through the existing Streams module.</li></ul></section>
    <span className="visually-hidden"><LayersIcon width={1} height={1}/></span>
  </>
}
