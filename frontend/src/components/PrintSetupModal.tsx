import { useMemo, useState } from 'react'
import type { LessonMeta } from './TimetableGrid'

type PrintSettings = { subject:boolean; teacher:boolean; classroom:boolean; group:boolean; class:boolean; count:boolean; subjectFullName:boolean; teacherFullName:boolean; groupEntireClass:boolean; classroomHome:boolean }
type Props = { lesson:any; meta:LessonMeta; onClose:()=>void }

export function PrintSetupModal({ lesson, meta, onClose }: Props) {
  const subject=meta.subjects.get(lesson.subject_id)
  const teacher=lesson.teacher_id ? meta.teachers.get(lesson.teacher_id) : undefined
  const cls=meta.classes.get(lesson.class_id)
  const room=lesson.room_id ? meta.rooms.get(Number(lesson.room_id)) : undefined
  const [settings,setSettings]=useState<PrintSettings>({subject:true,teacher:true,classroom:true,group:true,class:false,count:false,subjectFullName:false,teacherFullName:false,groupEntireClass:true,classroomHome:true})
  const toggle=(key:keyof PrintSettings)=>setSettings((current)=>({...current,[key]:!current[key]}))
  const printHtml=useMemo(()=>{
    const values=[
      settings.subject ? ['Subject',settings.subjectFullName ? subject?.name : subject?.code||subject?.name] : null,
      settings.teacher ? ['Teacher',settings.teacherFullName ? teacher?.name : teacher?.code||teacher?.staff_number||teacher?.name] : null,
      settings.class ? ['Class',(cls as any)?.code||(cls as any)?.name] : null,
      settings.group ? ['Group',(lesson as any).group_name||(lesson as any).group||''] : null,
      settings.classroom ? ['Classroom',settings.classroomHome ? '' : room?.name] : null,
      settings.count ? ['Count',String((lesson as any).count||'')] : null,
    ].filter(Boolean) as [string,string|undefined][]
    const escape=(v:unknown)=>String(v??'').replace(/[&<>\"]/g,(x)=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[x]||x))
    return '<!doctype html><html><head><meta charset="utf-8"><title>Lesson print</title><style>@page{size:A4 portrait;margin:15mm}body{font-family:Arial,sans-serif;color:#111}.card{border:1px solid #bbb;padding:12mm;max-width:150mm;margin:auto}.title{font-size:24px;font-weight:700;margin-bottom:8mm}.row{display:flex;gap:8mm;border-bottom:1px solid #ddd;padding:4mm 0}.label{width:30mm;font-weight:700}</style></head><body><section class="card"><div class="title">'+escape(subject?.code||subject?.name||'Lesson')+' '+escape((lesson as any).lesson_number||(lesson as any).number||'')+'</div>'+values.map(([k,v])=>v?'<div class="row"><div class="label">'+escape(k)+'</div><div>'+escape(v)+'</div></div>':'').join('')+'</section></body></html>'
  },[lesson,subject,teacher,cls,room,settings])
  const print=()=>{const win=window.open('','_blank','noopener,noreferrer,width=900,height=700');if(!win)return;win.document.open();win.document.write(printHtml);win.document.close();win.focus();window.setTimeout(()=>win.print(),250)}
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onContextMenu={(e)=>e.preventDefault()}>
    <div className="w-[900px] max-w-[95vw] rounded border bg-[#f0f0f0] p-4 shadow-xl" role="dialog" aria-modal="true">
      <div className="mb-2 flex justify-between text-xs"><span>Print setup</span><span>Settings structure columns/rows</span><span>Standard | preview</span></div>
      <div className="flex gap-4">
        <div className="w-[120px] shrink-0"><div className="flex h-[180px] flex-col items-center justify-center border-2 bg-white">{settings.subject&&<span className="text-xl font-bold">{subject?.code||subject?.name||'MAT'}</span>}<span className="mt-8">{(lesson as any).lesson_number||(lesson as any).number||lesson.id}</span></div><button type="button" className="mt-4 border px-4 py-1 text-xs">Set for more</button></div>
        <div className="grid flex-1 grid-cols-3 gap-3">
          <Setting title="Subject" checked={settings.subject} onChange={()=>toggle('subject')} extraChecked={settings.subjectFullName} onExtra={()=>toggle('subjectFullName')} />
          <Setting title="Teacher" checked={settings.teacher} onChange={()=>toggle('teacher')} extraChecked={settings.teacherFullName} onExtra={()=>toggle('teacherFullName')} />
          <Setting title="Class" checked={settings.class} onChange={()=>toggle('class')} />
          <Setting title="Group" checked={settings.group} onChange={()=>toggle('group')} extraLabel="Do not print if entire class" extraChecked={settings.groupEntireClass} onExtra={()=>toggle('groupEntireClass')} />
          <Setting title="Classroom" checked={settings.classroom} onChange={()=>toggle('classroom')} extraLabel="Do not print if home classroom" extraChecked={settings.classroomHome} onExtra={()=>toggle('classroomHome')} />
          <Setting title="Count" checked={settings.count} onChange={()=>toggle('count')} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-3"><button type="button" onClick={onClose} className="border px-6 py-1 text-sm">Cancel</button><button type="button" onClick={()=>{print();onClose()}} className="border bg-white px-6 py-1 text-sm">OK</button></div>
    </div>
  </div>
}

function Setting({title,checked,onChange,extraLabel,extraChecked,onExtra}:{title:string;checked:boolean;onChange:()=>void;extraLabel?:string;extraChecked?:boolean;onExtra?:()=>void}){
  return <div className="border bg-white p-2"><label className="flex gap-2 text-xs"><input type="checkbox" checked={checked} onChange={onChange}/>{title}</label>{extraLabel&&onExtra?<label className="mt-1 flex gap-2 text-[11px]"><input type="checkbox" checked={Boolean(extraChecked)} onChange={onExtra}/>{extraLabel}</label>:onExtra?<label className="mt-2 ml-4 flex gap-2 text-[11px]"><input type="checkbox" checked={Boolean(extraChecked)} onChange={onExtra}/>Print full name</label>:null}{(title==='Subject'||title==='Teacher')&&<><div className="mt-2 text-xs">Position: grid 3x3</div><button type="button" className="mt-2 border px-6 text-xs">Font</button></>}</div>
}