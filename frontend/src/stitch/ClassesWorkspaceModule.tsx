import { useMemo, useState, type FormEvent } from 'react'

type Period = { name: string; start: string; end: string; type?: 'lesson' | 'break' }
type Lesson = { id: string; day: string; period: number; className: string; subject: string; teacher: string; room: string; locked: boolean }
type ClassDetail = { color?: string; classTeacher?: string; grade?: string; number?: string; count?: number; printPictures?: boolean; timeOffGrid?: number[][] }
type ClassDraft = { name: string; short: string; color: string; classTeacher: string; grade: string; number: string; count: number; printPictures: boolean }
type LessonDraft = { subject: string; teacher: string; count: number; length: 'Single' | 'Double' | 'Triple'; room: string }
const palette = ['#b8e6d0','#fbcfe8','#facc15','#60a5fa','#ef4444','#22c55e','#a78bfa','#fb923c','#a5b4fc','#fff']
const emptyClass: ClassDraft = { name: '', short: '', color: '#b8e6d0', classTeacher: '', grade: '', number: '', count: 0, printPictures: true }
const emptyLesson: LessonDraft = { subject: '', teacher: '', count: 1, length: 'Single', room: '' }
const styles = `
.cm-backdrop{position:fixed;inset:0;z-index:12000;background:#10182870;display:flex;align-items:center;justify-content:center;padding:12px;font:13px "Segoe UI",Tahoma,Arial;color:#202939}
.cm-window{width:min(1180px,98vw);height:min(850px,94vh);display:flex;flex-direction:column;background:#e8ecf3;border:1px solid #667085;box-shadow:0 18px 55px #0004;min-height:0}
.cm-title{height:32px;flex:none;background:#e5eaf3;border-bottom:1px solid #aab2c0;display:flex;align-items:center;justify-content:space-between;padding:0 12px;font-weight:650}
.cm-title button{border:1px solid #aab2c0;background:white;cursor:pointer}
.cm-main{display:flex;flex:1;min-height:0}
.cm-table-wrap{flex:1;min-width:0;background:white;overflow:auto}
.cm-table{width:100%;border-collapse:collapse;min-width:560px}
.cm-table th{position:sticky;top:0;background:#d8deea;text-align:left;font-size:11px;padding:9px;border-bottom:1px solid #aab2c0}
.cm-table td{padding:8px 9px;border-bottom:1px solid #edf0f4;font-size:12px}
.cm-table tr{cursor:pointer}.cm-table tr.selected{background:#c7d8ff}.cm-actions{width:168px;flex:none;padding:10px;background:#e8ecf3;border-left:1px solid #aab2c0;display:flex;flex-direction:column;gap:7px}
.cm-btn{border:1px solid #9ba4b2;background:#f8fafc;padding:8px 10px;text-align:left;cursor:pointer;color:#202939;font-size:12px}
.cm-btn.primary{background:#2563eb;border-color:#1d4ed8;color:#fff}.cm-btn:disabled{opacity:.45;cursor:not-allowed}
.cm-footer{display:flex;gap:8px;align-items:center;padding:9px 12px;border-top:1px solid #aab2c0;background:#e8ecf3}.cm-spacer{flex:1}
.cm-mini{display:grid;grid-template-columns:repeat(10,6px);gap:1px}.cm-mini i{height:6px;border:1px solid #9aa4b2}
.cm-modal{width:min(620px,96vw);max-height:88vh;overflow:auto;background:#f2f3f5;border:1px solid #667085;box-shadow:0 15px 45px #0004}
.cm-modal-body{padding:16px;display:grid;gap:12px}.cm-field{display:grid;gap:5px;font-size:12px;font-weight:600}.cm-field input,.cm-field select{width:100%;box-sizing:border-box;padding:8px;border:1px solid #aab2c0;background:#fff;font:inherit;font-weight:400}
.cm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cm-color-palette{display:flex;gap:6px;flex-wrap:wrap}.cm-color-palette button{width:24px;height:24px;border:1px solid #7b8492;cursor:pointer}.cm-section{background:#fff;border:1px solid #d0d5dd;padding:10px}.cm-subtle{font-size:11px;color:#667085;margin:0}.cm-table-scroll{overflow:auto;max-height:50vh;background:white;border:1px solid #c5cad3}.cm-slots{display:grid;grid-template-columns:repeat(8,minmax(25px,1fr));gap:3px}.cm-slot{min-height:28px;border:1px solid #aab2c0;cursor:pointer;background:#d1fae5}.cm-slot.conditional{background:#bae6fd}.cm-slot.off{background:#fecaca}.cm-error{padding:9px;background:#fee2e2;color:#991b1b}
@media(max-width:650px){.cm-main{flex-direction:column;overflow:auto}.cm-actions{width:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-left:0;border-top:1px solid #aab2c0}.cm-grid2{grid-template-columns:1fr}.cm-window{height:96vh}.cm-footer{flex-wrap:wrap}}
`

