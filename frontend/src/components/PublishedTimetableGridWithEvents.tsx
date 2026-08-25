import type { Event, TimetableView } from '../lib/scheduling'
import './timetable-time-grid.css'
import './timetable-subject-colours.css'
function minutes(value:string){const [h,m]=value.split(':').map(Number);return h*60+m}
function subjectColour(subject:string){const palette=['#2563eb','#059669','#d97706','#7c3aed','#db2777','#0891b2','#65a30d','#dc2626'];let hash=0;for(let i=0;i<subject.length;i++)hash=(hash*31+subject.charCodeAt(i))>>>0;return palette[hash%palette.length]}
function eventLetter(event:Event,dayIndex:number){const word=(event.name.trim().split(/\s+/).at(-1)??event.name).replace(/[^A-Za-z]/g,'');const position=(event.day_indexes??[]).indexOf(dayIndex);return word[position>=0?position:0]?.toUpperCase()??'•'}
type Props={view:TimetableView;mode:'teacher'|'class';events:Event[]}
export function PublishedTimetableGridWithEvents({view,mode,events}:Props){
 const periods=[...view.periods].sort((a,b)=>minutes(a.start_time)-minutes(b.start_time)||a.index-b.index)
 const columns=periods.map((p)=>`${Math.max(1,minutes(p.end_time)-minutes(p.start_time))}fr`).join(' ')
 return <div className="timetable timetable--published timetable--final"><div className="timetable__time-grid" style={{'--tt-columns':columns} as React.CSSProperties}>
  <div className="timetable__corner">Day</div>{periods.map((p)=><div className={`timetable__period-head ${!p.is_teaching?'timetable__period-head--break':''}`} key={p.index}><span className="timetable__period">{p.name}</span><span className="timetable__clock">{p.start_time}–{p.end_time}</span></div>)}
  {view.days.map((day)=><div className="timetable__day-row" key={day.index}><div className="timetable__day-label">{day.name.slice(0,3)}</div>{periods.map((period)=>{const lesson=view.lessons.find((item)=>item.day===day.index&&item.period===period.index);const event=events.find((item)=>item.day_indexes.includes(day.index)&&item.start_time===period.start_time&&item.end_time===period.end_time);const isBreak=!period.is_teaching||Boolean(event);const colour=lesson?subjectColour(lesson.subject):'#0f2a47';return <div className={`timetable__cell ${isBreak?'timetable__cell--break':''}`} key={period.index}>{event?<span className="timetable__break-vertical" aria-label={`${event.name} ${event.start_time}–${event.end_time}`}>{eventLetter(event,day.index)}</span>:!period.is_teaching?<span className="timetable__break-vertical" aria-label={period.name}>{eventLetter({id:0,name:period.name,start_time:period.start_time,end_time:period.end_time,day_indexes:view.days.map((d)=>d.index),event_type:'break',note:null},day.index)}</span>:lesson?<div className="lesson-card lesson-card--final" style={{'--subject-colour':colour} as React.CSSProperties} title={mode==='class'&&lesson.teacher?`Teacher: ${lesson.teacher}`:undefined}><span className="lesson-card__subject">{lesson.subject}</span><span className="lesson-card__line">{mode==='teacher'?lesson.class:lesson.teacher}</span></div>:null}</div>})}</div>)}
 </div></div>
}
