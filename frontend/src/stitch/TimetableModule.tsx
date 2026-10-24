import { useMemo, useRef, useState } from 'react'

type Lesson = { id: string; day: string; period: number; className: string; subject: string; teacher: string; room: string; locked: boolean }
type Timetable = { schoolName: string; academicYear: string; days: string[]; periods: { name: string; start: string; end: string }[]; weekend: boolean; lessons: Lesson[] }
const KEY = 'phikila.timetable.v1'
const initial: Timetable = { schoolName: 'Phikila School', academicYear: '2026/2027', days: ['Monday','Tuesday','Wednesday','Thursday','Friday'], periods: [{name:'Period 1',start:'08:00',end:'08:40'},{name:'Period 2',start:'08:40',end:'09:20'},{name:'Break',start:'09:20',end:'09:40'},{name:'Period 3',start:'09:40',end:'10:20'},{name:'Period 4',start:'10:20',end:'11:00'},{name:'Lunch',start:'11:00',end:'11:40'},{name:'Period 5',start:'11:40',end:'12:20'},{name:'Period 6',start:'12:20',end:'13:00'}], weekend:false, lessons:[
{id:'1',day:'Monday',period:0,className:'Form 1A',subject:'Mathematics',teacher:'M. Njoroge',room:'Room 1',locked:false},
{id:'2',day:'Monday',period:1,className:'Form 1A',subject:'English',teacher:'A. Wanjiku',room:'Room 2',locked:false},
{id:'3',day:'Tuesday',period:0,className:'Form 1A',subject:'Science',teacher:'P. Otieno',room:'Lab 1',locked:true},
{id:'4',day:'Wednesday',period:0,className:'Form 2A',subject:'Mathematics',teacher:'M. Njoroge',room:'Room 3',locked:false}] }
const classDefaults = ['Form 1A','Form 1B','Form 2A','Form 2B','Form 3A']
const subjectDefaults = ['Mathematics','English','Kiswahili','Science','Social Studies','ICT','CRE','PE']
const teacherDefaults = ['M. Njoroge','A. Wanjiku','P. Otieno','J. Kamau','S. Achieng']
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`

const MENU_DATA = [
 { label: "Main", items: ["Subjects", "Classes", "Classrooms", "Teachers", "Students - Seminars", "Relations"] },
 { label: "File", items: ["New", "Open", "Save", "Save as", "Import", "Export"] },
 { label: "Specification", items: ["Subjects", "Classes", "Teachers", "Lessons", "Classrooms"] },
 { label: "View", items: ["Timetable view", "Teacher view", "Class view"] },
 { label: "Timetable", items: ["Generate new", "Generate in cloud", "Lock timetable", "Test"] },
 { label: "Options", items: ["School settings", "Verification", "Periods"] },
 { label: "Help", items: ["Questions? Comments? Write us", "About"] },
]
const TOOLBAR_GROUPS = [
 { id: "file", buttons: [{id:"new",label:"New",icon:"📄"},{id:"open",label:"Open",icon:"📁"},{id:"save",label:"Save",icon:"💾"},{id:"print",label:"Print",icon:"🖨️"},{id:"print-preview",label:"Print preview",icon:"🔍"}] },
 { id: "data", buttons: [{id:"subjects",label:"Subjects",icon:"📘"},{id:"classes",label:"Classes",icon:"👥"},{id:"classrooms",label:"Classrooms",icon:"🚪"},{id:"teachers",label:"Teachers",icon:"🎓"},{id:"students",label:"Students - Seminars",icon:"👨‍🎓"},{id:"relations",label:"Relations",icon:"🔗"},{id:"test",label:"Test",icon:"✅"},{id:"generate",label:"Generate new",icon:"🏫"},{id:"generate-cloud",label:"Generate in cloud",icon:"🏫"},{id:"verification",label:"Verification",icon:"🔑"},{id:"school",label:"School",icon:"🏛️"},{id:"online",label:"Year/Class Online",icon:"☁️"},{id:"questions",label:"Questions Comments",icon:"❓"}] },
]
function AscHeader({ onAction }: { onAction: (action: string) => void }) {
 const [openMenu,setOpenMenu]=useState<string|null>(null)
 return <div className="asc-header"><div className="asc-menu-bar">{MENU_DATA.map(menu=><div key={menu.label} className="asc-menu" onMouseEnter={()=>setOpenMenu(menu.label)} onMouseLeave={()=>setOpenMenu(null)}><button className="asc-menu-label" onClick={()=>setOpenMenu(openMenu===menu.label?null:menu.label)}>{menu.label}</button>{openMenu===menu.label&&<div className="asc-dropdown">{menu.items.map(item=><button key={item} className="asc-dropdown-item" onClick={()=>{setOpenMenu(null);onAction(item)}}>{item}</button>)}</div>}</div>)}<button className="asc-help-link" onClick={()=>onAction("Questions? Comments? Write us")}>Questions? Comments? Write us</button></div><div className="asc-toolbar">{TOOLBAR_GROUPS.map(group=><div key={group.id} className="asc-toolbar-group">{group.buttons.map(btn=><button key={btn.id} className="asc-tool-btn" onClick={()=>onAction(btn.id)} title={btn.label}><span className="asc-tool-icon">{btn.icon}</span><span className="asc-tool-label">{btn.label}</span></button>)}</div>)}</div></div>
}

export default function TimetableModule() {
 const [data,setData] = useState<Timetable>(()=>{try {const s=localStorage.getItem(KEY);return s?{...initial,...JSON.parse(s)}:initial}catch{return initial}})
 const [view,setView] = useState<'Whole school'|'Teachers'|'Subjects'|'Lesson grid'>('Whole school')
 const [filter,setFilter] = useState('All')
 const [status,setStatus] = useState('Draft changes not yet saved')
 const [settings,setSettings] = useState(false)
 const [preview,setPreview] = useState(false)
 const fileRef = useRef<HTMLInputElement>(null)
 const classes = useMemo(()=>[...new Set([...classDefaults,...data.lessons.map(l=>l.className)])],[data.lessons])
 const subjects = useMemo(()=>[...new Set([...subjectDefaults,...data.lessons.map(l=>l.subject)])],[data.lessons])
 const teachers = useMemo(()=>[...new Set([...teacherDefaults,...data.lessons.map(l=>l.teacher)])],[data.lessons])
 const visible = data.lessons.filter(l=>filter==='All'||(view==='Teachers'?l.teacher===filter:view==='Subjects'?l.subject===filter:l.className===filter))
 const issues = useMemo(()=>{
   const found:string[]=[]
   for(let i=0;i<data.lessons.length;i++) for(let j=i+1;j<data.lessons.length;j++){
    const a=data.lessons[i],b=data.lessons[j]
    if(a.day!==b.day||a.period!==b.period) continue
    const when=`${a.day}, ${data.periods[a.period]?.name??'period'}`
    if(a.className===b.className) found.push(`${when}: ${a.className} has overlapping lessons`)
    if(a.teacher===b.teacher) found.push(`${when}: ${a.teacher} is double-booked`)
    if(a.room&&a.room===b.room) found.push(`${when}: ${a.room} is double-booked`)
   }
   return [...new Set(found)]
 },[data])
 const field=(key:keyof Timetable,value:any)=>setData(p=>({...p,[key]:value}))
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(data));setStatus('Saved in this browser')}catch{setStatus('Save failed: browser storage unavailable')}}
 const fresh=()=>{if(window.confirm('Start a new timetable? Save or export current work first.')){setData({...initial,lessons:[]});setFilter('All');setStatus('New timetable — unsaved')}}
 const openFile=(file?:File)=>{if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const x=JSON.parse(String(reader.result));if(!Array.isArray(x.days)||!Array.isArray(x.periods)||!Array.isArray(x.lessons))throw Error();setData({...initial,...x});setStatus(`Opened ${file.name}`)}catch{window.alert('Invalid Phikila timetable JSON file')}};reader.readAsText(file)}
 const exportFile=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='phikila-timetable.json';a.click();URL.revokeObjectURL(url);setStatus('Timetable exported as JSON')}
 const updateLesson=(lessonId:string,patch:Partial<Lesson>)=>setData(p=>({...p,lessons:p.lessons.map(l=>l.id===lessonId?{...l,...patch}:l)}))
 const addLesson=(day=data.days[0],period=0)=>setData(p=>({...p,lessons:[...p.lessons,{id:id(),day,period,className:classes[0]??'Form 1A',subject:subjects[0]??'Mathematics',teacher:teachers[0]??'Teacher',room:'',locked:false}]}))
 const generate=()=>{
  const fixed=data.lessons.filter(l=>l.locked), result=[...fixed]
  const slots=data.days.flatMap(day=>data.periods.map((_,period)=>({day,period}))).filter(s=>!/(break|lunch)/i.test(data.periods[s.period].name))
  let cursor=0
  for(const c of classes) for(let i=0;i<Math.min(6,subjects.length);i++){
   const subject=subjects[(i+classes.indexOf(c))%subjects.length], teacher=teachers[(i+classes.indexOf(c))%teachers.length]
   let placed=false
   for(let tries=0;tries<slots.length*2;tries++){const s=slots[cursor++%slots.length];if(!result.some(l=>l.day===s.day&&l.period===s.period&&(l.className===c||l.teacher===teacher))){result.push({id:id(),...s,className:c,subject,teacher,room:'',locked:false});placed=true;break}}
   if(!placed) break
  }
  setData(p=>({...p,lessons:result}));setStatus('Draft generated. Run Test and review before publishing.')
 }
 const title=data.schoolName||'School timetable'
 const handleHeaderAction=(action:string)=>{
  switch(action){
   case "New": case "new": fresh(); break;
   case "Open": case "open": case "Import": fileRef.current?.click(); break;
   case "Save": case "save": save(); break;
   case "Save as": case "Export": case "export": exportFile(); break;
   case "Print": case "print": window.print(); break;
   case "Print preview": case "print-preview": setPreview(true); break;
   case "Subjects": case "subjects": setView("Subjects"); setFilter("All"); break;
   case "Teachers": case "teachers": case "Teacher view": setView("Teachers"); setFilter("All"); break;
   case "Classes": case "classes": case "Class view": setView("Lesson grid"); setFilter("All"); break;
   case "Timetable view": setView("Whole school"); setFilter("All"); break;
   case "Generate new": case "generate": generate(); break;
   case "Generate in cloud": case "generate-cloud": setStatus("Cloud generation requires a connected scheduling service."); window.alert("Cloud generation is not configured yet."); break;
   case "Test": case "test": setStatus(issues.length ? "Test found "+issues.length+" conflict(s)" : "Test passed — no same-slot conflicts found"); window.alert(issues.length ? issues.join(String.fromCharCode(10)) : "Test passed. No same-slot class, teacher or room conflicts found."); break;
   case "School settings": case "Periods": case "school": setSettings(v=>!v); break;
   case "Verification": case "verification": setStatus(issues.length ? "Verification found "+issues.length+" conflict(s)" : "Verification passed"); window.alert(issues.length ? issues.join(String.fromCharCode(10)) : "Verification passed. No same-slot conflicts found."); break;
   case "Lock timetable": setData(p=>({...p,lessons:p.lessons.map(l=>({...l,locked:true}))})); setStatus("All current lessons locked"); break;
   case "Classrooms": case "classrooms": case "Students - Seminars": case "students": case "Relations": case "relations": case "Lessons": case "online": case "Year/Class Online": case "Questions? Comments? Write us": case "questions": case "About": window.alert(action+" is not connected to a page yet."); break;
   default: window.alert(action+" is not connected to an action yet.");
  }
 }
 return <main className="tt-page"><div className="tt-wrap"><AscHeader onAction={handleHeaderAction}/></div>
  <style>{`.tt-page{min-height:100vh;background:#f3f6fb;color:#102033;padding:28px;font-family:Inter,system-ui,sans-serif}.tt-wrap{max-width:1600px;margin:auto;display:grid;gap:18px}.tt-header,.tt-toolbar,.tt-panel-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.tt-header h1{font-size:30px;font-weight:750;letter-spacing:-.04em;margin:4px 0}.tt-eyebrow{font-size:11px;letter-spacing:.16em;font-weight:800;color:#2454a6}.tt-muted{font-size:12px;color:#64748b;margin-top:4px}.tt-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.tt-btn,.tt-tab{border:1px solid #d5deea;border-radius:8px;background:#fff;padding:9px 12px;font-size:12px;font-weight:700;color:#334155;cursor:pointer}.tt-btn:hover,.tt-tab:hover{background:#eff4fa}.tt-blue{background:#174ca6;color:white;border-color:#174ca6}.tt-blue:hover{background:#103c86}.tt-tab.active{background:#132b4a;color:white;border-color:#132b4a}.tt-toolbar,.tt-panel{background:white;border:1px solid #dfe6ef;border-radius:13px;padding:16px;box-shadow:0 3px 12px #10203308}.tt-panel h2{font-size:17px;font-weight:750}.tt-panel h3{font-size:14px;font-weight:700;margin:18px 0 8px}.tt-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:14px 0}.tt-settings label,.tt-lesson label{display:grid;gap:5px;font-size:11px;font-weight:700;color:#526174}.tt-settings input,.tt-settings select,.tt-period input,.tt-panel-head select{border:1px solid #d5deea;border-radius:7px;padding:8px;font-size:12px;background:white;color:#102033;min-width:0}.tt-periods{display:grid;gap:7px}.tt-period{display:grid;grid-template-columns:1fr 120px 120px auto;gap:7px}.tt-scroll{overflow:auto;margin-top:14px}.tt-table{border-collapse:separate;border-spacing:0;width:100%;min-width:1200px;table-layout:fixed;font-size:12px}.tt-table th,.tt-table td{border-right:1px solid #e6ebf2;border-bottom:1px solid #e6ebf2;padding:8px;text-align:left;vertical-align:top;min-width:0;width:150px}.tt-table thead th{background:#edf2f8;font-weight:750}.tt-table .tt-day-heading,.tt-table .tt-day-name{min-width:105px;width:105px;background:#f7f9fc;font-weight:800;position:sticky;left:0;z-index:2}.tt-table thead .tt-day-heading{z-index:3;background:#e7edf5}.tt-table small{display:block;color:#718096;font-weight:500;margin-top:4px}.tt-period-break{background:#e9edf2!important;color:#526174;width:78px!important;min-width:78px!important}.tt-break-cell{background:#f1f3f6;text-align:center!important;vertical-align:middle!important;width:78px!important;min-width:78px!important}.tt-break-label{font-size:10px;font-weight:800;color:#667085;display:inline-block;letter-spacing:.04em}.tt-day-rows .tt-lesson{min-width:0;width:100%;box-sizing:border-box}.tt-lesson-detail{display:grid;gap:3px}.tt-detail-label{font-size:10px;font-weight:700;color:#64748b}.tt-lesson .tt-lock{font-size:10px;font-weight:700;border:1px solid #d5deea;border-radius:5px;padding:3px 5px;background:#fff;color:#475569}.tt-day-rows .tt-add{width:100%;min-height:52px;border:1px dashed #d6deea;border-radius:6px;background:#fbfcfe;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}.tt-day-rows .tt-add span{font-size:18px;line-height:1}.tt-day-rows .tt-add small{font-size:10px;margin:0}.tt-day-rows .tt-add:hover{background:#eff4fa;color:#174ca6}.tt-lesson{background:#f4f8ff;border:1px solid #d9e6fb;border-left:3px solid #2454a6;border-radius:8px;padding:8px;display:grid;gap:7px}.tt-lesson-top,.tt-room{display:flex;justify-content:space-between;gap:6px;align-items:center}.tt-lesson-top b{font-size:11px;color:#17427e}.tt-lesson select,.tt-room input{width:100%;min-width:0;border:1px solid #d8e1ed;border-radius:5px;background:white;padding:5px;font-size:11px;color:#334155}.tt-room button{color:#b91c1c;font-size:18px}.tt-add{font-size:11px;color:#8190a3;padding:8px;cursor:pointer}.tt-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.tt-metrics .tt-panel{display:grid;gap:5px}.tt-metrics small{font-size:10px;letter-spacing:.12em;color:#6a7b91;font-weight:800}.tt-metrics strong{font-size:26px}.tt-metrics p{font-size:12px;color:#64748b}.tt-status{font-weight:700;color:#1e3a5f}.tt-overlay{position:fixed;inset:0;z-index:100;background:#0b172b99;padding:24px;display:grid;place-items:center}.tt-preview{background:white;border-radius:12px;padding:22px;width:min(1200px,100%);max-height:90vh;overflow:auto}.tt-preview-lesson{padding:5px;border-bottom:1px solid #e2e8f0}.tt-preview-lesson b{font-size:11px}@media(max-width:760px){.tt-page{padding:12px}.tt-header h1{font-size:24px}.tt-metrics{grid-template-columns:1fr}.tt-period{grid-template-columns:1fr 90px 90px auto}}@media print{.tt-page{padding:0;background:white}.tt-actions,.tt-toolbar,.tt-btn,.tt-add,.tt-lesson button,.tt-lesson select,.tt-lesson input,.tt-overlay{display:none!important}.tt-panel{box-shadow:none;border:0;padding:0}.tt-table{min-width:0;font-size:9px}.tt-table th,.tt-table td{padding:4px;min-width:0}}.asc-header{font-family:"Segoe UI",Arial,sans-serif;background:#e6e6f0;border:1px solid #b9bdca;user-select:none}.asc-menu-bar{display:flex;gap:2px;background:#d9d9e8;padding:2px 8px;font-size:12px;align-items:center;border-bottom:1px solid #bbb;flex-wrap:wrap}.asc-menu{position:relative}.asc-menu-label{background:transparent;border:1px solid transparent;padding:4px 10px;cursor:pointer;font-size:12px;color:#202938}.asc-menu-label:hover{background:white;border-color:#999}.asc-dropdown{position:absolute;top:100%;left:0;background:white;border:1px solid #999;min-width:200px;z-index:100;box-shadow:2px 2px 4px #0003}.asc-dropdown-item{display:block;width:100%;text-align:left;border:0;background:white;padding:7px 12px;cursor:pointer;font-size:12px;color:#202938}.asc-dropdown-item:hover{background:#316ac5;color:white}.asc-help-link{margin-left:auto;border:0;background:transparent;font-size:11px;color:#333;cursor:pointer;padding:5px}.asc-toolbar{display:flex;gap:12px;padding:6px 10px;background:linear-gradient(#f5f5ff,#d0d0e0);overflow-x:auto}.asc-toolbar-group{display:flex;gap:3px;border-right:1px solid #aaa;padding-right:10px;flex-shrink:0}.asc-toolbar-group:last-child{border-right:none}.asc-tool-btn{display:flex;flex-direction:column;align-items:center;gap:2px;background:transparent;border:1px solid transparent;padding:4px 7px;cursor:pointer;min-width:58px;color:#202938}.asc-tool-btn:hover{background:#fff;border-color:#888;border-radius:3px}.asc-tool-icon{font-size:21px;line-height:22px}.asc-tool-label{font-size:9px;text-align:center;line-height:10px;max-width:65px;white-space:normal}`}</style></main>
}
