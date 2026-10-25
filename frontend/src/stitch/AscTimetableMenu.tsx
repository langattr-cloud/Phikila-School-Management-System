// AscTimetableMenu.tsx
import { useState } from "react";

type AscTimetableMenuProps = { onNavigate?: (name: string) => void };

export default function AscTimetableMenu({ onNavigate }: AscTimetableMenuProps) {
  const [whose, setWhose] = useState("Whole");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const topMenus = {
    Main: ["New", "Open", "Save", "Print", "Print preview", "Exit"],
    File: ["Import", "Export"],
    Specification: ["Subjects", "Classes", "Classrooms", "Teachers", "Lessons"],
    View: ["Timetable", "Classrooms view", "Teachers view"],
    Timetable: ["Generate new", "Generate in cloud", "Test", "Verification"],
    Options: ["School", "Constraints"],
    Help: ["Questions? Comments? Write us", "About"],
  };

  const Item = ({ icon, label, action, twoLines }: { icon: string; label: string; action?: string; twoLines?: boolean }) => (
    <button
      onClick={() => onNavigate?.(action || label)}
      style={S.ribbonBtn}
      title={label}
    >
      <div style={S.iconBox}>{icon}</div>
      <span style={{ fontSize: "11px", lineHeight: "12px", textAlign: "center", whiteSpace: twoLines ? "pre-line" : "nowrap" }}>{label}</span>
    </button>
  );

  return (
    <div style={S.wrapper}>
      {/* TOP MENU BAR */}
      <div style={S.topBar}>
        <div style={S.appIcon}>📘</div>
        {Object.keys(topMenus).map(name => (
          <div key={name} style={{ position: "relative" }}>
            <button
              onMouseEnter={() => openMenu && setOpenMenu(name)}
              onClick={() => setOpenMenu(openMenu === name ? null : name)}
              style={{ ...S.topBtn, background: openMenu === name ? "#d0e3ff" : "transparent" }}
            >
              {name}
            </button>
            {openMenu === name && (
              <div style={S.dropdown}>
                {topMenus[name as keyof typeof topMenus].map(i => (
                  <div key={i} style={S.dropItem} onClick={() => { onNavigate?.(i); setOpenMenu(null); }}>{i}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* RIBBON */}
      <div style={S.ribbon}>
        <div style={S.ribbonGroup}>
          <Item icon="📄" label="New" action="New" />
          <Item icon="📁" label="Open" action="Open" />
          <Item icon="💾" label="Save" action="Save" />
          <Item icon="🖨️" label="Print" action="Print" />
          <Item icon="👁️" label={`Print\npreview`} action="Print preview" twoLines />
          <div style={{ marginLeft: "8px" }}>
            <select value={whose} onChange={e => setWhose(e.target.value)} style={S.select}>
              <option>Whole</option>
              <option>Class</option>
              <option>Teacher</option>
              <option>Classroom</option>
            </select>
          </div>
        </div>

        <div style={S.divider} />

        <div style={S.ribbonGroup}>
          <Item icon="📘" label="Subjects" />
          <Item icon="👩‍🏫" label="Classes" />
          <Item icon="🚪" label="Classrooms" />
          <Item icon="🎓" label="Teachers" />
          <Item icon="👥" label={`Students /\nSeminars`} twoLines />
          <Item icon="🔗" label="Relations" />
        </div>

        <div style={S.divider} />

        <div style={S.ribbonGroup}>
          <Item icon="✅" label="Test" />
          <Item icon="🏛️" label={`Generate\nnew`} action="Generate new" twoLines />
          <Item icon="☁️🏛️" label={`Generate\nin cloud`} action="Generate in cloud" twoLines />
          <Item icon="🔨" label="Verification" />
          <Item icon="🏫" label="School" />
          <Item icon="☁️" label={`Timetables\nOnline`} twoLines />
          <Item icon="❓" label={`Questions?\nComments? Write us`} action="Questions? Comments? Write us" twoLines />
        </div>
      </div>
    </div>
  );
}

const S = {
  wrapper: { background: "#f0f4f8", borderBottom: "1px solid #a0a0a0", fontFamily: "Segoe UI, Tahoma, sans-serif", userSelect: "none" as const },
  topBar: { display: "flex", alignItems: "center", gap: "2px", padding: "2px 6px", background: "#fff", borderBottom: "1px solid #d0d0d0" },
  appIcon: { width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" },
  topBtn: { border: "1px solid transparent", padding: "3px 10px", fontSize: "13px", cursor: "pointer", borderRadius: "3px", background: "transparent" },
  dropdown: { position: "absolute" as const, top: "100%", left: 0, background: "#fff", border: "1px solid #888", boxShadow: "2px 2px 8px rgba(0,0,0,0.2)", minWidth: "160px", zIndex: 100, padding: "4px 0" },
  dropItem: { padding: "6px 16px", fontSize: "12px", cursor: "pointer" },
  ribbon: { display: "flex", alignItems: "flex-start", padding: "6px 10px", gap: "10px", overflowX: "auto" as const, background: "linear-gradient(to bottom, #ffffff, #e8eef7)" },
  ribbonGroup: { display: "flex", gap: "4px", alignItems: "flex-start" },
  ribbonBtn: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "3px", border: "1px solid transparent", background: "transparent", padding: "4px 6px", cursor: "pointer", minWidth: "62px", borderRadius: "4px" },
  iconBox: { width: "36px", height: "36px", border: "1px solid #c0c0c0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", borderRadius: "3px" },
  select: { width: "120px", height: "24px", fontSize: "12px", border: "1px solid #999", background: "#fff" },
  divider: { width: "1px", height: "52px", background: "#c0c0c0", margin: "0 6px", alignSelf: "center" as const },
};
