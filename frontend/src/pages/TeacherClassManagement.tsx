import { useEffect, useMemo, useState, type FormEvent } from 'react'

type Teacher = { id: string; name: string; code: string; email: string; classId: string; subject: string; unavailable: string[] }
type SchoolClass = { id: string; name: string; code: string; count: number }
type Tab = 'teachers' | 'classes'
const KEY = 'phikila.staff-classes.v1'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const PERIODS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
const seedClasses: SchoolClass[] = [
  { id: 'g4', name: 'Grade 4', code: 'G4', count: 35 }, { id: '5e', name: 'Grade 5E', code: '5E', count: 35 },
  { id: '5w', name: 'Grade 5W', code: '5W', count: 35 }, { id: '6e', name: 'Grade 6E', code: '6E', count: 35 },
  { id: '6w', name: 'Grade 6W', code: '6W', count: 35 }, { id: '6n', name: 'Grade 6N', code: '6N', count: 35 },
  { id: '7r', name: 'Grade 7R', code: '7R', count: 40 }, { id: '7b', name: 'Grade 7B', code: '7B', count: 40 },
  { id: '7y', name: 'Grade 7Y', code: '7Y', count: 40 }, { id: '8r', name: 'Grade 8R', code: '8R', count: 40 },
  { id: '8b', name: 'Grade 8B', code: '8B', count: 40 }, { id: '8y', name: 'Grade 8Y', code: '8Y', count: 40 },
  { id: '8g', name: 'Grade 8G', code: '8G', count: 40 }, { id: '9r', name: 'Grade 9R', code: '9R', count: 40 },
  { id: '9b', name: 'Grade 9B', code: '9B', count: 40 }, { id: '9y', name: 'Grade 9Y', code: '9Y', count: 40 },
  { id: '9g', name: 'Grade 9G', code: '9G', count: 40 },
]
const seedTeachers: Teacher[] = [
  { id: 't1', name: 'Bett Hussein', code: '2', email: '', classId: '', subject: '', unavailable: ['Mon-P7','Mon-P8','Tue-P8'] },
  { id: 't2', name: 'Tele Florence', code: '3', email: '', classId: '', subject: '', unavailable: ['Fri-P8'] },
  { id: 't3', name: 'Tanui Paul', code: '4', email: '', classId: '', subject: '', unavailable: ['Fri-P8'] },
  { id: 't4', name: 'Langat Philemon', code: '5', email: '', classId: '8b', subject: '', unavailable: ['Mon-P1','Tue-P6'] },
  { id: 't5', name: 'Kerich Florence', code: '6', email: '', classId: '8r', subject: '', unavailable: [] },
  { id: 't6', name: 'Langat Leonard', code: '17', email: '', classId: '5w', subject: '', unavailable: ['Mon-P1'] },
  { id: 't7', name: 'Nyongesa Abil', code: '7', email: '', classId: '9g', subject: '', unavailable: [] },
  { id: 't8', name: 'Ouko Robert', code: '8', email: '', classId: '9r', subject: '', unavailable: [] },
  { id: 't9', name: 'Ouma Fred', code: '9', email: '', classId: '6e', subject: '', unavailable: [] },
  { id: 't10', name: 'Owino Moses', code: '10', email: '', classId: '9b', subject: '', unavailable: [] },
  { id: 't11', name: 'Langat Geoffrey', code: '11', email: '', classId: '7b', subject: '', unavailable: ['Fri-P7','Fri-P8'] },
  { id: 't12', name: 'Towett Isaack', code: '12', email: '', classId: '6w', subject: '', unavailable: ['Mon-P1'] },
  { id: 't13', name: 'Sigei Hellen', code: '13', email: '', classId: '7r', subject: '', unavailable: ['Fri-P7','Fri-P8'] },
  { id: 't14', name: 'Mosonik Cynthia', code: '14', email: '', classId: '9g', subject: '', unavailable: ['Fri-P8'] },
  { id: 't15', name: 'Ngetich Maryline', code: '15', email: '', classId: '6n', subject: '', unavailable: ['Fri-P8'] },
  { id: 't16', name: 'Cheruiyot Richard', code: '16', email: '', classId: '9y', subject: '', unavailable: ['Mon-P1'] },
  { id: 't17', name: 'Rono Doris', code: '18', email: '', classId: '8y', subject: '', unavailable: [] },
  { id: 't18', name: 'Rotich Hellen', code: '19', email: '', classId: '8g', subject: '', unavailable: ['Fri-P8'] },
]
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const styles = `
.staff-page{color:var(--text,#172033);padding:clamp(16px,3vw,30px);max-width:1440px;margin:0 auto}
.staff-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap;margin-bottom:22px}
.staff-head h1{font-size:clamp(24px,3vw,32px);margin:0 0 7px;font-weight:750;letter-spacing:-.6px}
.staff-muted{color:var(--muted,#697386);font-size:14px;margin:0}
.staff-actions{display:flex;gap:9px;flex-wrap:wrap}
.staff-btn{border:1px solid var(--border,#dce2ea);background:var(--surface,#fff);color:var(--text,#172033);padding:10px 14px;border-radius:9px;font-weight:650;cursor:pointer;font-size:13px}
.staff-btn.primary{background:#176b4d;border-color:#176b4d;color:white}
.staff-btn.danger{color:#b42318}
.staff-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:22px}
.staff-stat{border:1px solid var(--border,#e1e6ed);background:var(--surface,#fff);border-radius:12px;padding:17px}
.staff-stat span{font-size:12px;color:var(--muted,#697386);display:block;margin-bottom:8px}
.staff-stat strong{font-size:26px;letter-spacing:-.5px}
.staff-panel{background:var(--surface,#fff);border:1px solid var(--border,#e1e6ed);border-radius:12px;overflow:hidden}
.staff-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:15px;border-bottom:1px solid var(--border,#e1e6ed)}
.staff-tabs{display:flex;gap:5px;background:var(--soft,#f3f5f8);padding:4px;border-radius:9px}
.staff-tab{border:0;background:transparent;padding:9px 13px;border-radius:7px;font-weight:650;color:var(--muted,#697386);cursor:pointer}
.staff-tab[aria-selected=true]{background:var(--surface,#fff);color:var(--text,#172033);box-shadow:0 1px 3px #00000012}
.staff-search{border:1px solid var(--border,#dce2ea);background:var(--surface,#fff);border-radius:8px;padding:10px 12px;min-width:220px;color:inherit;font:inherit;font-size:13px}
.staff-table-wrap{overflow:auto}
.staff-table{width:100%;border-collapse:collapse;min-width:680px}
.staff-table th{text-align:left;color:var(--muted,#697386);font-size:11px;text-transform:uppercase;letter-spacing:.55px;background:var(--soft,#f7f8fa);padding:12px 15px;font-weight:700}
.staff-table td{padding:12px 15px;border-top:1px solid var(--border,#edf0f4);font-size:13px;vertical-align:middle}
.staff-name{font-weight:700;text-transform:capitalize}
.staff-sub{display:block;font-size:11px;color:var(--muted,#697386);margin-top:3px}
.staff-code{display:inline-flex;align-items:center;justify-content:center;background:var(--soft,#f0f3f7);border-radius:6px;padding:5px 8px;font-weight:700;min-width:30px}
.staff-chip{display:inline-block;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:700;background:#e6f5ec;color:#176b4d}
.staff-grid{display:grid;grid-template-columns:repeat(8,minmax(23px,1fr));gap:3px;min-width:220px}
.staff-slot{height:12px;border:1px solid #b8e3c6;background:#52b76d;border-radius:2px;cursor:pointer;padding:0}
.staff-slot.off{background:#d84b4b;border-color:#d84b4b}
.staff-slot:focus-visible{outline:2px solid #176b4d;outline-offset:2px}
.staff-legend{display:flex;align-items:center;gap:12px;font-size:11px;color:var(--muted,#697386)}
.staff-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;background:#52b76d}
.staff-legend .off i{background:#d84b4b}
.staff-row-actions{display:flex;gap:6px}
.staff-iconbtn{border:1px solid var(--border,#dce2ea);background:transparent;border-radius:7px;padding:6px 9px;cursor:pointer;color:inherit}
.staff-empty{padding:34px;text-align:center;color:var(--muted,#697386)}
.staff-modal-backdrop{position:fixed;inset:0;background:#10182880;display:flex;align-items:center;justify-content:center;padding:18px;z-index:1000}
.staff-modal{width:min(100%,520px);max-height:90vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#172033);border-radius:14px;padding:24px;box-shadow:0 20px 60px #0003}
.staff-modal h2{margin:0 0 5px;font-size:22px}
.staff-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}
.staff-field{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:650}
.staff-field input,.staff-field select{width:100%;box-sizing:border-box;border:1px solid var(--border,#dce2ea);border-radius:8px;padding:11px;background:var(--surface,#fff);color:inherit;font:inherit;font-size:13px}
.staff-field.full{grid-column:1/-1}
.staff-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}
.staff-note{padding:12px 15px;border-top:1px solid var(--border,#e1e6ed);color:var(--muted,#697386);font-size:12px}
@media(max-width:650px){.staff-stats{grid-template-columns:1fr}.staff-form{grid-template-columns:1fr}.staff-field.full{grid-column:auto}.staff-toolbar{align-items:stretch}.staff-search{min-width:0;width:100%;box-sizing:border-box}}
`
export default function TeacherClassManagement() {
  const [tab, setTab] = useState<Tab>('teachers')
  const [teachers, setTeachers] = useState<Teacher[]>(() => { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v).teachers ?? seedTeachers : seedTeachers } catch { return seedTeachers } })
  const [classes, setClasses] = useState<SchoolClass[]>(() => { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v).classes ?? seedClasses : seedClasses } catch { return seedClasses } })
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<'teacher'|'class'|null>(null)
  const [editingId, setEditingId] = useState<string|null>(null)
  const [notice, setNotice] = useState('')
  const [teacherForm, setTeacherForm] = useState({name:'',code:'',email:'',classId:'',subject:''})
  const [classForm, setClassForm] = useState({name:'',code:'',count:'35'})
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({teachers,classes})) } catch { setNotice('Browser storage is unavailable. Changes may not persist after closing this page.') } }, [teachers, classes])
  const assigned = useMemo(() => teachers.filter(t => t.classId).length, [teachers])
  const visibleTeachers = useMemo(() => teachers.filter(t => [t.name,t.code,t.email,t.subject,classes.find(c=>c.id===t.classId)?.name].join(' ').toLowerCase().includes(query.toLowerCase())), [teachers,classes,query])
  const visibleClasses = useMemo(() => classes.filter(c => [c.name,c.code].join(' ').toLowerCase().includes(query.toLowerCase())), [classes,query])
  const openTeacher = (t?: Teacher) => { setEditingId(t?.id ?? null); setTeacherForm(t ? {name:t.name,code:t.code,email:t.email,classId:t.classId,subject:t.subject} : {name:'',code:String(Math.max(1,...teachers.map(x=>Number(x.code)||0))+1),email:'',classId:'',subject:''}); setModal('teacher') }
  const openClass = (c?: SchoolClass) => { setEditingId(c?.id ?? null); setClassForm(c ? {name:c.name,code:c.code,count:String(c.count)} : {name:'',code:'',count:'35'}); setModal('class') }
  const submitTeacher = (e: FormEvent) => { e.preventDefault(); const name=teacherForm.name.trim(), code=teacherForm.code.trim(); if (!name||!code) return; if(teachers.some(t=>t.code.toLowerCase()===code.toLowerCase()&&t.id!==editingId)){setNotice('That teacher short code is already in use.');return} if(editingId) setTeachers(p=>p.map(t=>t.id===editingId?{...t,...teacherForm,name,code}:t)); else setTeachers(p=>[...p,{...teacherForm,id:uid(),name,code,unavailable:[]}]); setModal(null);setNotice(editingId?'Teacher updated.':'Teacher added.') }
  const submitClass = (e: FormEvent) => { e.preventDefault(); const name=classForm.name.trim(),code=classForm.code.trim(),count=Number(classForm.count); if(!name||!code||!Number.isInteger(count)||count<0){setNotice('Enter a class name, short code and a valid non-negative student count.');return} if(classes.some(c=>c.code.toLowerCase()===code.toLowerCase()&&c.id!==editingId)){setNotice('That class short code is already in use.');return} if(editingId)setClasses(p=>p.map(c=>c.id===editingId?{...c,name,code,count}:c));else setClasses(p=>[...p,{id:uid(),name,code,count}]);setModal(null);setNotice(editingId?'Class updated.':'Class added.') }
  const removeTeacher = (t: Teacher) => { if(!window.confirm(`Remove ${t.name} from the teacher list?`))return;setTeachers(p=>p.filter(x=>x.id!==t.id));setNotice('Teacher removed.') }
  const removeClass = (c: SchoolClass) => { if(teachers.some(t=>t.classId===c.id)){setNotice('Reassign teachers before removing this class.');return} if(!window.confirm(`Remove ${c.name}?`))return;setClasses(p=>p.filter(x=>x.id!==c.id));setNotice('Class removed.') }
  const toggleSlot = (teacherId:string,slot:string) => setTeachers(p=>p.map(t=>t.id!==teacherId?t:{...t,unavailable:t.unavailable.includes(slot)?t.unavailable.filter(s=>s!==slot):[...t.unavailable,slot]}))
  const exportCsv = () => { const rows=tab==='teachers'?[['Name','Short code','Email','Class teacher','Subject','Unavailable periods'],...teachers.map(t=>[t.name,t.code,t.email,classes.find(c=>c.id===t.classId)?.name??'',t.subject,t.unavailable.join('; ')])]:[['Class','Short code','Student count','Assigned teachers'],...classes.map(c=>[c.name,c.code,String(c.count),String(teachers.filter(t=>t.classId===c.id).length)])];const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`phikila-${tab}.csv`;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('CSV export downloaded.') }
  const saveJson = () => { const url=URL.createObjectURL(new Blob([JSON.stringify({teachers,classes},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='phikila-teachers-classes.json';document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Backup downloaded.') }
  return <div className="staff-page">
    <style>{styles}</style>
    <header className="staff-head"><div><h1>Teachers & classes</h1><p className="staff-muted">Manage staff records, class groups, assignments and weekly availability.</p></div><div className="staff-actions"><button className="staff-btn" onClick={saveJson}>Export backup</button><button className="staff-btn" onClick={exportCsv}>Export CSV</button><button className="staff-btn primary" onClick={()=>tab==='teachers'?openTeacher():openClass()}>＋ Add {tab==='teachers'?'teacher':'class'}</button></div></header>
    <section className="staff-stats" aria-label="Management summary"><div className="staff-stat"><span>Total teachers</span><strong>{teachers.length}</strong></div><div className="staff-stat"><span>Classes / streams</span><strong>{classes.length}</strong></div><div className="staff-stat"><span>Teachers assigned as class teacher</span><strong>{assigned}</strong></div></section>
    <section className="staff-panel">
      <div className="staff-toolbar"><div className="staff-tabs" role="tablist" aria-label="Records"><button className="staff-tab" role="tab" aria-selected={tab==='teachers'} onClick={()=>{setTab('teachers');setQuery('')}}>Teachers ({teachers.length})</button><button className="staff-tab" role="tab" aria-selected={tab==='classes'} onClick={()=>{setTab('classes');setQuery('')}}>Classes ({classes.length})</button></div><input className="staff-search" aria-label="Search records" placeholder={`Search ${tab}…`} value={query} onChange={e=>setQuery(e.target.value)}/></div>
      {tab==='teachers' ? <><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Teacher</th><th>Short</th><th>Class teacher</th><th>Availability · click a cell to toggle</th><th>Actions</th></tr></thead><tbody>{visibleTeachers.map(t=><tr key={t.id}><td><span className="staff-name">{t.name}</span><span className="staff-sub">{t.email||t.subject||'Teacher record'}</span></td><td><span className="staff-code">{t.code}</span></td><td>{classes.find(c=>c.id===t.classId)?.code ? <span className="staff-chip">{classes.find(c=>c.id===t.classId)?.code}</span> : <span className="staff-muted">Not assigned</span>}</td><td><div className="staff-grid" aria-label={`Availability for ${t.name}`}>{DAYS.flatMap(day=>PERIODS.map(period=>{const slot=`${day}-${period}`;const off=t.unavailable.includes(slot);return <button key={slot} type="button" className={`staff-slot ${off?'off':''}`} title={`${day} ${period}: ${off?'Unavailable':'Available'}`} aria-label={`${t.name}, ${day} ${period}, ${off?'unavailable':'available'}; toggle`} onClick={()=>toggleSlot(t.id,slot)}/> }))}</div><span className="staff-sub">{t.unavailable.length} unavailable periods · 8 periods shown per day</span></td><td><div className="staff-row-actions"><button className="staff-iconbtn" onClick={()=>{setTeacherForm({name:t.name,code:t.code,email:t.email,classId:t.classId,subject:t.subject});setEditingId(t.id);setModal('teacher')}} aria-label={`Edit ${t.name}`}>Edit</button><button className="staff-iconbtn" onClick={()=>removeTeacher(t)} aria-label={`Remove ${t.name}`}>Remove</button></div></td></tr>)}</tbody></table>{visibleTeachers.length===0&&<div className="staff-empty">No teachers match your search.</div>}</div><div className="staff-note"><div className="staff-legend"><span><i/> Available</span><span className="off"><i/> Unavailable / time off</span><span>Click a cell to toggle availability.</span></div></div></> :
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Class name</th><th>Short</th><th>Student count</th><th>Class teachers</th><th>Actions</th></tr></thead><tbody>{visibleClasses.map(c=><tr key={c.id}><td><span className="staff-name">{c.name}</span></td><td><span className="staff-code">{c.code}</span></td><td>{c.count}</td><td>{teachers.filter(t=>t.classId===c.id).map(t=>t.name).join(', ')||<span className="staff-muted">Not assigned</span>}</td><td><div className="staff-row-actions"><button className="staff-iconbtn" onClick={()=>openClass(c)}>Edit</button><button className="staff-iconbtn" onClick={()=>removeClass(c)}>Remove</button></div></td></tr>)}</tbody></table>{visibleClasses.length===0&&<div className="staff-empty">No classes match your search.</div>}<div className="staff-note">Class teacher assignments are managed from the teacher record. Classes with assigned teachers cannot be deleted until reassigned.</div></div>}
    </section>
    {notice&&<div role="status" style={{marginTop:12,fontSize:13,color:'var(--muted,#697386)'}}>{notice}<button className="staff-iconbtn" style={{marginLeft:8}} onClick={()=>setNotice('')}>Dismiss</button></div>}
    {modal&&<div className="staff-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title"><h2 id="staff-modal-title">{editingId?'Edit':'Add'} {modal==='teacher'?'teacher':'class'}</h2><p className="staff-muted">Fields marked with * are required.</p>{modal==='teacher'?<form onSubmit={submitTeacher}><div className="staff-form"><label className="staff-field full">Full name *<input autoFocus required value={teacherForm.name} onChange={e=>setTeacherForm(p=>({...p,name:e.target.value}))} maxLength={120}/></label><label className="staff-field">Short code *<input required value={teacherForm.code} onChange={e=>setTeacherForm(p=>({...p,code:e.target.value}))} maxLength={20}/></label><label className="staff-field">Email<input type="email" value={teacherForm.email} onChange={e=>setTeacherForm(p=>({...p,email:e.target.value}))} maxLength={254}/></label><label className="staff-field">Class teacher assignment<select value={teacherForm.classId} onChange={e=>setTeacherForm(p=>({...p,classId:e.target.value}))}><option value="">Not assigned</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}</select></label><label className="staff-field">Subject / department<input value={teacherForm.subject} onChange={e=>setTeacherForm(p=>({...p,subject:e.target.value}))} maxLength={100}/></label></div><div className="staff-modal-actions"><button type="button" className="staff-btn" onClick={()=>setModal(null)}>Cancel</button><button className="staff-btn primary" type="submit">Save teacher</button></div></form>:<form onSubmit={submitClass}><div className="staff-form"><label className="staff-field full">Class name *<input autoFocus required value={classForm.name} onChange={e=>setClassForm(p=>({...p,name:e.target.value}))} maxLength={100}/></label><label className="staff-field">Short code *<input required value={classForm.code} onChange={e=>setClassForm(p=>({...p,code:e.target.value}))} maxLength={20}/></label><label className="staff-field">Student count *<input type="number" min="0" step="1" required value={classForm.count} onChange={e=>setClassForm(p=>({...p,count:e.target.value}))}/></label></div><div className="staff-modal-actions"><button type="button" className="staff-btn" onClick={()=>setModal(null)}>Cancel</button><button className="staff-btn primary" type="submit">Save class</button></div></form>}</section></div>}
  </div>
}
