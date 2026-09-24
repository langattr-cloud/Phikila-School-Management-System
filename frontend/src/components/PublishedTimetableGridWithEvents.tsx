import { useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import type { LessonMeta } from './TimetableGrid'
import type { Event, Lesson, Subject, Teacher, SchoolClass, Room, TimetableDisplayPeriod, TimetableView } from '../lib/scheduling'
import { PrintSetupModal } from './PrintSetupModal'
import './timetable-time-grid.css'
import './timetable-subject-colours.css'
import './personal-timetable.css'

function minutes(value:string){const [h,m]=value.split(':').map(Number);return h*60+m}
function validColour(value:string|undefined){return value&&/^#[0-9A-Fa-f]{6}$/.test(value)?value:undefined}
function compactClass(value:string){const match=value.trim().match(/\b\d+[A-Za-z][A-Za-z0-9-]*\b/);return match?.[0]??value.trim()}
function eventLetter(event:Event,dayIndex:number){const word=(event.name.trim().split(/\s+/).at(-1)??event.name).replace(/[^A-Za-z]/g,'');const position=(event.day_indexes??[]).indexOf(dayIndex);return word[position>=0?position:0]?.toUpperCase()??'•'}
function shortDayName(name:string){const value=name.trim();return value.length<=3?value:value.slice(0,3)}

type DisplaySlot=TimetableDisplayPeriod&{kind:'period'|'gap';gapMinutes?:number}
type Props={view:TimetableView;mode:'teacher'|'class';events:Event[]}
type MenuState={x:number;y:number;lesson:Lesson;meta:LessonMeta}

function buildLessonForPrint(lesson:TimetableView['lessons'][number], index:number, view:TimetableView, mode:'teacher'|'class'): { lesson:Lesson; meta:LessonMeta } {
 const subjectId=1
 const teacherId=2
 const classId=3
 const roomId=4
 const subject:Subject={id:subjectId,name:lesson.subject,code:lesson.subject,colour:lesson.subject_colour}
 const teacher:Teacher={id:teacherId,name:lesson.teacher||'—'}
 const klass:SchoolClass={id:classId,name:lesson.class||view.target_name||'—',code:lesson.class||view.target_name||'—'}
 const room:Room={id:roomId,name:lesson.room||'—'}
 const meta:LessonMeta={subjects:new Map([[subjectId,subject]]),teachers:new Map([[teacherId,teacher]]),rooms:new Map([[roomId,room]]),classes:new Map([[classId,klass]])}
 const synthetic:Lesson={id:index+1,day_index:lesson.day,period_index:lesson.period,subject_id:subjectId,teacher_id:teacherId,room_id:roomId,class_id:classId,version_id:view.version?.id??0,duration:1}
 return {lesson:synthetic,meta}
}

export function PublishedTimetableGridWithEvents({view,mode,events}:Props){
 const [menu,setMenu]=useState<MenuState|null>(null)
 const [printSetup,setPrintSetup]=useState<MenuState|null>(null)
 const sortedPeriods=useMemo(()=>[...view.periods].sort((a,b)=>minutes(a.start_time)-minutes(b.start_time)||a.index-b.index),[view.periods])
 const periods:DisplaySlot[]=useMemo(()=>sortedPeriods.flatMap((period,index)=>{
  if(index===0)return [{...period,kind:'period'}]
  const previous=sortedPeriods[index-1]
  const gapMinutes=minutes(period.start_time)-minutes(previous.end_time)
  return gapMinutes>0
   ? [{index:previous.index+0.0001,name:'',short_form:'',start_time:previous.end_time,end_time:period.start_time,is_teaching:false,kind:'gap',gapMinutes},{...period,kind:'period'}]
   : [{...period,kind:'period'}]
 }),[sortedPeriods])
 const days=view.days
 const periodCount=Math.max(1,periods.length)
 const dayCount=Math.max(1,days.length)
 const rowTemplate=`2.8rem repeat(${dayCount}, minmax(5.25rem, 1fr))`
 const periodBaseMinutes=Math.max(1,...sortedPeriods.map(period=>Math.max(1,minutes(period.end_time)-minutes(period.start_time))))
 const columnTemplate=[`2.7rem`,...periods.map(period=>period.kind==='gap'?`minmax(.65rem,${Math.max(.15,(period.gapMinutes??1)/periodBaseMinutes)}fr)`:'minmax(5.25rem,1fr)')].join(' ')
 const title=mode==='teacher' ? `Teacher ${view.target_name ?? ''}`.trim() : `${view.target_name ?? 'Class'} Timetable`
 const generatedTimestamp=new Date().toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})
 const openMenu=(event:MouseEvent,lesson:TimetableView['lessons'][number],index:number)=>{event.preventDefault();event.stopPropagation();const built=buildLessonForPrint(lesson,index,view,mode);setMenu({x:event.clientX,y:event.clientY,...built})}
 return <div className="timetable timetable--published timetable--final timetable--entity timetable--personal" onClick={()=>setMenu(null)}>
  <div className="timetable__personal-title">{title}</div>
  <div className="entity-timetable-grid" style={{'--tt-period-count':periodCount,'--tt-day-count':dayCount,'--tt-column-template':columnTemplate,gridTemplateRows:rowTemplate,gridTemplateColumns:columnTemplate} as CSSProperties}>
   <div className="entity-timetable-corner">Day / Date</div>
   {periods.map((p,column)=><div className={`entity-timetable-period ${p.kind==='gap'?'entity-timetable-period--gap':'entity-timetable-period--break'}`} style={{gridColumn:column+2,gridRow:1}} key={`${p.kind}-${p.index}-${p.start_time}`}><span>{p.kind==='gap'?'BREAK':p.name}</span><small>{p.start_time}–{p.end_time}</small></div>)}
   {days.map((day,row)=><div className="entity-timetable-day" style={{gridColumn:1,gridRow:row+2}} key={day.index} title={day.name}>{shortDayName(day.name)}</div>)}
   {periods.flatMap((period,column)=>{
    if(period.kind==='gap')return <div className="entity-timetable-cell entity-timetable-cell--gap entity-timetable-cell--break-span" style={{gridColumn:column+2,gridRow:`2 / span ${dayCount}`}} key={`gap-${period.start_time}`} aria-label={`BREAK ${period.start_time}–${period.end_time}`}/>
    return days.map((day,row)=>{
    const lesson=view.lessons.find(item=>item.day===day.index&&item.period===period.index)
    const event=events.find(item=>item.day_indexes.includes(day.index)&&item.start_time===period.start_time&&item.end_time===period.end_time)
    const isBreak=!lesson&&(!period.is_teaching||Boolean(event))
    const colour=lesson?validColour(lesson.subject_colour):undefined
    const lessonIndex=lesson?view.lessons.indexOf(lesson):0
    return <div className={`entity-timetable-cell ${isBreak?'entity-timetable-cell--break':''}`} style={{gridColumn:column+2,gridRow:row+2}} key={`${day.index}-${period.index}`} onContextMenu={lesson?(event)=>openMenu(event,lesson,lessonIndex):undefined}>
      {lesson?<div className="entity-lesson-card" style={{'--subject-colour':colour??'#0F2A47'} as CSSProperties}><strong>{lesson.subject}</strong><span>{mode==='class'?(lesson.teacher||'—'):compactClass(lesson.class)}</span></div>:event?<span className="entity-break-letter" aria-label={`${event.name} ${event.start_time}–${event.end_time}`}>{eventLetter(event,day.index)}</span>:null}
    </div>
   })
  })}
  </div>
  <div className="timetable__print-footer"><span className="timetable__print-brand">@Phikila Timetables</span><span className="timetable__print-generated" suppressHydrationWarning>{generatedTimestamp}</span></div>
  {menu&&<div role="menu" aria-label="Timetable context menu" style={{position:'fixed',left:menu.x,top:menu.y,zIndex:2000,minWidth:170,padding:4,border:'1px solid #94a3b8',borderRadius:4,background:'#fff',boxShadow:'0 8px 24px rgba(0,0,0,.18)'}} onClick={event=>event.stopPropagation()}>
    <button type="button" role="menuitem" style={{display:'block',width:'100%',padding:'8px 10px',border:0,background:'#fff',textAlign:'left',cursor:'pointer',fontSize:12}} onClick={()=>{setPrintSetup(menu);setMenu(null)}}>Print Setup</button>
  </div>}
  {printSetup&&<PrintSetupModal lesson={printSetup.lesson} meta={printSetup.meta} onClose={()=>setPrintSetup(null)}/>}
 </div>
}
