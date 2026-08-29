import type { Event, TimetableView } from '../lib/scheduling'
import './timetable-time-grid.css'
import './timetable-subject-colours.css'
function minutes(value:string){const [h,m]=value.split(':').map(Number);return h*60+m}
function validColour(value:string|undefined){return value&&/^#[0-9A-Fa-f]{6}$/.test(value)?value:undefined}
function compactClass(value:string){const match=value.trim().match(/\b\d+[A-Za-z][A-Za-z0-9-]*\b/);return match?.[0]??value.trim()}
function eventLetter(event:Event,dayIndex:number){const word=(event.name.trim().split(/\s+/).at(-1)??event.name).replace(/[^A-Za-z]/g,'');const position=(event.day_indexes??[]).indexOf(dayIndex);return word[position>=0?position:0]?.toUpperCase()??'•'}
type Props={view:TimetableView;mode:'teacher'|'class';events:Event[]}
export function PublishedTimetableGridWithEvents({view,mode,events}:Props){
 const periods=[...view.periods].sort((a,b)=>minutes(a.start_time)-minutes(b.start_time)||a.index-b.index)
 const periodCount=Math.max(1,periods.length)
 const gridStyle={'--tt-period-count':periodCount,gridTemplateColumns:`3.25rem repeat(${periodCount}, minmax(0, 1fr))`,gridAutoRows:'1.35rem'} as React.CSSProperties
 return <div className="timetable timetable--published timetable--final"><div className="timetable__time-grid" style={gridStyle}>
  <div className="timetable__corner" style={{gridColumn:1,gridRow:1}}>Day / Date</div>{periods.map((p,periodPosition)=><div className={`timetable__period-head ${!p.is_teaching?'timetable__period-head--break':''}`} style={{gridColumn:periodPosition+2,gridRow:1}} key={p.index}><span className="timetable__period">{p.name}</span><span className="timetable__clock">{p.start_time}–{p.end_time}</span></div>)}
  {view.days.map((day,dayPosition)=><div className="timetable__day-row" key={day.index} style={{display:'contents'}}><div className="timetable__day-label" style={{gridColumn:1,gridRow:dayPosition+2}}>{day.name.slice(0,3)}</div>{periods.map((period,periodPosition)=>{const lesson=view.lessons.find((item)=>item.day===day.index&&item.period===period.index);const event=events.find((item)=>item.day_indexes.includes(day.index)&&item.start_time===period.start_time&&item.end_time===period.end_time);const isBreak=!period.is_teaching||Boolean(event);const colour=lesson?validColour(lesson.subject_colour):undefined;return <div className={`timetable__cell ${isBreak?'timetable__cell--break':''}`} style={{gridColumn:periodPosition+2,gridRow:dayPosition+2}} key={period.index}>{event?<span className="timetable__break-vertical" aria-label={`${event.name} ${event.start_time}–${event.end_time}`}>{eventLetter(event,day.index)}</span>:!period.is_teaching?<span className="timetable__break-vertical" aria-label={period.name}>{eventLetter({id:0,name:period.name,start_time:period.start_time,end_time:period.end_time,day_indexes:view.days.map((d)=>d.index),event_type:'break',note:null},day.index)}</span>:lesson?<div className="lesson-card lesson-card--final" style={{'--subject-colour':colour??'#0F2A47'} as React.CSSProperties} title={mode==='class'&&lesson.teacher?`Teacher: ${lesson.teacher}`:undefined}><span className="lesson-card__subject">{lesson.subject}</span><span className="lesson-card__class">{compactClass(lesson.class)}</span></div>:null}</div>})}</div>)}
 </div></div>
}
