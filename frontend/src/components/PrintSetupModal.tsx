import { useMemo, useState } from 'react'
import type { LessonMeta } from './TimetableGrid'

type FieldKey = 'subject' | 'teacher' | 'class' | 'group' | 'classroom' | 'count' | 'bellTimes'

type FieldConfig = {
  key: FieldKey
  label: string
  hasFullName?: boolean
  hasPosition?: boolean
  hasFont?: boolean
  hasOption?: string
}

const FIELD_CONFIG: FieldConfig[] = [
  { key: 'subject', label: 'Subject', hasFullName: true, hasPosition: true, hasFont: true },
  { key: 'teacher', label: 'Teacher', hasFullName: true, hasPosition: true, hasFont: true },
  { key: 'class', label: 'Class' },
  { key: 'group', label: 'Group', hasOption: 'Do not print if entire class', hasPosition: true, hasFont: true },
  { key: 'classroom', label: 'Classroom', hasOption: 'Do not print if home classroom', hasPosition: true, hasFont: true },
  { key: 'count', label: 'Count' },
  { key: 'bellTimes', label: 'Bell times' },
]

type PrintConfig = {
  [K in FieldKey]: {
    enabled: boolean
    fullName?: boolean
    pos?: number
    font?: string
    hideIfEntire?: boolean
    hideIfHome?: boolean
  }
}

type Props = {
  lesson: any
  meta: LessonMeta
  onClose: () => void
}

function PositionPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="grid w-12 grid-cols-3 gap-1" aria-label="Position">
      {Array.from({ length: 9 }, (_, index) => (
        <button
          key={index}
          type="button"
          title={`Grid position ${index + 1}`}
          aria-label={`Grid position ${index + 1}`}
          onClick={() => onChange(index)}
          className={`h-3 w-3 border border-slate-500 ${value === index ? 'bg-black' : 'bg-white'}`}
        />
      ))}
    </div>
  )
}