export default function ClassesWorkspaceModule({ classes, lessons, days, periods, teachers, subjects, classrooms, details, onClose, onSave }: {
  classes: string[]; lessons: Lesson[]; days: string[]; periods: Period[]; teachers: string[]; subjects: string[]; classrooms: string[]; details: Record<string, ClassDetail>
  onClose: () => void; onSave: (classes: string[], lessons: Lesson[], details: Record<string, ClassDetail>) => void
}) {
  const [selected, setSelected] = useState(classes[0] || '')
  const [dialog, setDialog] = useState<'class'|'lessons'|'timeoff'|null>(null)
  const [editingName, setEditingName] = useState<string|null>(null)
  const [draft, setDraft] = useState<ClassDraft>(emptyClass)
  const [lessonDraft, setLessonDraft] = useState<LessonDraft>(emptyLesson)
  const [lessonEditId, setLessonEditId] = useState<string|null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState<string|null>(null)
  const [error, setError] = useState('')
  const [timeGrid, setTimeGrid] = useState<number[][]>([])
  const selectedLessons = useMemo(() => lessons.filter(item => item.className === selected), [lessons, selected])
  const selectedDetails = details[selected] || {}
  const editablePeriods = periods.map((p,i)=>({p,i})).filter(({p})=>p.type !== 'break' && !/break|lunch|recess|games/i.test(p.name))
  const openClass = (name?: string) => {
    setEditingName(name || null)
    const value = name ? details[name] || {} : {}
    setDraft(name ? { name, short: name, color:value.color || '#b8e6d0', classTeacher:value.classTeacher || '', grade:value.grade || '', number:value.number || '', count:Number(value.count)||0, printPictures:value.printPictures ?? true } : {...emptyClass})
    setError(''); setDialog('class')
  }
  const saveClass = (event: FormEvent) => {
    event.preventDefault()
    const name = draft.name.trim(), short = draft.short.trim() || name
    if (!name) { setError('Class name is required.'); return }
    if (classes.some(item=>item!==editingName && item.toLowerCase()===name.toLowerCase())) { setError('That class already exists.'); return }
    const nextClasses = editingName ? classes.map(item=>item===editingName?name:item) : [...classes,name]
    const nextLessons = editingName ? lessons.map(item=>item.className===editingName?{...item,className:name}:item) : lessons
    const nextDetails = {...details}
    if (editingName && editingName!==name) delete nextDetails[editingName]
    nextDetails[name] = { ...(nextDetails[name] || {}), color:draft.color, classTeacher:draft.classTeacher, grade:draft.grade, number:draft.number, count:draft.count, printPictures:draft.printPictures, timeOffGrid:nextDetails[name]?.timeOffGrid || days.map(()=>periods.map(()=>0)) }
    // Short code is kept in the metadata for display and export.
    ;(nextDetails[name] as ClassDetail & {short?:string}).short = short
    onSave(nextClasses,nextLessons,nextDetails); setSelected(name); setDialog(null); setError('')
  }
  const removeClass = () => {
    if (!selected) return
    if (lessons.some(item=>item.className===selected)) { setError('This class has timetable lessons. Move or remove those lessons before removing the class.'); return }
    if (!window.confirm('Remove class '+selected+'?')) return
    const nextDetails = {...details}; delete nextDetails[selected]
    const nextClasses = classes.filter(item=>item!==selected)
    onSave(nextClasses,lessons,nextDetails); setSelected(nextClasses[0] || ''); setError('')
  }
  const openLessons = () => { setLessonDraft(emptyLesson); setLessonEditId(null); setSelectedLessonId(null); setError(''); setDialog('lessons') }
  const editLesson = (lesson: Lesson) => { setSelectedLessonId(lesson.id); setLessonDraft({subject:lesson.subject,teacher:lesson.teacher,count:1,length:'Single',room:lesson.room}); setLessonEditId(lesson.id); setError('') }
  const removeLesson = () => { if (!selectedLessonId) { setError('Select a lesson to remove.'); return } const target = lessons.find(item=>item.id===selectedLessonId); if (!target) { setError('That lesson no longer exists. Reload the workspace.'); return } if (!window.confirm('Remove this '+target.subject+' lesson from '+selected+'?')) return; onSave(classes,lessons.filter(item=>item.id!==selectedLessonId),details); setSelectedLessonId(null); setLessonEditId(null); setLessonDraft(emptyLesson); setError('') }
  const saveLesson = (event: FormEvent) => {
    event.preventDefault()
    if (!lessonDraft.subject || !lessonDraft.teacher) { setError('Select a subject and teacher.'); return }
    if (lessonEditId) {
      const old = lessons.find(item=>item.id===lessonEditId)
      if (!old) { setError('That lesson no longer exists. Reload the workspace.'); return }
      const updated = lessons.map(item=>item.id===lessonEditId?{...item,subject:lessonDraft.subject,teacher:lessonDraft.teacher,room:lessonDraft.room}:item)
      onSave(classes,updated,details); setLessonEditId(null); setDialog(null); setError(''); return
    }
    const count = Math.max(1,Math.min(10,Number(lessonDraft.count)||1)), span = lessonDraft.length==='Triple'?3:lessonDraft.length==='Double'?2:1
    const blocked = new Set<string>()
    const classOff = selectedDetails.timeOffGrid || []
    const teacherOff = new Set<string>()
    const slots: Array<{day:string;period:number}> = []
    for (const day of days) for (const {p, i} of editablePeriods) {
      const run = Array.from({length:span},(_,offset)=>i+offset)
      if (run.length!==span || run.some(index=>index>=periods.length || periods[index]?.type==='break' || /break|lunch|recess|games/i.test(periods[index]?.name||''))) continue
      if (classOff[days.indexOf(day)]?.[i]===2) continue
      if (lessons.some(item=>item.day===day && run.includes(item.period) && (item.className===selected || item.teacher===lessonDraft.teacher || (!!lessonDraft.room && item.room===lessonDraft.room)))) continue
      const slotKey = day+':'+i
      if (!blocked.has(slotKey)) slots.push({day,period:i})
    }
    const chosen: Array<{day:string;period:number}> = []
    for (const slot of slots) {
      if (chosen.some(item=>item.day===slot.day && Array.from({length:span},(_,offset)=>item.period+offset).some(index=>index>=slot.period && index<slot.period+span))) continue
      chosen.push(slot)
      if(chosen.length===count) break
    }
    if(chosen.length<count){setError('Not enough free timetable slots for the requested lessons. Existing lessons were not changed.');return}
    const additions: Lesson[] = []
    for (const slot of chosen) for (let offset=0;offset<span;offset++) additions.push({id:'class-lesson-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+offset,day:slot.day,period:slot.period+offset,className:selected,subject:lessonDraft.subject,teacher:lessonDraft.teacher,room:lessonDraft.room,locked:false})
    onSave(classes,[...lessons,...additions],details); setDialog(null); setError('')
  }
  const openTimeOff = () => { const grid = selectedDetails.timeOffGrid || days.map(()=>periods.map(()=>0)); setTimeGrid(days.map((_,d)=>periods.map((_,p)=>grid[d]?.[p] ?? 0))); setError(''); setDialog('timeoff') }
  const cycleTimeOff = (d:number,p:number,reverse=false) => setTimeGrid(current=>current.map((row,di)=>row.map((value,pi)=>di===d&&pi===p?(value+(reverse?2:1))%3:value)))
  const saveTimeOff = () => { onSave(classes,lessons,{...details,[selected]:{...selectedDetails,timeOffGrid:timeGrid}}); setDialog(null); setError('') }

  return <div className="cm-backdrop"><style>{styles}</style><section className="cm-window" role="dialog" aria-modal="true" aria-labelledby="cm-title">
    <header className="cm-title"><span id="cm-title">Classes</span><button onClick={onClose} aria-label="Close classes">×</button></header>
    <div className="cm-main">
      <div className="cm-table-wrap"><table className="cm-table"><thead><tr><th>Name</th><th>Short</th><th>Count</th><th>Class teacher</th><th>Time off</th></tr></thead><tbody>
      {classes.map(name=><tr key={name} className={selected===name?'selected':''} onClick={()=>{setSelected(name);setError('')}} onDoubleClick={()=>{setSelected(name);setDialog('lessons');setLessonDraft(emptyLesson);setLessonEditId(null);setError('')}}><td><span style={{ background: (details[name] && details[name].color) || '#b8e6d0', display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 7 }}/>{name}</td><td>{(details[name] as (ClassDetail & {short?:string})|undefined)?.short || name}</td><td>{details[name]?.count ?? ''}</td><td>{details[name]?.classTeacher || '—'}</td><td><div className="cm-mini">{Array.from({length:Math.min(40,days.length*periods.length)},(_,i)=>{const v=details[name]?.timeOffGrid?.[Math.floor(i/Math.max(1,periods.length))]?.[i%Math.max(1,periods.length)]||0;return <i key={i} style={{background:v===2?'#ef4444':v===1?'#38bdf8':'#22c55e'}}/>})}</div></td></tr>)}
      {classes.length===0 && <tr><td colSpan={5}>No classes are configured. Use New to add the first class.</td></tr>}
      </tbody></table></div>
      <aside className="cm-actions"><button className="cm-btn primary" onClick={()=>openClass()}>＋ New</button><button className="cm-btn" disabled={!selected} onClick={()=>openClass(selected)}>Edit</button><button className="cm-btn" disabled={!selected} onClick={removeClass}>Remove</button><div style={{height:8}}/><button className="cm-btn" disabled={!selected} onClick={openLessons}>Lessons</button><button className="cm-btn" disabled={!selected} onClick={openTimeOff}>Time off</button><button className="cm-btn" disabled={!selected} onClick={()=>setError('Class constraints are represented by the time-off grid; additional constraint rules are not yet available.')}>Constraints</button><div className="cm-spacer"/><button className="cm-btn" onClick={()=>setSelected(classes[Math.max(0,classes.indexOf(selected)-1)]||'')} disabled={!classes.length}>↑ Previous</button><button className="cm-btn" onClick={()=>setSelected(classes[Math.min(classes.length-1,classes.indexOf(selected)+1)]||'')} disabled={!classes.length}>↓ Next</button></aside>
    </div>
    {error && !dialog && <div className="cm-error" role="alert">{error}</div>}
    <footer className="cm-footer"><button className="cm-btn" onClick={onClose}>Close</button><span className="cm-spacer"/><span className="cm-subtle">Changes are stored in the timetable workspace; use Save workspace to persist.</span></footer>
  </section>
  {dialog==='class' && <div className="cm-backdrop"><section className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-class-title"><header className="cm-title"><span id="cm-class-title">{editingName?'Edit class':'New class'}</span><button onClick={()=>setDialog(null)}>×</button></header><form onSubmit={saveClass}><div className="cm-modal-body"><label className="cm-field">Class name<input autoFocus value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} required/></label><div className="cm-grid2"><label className="cm-field">Short code<input value={draft.short} onChange={e=>setDraft({...draft,short:e.target.value})} placeholder="Optional"/></label><label className="cm-field">Student count<input type="number" min="0" value={draft.count} onChange={e=>setDraft({...draft,count:Number(e.target.value)})}/></label><label className="cm-field">Grade<input value={draft.grade} onChange={e=>setDraft({...draft,grade:e.target.value})}/></label><label className="cm-field">Class teacher<select value={draft.classTeacher} onChange={e=>setDraft({...draft,classTeacher:e.target.value})}><option value="">Not assigned</option>{teachers.map(t=><option key={t} value={t}>{t}</option>)}</select></label><label className="cm-field">Class number<input value={draft.number} onChange={e=>setDraft({...draft,number:e.target.value})}/></label><label className="cm-field">Print subject pictures<select value={String(draft.printPictures)} onChange={e=>setDraft({...draft,printPictures:e.target.value==='true'})}><option value="true">Yes</option><option value="false">No</option></select></label></div><div className="cm-section"><strong>Color</strong><div className="cm-color-palette" style={{marginTop:8}}>{palette.map(color=><button key={color} type="button" aria-label={'Use '+color} title={color} style={{background:color,outline:draft.color===color?'2px solid #2563eb':undefined}} onClick={()=>setDraft({...draft,color})}/>)}</div><label className="cm-field" style={{marginTop:10}}>Custom color<input type="color" value={draft.color} onChange={e=>setDraft({...draft,color:e.target.value})}/></label></div>{error&&<div className="cm-error">{error}</div>}</div><footer className="cm-footer"><button type="button" className="cm-btn" onClick={()=>setDialog(null)}>Cancel</button><span className="cm-spacer"/><button type="submit" className="cm-btn primary">OK</button></footer></form></section></div>}
  {dialog==='lessons' && <div className="cm-backdrop"><section className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-lessons-title"><header className="cm-title"><span id="cm-lessons-title">Lessons for {selected}</span><button onClick={()=>setDialog(null)}>×</button></header><div className="cm-modal-body"><p className="cm-subtle">Existing timetable lessons are shown below. New lessons are placed only into free teaching slots and are not persisted until Save workspace.</p><div className="cm-table-scroll"><table className="cm-table"><thead><tr><th>Day / period</th><th>Subject</th><th>Teacher</th><th>Room</th><th/></tr></thead><tbody>{selectedLessons.map(lesson=><tr key={lesson.id} className={selectedLessonId===lesson.id?'selected':''} onClick={()=>setSelectedLessonId(lesson.id)}><td>{lesson.day} · {periods[lesson.period]?.name || 'Period '+(lesson.period+1)}</td><td>{lesson.subject}</td><td>{lesson.teacher}</td><td>{lesson.room||'—'}</td><td><button className="cm-btn" onClick={event=>{event.stopPropagation();editLesson(lesson)}}>Edit</button></td></tr>)}{!selectedLessons.length&&<tr><td colSpan={5}>No timetable lessons for this class yet.</td></tr>}</tbody></table></div><form onSubmit={saveLesson} className="cm-section"><h3 style={{margin:'0 0 10px'}}>{lessonEditId?'Edit lesson':'New lesson'}</h3><div className="cm-grid2"><label className="cm-field">Subject<select value={lessonDraft.subject} onChange={e=>setLessonDraft({...lessonDraft,subject:e.target.value})} required><option value="">Select subject</option>{subjects.map(item=><option key={item}>{item}</option>)}</select></label><label className="cm-field">Teacher<select value={lessonDraft.teacher} onChange={e=>setLessonDraft({...lessonDraft,teacher:e.target.value})} required><option value="">Select teacher</option>{teachers.map(item=><option key={item}>{item}</option>)}</select></label><label className="cm-field">Lessons per week<input type="number" min="1" max="10" value={lessonDraft.count} disabled={!!lessonEditId} onChange={e=>setLessonDraft({...lessonDraft,count:Number(e.target.value)})}/></label><label className="cm-field">Lesson length<select value={lessonDraft.length} disabled={!!lessonEditId} onChange={e=>setLessonDraft({...lessonDraft,length:e.target.value as LessonDraft['length']})}><option>Single</option><option>Double</option><option>Triple</option></select></label><label className="cm-field">Classroom<select value={lessonDraft.room} onChange={e=>setLessonDraft({...lessonDraft,room:e.target.value})}><option value="">No classroom</option>{classrooms.map(room=><option key={room}>{room}</option>)}</select></label></div>{error&&<div className="cm-error" style={{marginTop:10}}>{error}</div>}<div className="cm-footer" style={{padding:'10px 0 0',border:0}}><button type="button" className="cm-btn" onClick={()=>{setLessonDraft(emptyLesson);setLessonEditId(null);setError('')}}>Clear form</button><span className="cm-spacer"/><button type="submit" className="cm-btn primary">{lessonEditId?'Save edit':'Add lessons'}</button></div></form></div><footer className="cm-footer"><button className="cm-btn" onClick={()=>{setLessonDraft(emptyLesson);setLessonEditId(null);setSelectedLessonId(null);setError('');setDialog(null)}}>Close</button><span className="cm-spacer"/><button className="cm-btn" disabled={!selectedLessonId} onClick={removeLesson}>Remove selected lesson</button></footer></section></div>}
  {dialog==='timeoff' && <div className="cm-backdrop"><section className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-time-title"><header className="cm-title"><span id="cm-time-title">Time off · {selected}</span><button onClick={()=>setDialog(null)}>×</button></header><div className="cm-modal-body"><p className="cm-subtle">Click a cell to cycle Available → Conditional → Not available. Right-click cycles backwards.</p><div className="cm-table-scroll"><table className="cm-table"><thead><tr><th>Day</th>{periods.map((p,i)=><th key={p.name+i}>{p.name}</th>)}</tr></thead><tbody>{days.map((day,d)=><tr key={day}><td>{day}</td>{periods.map((p,i)=>{const v=timeGrid[d]?.[i]||0;return <td key={p.name+i} style={{padding:3}}><button className={'cm-slot '+(v===1?'conditional':v===2?'off':'')} title={v===0?'Available':v===1?'Conditional':'Not available'} aria-label={day+' '+p.name+': '+(v===0?'Available':v===1?'Conditional':'Not available')} onContextMenu={e=>{e.preventDefault();cycleTimeOff(d,i,true)}} onClick={()=>cycleTimeOff(d,i)} style={{width:'100%'}}>{v===0?'✓':v===1?'?':'×'}</button></td>})}</tr>)}</tbody></table></div><div className="cm-subtle">Time-off settings are saved with class details in the shared timetable workspace.</div></div><footer className="cm-footer"><button className="cm-btn" onClick={()=>setDialog(null)}>Cancel</button><span className="cm-spacer"/><button className="cm-btn primary" onClick={saveTimeOff}>Save time off</button></footer></section></div>}
  </div>
}
