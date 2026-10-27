// LessonsForClass_Grade4_Combined.jsx - Combined as you asked
import { useState, type CSSProperties } from "react";

type PeriodOption = { name: string; type?: 'lesson' | 'break' };
export default function LessonsForClass_Grade4({ onClose, className = "GRADE 4", days = [], periods = [] }: { onClose: () => void; className?: string; days?: string[]; periods?: PeriodOption[] }) {
  const availableLessonCount = Math.max(1, days.length * periods.filter(period => period.type !== 'break' && !/break|lunch|recess|games/i.test(period.name)).length);
  const classCode = className.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase();
  const [lessons, setLessons] = useState(() => className.trim().toUpperCase() === "GRADE 4" ? [
    { id:1, code:"AGN", subject:"AGRICULTURE ...", teacher:"TANGUS VICTOR", cls:"G4", count:4, length:1, color:"#f2780d" },
    { id:2, code:"CRE", subject:"CRE", teacher:"CHEPKWONY MERCY", cls:"G4", count:3, length:1, color:"#d67a7a" },
    { id:3, code:"CAS", subject:"CREATIVE ART...", teacher:"NYONGESA ABIL", cls:"G4", count:6, length:1, color:"#c25b5b" },
    { id:4, code:"ENG", subject:"ENGLISH", teacher:"CHEPKWONY MERCY", cls:"G4", count:5, length:1, color:"#f5d7b0" },
    { id:5, code:"KIS", subject:"KISWAHILI", teacher:"CHERUIYOT RICHARD", cls:"G4", count:4, length:1, color:"#f5e6c8" },
    { id:6, code:"MAT", subject:"MATHEMATICS", teacher:"MOMANYI POLYTON", cls:"G4", count:5, length:1, color:"#6fa8dc" },
    { id:7, code:"PPI", subject:"PPI", teacher:"Without teacher", cls:"G4", count:1, length:1, color:"#d9d2e9" },
    { id:8, code:"SCT", subject:"SCIENCE TECH...", teacher:"CHEPKWONY MERCY", cls:"G4", count:4, length:1, color:"#e6a57e" },
    { id:9, code:"SST", subject:"SOCIAL STUDIES", teacher:"MOCHACHE PURITY", cls:"G4", count:3, length:1, color:"#b6d7a8" },
  ] : []);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showNewLesson, setShowNewLesson] = useState(false);
  const [showEditLesson, setShowEditLesson] = useState(false);
  const [editForm, setEditForm] = useState({
    teacher: "", subject: "", class: className, group: "Entire class",
    lessonsPerWeek: 1, length: "Single" as "Single" | "Double",
    home: true, shared: false, teacherRooms: false, subjectRooms: false, otherRooms: ""
  });
  const selectedLesson = lessons.find(l => l.id === selectedId);
  const openEditLesson = () => {
    if (!selectedLesson) { alert("Select a lesson to edit"); return; }
    setEditForm({
      teacher: selectedLesson.teacher === "MOCHACHE PURITY" ? "MOCHACHE PURITY (20)" : selectedLesson.teacher,
      subject: selectedLesson.subject.replace(/\.\.\.$/, ""),
      class: className, group: "Entire class",
      lessonsPerWeek: selectedLesson.count, length: selectedLesson.length === 2 ? "Double" : "Single",
      home: true, shared: false, teacherRooms: false, subjectRooms: false, otherRooms: ""
    });
    setShowEditLesson(true);
  };
  const handleSaveEdit = () => {
    if (!editForm.teacher) { alert("Select Teacher"); return; }
    if (!editForm.subject) { alert("Select Subject"); return; }
    setLessons(current => current.map(l => l.id === selectedId ? {
      ...l, code: editForm.subject.substring(0, 3).toUpperCase(),
      subject: editForm.subject, teacher: editForm.teacher.replace(/ \(20\)$/, ""),
      cls: classCode, count: editForm.lessonsPerWeek, length: editForm.length === "Double" ? 2 : 1
    } : l));
    setShowEditLesson(false);
  };
  const [newForm, setNewForm] = useState({
    teacher: "", subject: "", class: className, group: "Entire class",
    lessonsPerWeek: 1, length: "Single",
    home: true, shared: false, teacherRooms: false, subjectRooms: false, otherRooms: ""
  });

  const handleSaveNew = () => {
    if(!newForm.teacher || !newForm.subject){ alert("Select Teacher and Subject"); return; }
    const newLesson = {
      id: Date.now(),
      code: newForm.subject.substring(0,3).toUpperCase(),
      subject: newForm.subject.toUpperCase(),
      teacher: newForm.teacher,
      cls: classCode,
      count: newForm.lessonsPerWeek,
      length: 1,
      color: "#ddd"
    };
    setLessons([...lessons, newLesson]);
    setShowNewLesson(false);
    setNewForm({ teacher:"", subject:"", class:className, group:"Entire class", lessonsPerWeek:1, length:"Single", home:true, shared:false, teacherRooms:false, subjectRooms:false, otherRooms:"" });
  };

  return (
    <div style={S.overlay}>
      {/* MAIN: Lessons for class GRADE 4 */}
      <div style={S.window}>
        <div style={S.titleBar}><span>Lessons for class</span><div style={S.winBtns}><span style={S.box}>☐</span><span onClick={onClose} style={S.x}>✕</span></div></div>
        <div style={S.header}><div style={S.iconGroup}>👩‍👦‍👦</div><div><div style={S.name}>{className}</div><div style={S.sub}>{classCode}</div></div></div>
        <div style={S.tableWrap}>
          <div style={S.headRow}>
            <div style={{width:"18%"}}>Subject</div><div style={{width:"24%"}}></div><div style={{width:"22%"}}>Teacher</div><div style={{width:"8%"}}>Class</div><div style={{width:"8%"}}>Count</div><div style={{width:"8%"}}>Length</div><div style={{width:"12%"}}>Classrooms</div>
          </div>
          <div style={S.list}>
            {lessons.map((l,i)=>(
              <div key={l.id} onClick={()=>setSelectedId(l.id)} style={{...S.row, background: selectedId===l.id ? "#0d6efd" : i%2===0 ? "#fff" : "#f0f4ff", color: selectedId===l.id ? "#fff" : "#000"}}>
                <div style={{...S.cell, width:"4%", background:l.color, fontWeight:"bold", fontSize:10, textAlign:"center", color:"#000"}}>{l.code}</div>
                <div style={{...S.cell, width:"17%"}}>{l.subject}</div>
                <div style={{...S.cell, width:"24%"}}>{l.teacher}</div>
                <div style={{...S.cell, width:"8%", textAlign:"center"}}>{l.cls}</div>
                <div style={{...S.cell, width:"8%", textAlign:"center"}}>{l.count}</div>
                <div style={{...S.cell, width:"8%", textAlign:"center"}}>{l.length}</div>
                <div style={{...S.cell, width:"12%", textAlign:"center"}}>🏠</div>
              </div>
            ))}
            <div style={{height:250}}></div>
          </div>
        </div>
        <div style={S.footer}>
          <button onClick={()=>setShowNewLesson(true)} style={{...S.btn, background:"#fff", border:"2px solid #000"}}>New lesson</button>
          <button onClick={openEditLesson} style={S.btn}>Edit lesson</button>
          <button onClick={()=>setLessons(lessons.filter(x=>x.id!==selectedId))} style={S.btn}>Remove</button>
          <div style={{width:40}}></div><button style={S.btn}>Copy to</button><button style={S.btn}>Add more</button>
          <div style={{flex:1}}></div><button onClick={onClose} style={S.close}>Close</button>
        </div>
      </div>

      {showEditLesson && (
        <div style={L.overlay}>
          <div style={L.window}>
            <div style={L.titleBar}><span>Lesson</span><button aria-label="Close" onClick={()=>setShowEditLesson(false)} style={L.x}>✕</button></div>
            <div style={L.body}>
              <div style={L.card}><div style={L.ic}>🎓</div><div style={L.f}><label style={L.lb}>Teacher</label><select value={editForm.teacher} onChange={e=>setEditForm({...editForm, teacher:e.target.value})} style={{...L.sel, width:"100%", background:"#fffbe6", fontWeight:"bold"}}>{["","MOCHACHE PURITY (20)","MOCHACHE PURITY","TANGUS VICTOR","CHEPKWONY MERCY","NYONGESA ABIL","CHERUIYOT RICHARD","MOMANYI POLYTON","Without teacher"].map(x=><option key={x} value={x}>{x}</option>)}</select></div><button type="button" style={L.side}>More teachers</button></div>
              <div style={L.card}><div style={L.ic}>📘</div><div style={L.f}><label style={L.lb}>Subject</label><select value={editForm.subject} onChange={e=>setEditForm({...editForm, subject:e.target.value})} style={{...L.sel, width:"100%", background:"#a8c8ff"}}>{["","SOCIAL STUDIES","AGRICULTURE","CRE","CREATIVE ARTS","ENGLISH","KISWAHILI","MATHEMATICS","PPI","SCIENCE TECHNOLOGY"].map(x=><option key={x} value={x}>{x}</option>)}</select></div><div style={{width:140}}/></div>
              <div style={L.card}><div style={L.ic}>👥</div><div style={L.f}><label style={L.lb}>Class</label><div style={{display:"flex",gap:12}}><select value={editForm.class} onChange={e=>setEditForm({...editForm,class:e.target.value})} style={{...L.sel,width:210}}>{["GRADE 1","GRADE 2","GRADE 3","GRADE 4","GRADE 5","GRADE 6","GRADE 7","GRADE 8","GRADE 9"].map(x=><option key={x}>{x}</option>)}</select><select value={editForm.group} onChange={e=>setEditForm({...editForm,group:e.target.value})} style={{...L.sel,width:130}}><option>Entire class</option><option>Group</option></select></div></div><div style={L.sideCol}><button type="button" style={L.side}>Joint classes</button><button type="button" style={L.side}>Add division</button></div></div>
              <div style={L.card}><div style={L.ic}>📅</div><div style={L.f}><label style={L.lb}>Lessons/week</label><div style={{display:"flex",gap:12}}><select value={editForm.lessonsPerWeek} onChange={e=>setEditForm({...editForm,lessonsPerWeek:Number(e.target.value)})} style={{...L.sel,width:190}}>{Array.from({ length: Math.max(10, availableLessonCount, editForm.lessonsPerWeek) }, (_, index) => index + 1).map(x=><option key={x} value={x}>{x}</option>)}</select><select value={editForm.length} onChange={e=>setEditForm({...editForm,length:e.target.value as "Single"|"Double"})} style={{...L.sel,width:130}}><option>Single</option><option>Double</option></select></div></div><div style={{width:140}}><span style={{fontSize:11}}>More weeks/terms</span></div></div>
              <div style={L.card}><div style={L.ic}>🚪</div><div style={L.f}><div style={L.checkGrid}><label style={L.chk}><input type="checkbox" checked={editForm.home} onChange={e=>setEditForm({...editForm,home:e.target.checked})}/> Home classroom</label><label style={L.chk}><input type="checkbox" checked={editForm.teacherRooms} onChange={e=>setEditForm({...editForm,teacherRooms:e.target.checked})}/> Teacher's classrooms</label><label style={L.chk}><input type="checkbox" checked={editForm.shared} onChange={e=>setEditForm({...editForm,shared:e.target.checked})}/> Shared room</label><label style={L.chk}><input type="checkbox" checked={editForm.subjectRooms} onChange={e=>setEditForm({...editForm,subjectRooms:e.target.checked})}/> Subject's classrooms</label></div><input value={editForm.otherRooms} onChange={e=>setEditForm({...editForm,otherRooms:e.target.value})} placeholder="Other available classrooms" style={L.in}/></div><button type="button" style={L.side}>More classrooms</button></div>
            </div>
            <div style={L.foot}><button onClick={()=>setShowEditLesson(false)} style={L.cancel}>Cancel</button><button type="button" style={L.help}>Help</button><div style={{flex:1}}/><button onClick={handleSaveEdit} style={L.ok}>OK</button></div>
          </div>
        </div>
      )}

      {/* POPUP: New lesson on GRADE 4 - GRADE 4 prefilled as your photo */}
      {showNewLesson && (
        <div style={L.overlay}>
          <div style={L.window}>
            <div style={L.titleBar}><span>Lesson</span><span onClick={()=>setShowNewLesson(false)} style={L.x}>✕</span></div>
            <div style={L.body}>
              <div style={L.card}><div style={L.ic}>🎓</div><div style={L.f}><label style={L.lb}>Teacher</label><select value={newForm.teacher} onChange={e=>setNewForm({...newForm, teacher:e.target.value})} style={L.sel}><option value=""></option><option>TANGUS VICTOR</option><option>CHEPKWONY MERCY</option><option>NYONGESA ABIL</option><option>CHERUIYOT RICHARD</option><option>MOMANYI POLYTON</option><option>MOCHACHE PURITY</option><option>Without teacher</option></select></div><button style={L.side}>More teachers</button></div>
              <div style={L.card}><div style={L.ic}>📘</div><div style={L.f}><label style={L.lb}>Subject</label><select value={newForm.subject} onChange={e=>setNewForm({...newForm, subject:e.target.value})} style={L.sel}><option value=""></option><option>AGRICULTURE</option><option>CRE</option><option>CREATIVE ARTS</option><option>ENGLISH</option><option>KISWAHILI</option><option>MATHEMATICS</option><option>PPI</option><option>SCIENCE TECHNOLOGY</option><option>SOCIAL STUDIES</option></select></div><div style={{width:140}}></div></div>
              <div style={L.card}><div style={L.ic}>👥</div><div style={L.f}><label style={L.lb}>Class</label><div style={{display:"flex", gap:12}}><select value={newForm.class} onChange={e=>setNewForm({...newForm, class:e.target.value})} style={{...L.sel, width:200, background:"#fffbe6"}}>{["GRADE 1","GRADE 2","GRADE 3","GRADE 4","GRADE 5","GRADE 6","GRADE 7","GRADE 8","GRADE 9"].map(name=><option key={name}>{name}</option>)}</select><select value={newForm.group} onChange={e=>setNewForm({...newForm, group:e.target.value})} style={{...L.sel, width:130}}><option>Entire class</option><option>Group</option></select></div></div><div style={L.sideCol}><button style={L.side}>Joint classes</button><button style={L.side}>Add division</button></div></div>
              <div style={L.card}><div style={L.ic}>📅</div><div style={L.f}><label style={L.lb}>Lessons/week</label><div style={{display:"flex", gap:12}}><select value={newForm.lessonsPerWeek} onChange={e=>setNewForm({...newForm, lessonsPerWeek:parseInt(e.target.value)})} style={{...L.sel, width:180}}>{Array.from({ length: Math.max(10, availableLessonCount, newForm.lessonsPerWeek) }, (_, index) => index + 1).map(x => <option key={x} value={x}>{x}</option>)}</select><select value={newForm.length} onChange={e=>setNewForm({...newForm, length:e.target.value})} style={{...L.sel, width:130}}><option>Single</option><option>Double</option></select></div></div><div style={{width:140}}><span style={{fontSize:11}}>More weeks/terms</span></div></div>
              <div style={L.card}><div style={L.ic}>🚪</div><div style={L.f}><div style={L.checkGrid}><label style={L.chk}><input type="checkbox" checked={newForm.home} onChange={e=>setNewForm({...newForm, home:e.target.checked})}/> Home classroom</label><label style={L.chk}><input type="checkbox" checked={newForm.teacherRooms} onChange={e=>setNewForm({...newForm, teacherRooms:e.target.checked})}/> Teacher's classrooms</label><label style={L.chk}><input type="checkbox" checked={newForm.shared} onChange={e=>setNewForm({...newForm, shared:e.target.checked})}/> Shared room</label><label style={L.chk}><input type="checkbox" checked={newForm.subjectRooms} onChange={e=>setNewForm({...newForm, subjectRooms:e.target.checked})}/> Subject's classrooms</label></div><input value={newForm.otherRooms} onChange={e=>setNewForm({...newForm, otherRooms:e.target.value})} placeholder="Other available classrooms" style={L.in}/></div><button style={L.side}>More classrooms</button></div>
            </div>
            <div style={L.foot}><button onClick={()=>setShowNewLesson(false)} style={L.cancel}>Cancel</button><button style={L.help}>Help</button><div style={{flex:1}}></div><button onClick={handleSaveNew} style={L.ok}>OK</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  overlay:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10070, fontFamily:"Segoe UI" },
  window:{ width:"98%", maxWidth:1120, height:"92vh", background:"#e8e8e8", border:"1px solid #777", boxShadow:"12px 12px 26px rgba(0,0,0,0.5)", display:"flex", flexDirection:"column" },
  titleBar:{ height:28, background:"#f0f0f0", borderBottom:"1px solid #aaa", display:"flex", justifyContent:"space-between", padding:"0 10px", alignItems:"center", fontSize:12 },
  winBtns:{ display:"flex", gap:6 },
  box:{ width:20, height:18, border:"1px solid #aaa", background:"#fff", display:"flex", alignItems:"center", justifyContent:"center" },
  x:{ width:22, height:18, border:"1px solid #aaa", background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" },
  header:{ display:"flex", gap:12, padding:"10px 16px", background:"#f5f5f5", alignItems:"center" },
  iconGroup:{ fontSize:28, width:40, height:34, background:"#4a7", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:4 },
  name:{ fontWeight:"bold", fontSize:15 },
  sub:{ fontSize:11, color:"#666" },
  tableWrap:{ flex:1, background:"#fff", display:"flex", flexDirection:"column", overflow:"hidden" },
  headRow:{ display:"flex", background:"#e8e8e8", borderTop:"1px solid #aaa", borderBottom:"1px solid #999", padding:"6px 4px", fontSize:11, fontWeight:500 },
  list:{ flex:1, overflowY:"auto" },
  row:{ display:"flex", alignItems:"center", height:28, fontSize:11, borderBottom:"1px solid #e0e0e0", cursor:"pointer" },
  cell:{ padding:4, whiteSpace:"nowrap", overflow:"hidden" },
  footer:{ display:"flex", gap:8, padding:"12px 16px", borderTop:"1px solid #bbb", background:"#e8e8e8", alignItems:"center" },
  btn:{ minWidth:95, height:28, border:"1px solid #999", background:"#f0f0f0", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  close:{ minWidth:80, height:26, border:"none", borderBottom:"1px solid #666", background:"transparent", fontSize:11, cursor:"pointer", textDecoration:"underline", marginLeft:"auto" },
};

const L: Record<string, CSSProperties> = {
  overlay:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:12001, fontFamily:"Segoe UI" },
  window:{ width:"98%", maxWidth:860, background:"#e8e8ea", border:"1px solid #777", boxShadow:"18px 18px 36px rgba(0,0,0,0.8)", display:"flex", flexDirection:"column" },
  titleBar:{ height:26, background:"#f0f0f0", borderBottom:"1px solid #aaa", display:"flex", justifyContent:"space-between", padding:"0 10px", alignItems:"center", fontSize:12 },
  x:{ width:22, height:18, border:"1px solid #aaa", background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" },
  body:{ padding:8, display:"flex", flexDirection:"column", gap:6 },
  card:{ display:"flex", gap:12, border:"1px solid #bbb", background:"#eef1f4", padding:"10px 12px", minHeight:52 },
  ic:{ width:44, height:36, fontSize:26, display:"flex", alignItems:"center", justifyContent:"center" },
  f:{ flex:1, display:"flex", flexDirection:"column", gap:4 },
  lb:{ fontSize:11 },
  sel:{ height:26, border:"1px solid #888", background:"#fff", fontSize:11, padding:"0 6px" },
  side:{ minWidth:130, height:26, border:"1px solid #999", background:"#f5f5f5", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  sideCol:{ width:130, display:"flex", flexDirection:"column", gap:6 },
  checkGrid:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 30px", marginBottom:6 },
  chk:{ fontSize:11, display:"flex", gap:6, alignItems:"center" },
  in:{ height:24, border:"1px solid #888", background:"#fff", fontSize:11, padding:"0 6px", width:"100%" },
  foot:{ display:"flex", gap:10, padding:"10px 12px", borderTop:"1px solid #bbb", background:"#e0e0e0" },
  cancel:{ width:110, height:26, border:"1px solid #999", background:"#f0f0f0", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  help:{ width:110, height:26, border:"1px solid #999", background:"#f0f0f0", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  ok:{ width:260, height:28, border:"1px solid #666", background:"#fff", fontSize:11, cursor:"pointer", borderBottom:"2px solid #666" },
};