export function PrintSetupModal({ lesson, meta, onClose }: Props) {
  const subject = meta.subjects.get(lesson.subject_id)
  const teacher = lesson.teacher_id ? meta.teachers.get(lesson.teacher_id) : undefined
  const assignedClass = meta.classes.get(lesson.class_id)
  const room = lesson.room_id ? meta.rooms.get(Number(lesson.room_id)) : undefined

  const classLabel = assignedClass
    ? ((assignedClass as any).code || (assignedClass as any).name || `Class ${assignedClass.id}`)
    : '—'
  const subjectCode = subject?.code || subject?.name || '—'
  const subjectName = subject?.name || subjectCode
  const teacherCode = teacher?.code || teacher?.staff_number || teacher?.name || '—'
  const teacherName = teacher?.name || teacherCode
  const groupName = lesson.group_name || lesson.group || lesson.group_code || ''
  const roomName = room?.name || '—'
  const lessonNumber = lesson.lesson_number || lesson.number || lesson.id

  const [config, setConfig] = useState<PrintConfig>({
    subject: { enabled: true, fullName: false, pos: 1, font: 'bold' },
    teacher: { enabled: true, fullName: false, pos: 4, font: 'normal' },
    class: { enabled: false, pos: 0 },
    group: { enabled: true, hideIfEntire: true, pos: 2, font: 'normal' },
    classroom: { enabled: true, hideIfHome: true, pos: 7, font: 'normal' },
    count: { enabled: false },
    bellTimes: { enabled: false },
  })

  const preview = useMemo(() => ({
    subject: config.subject.fullName ? subjectName : subjectCode,
    teacher: config.teacher.fullName ? teacherName : teacherCode,
    class: classLabel,
    group: groupName,
    classroom: roomName,
    count: String(lesson.count || ''),
  }), [config, subjectName, subjectCode, teacherName, teacherCode, classLabel, groupName, roomName, lesson.count])

  const updateField = (key: FieldKey, patch: Partial<PrintConfig[FieldKey]>) => {
    setConfig((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }))
  }

  const saveAndPrint = () => {
    window.localStorage.setItem('timetable_print_style', JSON.stringify(config))

    const values = [
      config.subject.enabled ? ['Subject', preview.subject] : null,
      config.teacher.enabled ? ['Teacher', preview.teacher] : null,
      config.class.enabled ? ['Class', preview.class] : null,
      config.group.enabled && (!config.group.hideIfEntire || Boolean(preview.group)) ? ['Group', preview.group] : null,
      config.classroom.enabled && (!config.classroom.hideIfHome || preview.classroom !== '—') ? ['Classroom', preview.classroom] : null,
      config.count.enabled ? ['Count', preview.count] : null,
      config.bellTimes.enabled ? ['Bell times', ''] : null,
    ].filter(Boolean) as Array<[string, string]>

    const escape = (value: unknown) =>
      String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')

    const rows = values
      .filter(([, value]) => value)
      .map(([label, value]) => `<div class="row"><div class="label">${escape(label)}</div><div>${escape(value)}</div></div>`)
      .join('')

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    win.document.open()
    win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Lesson print</title>
<style>
@page{size:A4 portrait;margin:15mm}
body{font-family:Arial,sans-serif;color:#111;background:#fff}
.card{border:1px solid #bbb;padding:12mm;max-width:150mm;margin:auto}
.title{font-size:24px;font-weight:700;margin-bottom:8mm}
.row{display:flex;gap:8mm;border-bottom:1px solid #ddd;padding:4mm 0}
.label{width:30mm;font-weight:700}
</style></head>
<body><section class="card">
<div class="title">${escape(preview.subject)} ${escape(lessonNumber)}</div>
${rows}
</section></body></html>`)
    win.document.close()
    win.focus()
    window.setTimeout(() => win.print(), 250)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="w-[900px] max-w-[95vw] border-2 border-slate-500 bg-[#d9d9d9] p-3 text-xs shadow-xl" role="dialog" aria-modal="true" aria-label="Print setup">
        <div className="mb-2 flex items-center justify-between font-bold">
          <span>Print setup</span>
          <button type="button" onClick={onClose} aria-label="Close">X</button>
        </div>

        <div className="flex gap-4">
          <div className="w-[140px] shrink-0 border bg-[#e9e9e9] p-2">
            <p>Timetable for each class</p>
            <p className="mt-2">Set the print style for the cards where:</p>
            <p className="mt-2">Length: Single<br />Size: 1</p>
            <div className="relative mt-4 flex h-[200px] flex-col border bg-white">
              {config.subject.enabled && (
                <div className="mt-4 text-center text-lg font-bold">{preview.subject}</div>
              )}
              {config.teacher.enabled && (
                <div className="mt-8 text-center">{preview.teacher}</div>
              )}
              {config.class.enabled && (
                <div className="text-center text-[10px]">{preview.class}</div>
              )}
              {config.group.enabled && preview.group && (
                <div className="text-center text-[9px]">{preview.group}</div>
              )}
              {config.classroom.enabled && preview.classroom !== '—' && (
                <div className="text-center text-[9px]">{preview.classroom}</div>
              )}
            </div>
            <button type="button" className="mt-8 w-full border bg-white py-1">Set for more</button>
          </div>

          <div className="grid flex-1 grid-cols-3 gap-2">
            {FIELD_CONFIG.map((field) => {
              const value = config[field.key]
              return (
                <div key={field.key} className="min-h-[130px] border bg-[#efefef] p-2">
                  <label className="flex gap-1 font-bold">
                    <input
                      type="checkbox"
                      checked={value.enabled}
                      onChange={(event) => updateField(field.key, { enabled: event.target.checked })}
                    />
                    {field.label}
                  </label>

                  {field.hasFullName && value.enabled && (
                    <label className="ml-4 mt-1 flex gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(value.fullName)}
                        onChange={(event) => updateField(field.key, { fullName: event.target.checked })}
                      />
                      Print full name
                    </label>
                  )}

                  {field.hasOption && (
                    <label className="ml-4 mt-1 flex gap-1">
                      <input
                        type="checkbox"
                        checked={field.key === 'group' ? Boolean(value.hideIfEntire) : Boolean(value.hideIfHome)}
                        onChange={(event) => updateField(field.key, field.key === 'group' ? { hideIfEntire: event.target.checked } : { hideIfHome: event.target.checked })}
                      />
                      {field.hasOption}
                    </label>
                  )}

                  {field.hasPosition && value.enabled && (
                    <div className="mt-2 flex items-center gap-2">
                      <span>Position: grid 3x3</span>
                      <PositionPicker value={value.pos ?? 0} onChange={(pos) => updateField(field.key, { pos })} />
                    </div>
                  )}

                  {field.hasFont && value.enabled && (
                    <div className="mt-2 text-right">
                      <button type="button" className="border bg-white px-3 py-0.5">Font</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-3 flex justify-between">
          <div className="w-[60%] border p-2">
            Other
            <button type="button" className="ml-4 border bg-white px-3">Edit texts</button>
            <button type="button" className="ml-10 border bg-white px-3">Set default: All</button>
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={saveAndPrint} className="border bg-white px-6 py-1">OK</button>
            <button type="button" onClick={onClose} className="border bg-white px-6 py-1">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
