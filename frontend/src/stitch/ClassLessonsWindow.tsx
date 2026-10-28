// Shared class lessons window. Uses the saved timetable workspace as its source of truth.
import { useState, type CSSProperties } from "react";

type LessonRow = {
  id: string;
  code: string;
  subject: string;
  teacher: string;
  cls: string;
  count: number;
  length: number;
  color: string;
  room: string;
};

type Props = {
  className: string;
  shortClass: string;
  lessons: LessonRow[];
  onClose: () => void;
  onNew: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onCopyTo: (id: string) => void;
};

export default function ClassLessonsWindow({ className, shortClass, lessons, onClose, onNew, onEdit, onRemove, onCopyTo }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div style={S.overlay}>
      {/* BACKGROUND MAIN TIMETABLE (blur) */}
      <div style={S.window}>
        <div style={S.titleBar}><span>Lessons for class</span><div style={S.winBtns}><span style={S.box}>☐</span><span onClick={onClose} style={S.x}>✕</span></div></div>

        <div style={S.header}>
          <div style={S.icon}>👩‍👦‍👦</div>
          <div><div style={S.name}>{className}</div><div style={S.sub}>{shortClass || className}</div></div>
        </div>

        <div style={S.tableWrap}>
          <div style={S.headRow}>
            <div style={{...S.h, width:"20%"}}>Subject</div>
            <div style={{...S.h, width:"24%"}}>Teacher</div>
            <div style={{...S.h, width:"10%"}}>Class</div>
            <div style={{...S.h, width:"8%"}}>Count</div>
            <div style={{...S.h, width:"8%"}}>Length</div>
            <div style={{...S.h, width:"12%"}}>Classrooms</div>
          </div>

          <div style={S.list}>
            {lessons.map((l,i)=>(
              <div key={l.id} onClick={()=>setSelectedId(l.id)} onDoubleClick={()=>onEdit(l.id)} style={{...S.row, background: selectedId===l.id ? "#0d6efd" : i%2===0 ? "#fff" : "#eef2ff", color: selectedId===l.id ? "#fff" : "#000"}}>
                <div style={{...S.c, width:"4%", background:l.color, fontWeight:"bold", fontSize:10, color:"#000", textAlign:"center"}}>{l.code}</div>
                <div style={{...S.c, width:"16%"}}>{l.subject}</div>
                <div style={{...S.c, width:"24%"}}>{l.teacher}</div>
                <div style={{...S.c, width:"10%", textAlign:"center"}}>{l.cls}</div>
                <div style={{...S.c, width:"8%", textAlign:"center"}}>{l.count}</div>
                <div style={{...S.c, width:"8%", textAlign:"center"}}>{l.length}</div>
                <div style={{...S.c, width:"12%", textAlign:"center"}}>{l.room || "—"}</div>
              </div>
            ))}
            {lessons.length === 0 && <div style={S.empty}>No timetable lessons are assigned to {className} yet.</div>}
          </div>
        </div>

        <div style={S.footer}>
          <button onClick={onNew} style={S.btn}>New lesson</button>
          <button onClick={()=>selectedId != null && onEdit(selectedId)} disabled={selectedId == null} style={S.btn}>Edit lesson</button>
          <button onClick={()=>selectedId != null && onRemove(selectedId)} disabled={selectedId == null} style={S.btn}>Remove</button>
          <div style={{width:60}}></div>
          <button onClick={()=>selectedId != null && onCopyTo(selectedId)} disabled={selectedId == null} style={S.btn2}>Copy to</button>
          <button onClick={onNew} style={S.btn2}>Add more</button>
          <div style={{flex:1}}></div>
          <button onClick={onClose} style={S.close}>Close</button>
        </div>
      </div>

    </div>
  );
}



const S: Record<string, CSSProperties> = {
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
  empty:{ padding:20, color:"#666", fontSize:12 },
  row:{ display:"flex", alignItems:"center", height:28, fontSize:11, borderBottom:"1px solid #e0e0e0", cursor:"pointer" },
  c:{ padding:4, whiteSpace:"nowrap", overflow:"hidden" },
  footer:{ display:"flex", gap:8, padding:"12px 16px", borderTop:"1px solid #bbb", background:"#e8e8e8", alignItems:"center" },
  btn:{ minWidth:100, height:28, border:"1px solid #999", background:"#f0f0f0", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  btn2:{ minWidth:100, height:26, border:"1px solid #999", background:"#f5f5f5", fontSize:11, cursor:"pointer", borderBottom:"2px solid #888" },
  close:{ minWidth:80, height:26, border:"none", borderBottom:"1px solid #666", background:"transparent", fontSize:11, cursor:"pointer", textDecoration:"underline", marginLeft:"auto" },
};

