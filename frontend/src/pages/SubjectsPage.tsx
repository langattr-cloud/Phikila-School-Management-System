import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { apiFetch, friendlyApiError, type SchoolClassSetup } from '../lib/api'

type Subject = { id: string; name: string; code: string; category: 'Core' | 'Elective' | 'Practical'; lessonsPerWeek: number; teacherId: string; classCodes: string[]; gradeLessonCounts: Record<string, number>; active: boolean; rawProfile?: Record<string, unknown> }
type StaffRecord = { id: string; name: string; code: string }
type ClassRecord = { id: string; name: string; code: string; count: number }
type SavedProfile = { id: number; profile: Record<string, unknown> }
type TeacherProfile = { id: number; profile: { firstName?: string; lastName?: string; short?: string; titleBefore?: string; titleAfter?: string } }
const toSubject = (row: SavedProfile): Subject => {
  const p = row.profile
  return { id: String(row.id), name: String(p.title ?? ''), code: String(p.short ?? p.code ?? '').toUpperCase(), category: (['Core','Elective','Practical'].includes(String(p.category)) ? p.category : 'Core') as Subject['category'], lessonsPerWeek: Math.max(1, Number(p.count ?? p.lessonsPerWeek ?? 4) || 4), teacherId: String(p.teacherId ?? ''), classCodes: Array.isArray(p.classCodes) ? p.classCodes.map(String) : [], gradeLessonCounts: p.gradeLessonCounts && typeof p.gradeLessonCounts === 'object' ? Object.fromEntries(Object.entries(p.gradeLessonCounts as Record<string, unknown>).map(([k,v])=>[k,Math.max(1,Math.min(50,Number(v)||4))])) : {}, active: p.active !== false, rawProfile: p }
}
const css = `
.subject-page{max-width:1440px;margin:0 auto;padding:24px;color:var(--text,#172033)}
.subject-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.subject-actions{display:flex;gap:8px;flex-wrap:wrap}
.subject-btn{border:1px solid var(--border,#dce2ea);border-radius:8px;padding:10px 13px;background:var(--surface,#fff);color:inherit;cursor:pointer;font-size:13px;font-weight:650}
.subject-btn.primary{background:#176b4d;border-color:#176b4d;color:white}
.subject-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px}
.subject-stat{border:1px solid var(--border,#e1e6ed);background:var(--surface,#fff);border-radius:12px;padding:16px}
.subject-stat span{display:block;font-size:12px;color:var(--muted,#697386);margin-bottom:8px}.subject-stat strong{font-size:26px}
.subject-panel{border:1px solid var(--border,#e1e6ed);border-radius:12px;overflow:hidden;background:var(--surface,#fff)}
.subject-toolbar{padding:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--border,#e1e6ed)}
.subject-search{border:1px solid var(--border,#dce2ea);border-radius:8px;padding:10px 12px;background:var(--surface,#fff);color:inherit;font:inherit;font-size:13px;min-width:230px}
.subject-table-wrap{overflow:auto}.subject-table{width:100%;border-collapse:collapse;min-width:760px}
.subject-table th{text-align:left;background:var(--soft,#f7f8fa);color:var(--muted,#697386);font-size:11px;text-transform:uppercase;letter-spacing:.5px;padding:12px}
.subject-table td{border-top:1px solid var(--border,#edf0f4);padding:13px 12px;font-size:13px;vertical-align:middle}
.subject-name{font-weight:700}.subject-sub{display:block;color:var(--muted,#697386);font-size:11px;margin-top:3px}
.subject-code{display:inline-block;background:var(--soft,#f0f3f7);border-radius:6px;padding:5px 8px;font-weight:700}
.subject-pill{display:inline-block;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:700;background:#e6f5ec;color:#176b4d}
.subject-pill.inactive{background:#fce8e6;color:#b42318}
.subject-row-actions{display:flex;gap:6px}.subject-empty{padding:32px;text-align:center;color:var(--muted,#697386)}
.subject-backdrop{position:fixed;inset:0;background:#10182880;display:flex;align-items:center;justify-content:center;padding:16px;z-index:1000}
.subject-modal{width:min(100%,560px);max-height:90vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#172033);border-radius:14px;padding:24px;box-shadow:0 20px 60px #0003}
.subject-modal h2{margin:0 0 6px;font-size:22px}.subject-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}
.subject-field{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:650}.subject-field input,.subject-field select{box-sizing:border-box;width:100%;border:1px solid var(--border,#dce2ea);border-radius:8px;padding:10px;background:var(--surface,#fff);color:inherit;font:inherit;font-size:13px}
.subject-field.full{grid-column:1/-1}.subject-class-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:5px}.subject-class-option{font-size:12px;font-weight:500;display:flex;gap:6px;align-items:center}.subject-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}
@media(max-width:650px){.subject-page{padding:15px}.subject-summary{grid-template-columns:1fr}.subject-form{grid-template-columns:1fr}.subject-field.full{grid-column:auto}.subject-search{min-width:0;width:100%;box-sizing:border-box}.subject-class-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
`
export default function SubjectsPage() {
  const [subjects,setSubjects] = useState<Subject[]>([])
  const [staff,setStaff] = useState<StaffRecord[]>([])
  const [classes,setClasses] = useState<ClassRecord[]>([])
  const [query,setQuery] = useState('')
  const [category,setCategory] = useState('All')
  const [editing,setEditing] = useState<string|null>(null)
  const [modal,setModal] = useState(false)
  const [notice,setNotice] = useState('')
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [form,setForm] = useState({name:'',code:'',category:'Core' as Subject['category'],lessonsPerWeek:'4',teacherId:'',classCodes:[] as string[],gradeLessonCounts:{} as Record<string,string>,active:true})
  const loadData = async () => {
    setLoading(true)
    try {
      const [subjectRows,teacherRows,classRows] = await Promise.all([
        apiFetch<SavedProfile[]>('/api/v1/timetable/subjects'),
        apiFetch<TeacherProfile[]>('/api/v1/timetable/teachers'),
        apiFetch<SchoolClassSetup[]>('/api/v1/academics/classes')
      ])
      setSubjects(subjectRows.map(toSubject))
      setStaff(teacherRows.map(t=>({id:String(t.id),name:[t.profile.titleBefore,t.profile.firstName,t.profile.lastName,t.profile.titleAfter].filter(Boolean).join(' '),code:t.profile.short||String(t.id)})))
      setClasses(classRows.map((item: SchoolClassSetup)=>({id:String(item.id),name:item.name,code:item.code,count:0})))
      setNotice('')
    } catch(error) {
      setNotice(friendlyApiError(error,'load shared subjects, teachers and classes'))
    } finally { setLoading(false) }
  }
  useEffect(()=>{ void loadData() },[])
  const filtered=useMemo(()=>subjects.filter(s=>(!query||[s.name,s.code,s.category].join(' ').toLowerCase().includes(query.toLowerCase()))&&(category==='All'||s.category===category)),[subjects,query,category])
  const openCreate=()=>{setEditing(null);setForm({name:'',code:'',category:'Core',lessonsPerWeek:'4',teacherId:'',classCodes:[],gradeLessonCounts:{},active:true});setModal(true)}
  const openEdit=(s:Subject)=>{setEditing(s.id);setForm({name:s.name,code:s.code,category:s.category,lessonsPerWeek:String(s.lessonsPerWeek),teacherId:s.teacherId,classCodes:[...s.classCodes],gradeLessonCounts:Object.fromEntries(s.classCodes.map(code=>[code,String(s.gradeLessonCounts[code]??s.lessonsPerWeek)])),active:s.active});setModal(true)}
  const save=async(e:FormEvent)=>{e.preventDefault();const name=form.name.trim(),code=form.code.trim().toUpperCase(),lessons=Number(form.lessonsPerWeek);if(!name||!code||!Number.isInteger(lessons)||lessons<1||lessons>50){setNotice('Enter a subject name, code and a lesson count from 1 to 50.');return}if(subjects.some(s=>s.code.toLowerCase()===code.toLowerCase()&&s.id!==editing)){setNotice('That subject code is already in use.');return}
    const gradeLessonCounts=Object.fromEntries(form.classCodes.map(classCode=>[classCode,Math.max(1,Math.min(50,Number(form.gradeLessonCounts[classCode]??lessons)||lessons))]));const profile={title:name,short:code,code,category:form.category,count:lessons,lessonsPerWeek:lessons,teacherId:form.teacherId,classCodes:form.classCodes,gradeLessonCounts,active:form.active}
    setSaving(true);setNotice('')
    try { const saved=editing?await apiFetch<SavedProfile>('/api/v1/timetable/subjects/'+editing,{method:'PUT',body:JSON.stringify({profile:{...(subjects.find(s=>s.id===editing)?.rawProfile??{}),...profile}})}):await apiFetch<SavedProfile>('/api/v1/timetable/subjects',{method:'POST',body:JSON.stringify({profile})})
      setSubjects(current=>editing?current.map(s=>s.id===editing?toSubject(saved):s):[toSubject(saved),...current]);setModal(false);setNotice(editing?'Subject updated and saved to the shared database.':'Subject created in the shared database.')
    } catch(error){setNotice(friendlyApiError(error,editing?'update subject':'create subject'))} finally{setSaving(false)}
  }
  const remove=async(s:Subject)=>{if(!window.confirm(`Remove subject ${s.name}? This removes it from the shared database.`))return;try{await apiFetch<void>('/api/v1/timetable/subjects/'+s.id,{method:'DELETE'});setSubjects(p=>p.filter(x=>x.id!==s.id));setNotice('Subject removed from the shared database.')}catch(error){setNotice(friendlyApiError(error,'remove subject'))}}
  const toggleClass=(code:string)=>setForm(p=>{const selected=p.classCodes.includes(code);return {...p,classCodes:selected?p.classCodes.filter(c=>c!==code):[...p.classCodes,code],gradeLessonCounts:selected?Object.fromEntries(Object.entries(p.gradeLessonCounts).filter(([k])=>k!==code)):{...p.gradeLessonCounts,[code]:p.lessonsPerWeek}}})
  const exportCsv=()=>{const rows=[['Subject','Code','Category','Default lessons per week','Class-specific lessons','Assigned teacher','Classes','Status'],...filtered.map(s=>[s.name,s.code,s.category,String(s.lessonsPerWeek),s.classCodes.map(code=>`${classes.find(c=>c.code===code)?.name??code}: ${s.gradeLessonCounts[code]??s.lessonsPerWeek}`).join('; '),staff.find(t=>t.id===s.teacherId)?.name??'',s.classCodes.join('; '),s.active?'Active':'Inactive'])];const csv=rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='phikila-subjects.csv';document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Subject CSV exported.')}
  return <div className="subject-page"><style>{css}</style>
    <PageHeader title="Subjects" description="Manage curriculum subjects, weekly lesson allocations, teachers and class applicability." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'School setup',to:'/setup/school-structure'},{label:'Subjects'}]}/>
    <header className="subject-header"><div><p className="staff-muted">Curriculum directory and lesson planning defaults.</p></div><div className="subject-actions"><button className="subject-btn" onClick={exportCsv}>Export CSV</button><button className="subject-btn primary" onClick={openCreate} disabled={loading}>＋ Add subject</button><button className="subject-btn" onClick={()=>void loadData()} disabled={loading}>Refresh</button></div></header>
    <section className="subject-summary"><div className="subject-stat"><span>Total subjects</span><strong>{subjects.length}</strong></div><div className="subject-stat"><span>Active subjects</span><strong>{subjects.filter(s=>s.active).length}</strong></div><div className="subject-stat"><span>Weekly lessons (configured)</span><strong>{subjects.filter(s=>s.active).reduce((n,s)=>n+s.lessonsPerWeek,0)}</strong></div></section>
    <section className="subject-panel"><div className="subject-toolbar"><input className="subject-search" aria-label="Search subjects" placeholder="Search subject or code…" value={query} onChange={e=>setQuery(e.target.value)}/><select className="subject-search" aria-label="Filter category" value={category} onChange={e=>setCategory(e.target.value)}><option>All</option><option>Core</option><option>Elective</option><option>Practical</option></select></div>
    <div className="subject-table-wrap"><table className="subject-table"><thead><tr><th>Subject</th><th>Code</th><th>Category</th><th>Lessons / week by class</th><th>Assigned teacher</th><th>Classes</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map(s=><tr key={s.id}><td><span className="subject-name">{s.name}</span></td><td><span className="subject-code">{s.code}</span></td><td>{s.category}</td><td>{s.classCodes.length?s.classCodes.map(code=><span key={code} className="subject-sub">{classes.find(c=>c.code===code)?.name??code}: {s.gradeLessonCounts[code]??s.lessonsPerWeek}</span>):s.lessonsPerWeek+' default (no classes assigned)'}</td><td>{staff.find(t=>t.id===s.teacherId)?.name??<span style={{color:'var(--muted,#697386)'}}>Unassigned</span>}</td><td>{s.classCodes.length? s.classCodes.length+' classes':'No classes'}</td><td><span className={`subject-pill ${s.active?'':'inactive'}`}>{s.active?'Active':'Inactive'}</span></td><td><div className="subject-row-actions"><button className="subject-btn" onClick={()=>openEdit(s)}>Edit</button><button className="subject-btn" onClick={()=>remove(s)}>Remove</button></div></td></tr>)}</tbody></table>{loading&&<div className="subject-empty">Loading shared subject records…</div>}{!loading&&filtered.length===0&&<div className="subject-empty">No subjects match these filters.</div>}</div><div className="staff-note">Subject records, assignments and weekly lesson counts are saved to the signed-in account's shared backend database.</div></section>
    {notice&&<p role="status" style={{fontSize:13,color:'var(--muted,#697386)'}}>{notice} <button className="subject-btn" onClick={()=>setNotice('')}>Dismiss</button></p>}
    {modal&&<div className="subject-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><section className="subject-modal" role="dialog" aria-modal="true" aria-labelledby="subject-modal-title"><h2 id="subject-modal-title">{editing?'Edit':'Add'} subject</h2><p style={{fontSize:13,color:'var(--muted,#697386)'}}>Configure subject details and where it is taught.</p><form onSubmit={save}><div className="subject-form"><label className="subject-field full">Subject name *<input autoFocus required maxLength={100} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Mathematics"/></label><label className="subject-field">Subject code *<input required maxLength={16} value={form.code} onChange={e=>setForm(p=>({...p,code:e.target.value.toUpperCase()}))} placeholder="e.g. MAT"/></label><label className="subject-field">Category<select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value as Subject['category']}))}><option>Core</option><option>Elective</option><option>Practical</option></select></label><label className="subject-field">Lessons per week *<input type="number" min="1" max="50" step="1" required value={form.lessonsPerWeek} onChange={e=>setForm(p=>({...p,lessonsPerWeek:e.target.value}))}/></label><label className="subject-field">Assigned teacher<select value={form.teacherId} onChange={e=>setForm(p=>({...p,teacherId:e.target.value}))}><option value="">Unassigned</option>{staff.map(t=><option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}</select></label><div className="subject-field full"><span>Classes / grades and their weekly lesson counts</span><p style={{fontWeight:400,color:'var(--muted,#697386)',margin:'2px 0 8px'}}>Select each class, then set the number of lessons for that class. Counts can differ by grade.</p><div className="subject-class-list">{(classes.length?classes:[]).map(c=><label key={c.id} className="subject-class-option"><input type="checkbox" checked={form.classCodes.includes(c.code)} onChange={()=>toggleClass(c.code)}/>{c.name} ({c.code})</label>)}</div>{form.classCodes.length>0&&<div style={{display:'grid',gap:10,marginTop:12}}>{form.classCodes.map(code=>{const cls=classes.find(c=>c.code===code);return <label key={code} className="subject-field">{cls?.name??code} — lessons per week<input type="number" min="1" max="50" step="1" required value={form.gradeLessonCounts[code]??form.lessonsPerWeek} onChange={e=>setForm(p=>({...p,gradeLessonCounts:{...p.gradeLessonCounts,[code]:e.target.value}}))}/></label>})}</div>}{classes.length===0&&<span style={{fontWeight:400,color:'var(--muted,#697386)'}}>Add classes in Teachers & classes first. You can save a subject without assigning classes.</span>}</div><label className="subject-field full"><span><input type="checkbox" checked={form.active} onChange={e=>setForm(p=>({...p,active:e.target.checked}))}/> Active subject</span></label></div><div className="subject-modal-actions"><button type="button" className="subject-btn" onClick={()=>setModal(false)}>Cancel</button><button type="submit" className="subject-btn primary" disabled={saving}>{saving?'Saving…':'Save subject'}</button></div></form></section></div>}
  </div>
}
