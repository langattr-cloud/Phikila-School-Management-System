import { useMemo, useRef, useState } from 'react'

type Lesson = { id: string; day: string; period: number; className: string; subject: string; teacher: string; room: string; locked: boolean }
type Timetable = { schoolName: string; academicYear: string; days: string[]; periods: { name: string; start: string; end: string }[]; weekend: boolean; lessons: Lesson[] }
const KEY = 'phikila.timetable.v1'
const initial: Timetable = { schoolName: 'Phikila School', academicYear: '2026/2027', days: ['Monday','Tuesday','Wednesday','Thursday','Friday'], periods: [{name:'Period 1',start:'08:00',end:'08:40'},{name:'Period 2',start:'08:40',end:'09:20'},{name:'Break',start:'09:20',end:'09:40'},{name:'Period 3',start:'09:40',end:'10:20'},{name:'Period 4',start:'10:20',end:'11:00'},{name:'Lunch',start:'11:00',end:'11:40'},{name:'Period 5',start:'11:40',end:'12:20'},{name:'Period 6',start:'12:20',end:'13:00'}], weekend:false, lessons:[] }
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
 { id: "data", buttons: [{id:"subjects",label:"Subjects",icon:"📘"},{id:"classes",label:"Classes",icon:"👥"},{id:"classrooms",label:"Classrooms",icon:"🚪"},{id:"teachers",label:"Teachers",icon:"🎓"},{id:"students",label:"Students - Seminars",icon:"👨‍🎓"},{id:"relations",label:"Relations",icon:"🔗"},{id:"test",label:"Test",icon:"✅"},{id:"generate",label:"Generate new",icon:"🏫"},{id:"generate-cloud",label:"Generate in cloud",icon:"🏫"},{id:"verification",label:"Verification",icon:"🔑"},{id:"school",label:"School",icon:"🏛️"},{id:"online",label:"Year/Class Online",icon:"☁️"},{id:"questions",label:"Questions Comments",icon:"❓"}] }
]
function AscHeader({ onAction }: { onAction: (action: string) => void }) {
 const [openMenu,setOpenMenu]=useState<string|null>(null)
 return <div className="asc-header"><div className="asc-menu-bar">{MENU_DATA.map(menu=><div key={menu.label} className="asc-menu" onMouseEnter={()=>setOpenMenu(menu.label)} onMouseLeave={()=>setOpenMenu(null)}><button className="asc-menu-label" onClick={()=>setOpenMenu(openMenu===menu.label?null:menu.label)}>{menu.label}</button>{openMenu===menu.label&&<div className="asc-dropdown">{menu.items.map(item=><button key={item} className="asc-dropdown-item" onClick={()=>{setOpenMenu(null);onAction(item)}}>{item}</button>)}</div>}</div>)}<button className="asc-help-link" onClick={()=>onAction("Questions? Comments? Write us")}>Questions? Comments? Write us</button></div><div className="asc-toolbar">{TOOLBAR_GROUPS.map(group=><div key={group.id} className="asc-toolbar-group">{group.buttons.map(btn=><button key={btn.id} className="asc-tool-btn" onClick={()=>onAction(btn.id)} title={btn.label}><span className="asc-tool-icon">{btn.icon}</span><span className="asc-tool-label">{btn.label}</span></button>)}</div>)}</div></div>
}
export default function TimetableModule() {
 const [data,setData] = useState<Timetable>(()=>{try {const s=localStorage.getItem(KEY);if(!s)return initial;const saved={...initial,...JSON.parse(s)} as Timetable;const sampleIds=new Set(['1','2','3','4']);const isOnlyDemoLessons=saved.lessons.length>0&&saved.lessons.every(l=>sampleIds.has(l.id))&&saved.lessons.every(l=>l.className==='Form 1A'||l.className==='Form 2A')&&saved.lessons.every(l=>['Mathematics','English','Science'].includes(l.subject));return isOnlyDemoLessons?{...saved,lessons:[]}:saved}catch{return initial}})
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
 return <main className="tt-page" aria-label="Empty timetable workspace"><div className="tt-wrap"></div></main>
}
