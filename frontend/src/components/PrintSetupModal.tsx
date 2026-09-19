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

type FieldState = {
  enabled: boolean
  fullName?: boolean
  pos?: number
  font?: 'normal' | 'bold' | 'italic'
  hideIfEntire?: boolean
  hideIfHome?: boolean
}

type PrintConfig = Record<FieldKey, FieldState>

const FIELD_CONFIG: FieldConfig[] = [
  { key: 'subject', label: 'Subject', hasFullName: true, hasPosition: true, hasFont: true },
  { key: 'teacher', label: 'Teacher', hasFullName: true, hasPosition: true, hasFont: true },
  { key: 'class', label: 'Class' },
  { key: 'group', label: 'Group', hasOption: 'Do not print if entire class', hasPosition: true, hasFont: true },
  { key: 'classroom', label: 'Classroom', hasOption: 'Do not print if home classroom', hasPosition: true, hasFont: true },
  { key: 'count', label: 'Count' },
  { key: 'bellTimes', label: 'Bell times' },
]

const DEFAULT_CONFIG: PrintConfig = {
  subject: { enabled: true, fullName: false, pos: 1, font: 'bold' },
  teacher: { enabled: true, fullName: false, pos: 4, font: 'normal' },
  class: { enabled: false, pos: 0, font: 'normal' },
  group: { enabled: true, hideIfEntire: true, pos: 2, font: 'normal' },
  classroom: { enabled: true, hideIfHome: true, pos: 7, font: 'normal' },
  count: { enabled: false, pos: 8, font: 'normal' },
  bellTimes: { enabled: false, pos: 6, font: 'normal' },
}

const STORAGE_KEY = 'timetable_print_style'

type Props = {
  lesson: any
  meta: LessonMeta
  onClose: () => void
}

function loadConfig(): PrintConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw) as Partial<PrintConfig>
    return Object.fromEntries(
      (Object.keys(DEFAULT_CONFIG) as FieldKey[]).map((key) => [key, { ...DEFAULT_CONFIG[key], ...(parsed[key] ?? {}) }]),
    ) as PrintConfig
  } catch {
    return DEFAULT_CONFIG
  }
}

function PositionPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="grid w-[42px] grid-cols-3 gap-[2px]" aria-label="Position">
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

