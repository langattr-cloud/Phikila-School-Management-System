// TopMenuFullWidth.tsx
import { useState } from "react";

type TopMenuFullWidthProps = { onNavigate?: (name: string) => void };

export default function AscTimetableMenu({ onNavigate }: TopMenuFullWidthProps) {
  const [whole, setWhole] = useState("Whole");
  const go = (n: string) => onNavigate?.(n);

  return (
    <div style={S.wrapper}>
      <div style={S.topRow}>
        <span>🔔</span>
        <b style={{ color: "#1a56db", fontSize: "12px" }}>Main</b>
        <span style={S.top}>File</span>
        <span style={S.top}>Specification</span>
        <span style={S.top}>View</span>
        <span style={S.top}>Timetable</span>
        <span style={S.top}>Options</span>
        <span style={S.top}>Help</span>
        <span style={{ marginLeft: "auto", fontSize: "11px" }}>Find:</span>
      </div>
      <div style={S.ribbonFull}>
        <button onClick={() => go("New")} style={S.cell}><div style={S.ico}>📄</div><span style={S.lb}>New</span></button>
        <button onClick={() => go("Open")} style={S.cell}><div style={S.ico}>📁</div><span style={S.lb}>Open</span></button>
        <button onClick={() => go("Save")} style={S.cell}><div style={S.ico}>💾</div><span style={S.lb}>Save</span></button>
        <button onClick={() => go("Print")} style={S.cell}><div style={S.ico}>🖨️</div><span style={S.lb}>Print</span></button>
        <button onClick={() => go("Print preview")} style={S.cell}><div style={S.ico}>🔍</div><span style={S.lb}>Print<br/>preview</span></button>
        <div style={S.cellWhole}><select value={whole} onChange={e => setWhole(e.target.value)} style={S.wholeSel}><option>Whole</option><option>Class</option><option>Teacher</option></select></div>
        <button onClick={() => go("Subjects")} style={S.cell}><div style={S.ico}>📘</div><span style={S.lb}>Subjects</span></button>
        <button onClick={() => go("Classes")} style={S.cell}><div style={S.ico}>👥</div><span style={S.lb}>Classes</span></button>
        <button onClick={() => go("Teachers")} style={S.cell}><div style={S.ico}>🎓</div><span style={S.lb}>Teachers</span></button>
        <button onClick={() => go("Relations")} style={S.cell}><div style={S.ico}>🔗</div><span style={S.lb}>Relations</span></button>
        <button onClick={() => go("Test")} style={S.cell}><div style={S.ico}>✅</div><span style={S.lb}>Test</span></button>
        <button onClick={() => go("Generate new")} style={S.cell}><div style={S.ico}>🏛️</div><span style={S.lb}>Generate<br/>new</span></button>
        <button onClick={() => go("Generate in cloud")} style={S.cell}><div style={S.ico}>☁️</div><span style={S.lb}>Generate<br/>in cloud</span></button>
        <button onClick={() => go("Verification")} style={S.cell}><div style={S.ico}>🔨</div><span style={S.lb}>Verification</span></button>
        <button onClick={() => go("School")} style={S.cell}><div style={S.ico}>🏫</div><span style={S.lb}>School</span></button>
        <button onClick={() => go("Timetables Online")} style={S.cell}><div style={S.ico}>☁️</div><span style={S.lb}>TimeTables<br/>Online</span></button>
        <button onClick={() => go("Questions? Comments? Write us")} style={S.cell}><div style={S.ico}>❓</div><span style={S.lb}>Questions?<br/>Comments?<br/>Write us</span></button>
      </div>
    </div>
  );
}

const S = {
  wrapper: { width: "100%", maxWidth: "100%", background: "#eef5ff", borderBottom: "1px solid #999", fontFamily: "Segoe UI, Arial", boxSizing: "border-box" as const, overflow: "hidden" as const },
  topRow: { display: "flex", gap: "14px", alignItems: "center", padding: "3px 12px", background: "#f8fbff", borderBottom: "1px solid #d0d8e8", fontSize: "12px", whiteSpace: "nowrap" as const },
  top: { fontSize: "12px", cursor: "pointer" },
  ribbonFull: { display: "flex", flexDirection: "row" as const, flexWrap: "nowrap" as const, justifyContent: "space-between", alignItems: "stretch", width: "100%", padding: "2px 0px", background: "linear-gradient(#fff, #e8eef7)", boxSizing: "border-box" as const },
  cell: { flex: "1 1 0", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "flex-start", minWidth: "0", border: "1px solid transparent", borderRight: "1px solid #dde5f0", background: "transparent", cursor: "pointer", padding: "3px 1px", gap: "2px", boxSizing: "border-box" as const },
  cellWhole: { flex: "1.2 1 0", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #dde5f0", padding: "0 4px", minWidth: "0", boxSizing: "border-box" as const },
  ico: { width: "30px", height: "28px", maxWidth: "100%", background: "#fff", border: "1px solid #c0cddc", borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 1 },
  lb: { fontSize: "8.8px", lineHeight: "9.5px", textAlign: "center" as const, whiteSpace: "pre-line" as const, color: "#1f2937", marginTop: "2px", width: "100%", overflow: "hidden" as const, overflowWrap: "anywhere" as const },
  wholeSel: { width: "100%", maxWidth: "84px", minWidth: "0", height: "24px", fontSize: "11px", border: "1px solid #888", background: "#fff" },
};
