import { useMemo, useState, type CSSProperties } from 'react'
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

type DisplaySlot=
 | (TimetableDisplayPeriod&{kind:'period'})
 | {kind:'gap';index:number;name:string;short_form:string;start_time:string;end_time:string;is_teaching:false;gapMinutes:number}
 | {kind:'event';index:number;name:string;short_form:string;start_time:string;end_time:string;is_teaching:false;event:Event}
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

// Right-clicking a populated class/teacher lesson opens Print Setup directly.\nexport function PublishedTimetableGridWithEvents({view,mode,events}:Props){
 const [printSetup,setPrintSetup]=useState<MenuState|null>(null)
 const sortedPeriods=useMemo(()=>[...view.periods].sort((a,b)=>minutes(a.start_time)-minutes(b.start_time)||a.index-b.index),[view.periods])
 const days=view.days
 const dayIndexes=new Set(days.map(day=>day.index))
 const recurringEvents=useMemo(
  ()=>events
   .filter(event=>event.day_indexes.length>0&&days.length>0&&days.every(day=>event.day_indexes.includes(day.index)))
   .filter((event,index,list)=>list.findIndex(item=>item.name===event.name&&item.start_time===event.start_time&&item.end_time===event.end_time)===index)
   .sort((a,b)=>minutes(a.start_time)-minutes(b.start_time)||minutes(a.end_time)-minutes(b.end_time)),
  [events,days],
 )
 const periods:DisplaySlot[]=useMemo(()=>{
  const base:DisplaySlot[]=[
   ...sortedPeriods.map(period=>({...period,kind:'period' as const})),
   ...recurringEvents.map((event,index)=>({
    kind:'event' as const,
    index:10000+index,
    name:event.name,
    short_form:event.name,
    start_time:event.start_time,
    end_time:event.end_time,
    is_teaching:false as const,
    event,
   })),
  ].sort((a,b)=>minutes(a.start_time)-minutes(b.start_time)||minutes(a.end_time)-minutes(b.end_time)||(a.kind==='event'?-1:1))
  const slots:DisplaySlot[]=[]
  for(const slot of base){
   const previous=slots.at(-1)
   if(previous){
    const gapMinutes=minutes(slot.start_time)-minutes(previous.end_time)
    if(gapMinutes>0) slots.push({kind:'gap',index:previous.index+0.0001,name:'',short_form:'',start_time:previous.end_time,end_time:slot.start_time,is_teaching:false,gapMinutes})
   }
   slots.push(slot)
  }
  return slots
 },[sortedPeriods,recurringEvents])
 const periodCount=Math.max(1,periods.length)
 const dayCount=Math.max(1,days.length)
 const rowTemplate=`2.8rem repeat(${dayCount}, minmax(5.25rem, 1fr))`
 const periodBaseMinutes=Math.max(1,...sortedPeriods.map(period=>Math.max(1,minutes(period.end_time)-minutes(period.start_time))))
 const columnTemplate=[`6rem`,...periods.map(period=>{
  if(period.kind==='event') return `minmax(3rem,${Math.max(.55,(minutes(period.end_time)-minutes(period.start_time))/periodBaseMinutes)}fr)`
  if(period.kind==='gap') return `minmax(.65rem,${Math.max(.15,period.gapMinutes/periodBaseMinutes)}fr)`
  return 'minmax(5.25rem,1fr)'
 })].join(' ')
 const title=mode==='teacher' ? `Teacher ${view.target_name ?? ''}`.trim() : `${view.target_name ?? 'Class'} Timetable`
 const generatedTimestamp=new Date().toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})
 return <div className="timetable timetable--published timetable--final timetable--entity timetable--personal">
  <div className="timetable__personal-title">{title}</div>
  <div className="entity-timetable-grid" style={{'--tt-period-count':periodCount,'--tt-day-count':dayCount,'--tt-column-template':columnTemplate,gridTemplateRows:rowTemplate,gridTemplateColumns:columnTemplate} as CSSProperties}>
   <div className="entity-timetable-corner">Day / Date</div>
   {periods.map((p,column)=><div className={`entity-timetable-period ${p.kind==='event'?'entity-timetable-period--event':p.kind==='gap'?'entity-timetable-period--gap':''}`} style={{gridColumn:column+2,gridRow:1}} key={`${p.kind}-${p.index}-${p.start_time}`}><span>{p.kind==='gap'?'Gap':p.name}</span><small>{p.start_time}–{p.end_time}</small></div>)}
   {days.map((day,row)=><div className="entity-timetable-day" style={{gridColumn:1,gridRow:row+2}} key={day.index} title={day.name}>{shortDayName(day.name)}</div>)}
   {periods.flatMap((period,column)=>{
    if(period.kind==='event') return <div className="entity-timetable-cell entity-timetable-cell--break-span" style={{gridColumn:column+2,gridRow:`2 / span ${dayCount}`}} key={`event-${period.index}-${period.start_time}`}><span aria-label={`${period.event.name} ${period.start_time}–${period.end_time}`}>{period.event.name}</span></div>
    return days.map((day,row)=>{
     if(period.kind==='gap')return <div className="entity-timetable-cell entity-timetable-cell--gap" style={{gridColumn:column+2,gridRow:row+2}} key={`${day.index}-gap-${period.start_time}`}/>
     const lesson=view.lessons.find(item=>item.day===day.index&&item.period===period.index)
     const event=events.find(item=>dayIndexes.has(day.index)&&item.day_indexes.includes(day.index)&&item.start_time===period.start_time&&item.end_time===period.end_time)
     const isBreak=!lesson&&(!period.is_teaching||Boolean(event))
     const colour=lesson?validColour(lesson.subject_colour):undefined
     const lessonIndex=lesson?view.lessons.indexOf(lesson):0
     return <div className={`entity-timetable-cell ${isBreak?'entity-timetable-cell--break':''}`} style={{gridColumn:column+2,gridRow:row+2}} key={`${day.index}-${period.index}`} onContextMenu={lesson?(event)=>{event.preventDefault();event.stopPropagation();const built=buildLessonForPrint(lesson,lessonIndex,view,mode);setPrintSetup(built)}:undefined}>
      {lesson?<div className="entity-lesson-card" style={{'--subject-colour':colour??'#0F2A47'} as CSSProperties}><strong>{lesson.subject}</strong><span>{mode==='class'?(lesson.teacher||'—'):compactClass(lesson.class)}</span></div>:event?<span className="entity-break-letter" aria-label={`${event.name} ${event.start_time}–${event.end_time}`}>{eventLetter(event,day.index)}</span>:null}
     </div>
    })
   })}
  </div>
  <div className="timetable__print-footer"><span className="timetable__print-brand">@Phikila Timetables</span><span className="timetable__print-generated" suppressHydrationWarning>{generatedTimestamp}</span></div>
  {printSetup&&<PrintSetupModal lesson={printSetup.lesson} meta={printSetup.meta} onClose={()=>setPrintSetup(null)}/>}
 </div>
}
