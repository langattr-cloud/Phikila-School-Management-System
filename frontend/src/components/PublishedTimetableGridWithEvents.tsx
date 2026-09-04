import type { Event, TimetableDisplayPeriod, TimetableView } from '../lib/scheduling'
import './timetable-time-grid.css'
import './timetable-subject-colours.css'
import './personal-timetable.css'

function minutes(value:string){const [h,m]=value.split(':').map(Number);return h*60+m}
function validColour(value:string|undefined){return value&&/^#[0-9A-Fa-f]{6}$/.test(value)?value:undefined}
function compactClass(value:string){const match=value.trim().match(/\b\d+[A-Za-z][A-Za-z0-9-]*\b/);return match?.[0]??value.trim()}
function eventLetter(event:Event,dayIndex:number){const word=(event.name.trim().split(/\s+/).at(-1)??event.name).replace(/[^A-Za-z]/g,'');const position=(event.day_indexes??[]).indexOf(dayIndex);return word[position>=0?position:0]?.toUpperCase()??'•'}

type DisplaySlot=TimetableDisplayPeriod&{kind:'period'|'gap';gapMinutes?:number}
type Props={view:TimetableView;mode:'teacher'|'class';events:Event[]}

export function PublishedTimetableGridWithEvents({view,mode,events}:Props){
 const sortedPeriods=[...view.periods].sort((a,b)=>minutes(a.start_time)-minutes(b.start_time)||a.index-b.index)
 const periods:DisplaySlot[]=sortedPeriods.flatMap((period,index)=>{
  if(index===0)return [{...period,kind:'period'}]
  const previous=sortedPeriods[index-1]
  const gapMinutes=minutes(period.start_time)-minutes(previous.end_time)
  return gapMinutes>0
   ? [{index:previous.index+0.0001,name:'',short_form:'',start_time:previous.end_time,end_time:period.start_time,is_teaching:false,kind:'gap',gapMinutes},{...period,kind:'period'}]
   : [{...period,kind:'period'}]
 })
 const days=view.days
 const periodCount=Math.max(1,periods.length)
 const dayCount=Math.max(1,days.length)
 const rowTemplate=`2.8rem repeat(${dayCount}, minmax(5.25rem, 1fr))`
 const periodBaseMinutes=Math.max(1,...sortedPeriods.map(period=>Math.max(1,minutes(period.end_time)-minutes(period.start_time))))
 const columnTemplate=[`clamp(3.25rem,5.5vw,4rem)`,...periods.map(period=>period.kind==='gap'?`minmax(.65rem,${Math.max(.15,(period.gapMinutes??1)/periodBaseMinutes)}fr)`:'minmax(5.25rem,1fr)')].join(' ')
 const title=mode==='teacher' ? `Teacher ${view.target_name ?? ''}`.trim() : `${view.target_name ?? 'Class'} Timetable`
 return <div className="timetable timetable--published timetable--final timetable--entity timetable--personal">
  <div className="timetable__personal-title">{title}</div>
  <div className="entity-timetable-grid" style={{'--tt-period-count':periodCount,'--tt-day-count':dayCount,gridTemplateRows:rowTemplate,gridTemplateColumns:columnTemplate} as React.CSSProperties}>
   <div className="entity-timetable-corner">Day / Date</div>
   {periods.map((p,column)=><div className={`entity-timetable-period ${p.kind==='gap'?'entity-timetable-period--gap':'entity-timetable-period--break'}`} style={{gridColumn:column+2,gridRow:1}} key={`${p.kind}-${p.index}-${p.start_time}`}><span>{p.kind==='gap'?'Gap':p.name}</span><small>{p.start_time}–{p.end_time}</small></div>)}
   {days.map((day,row)=><div className="entity-timetable-day" style={{gridColumn:1,gridRow:row+2}} key={day.index}>{day.name}</div>)}
   {days.flatMap((day,row)=>periods.map((period,column)=>{if(period.kind==='gap')return <div className="entity-timetable-cell entity-timetable-cell--gap" style={{gridColumn:column+2,gridRow:row+2}} key={`${day.index}-gap-${period.start_time}`}/>;const lesson=view.lessons.find(item=>item.day===day.index&&item.period===period.index);const event=events.find(item=>item.day_indexes.includes(day.index)&&item.start_time===period.start_time&&item.end_time===period.end_time);const isBreak=!period.is_teaching||Boolean(event);const colour=lesson?validColour(lesson.subject_colour):undefined;return <div className={`entity-timetable-cell ${isBreak?'entity-timetable-cell--break':''}`} style={{gridColumn:column+2,gridRow:row+2}} key={`${day.index}-${period.index}`}>{event?<span className="entity-break-letter" aria-label={`${event.name} ${event.start_time}–${event.end_time}`}>{eventLetter(event,day.index)}</span>:isBreak?null:lesson?<div className="entity-lesson-card" style={{'--subject-colour':colour??'#0F2A47'} as React.CSSProperties}><strong>{lesson.subject}</strong><span>{mode==='class'?(lesson.teacher||'—'):compactClass(lesson.class)}</span></div>:null}</div>}))}
  </div>
  <div className="timetable__print-footer"><span className="timetable__print-brand">Phikila School Management System</span><span className="timetable__print-generated">{view.version ? `Version ${view.version.number ?? view.version.id}` : ''}</span></div>
 </div>
}
