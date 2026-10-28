// DoubleClick_Class_Grade4.jsx - Double clicking on GRADE 4 pops this
import { useState } from "react";

export default function LessonsForClass_Grade4({ onClose }) {
  const [lessons, setLessons] = useState([
    { id:1, code:"AGN", subject:"AGRICULTURE ...", teacher:"TANGUS VICTOR", cls:"G4", count:4, length:1, color:"#e05a33" },
    { id:2, code:"CRE", subject:"CRE", teacher:"CHEPKWONY MERCY", cls:"G4", count:3, length:1, color:"#8b5a44" },
    { id:3, code:"CAS", subject:"CREATIVE ART...", teacher:"NYONGESA ABIL", cls:"G4", count:6, length:1, color:"#c94c4c" },
    { id:4, code:"ENG", subject:"ENGLISH", teacher:"CHEPKWONY MERCY", cls:"G4", count:5, length:1, color:"#e67e22" },
    { id:5, code:"KIS", subject:"KISWAHILI", teacher:"CHERUIYOT RICHARD", cls:"G4", count:4, length:1, color:"#f5e6c8" },
    { id:6, code:"MAT", subject:"MATHEMATICS", teacher:"MOMANYI POLYTON", cls:"G4", count:5, length:1, color:"#3498db" },
    { id:7, code:"PPI", subject:"PPI", teacher:"Without teacher", cls:"G4", count:1, length:1, color:"#d9d2e9" },
    { id:8, code:"SCT", subject:"SCIENCE TECH...", teacher:"CHEPKWONY MERCY", cls:"G4", count:4, length:1, color:"#e67e22" },
    { id:9, code:"SST", subject:"SOCIAL STUDIES", teacher:"MOCHACHE PURITY", cls:"G4", count:3, length:1, color:"#82c785" },
  ]);

  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ teacher:"", subject:"", class:"GRADE 4", lessonsPerWeek:1 });

  return (
    <div style={S.overlay}>
      {/* BACKGROUND MAIN TIMETABLE (blur) */}
      <div style={S.window}>
        <div style={S.titleBar}><span>Lessons for class</span><div style={S.winBtns}><span style={S.box}>☐</span><span onClick={onClose} style={S.x}>✕</span></div></div>

        <div style={S.header}>
          <div style={S.icon}>👩‍👦‍👦</div>
          <div><div style={S.name}>GRADE 4</div><div style={S.sub}>G4</div></div>
        </div>

        <div style={S.tableWrap}>
          <div style={S.headRow}>
            <div style={{...S.h, width:"20%"}}>Subject</div>
            <div style={{...S.h, width:"24%"}}>Teacher</div>
            <div style={{...S.h, width:"10%"}}>Class</div>
            <div style={{...S.h, width:"8%"}}>Count</div>
            <div style={{...S.h, width:"8%"}}>Length</div>
            <div style={{...S.h, width:"12%"}}>Classrooms</div>
            <div style={{...S.h, width:"9%"}}>Week</div>
            <div style={{...S.h, width:"9%"}}>Term</div>
          </div>

          <div style={S.list}>
            {lessons.map((l,i)=>(
              <div key={l.id} onClick={()=>setSelectedId(l.id)} onDoubleClick={()=>alert(`Edit ${l.subject}`)} style={{...S.row, background: selectedId===l.id ? "#0d6efd" : i%2===0 ? "#fff" : "#eef2ff", color: selectedId===l.id ? "#fff" : "#000"}}>
                <div style={{...S.c, width:"4%", background:l.color, fontWeight:"bold", fontSize:10, color:"#000", textAlign:"center"}}>{l.code}</div>
                <div style={{...S.c, width:"16%"}}>{l.subject}</div>
                <div style={{...S.c, width:"24%"}}>{l.teacher}</div>
                <div style={{...S.c, width:"10%", textAlign:"center"}}>{l.cls}</div>
                <div style={{...S.c, width:"8%", textAlign:"center"}}>{l.count}</div>
                <div style={{...S.c, width:"8%", textAlign:"center"}}>{l.length}</div>
                <div style={{...S.c, width:"12%", textAlign:"center"}}>🏠</div>
                <div style={{...S.c, width:"9%"}}></div>
                <div style={{...S.c, width:"9%"}}></div>
              </div>
            ))}
            <div style={{height:380}}></div>
          </div>
        </div>

        <div style={S.footer}>
          <button onClick={()=>setShowNew(true)} style={S.btn}>New lesson</button>
          <button style={S.btn}>Edit lesson</button>
          <button onClick={()=>setLessons(lessons.filter(x=>x.id!==selectedId))} style={S.btn}>Remove</button>
          <div style={{width:60}}></div>
          <button style={S.btn2}>Copy to</button>
          <button style={S.btn2}>Add more</button>
          <div style={{flex:1}}></div>
          <button onClick={onClose} style={S.close}>Close</button>
        </div>
      </div>

      {/* NEW LESSON POPUP - GRADE 4 PREFILLED - as your previous photo combined */}
      {showNew && (
        <div style={L.overlay}>
          <div style={L.win}>
            <div style={L.tBar}><span>Lesson</span><span onClick={()=>setShowNew(false)} style={L.x}>✕</span></div>
            <div style={L.body}>
              <div style={L.card}><div style={L.ic}>🎓</div><div style={L.f}><label style={L.lb}>Teacher</label><select value={form.teacher} onChange={e=>setForm({...form, teacher:e.target.value})} style={L.sel}><option value=""></option><option>TANGUS VICTOR</option><option>CHEPKWONY MERCY</option><option>NYONGESA ABIL</option><option>CHERUIYOT RICHARD</option><option>MOMANYI POLYTON</option><option>MOCHACHE PURITY</option></select></div><button style={L.side}>More teachers</button></div>
              <div style={L.card}><div style={L.ic}>📘</div><div style={L.f}><label style={L.lb}>Subject</label><select value={form.subject} onChange={e=>setForm({...form, subject:e.target.value})} style={L.sel}><option value=""></option><option>AGRICULTURE</option><option>CRE</option><option>CREATIVE ARTS</option><option>ENGLISH</option><option>KISWAHILI</option><option>MATHEMATICS</option><option>PPI</option><option>SCIENCE TECHNOLOGY</option><option>SOCIAL STUDIES</option></select></div><div style={{width:140}}></div></div>
              <div style={L.card}><div style={L.ic}>👥</div><div style={L.f}><label style={L.lb}>Class</label><div style={{display:"flex", gap:10}}><select value={form.class} style={{...L.sel, width:200, background:"#fffbe6"}}><option>GRADE 4</option></select><select style={{...L.sel, width:130}}><option>Entire class</option></select></div></div><div style={L.sideCol}><button style={L.side}>Joint classes</button><button style={L.side}>Add division</button></div></div>
              <div style={L.card}><div style={L.ic}>📅</div><div style={L.f}><label style={L.lb}>Lessons/week</label><div style={{display:"flex", gap:10}}><select value={form.lessonsPerWeek} onChange={e=>setForm({...form, lessonsPerWeek:parseInt(e.target.value)})} style={{...L.sel, width:180}}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option><option value={6}>6</option></select><select style={{...L.sel, width:130}}><option>Single</option></select></div></div><div style={{width:140}}><span style={{fontSize:11}}>More weeks/terms</span></div></div>
              <div style={L.card}><div style={L.ic}>🚪</div><div style={L.f}><div style={L.checks}><label style={L.chk}><input type="checkbox" defaultChecked/> Home classroom</label><label style={L.chk}><input type="checkbox"/> Teacher's classrooms</label><label style={L.chk}><input type="checkbox"/> Shared room</label><label style={L.chk}><input type="checkbox"/> Subject's classrooms</label></div><input placeholder="Other available classrooms" style={L.in}/></div><button style={L.side}>More classrooms</button></div>
            </div>
            <div style={L.foot}><button onClick={()=>setShowNew(false)} style={L.cancel}>Cancel</button><button style={L.help}>Help</button><div style={{flex:1}}></div><button onClick={()=>{ if(!form.teacher||!form.subject){alert("Select Teacher & Subject");return;} setLessons([...lessons, {id:Date.now(), code:form.subject.substring(0,3).toUpperCase(), subject:form.subject, teacher:form.teacher, cls:"G4", count:form.lessonsPerWeek, length:1, color:"#ccc"}]); setShowNew(false); }} style={L.ok}>OK</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  overlay:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10070, fontFamily:"Segoe UI" },
  window:{ width:"98%", maxWidth:1100, height:"92vh", background:"#e8e8e8", border:"1px solid #777", boxShadow:"12px 12px 26px rgba(0,0,0,0.5)", display:"flex", flexDirection:"column" },
  titleBar:{ height:28, background:"#f0f0f0", borderBottom:"1px solid #aaa", display:"flex", justifyContent:"space-between", padding:"0 10px", alignItems:"center", fontSize:12 },
  winBtns:{ display:"flex", gap:6 },
  box:{ width:20, height:18, border:"1px solid #aaa", background:"#fff", display:"flex", alignItems:"center", justifyContent:"center" },
  x:{ width:22, height:18, border:"1px solid #aaa", background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" },
  header:{ display:"flex", gap:12, padding:"10px 16px", background:"#f5f5f5", alignItems:"center", borderBottom:"1px solid #ddd" },
  icon:{ fontSize:28, width:40, height:34, background:"#4a7", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:4 },
  name:{ fontWeight:"bold", fontSize:16 },
  sub:{ fontSize:11, color:"#666" },
  tableWrap:{ flex:1, background:"#fff", display:"flex", flexDirection:"column", overflow:"hidden" },
  headRow:{ display:"flex", background:"#e8e8e8", borderTop:"1px solid #aaa", borderBottom:"1px solid #999", padding:"6px 4px", fontSize:11, fontWeight:600 },
  h:{ padding:2 },
  list:{ flex:1, overflowY:"auto" },
  row:{ display:"flex", alignItems:"center", height:28, fontSize:11, borderBottom:"1px solid #e0e0e0", cursor:"pointer" },
  c:{ padding:4, whiteSpace:"nowrap", overflow:"hidden" },
  footer:{ display:"flex", gap:8, padding:"12px 16px", borderTop:"1px solid #bbb", background:"#e8e8e8", alignItems:"center" },
  btn:{ minWidth:100, height:28, border:"1px solid #999", background:"#f0f0f0", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  btn2:{ minWidth:100, height:26, border:"1px solid #999", background:"#f5f5f5", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  close:{ minWidth:80, height:26, border:"none", borderBottom:"1px solid #666", background:"transparent", fontSize:11, cursor:"pointer", textDecoration:"underline", marginLeft:"auto" },
};

const L = {
  overlay:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10120, fontFamily:"Segoe UI" },
  win:{ width:"98%", maxWidth:860, background:"#e8e8ea", border:"1px solid #777", boxShadow:"18px 18px 36px rgba(0,0,0,0.8)", display:"flex", flexDirection:"column" },
  tBar:{ height:26, background:"#f0f0f0", borderBottom:"1px solid #aaa", display:"flex", justifyContent:"space-between", padding:"0 10px", alignItems:"center", fontSize:12 },
  x:{ width:22, height:18, border:"1px solid #aaa", background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" },
  body:{ padding:8, display:"flex", flexDirection:"column", gap:6 },
  card:{ display:"flex", gap:12, border:"1px solid #bbb", background:"#eef1f4", padding:"10px 12px", minHeight:52 },
  ic:{ width:44, height:36, fontSize:26, display:"flex", alignItems:"center", justifyContent:"center" },
  f:{ flex:1, display:"flex", flexDirection:"column", gap:4 },
  lb:{ fontSize:11 },
  sel:{ height:26, border:"1px solid #888", background:"#fff", fontSize:11, padding:"0 6px" },
  side:{ minWidth:130, height:26, border:"1px solid #999", background:"#f5f5f5", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  sideCol:{ width:130, display:"flex", flexDirection:"column", gap:6 },
  checks:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 30px", marginBottom:6 },
  chk:{ fontSize:11, display:"flex", gap:6, alignItems:"center" },
  in:{ height:24, border:"1px solid #888", background:"#fff", fontSize:11, padding:"0 6px", width:"100%" },
  foot:{ display:"flex", gap:10, padding:"10px 12px", borderTop:"1px solid #bbb", background:"#e0e0e0" },
  cancel:{ width:110, height:26, border:"1px solid #999", background:"#f0f0f0", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  help:{ width:110, height:26, border:"1px solid #999", background:"#f0f0f0", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  ok:{ width:260, height:28, border:"1px solid #666", background:"#fff", fontSize:11, cursor:"pointer", borderBottom:"2px solid #666" },
};