function nextFont(font: FieldState['font']): NonNullable<FieldState['font']> {
  if (font === 'normal') return 'bold'
  if (font === 'bold') return 'italic'
  return 'normal'
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

  const [config, setConfig] = useState<PrintConfig>(() => loadConfig())
  const [editTexts, setEditTexts] = useState(false)
  const [customSubject, setCustomSubject] = useState('')
  const [customTeacher, setCustomTeacher] = useState('')
  const [applyToMore, setApplyToMore] = useState(false)

  const preview = useMemo(() => ({
    subject: customSubject || (config.subject.fullName ? subjectName : subjectCode),
    teacher: customTeacher || (config.teacher.fullName ? teacherName : teacherCode),
    class: classLabel,
    group: groupName,
    classroom: roomName,
    count: String(lesson.count || ''),
  }), [config, customSubject, customTeacher, subjectName, subjectCode, teacherName, teacherCode, classLabel, groupName, roomName, lesson.count])

  const updateField = (key: FieldKey, patch: Partial<FieldState>) => {
    setConfig((current) => ({ ...current, [key]: { ...current[key], ...patch } }))
  }

  const saveConfig = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    if (applyToMore) localStorage.setItem(`${STORAGE_KEY}:apply-to-more`, 'true')
  }

  const saveAndPrint = () => {
    saveConfig()

    const values: Array<[string, string]> = [
      ...(config.subject.enabled ? [['Subject', preview.subject] as [string, string]] : []),
      ...(config.teacher.enabled ? [['Teacher', preview.teacher] as [string, string]] : []),
      ...(config.class.enabled ? [['Class', preview.class] as [string, string]] : []),
      ...(config.group.enabled && (!config.group.hideIfEntire || Boolean(preview.group)) ? [['Group', preview.group] as [string, string]] : []),
      ...(config.classroom.enabled && (!config.classroom.hideIfHome || preview.classroom !== '—') ? [['Classroom', preview.classroom] as [string, string]] : []),
      ...(config.count.enabled ? [['Count', preview.count] as [string, string]] : []),
      ...(config.bellTimes.enabled ? [['Bell times', ''] as [string, string]] : []),
    ]

    const escape = (value: unknown) => String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

    const rows = values
      .filter(([, value]) => value)
      .map(([label, value]) => `<div class="row"><div class="label">${escape(label)}</div><div>${escape(value)}</div></div>`)
      .join('')

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    win.document.open()
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Lesson print</title>
<style>
@page{size:A4 portrait;margin:15mm}
body{font-family:Arial,sans-serif;color:#111;background:#fff}
.card{border:1px solid #bbb;padding:12mm;max-width:150mm;margin:auto}
.title{font-size:24px;font-weight:700;margin-bottom:8mm}
.row{display:flex;gap:8mm;border-bottom:1px solid #ddd;padding:4mm 0}
.label{width:30mm;font-weight:700}
</style></head><body><section class="card">
<div class="title">${escape(preview.subject)} ${escape(lessonNumber)}</div>${rows}
</section></body></html>`)
    win.document.close()
    win.focus()
    window.setTimeout(() => win.print(), 250)
    onClose()
  }

  const resetDefaults = () => setConfig(DEFAULT_CONFIG)

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-4"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="w-[920px] max-w-[96vw] max-h-[94vh] overflow-auto border-2 border-slate-500 bg-[#d9d9d9] p-3 text-xs shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Print setup"
      >
        <div className="mb-2 flex items-center justify-between font-bold">
          <span>Print setup</span>
          <button type="button" onClick={onClose} aria-label="Close" className="px-2">X</button>
        </div>

        <div className="flex gap-4">
          <div className="w-[155px] shrink-0 border border-slate-400 bg-[#e9e9e9] p-2">
            <p className="font-bold">Timetable for each class</p>
            <p className="mt-2">Set the print style for the cards where:</p>
            <p className="mt-2">Length: Single<br />Size: 1</p>
            <div className="relative mt-4 h-[200px] border border-slate-400 bg-white">
              {(Object.keys(config) as FieldKey[]).map((key) => {
                const field = config[key]
                const value = preview[key === 'bellTimes' ? 'subject' : key as 'subject' | 'teacher' | 'class' | 'group' | 'classroom' | 'count']
                if (!field.enabled || !value) return null
                const row = Math.floor((field.pos ?? 0) / 3)
                const col = (field.pos ?? 0) % 3
                return (
                  <span
                    key={key}
                    className="absolute max-w-[45px] overflow-hidden text-center text-[8px]"
                    style={{ left: `${10 + col * 30}%`, top: `${8 + row * 30}%`, fontWeight: field.font === 'bold' ? 700 : 400, fontStyle: field.font === 'italic' ? 'italic' : 'normal' }}
                  >
                    {value}
                  </span>
                )
              })}
            </div>
            <button type="button" className="mt-4 w-full border border-slate-500 bg-white py-1" onClick={() => setApplyToMore((value) => !value)}>
              {applyToMore ? 'Set for more: ON' : 'Set for more'}
            </button>
          </div>

          <div className="grid flex-1 grid-cols-3 gap-2">
            {FIELD_CONFIG.map((field) => {
              const value = config[field.key]
              return (
                <div key={field.key} className="min-h-[130px] border border-slate-400 bg-[#efefef] p-2">
                  <label className="flex gap-1 font-bold">
                    <input type="checkbox" checked={value.enabled} onChange={(event) => updateField(field.key, { enabled: event.target.checked })} />
                    {field.label}
                  </label>

                  {field.hasFullName && value.enabled && (
                    <label className="ml-4 mt-1 flex gap-1">
                      <input type="checkbox" checked={Boolean(value.fullName)} onChange={(event) => updateField(field.key, { fullName: event.target.checked })} />
                      Print full name
                    </label>
                  )}

                  {field.hasOption && value.enabled && (
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
                      <span>Position:</span>
                      <PositionPicker value={value.pos ?? 0} onChange={(pos) => updateField(field.key, { pos })} />
                    </div>
                  )}

                  {field.hasFont && value.enabled && (
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <span className="text-[10px] text-slate-600">{value.font}</span>
                      <button type="button" className="border border-slate-500 bg-white px-3 py-0.5" onClick={() => updateField(field.key, { font: nextFont(value.font) })}>
                        Font
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {editTexts && (
          <div className="mt-3 border border-slate-500 bg-[#efefef] p-2">
            <strong>Edit texts</strong>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label>Subject<input className="ml-2 border border-slate-500 bg-white px-1" value={customSubject} onChange={(event) => setCustomSubject(event.target.value)} placeholder={subjectName} /></label>
              <label>Teacher<input className="ml-2 border border-slate-500 bg-white px-1" value={customTeacher} onChange={(event) => setCustomTeacher(event.target.value)} placeholder={teacherName} /></label>
            </div>
          </div>
        )}

        <div className="mt-3 flex justify-between">
          <div className="flex w-[60%] items-center gap-3 border border-slate-500 p-2">
            <span>Other</span>
            <button type="button" className="border border-slate-500 bg-white px-3" onClick={() => setEditTexts((value) => !value)}>
              {editTexts ? 'Close text editor' : 'Edit texts'}
            </button>
            <button type="button" className="border border-slate-500 bg-white px-3" onClick={resetDefaults}>Set default: All</button>
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={saveAndPrint} className="border border-slate-600 bg-white px-6 py-1 font-semibold">OK</button>
            <button type="button" onClick={onClose} className="border border-slate-600 bg-white px-6 py-1">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
