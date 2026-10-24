import { useEffect, useState, type FormEvent } from 'react'
import { apiFetch, ApiError } from '../lib/api'

type SchoolClass = { id: number; school_id?: number; name: string; code: string; class_teacher_id?: number | null; status?: string | null; student_count?: number; color?: string; unavailable?: string[] }
type Form = { name: string; short: string; code: string; grade: string; number: string; classTeacherId: string; color: string; printSubjectPictures: boolean }
const blank: Form = { name: '', short: '', code: '', grade: '', number: '', classTeacherId: '', color: '#FFD700', printSubjectPictures: true }
const days = ['MO', 'TU', 'WE', 'TH', 'FR']
const periods = [1, 2, 3, 4, 5, 6, 7, 8]
const prefKey = 'phikila.class-management.preferences.v1'
type Preferences = Record<string, { color?: string; unavailable?: string[]; timeOffMatrix?: number[][]; short?: string; grade?: string; number?: string; printSubjectPictures?: boolean }>

export default function ClassManagementDialog({ onClose, onStatus }: { onClose: () => void; onStatus: (message: string) => void }) {
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [teachers, setTeachers] = useState<Array<{id:number;profile:{firstName?:string;lastName?:string;titleBefore?:string}}>>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(blank)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [timeOffId, setTimeOffId] = useState<number | null>(null)
  const [grid, setGrid] = useState<number[][]>(() => Array.from({length:5},()=>Array(8).fill(1)))
  const [prefs, setPrefs] = useState<Preferences>(() => { try { return JSON.parse(localStorage.getItem(prefKey) || '{}') } catch { return {} } })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selected = classes.find(c => c.id === selectedId) ?? null
  const persistPrefs = (next: Preferences) => { setPrefs(next); try { localStorage.setItem(prefKey, JSON.stringify(next)) } catch {} }
  const load = async () => {
    setLoading(true); setError('')
    try {
      const rows = await apiFetch<SchoolClass[]>('/api/v1/academics/classes')
      setClasses(Array.isArray(rows) ? rows : [])
      if (Array.isArray(rows) && rows.length) setSelectedId(current => current != null && rows.some(c => c.id === current) ? current : rows[0].id)
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load classes from the school database.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load(); apiFetch<typeof teachers>('/api/v1/timetable/teachers').then(setTeachers).catch(()=>setTeachers([])) }, [])
  const begin = (cls?: SchoolClass) => {
    const p = cls ? prefs[String(cls.id)] || {} : {}
    setEditingId(cls?.id ?? null)
    setEditorOpen(true)
    setForm(cls ? { name: cls.name, short: p.short || cls.code, code: cls.code, grade: p.grade || '', number: p.number || '', classTeacherId: cls.class_teacher_id ? String(cls.class_teacher_id) : '', color: p.color || '#FFD700', printSubjectPictures: p.printSubjectPictures ?? true } : blank)
    setError('')
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.code.trim()) { setError('Class name and code are required.'); return }
    setSaving(true); setError('')
    try {
      const payload = { name: form.name.trim(), code: form.code.trim(), class_teacher_id: form.classTeacherId ? Number(form.classTeacherId) : null }
      const saved = editingId == null
        ? await apiFetch<SchoolClass>('/api/v1/academics/classes', { method: 'POST', body: JSON.stringify(payload) })
        : await apiFetch<SchoolClass>('/api/v1/academics/classes/' + editingId, { method: 'PATCH', body: JSON.stringify(payload) })
      persistPrefs({ ...prefs, [String(saved.id)]: { ...prefs[String(saved.id)], color: form.color, short: form.short, grade: form.grade, number: form.number, printSubjectPictures: form.printSubjectPictures } })
      setEditingId(null); setEditorOpen(false); await load(); setSelectedId(saved.id); onStatus(editingId == null ? 'Class saved to the school database.' : 'Class updated in the school database.')
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save class to the school database.') }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!selected || !window.confirm('Remove ' + selected.name + ' from the school database?')) return
    setSaving(true); setError('')
    try { await apiFetch<void>('/api/v1/academics/classes/' + selected.id, { method: 'DELETE' }); const next={...prefs}; delete next[String(selected.id)]; persistPrefs(next); setSelectedId(null); await load(); onStatus('Class removed from the school database.') }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not remove class.') }
    finally { setSaving(false) }
  }
  const openTimeOff = () => {
    if (!selected) return
    const matrix = prefs[String(selected.id)]?.timeOffMatrix
    setGrid(Array.from({length:5},(_,d)=>Array.from({length:8},(_,p)=>matrix?.[d]?.[p] ?? 1)))
    setTimeOffId(selected.id)
  }
  const saveTimeOff = () => {
    if (timeOffId == null) return
    persistPrefs({...prefs,[String(timeOffId)]:{...prefs[String(timeOffId)],timeOffMatrix:grid}})
    setTimeOffId(null); onStatus('Class time-off settings saved in this browser. They are not shared across devices.')
  }
  const teacherName = (id?: number | null) => { const t=teachers.find(x=>x.id===id); return t ? [t.profile.titleBefore,t.profile.firstName,t.profile.lastName].filter(Boolean).join(' ') : '' }
  return <div className="class-mgmt-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="class-mgmt-dialog" role="dialog" aria-modal="true" aria-label="Classes">
      <header><strong>Enter classes :</strong><button onClick={onClose} aria-label="Close classes">×</button></header>
      {error && <div className="class-mgmt-error" role="alert">{error}</div>}
      {timeOffId != null ? <><div className="class-timeoff-body"><strong>Time off — {classes.find(c=>c.id===timeOffId)?.name}</strong><p>Click a cell to toggle availability. Changes are saved for this browser.</p><div className="class-timeoff-grid"><div/><div className="class-timeoff-periods">{periods.map(p=><span key={p}>{p}</span>)}</div>{days.map((day,d)=><div className="class-timeoff-row" key={day}><strong>{day}</strong>{periods.map((p,i)=><button key={p} onClick={()=>setGrid(g=>g.map((r,ri)=>r.map((v,pi)=>ri===d&&pi===i?1-v:v)))} aria-label={day+' period '+p+(grid[d][i]?' available':' unavailable')} style={{background:grid[d][i]?'#8a9ac0':'#fff',color:grid[d][i]?'#166534':'#dc2626'}}>{grid[d][i]?'✔':'✘'}</button>)}</div>)}</div><div className="class-timeoff-caption">✔ Available · ✘ Not available</div></div><footer><button onClick={()=>setTimeOffId(null)}>Cancel</button><button onClick={saveTimeOff}>OK</button></footer></> : <><div className="class-mgmt-content"><div className="class-mgmt-table-wrap"><table><thead><tr><th>Name</th><th>Short</th><th>Count</th><th>Time off</th></tr></thead><tbody>{classes.map(c=><tr key={c.id} onClick={()=>setSelectedId(c.id)} onDoubleClick={()=>begin(c)} className={selectedId===c.id?'selected':''}><td><i style={{background:prefs[String(c.id)]?.color||'#FFD700'}}/> {c.name}</td><td>{prefs[String(c.id)]?.short||c.code}</td><td>{c.student_count ?? '—'}</td><td><div className="class-mgmt-mini">{Array.from({length:40},(_,i)=><i key={i} style={{background:(prefs[String(c.id)]?.timeOffMatrix?.[Math.floor(i/8)]?.[i%8] ?? 1)?'#16a34a':'#ef4444'}}/>)}</div></td></tr>)}</tbody></table>{loading&&<p className="class-mgmt-empty">Loading classes…</p>}{!loading&&!classes.length&&<p className="class-mgmt-empty">No classes found. Select New to create one.</p>}</div><aside><button onClick={()=>begin()}>＋ New</button><button disabled={!selected} onClick={()=>selected&&begin(selected)}>Edit</button><button disabled={!selected||saving} onClick={()=>void remove()}>− Remove</button><div className="class-mgmt-separator"/><button disabled={!selected} onClick={openTimeOff}>◷ Time off</button><button disabled={!selected} onClick={()=>selected&&begin(selected)}>◼ Lessons</button><button disabled={!selected} onClick={()=>selected&&begin(selected)}># Constraints</button><button disabled={!selected} onClick={()=>selected&&begin(selected)}>⑂ Divisions</button></aside></div>
      {editorOpen ? <form className="class-mgmt-edit" onSubmit={save}><strong>Class — {editingId==null?'New':'Edit'}</strong><label>Class name<input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label><label>Short<input value={form.short} onChange={e=>setForm(f=>({...f,short:e.target.value,code:e.target.value}))}/></label><label>Code<input required value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value}))}/></label><label>Class teacher<select value={form.classTeacherId} onChange={e=>setForm(f=>({...f,classTeacherId:e.target.value}))}><option value="">Not assigned</option>{teachers.map(t=><option key={t.id} value={t.id}>{[t.profile.titleBefore,t.profile.firstName,t.profile.lastName].filter(Boolean).join(' ')||('Teacher '+t.id)}</option>)}</select></label><label>Grade<input value={form.grade} onChange={e=>setForm(f=>({...f,grade:e.target.value}))}/></label><label>Number<input value={form.number} onChange={e=>setForm(f=>({...f,number:e.target.value}))}/></label><label>Color<input type="color" value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))}/></label><label className="class-mgmt-checkbox"><input type="checkbox" checked={form.printSubjectPictures} onChange={e=>setForm(f=>({...f,printSubjectPictures:e.target.checked}))}/> Print subject pictures</label><div className="class-mgmt-edit-actions"><button type="button" onClick={()=>{setEditingId(null);setEditorOpen(false)}}>Cancel</button><button type="submit" disabled={saving}>{saving?'Saving…':'OK'}</button></div></form> : null}
      <footer><span>Class list is loaded from the school database.</span><button onClick={onClose}>Close</button></footer></>}
    </section>
    <style>{`.class-mgmt-overlay{position:fixed;inset:0;background:#0004;display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px;font:13px "Segoe UI",Arial,sans-serif;color:#222}.class-mgmt-dialog{width:min(1000px,100%);max-height:94vh;overflow:auto;background:#d6d6d6;border:1px solid #777;box-shadow:0 12px 40px #0003}.class-mgmt-dialog>header{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;background:#e9e9e9;border-bottom:1px solid #999}.class-mgmt-dialog button{cursor:pointer}.class-mgmt-dialog>header button{border:0;background:transparent;font-size:20px}.class-mgmt-error{padding:8px 12px;color:#991b1b;background:#fee2e2}.class-mgmt-content{display:flex;min-height:270px}.class-mgmt-table-wrap{flex:1;background:#fff;overflow:auto;max-height:360px}.class-mgmt-table-wrap table{width:100%;border-collapse:collapse;font-size:12px}.class-mgmt-table-wrap th{position:sticky;top:0;background:#e5e7eb;text-align:left;border:1px solid #bbb;padding:6px}.class-mgmt-table-wrap td{border:1px solid #ddd;padding:5px 7px;white-space:nowrap}.class-mgmt-table-wrap tbody tr{cursor:pointer}.class-mgmt-table-wrap tbody tr.selected{background:#dbeafe}.class-mgmt-table-wrap td:first-child i{display:inline-block;width:9px;height:18px;border:1px solid #777;vertical-align:middle}.class-mgmt-mini{display:grid;grid-template-columns:repeat(10,6px);gap:1px}.class-mgmt-mini i{height:5px}.class-mgmt-empty{padding:12px;color:#555}.class-mgmt-content aside{width:180px;padding:10px;background:#eef1f5;border-left:1px solid #bbb;display:flex;flex-direction:column;gap:7px}.class-mgmt-content aside button{padding:7px 9px;text-align:left;background:#fff;border:1px solid #999}.class-mgmt-content aside button:disabled{opacity:.5;cursor:not-allowed}.class-mgmt-separator{height:16px}.class-mgmt-edit{padding:12px 16px;border-top:1px solid #aaa;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.class-mgmt-edit>strong{grid-column:1/-1}.class-mgmt-edit label{display:flex;gap:8px;align-items:center}.class-mgmt-edit label input:not([type=checkbox]):not([type=color]),.class-mgmt-edit select{flex:1;min-width:0;padding:5px;background:#fff7e8;border:1px solid #777}.class-mgmt-edit input[type=color]{width:60px;height:28px}.class-mgmt-edit .class-mgmt-checkbox{grid-column:1/-1}.class-mgmt-edit-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px}.class-mgmt-edit-actions button,.class-mgmt-dialog footer button{padding:6px 16px;border:1px solid #777;background:#fff}.class-mgmt-dialog footer{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-top:1px solid #aaa;color:#555;font-size:11px}.class-timeoff-body{padding:18px}.class-timeoff-grid{display:grid;grid-template-columns:45px 1fr;gap:0}.class-timeoff-periods{display:grid;grid-template-columns:repeat(8,minmax(35px,1fr));text-align:center;padding-bottom:6px}.class-timeoff-row{display:contents}.class-timeoff-row>strong{padding:12px 0;border-bottom:1px dashed #bbb}.class-timeoff-row>button{height:42px;border:1px dashed #aaa;font-size:19px}.class-timeoff-caption{font-size:12px;margin-top:12px}.class-mgmt-dialog>footer{gap:10px}`}</style>
  </div>
}
