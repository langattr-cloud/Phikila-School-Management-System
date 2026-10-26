import React, { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from '../lib/router'
import { apiFetch, friendlyApiError } from '../lib/api'
import AscTimetableMenu from './AscTimetableMenu'
import ClassesWorkspaceModule from './ClassesWorkspaceModule'
import DaysDialog, { type DayEntry } from './DaysDialog'
import PeriodsMaster from './PeriodsMaster'
import AdvisorDialog from './AdvisorDialog'
import GenerateNewAdvisor from './GenerateNewAdvisor'
import './timetable-module.css'

type Lesson = { id: string; day: string; period: number; className: string; subject: string; teacher: string; room: string; locked: boolean }
type Period = { name: string; start: string; end: string; type?: 'lesson' | 'break'; short?: string; len?: number; position?: number; textForPrintouts?: string; printSummary?: boolean; printTeacher?: boolean; printClass?: boolean; printClassroom?: boolean; printInBells?: string; doubleCannotSpan?: boolean }
type Specification = { subjects: string[]; classes: string[]; teachers: string[]; classrooms: string[] }
type SubjectDetail = { short: string; color: string; number: string; customFields: string; classrooms: string[]; timeOffGrid?: number[][]; distrib?: string }
type SubjectForm = { title: string; short: string; color: string; number: string; customFields: string; classrooms: string[] }
type TeacherDetail = { firstName: string; short: string; color: string; classTeacher: string; contract: string; email: string; phone: string; title1: string; title2: string; number: string; male: boolean; timeOffGrid: number[][] }
type ClassDetail = { color?: string; classTeacher?: string; grade?: string; number?: string; count?: number; printPictures?: boolean; timeOffGrid?: number[][]; short?: string }
type Workspace = { dayDetails?: Record<string, { short?: string; desc?: string; combinedDays?: string[] }>; classDetails?: Record<string, ClassDetail>; schoolName: string; academicYear: string; registrationName: string; periodsPerDay: number; numberOfDays: number; weekend: string; workZero: boolean; days: string[]; periods: Period[]; lessons: Lesson[]; specification: Specification; subjectDetails?: Record<string, SubjectDetail>; teacherDetails?: Record<string, TeacherDetail> }
type Whose = 'All' | 'Classes' | 'Teachers' | 'Classrooms'
type Action = 'New' | 'Open' | 'Save' | 'Save As' | 'Print' | 'Print preview' | 'Exit' | 'Import' | 'Export' | 'Settings' | 'Subjects' | 'Classes' | 'Classrooms' | 'Teachers' | 'Lessons' | 'Students' | 'Relations' | 'Timetable' | 'Summary' | 'Zoom' | 'Generate new' | 'Generate in cloud' | 'Test' | 'Verification' | 'School' | 'Year/Class Online' | 'Bell times' | 'Constraints' | 'Contents' | 'Questions/Comments' | 'Questions? / Write us' | 'Questions? Comments? Write us' | 'About' | 'Periods' | 'View timetable' | 'Year Online' | 'Generate' | 'Help' | 'Timetables Online' | 'Classrooms view' | 'Teachers view'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DEFAULT_PERIODS: Period[] = [
  { name: 'Period 1', start: '08:00', end: '08:40' }, { name: 'Period 2', start: '08:40', end: '09:20' },
  { name: 'Break', start: '09:20', end: '09:40', type: 'break' }, { name: 'Period 3', start: '09:40', end: '10:20' },
  { name: 'Period 4', start: '10:20', end: '11:00' }, { name: 'Lunch', start: '11:00', end: '11:40', type: 'break' },
  { name: 'Period 5', start: '11:40', end: '12:20' }, { name: 'Period 6', start: '12:20', end: '13:00' },
]
const EMPTY: Workspace = { schoolName: 'Phikila School', academicYear: '2026/2027', registrationName: '', periodsPerDay: 6, numberOfDays: 5, weekend: 'Saturday - Sunday', workZero: false, days: DAYS.slice(0, 5), periods: DEFAULT_PERIODS, lessons: [], specification: { subjects: ['Mathematics', 'English', 'Kiswahili', 'Science', 'Social Studies', 'ICT'], classes: ['Form 1A', 'Form 1B', 'Form 2A', 'Form 2B'], teachers: ['M. Njoroge', 'A. Wanjiku', 'P. Otieno'], classrooms: ['Room 1', 'Room 2', 'Science Lab'] } }
const makeId = () => (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : 'lesson-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
const unique = (items: string[]) => Array.from(new Set(items.map(item => item.trim()).filter(Boolean)))

function RibbonButton({ label, glyph, tint, onClick }: { label: string; glyph: string; tint?: string; onClick: () => void }) {
  return <button type="button" className="phikila-ribbon-button" title={label} aria-label={label} onClick={onClick}><span className={'phikila-ribbon-icon tint-' + (tint || 'neutral')} aria-hidden="true">{glyph}</span><span>{label}</span></button>
}

export default function TimetableModule() {
  const navigate = useNavigate()
  const [data, setData] = useState<Workspace>(EMPTY)
  const [whose, setWhose] = useState<Whose>('All')
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('Loading saved workspace…')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<{ day: string; period: number; lesson?: Lesson } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [setupTab, setSetupTab] = useState<'basic' | 'bell' | 'subjects' | 'classes'>('basic')
  const [daysDialogOpen, setDaysDialogOpen] = useState(false)
  const [periodsMasterOpen, setPeriodsMasterOpen] = useState(false)
  const [catalogueValue, setCatalogueValue] = useState('')
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [subjectDialog, setSubjectDialog] = useState<{mode:'new'|'edit';originalName?:string;form:SubjectForm}|null>(null)
  const [subjectLessonsOpen, setSubjectLessonsOpen] = useState<string | null>(null)
  const [lessonDialog, setLessonDialog] = useState<Lesson | null>(null)
  const [subjectTimeOffOpen, setSubjectTimeOffOpen] = useState<string | null>(null)
  const [breakDialog, setBreakDialog] = useState<{ index: number | null; form: BreakForm } | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const [generateNewAdvisorOpen, setGenerateNewAdvisorOpen] = useState(false)
  const [section, setSection] = useState<string | null>(null)
  const [teachersOpen, setTeachersOpen] = useState(false)
  const [classesOpen, setClassesOpen] = useState(false)
  const [contractTeacher, setContractTeacher] = useState<string | null>(null)
  const [newLessonTeacher, setNewLessonTeacher] = useState<string | null>(null)
  const [specValue, setSpecValue] = useState('')
  const [form, setForm] = useState({ className: '', subject: '', teacher: '', room: '', locked: false })
  const fileRef = useRef<HTMLInputElement>(null)

  const classes = useMemo(() => unique(data.specification.classes.concat(data.lessons.map(item => item.className))), [data.specification.classes, data.lessons])
  const subjects = useMemo(() => unique(data.specification.subjects.concat(data.lessons.map(item => item.subject))), [data.specification.subjects, data.lessons])
  const teachers = useMemo(() => unique(data.specification.teachers.concat(data.lessons.map(item => item.teacher))), [data.specification.teachers, data.lessons])
  const rooms = useMemo(() => unique(data.specification.classrooms.concat(data.lessons.map(item => item.room).filter(Boolean))), [data.specification.classrooms, data.lessons])
  const filterOptions = whose === 'Classes' ? classes : whose === 'Teachers' ? teachers : whose === 'Classrooms' ? rooms : []
  const visibleLessons = useMemo(() => data.lessons.filter(item => {
    if (!filter) return true
    if (whose === 'Classes') return item.className === filter
    if (whose === 'Teachers') return item.teacher === filter
    if (whose === 'Classrooms') return item.room === filter
    return true
  }), [data.lessons, whose, filter])
  const conflicts = useMemo(() => findConflicts(data), [data])

  const [savedTeacherWorkloads, setSavedTeacherWorkloads] = useState<Record<string, number>>({})
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [workspaceResult, staffResult, profileResult] = await Promise.allSettled([
        apiFetch<{ data: Workspace | null; updated_at: string | null }>('/api/v1/timetable/workspace'),
        apiFetch<SavedTeacherSource[]>('/api/v1/teachers/'),
        apiFetch<SavedTeacherSource[]>('/api/v1/timetable/teachers'),
      ])
      const workspace = workspaceResult.status === 'fulfilled' ? workspaceResult.value.data : null
      const base = normaliseWorkspace(workspace || EMPTY)
      const staff = staffResult.status === 'fulfilled' && Array.isArray(staffResult.value) ? staffResult.value : []
      const profiles = profileResult.status === 'fulfilled' && Array.isArray(profileResult.value) ? profileResult.value : []
      const roster = new Map<string, { detail: Partial<TeacherDetail>; workload?: number }>()
      const addRoster = (source: SavedTeacherSource, profileMode: boolean) => {
        const profile = source.profile && typeof source.profile === 'object' ? source.profile : source
        const firstName = String(profile.firstName || profile.first_name || source.firstName || source.first_name || '').trim()
        const lastName = String(profile.lastName || profile.last_name || source.lastName || source.last_name || '').trim()
        const name = String(profile.name || source.name || [firstName, lastName].filter(Boolean).join(' ')).trim()
        if (!name) return
        const previous = roster.get(name) || { detail: {} }
        const workloadValue = Number(profile.count ?? profile.workload ?? source.count ?? 0)
        roster.set(name, {
          detail: {
            ...previous.detail,
            firstName: firstName || previous.detail.firstName || '',
            short: String(profile.short || profile.code || source.staff_number || previous.detail.short || ''),
            color: String(profile.color || previous.detail.color || '#1e40af'),
            email: String(profile.email || source.email || previous.detail.email || ''),
            phone: String(profile.phone || source.phone || previous.detail.phone || ''),
          },
          workload: Number.isFinite(workloadValue) && workloadValue >= 0 ? Math.max(previous.workload || 0, workloadValue) : previous.workload,
        })
      }
      staff.forEach(source => addRoster(source, false))
      profiles.forEach(source => addRoster(source, true))
      const rosterNames = Array.from(roster.keys())
      const mergedTeachers = unique([...base.specification.teachers, ...rosterNames])
      const mergedDetails: Record<string, TeacherDetail> = { ...(base.teacherDetails || {}) }
      const workloads: Record<string, number> = {}
      roster.forEach((value, name) => {
        mergedDetails[name] = { ...({ firstName: '', short: '', color: '#1e40af', classTeacher: '', contract: '', email: '', phone: '', title1: '', title2: '', number: '', male: false, timeOffGrid: base.days.map(() => base.periods.map(() => 0)) } as TeacherDetail), ...(value.detail as TeacherDetail), ...(mergedDetails[name] || {}) }
        if (value.workload != null) workloads[name] = value.workload
      })
      setSavedTeacherWorkloads(workloads)
      setData({ ...base, specification: { ...base.specification, teachers: mergedTeachers }, teacherDetails: mergedDetails })
      setStatus(workspace ? 'Loaded shared workspace and saved teacher records' : 'Loaded saved teacher records · timetable workspace is new')
    } catch (caught) {
      setError(friendlyApiError(caught, 'load timetable workspace and saved teachers'))
      setStatus('Could not load workspace')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const persistWorkspace = async (nextData: Workspace, action = 'save timetable workspace'): Promise<boolean> => {
    setError('')
    setStatus('Saving to the school database…')
    try {
      const result = await apiFetch<{ data: Workspace; updated_at: string | null }>('/api/v1/timetable/workspace', {
        method: 'PUT',
        body: JSON.stringify({ data: nextData }),
      })
      const saved = normaliseWorkspace(result.data || nextData)
      setData(saved)
      setStatus('Saved to the school database · ' + new Date().toLocaleTimeString())
      return true
    } catch (caught) {
      setError(friendlyApiError(caught, action))
      setStatus('Save failed · changes were not confirmed by the database')
      return false
    }
  }

  const save = async () => { await persistWorkspace(data) }
  const runTest = async () => {
    setError('')
    try {
      const result = await apiFetch<{ valid: boolean; lessons_checked: number; conflicts: { message: string }[] }>('/api/v1/timetable/test', { method: 'POST', body: JSON.stringify({ data }) })
      setStatus(result.valid ? 'Test passed · ' + result.lessons_checked + ' lessons checked' : 'Test found ' + result.conflicts.length + ' conflict(s)')
      if (result.conflicts.length) setError(result.conflicts.map(item => item.message).join(' · '))
    } catch (caught) { setError(friendlyApiError(caught, 'test timetable')) }
  }
  const openEditor = (day: string, period: number, lesson?: Lesson, preferredTeacher?: string) => {
    setEditor({ day, period, lesson })
    setForm(lesson ? { className: lesson.className, subject: lesson.subject, teacher: lesson.teacher, room: lesson.room, locked: lesson.locked } : { className: classes[0] || 'Form 1A', subject: subjects[0] || 'Mathematics', teacher: preferredTeacher || teachers[0] || 'Teacher', room: '', locked: false })
  }
  const submitLesson = async (event: FormEvent) => {
    event.preventDefault()
    if (!editor) return
    const lesson: Lesson = { id: editor.lesson ? editor.lesson.id : makeId(), day: editor.day, period: editor.period, ...form }
    const nextData: Workspace = { ...data, lessons: editor.lesson ? data.lessons.map(item => item.id === lesson.id ? lesson : item) : data.lessons.concat(lesson) }
    if (await persistWorkspace(nextData, 'save lesson')) setEditor(null)
  }
  const deleteLesson = async () => {
    if (!editor || !editor.lesson) return
    if (editor.lesson.locked && !window.confirm('This lesson is locked. Remove it anyway?')) return
    const nextData: Workspace = { ...data, lessons: data.lessons.filter(item => item.id !== editor.lesson?.id) }
    if (await persistWorkspace(nextData, 'remove lesson')) setEditor(null)
  }
  const newWorkspace = () => {
    if (!window.confirm('Start a new empty timetable? Unsaved changes will be lost.')) return
    setData({ ...EMPTY, days: DAYS.slice(0, 5), periods: DEFAULT_PERIODS.map(period => ({ ...period })), lessons: [] })
    setFilter(''); setStatus('New empty workspace · unsaved')
  }
  const openJson = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try { setData(normaliseWorkspace(JSON.parse(String(reader.result)) as Partial<Workspace>)); setStatus('Opened ' + file.name + ' · remember to Save'); setError('') }
      catch { setError('This file is not a valid Phikila timetable JSON export.') }
    }
    reader.readAsText(file)
  }
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'phikila-timetable.json'; anchor.click(); URL.revokeObjectURL(url)
    setStatus('Timetable exported as JSON')
  }
  const onAction = (action: Action) => {
    switch (action) {
      case 'New': newWorkspace(); break
      case 'Open': case 'Import': fileRef.current?.click(); break
      case 'Save': void save(); break
      case 'Save As': case 'Export': exportJson(); break
      case 'Print': window.print(); break
      case 'Print preview': setPreviewOpen(true); break
      case 'Test': setAdvisorOpen(true); break
      case 'Verification': void runTest(); break
      case 'Generate': { const result = generateSchedule(data); if (result.error) { setError(result.error); setStatus('Generation stopped · existing timetable preserved') } else { setData(current => ({ ...current, lessons: result.lessons })); setError(''); setStatus('Generated a conflict-free draft for ' + result.lessons.length + ' lessons · review and Save') } break }
      case 'Help': case 'Contents': case 'Questions/Comments': case 'Questions? / Write us': case 'Questions? Comments? Write us': case 'About': setStatus('Phikila Timetable Help · Use the menu bar for File, Specification, View, Timetable, Options, and Help actions.'); break
      case 'School': case 'Settings': setSetupTab('basic'); setSettingsOpen(true); break
      case 'Year/Class Online': case 'Year Online': case 'Timetables Online': setStatus('Year/Class Online · online publishing will be available after the timetable is generated and approved.'); break
      case 'Bell times': case 'Periods': setSetupTab('bell'); setSettingsOpen(true); break
      case 'Exit': setStatus('Use the main application navigation to leave the timetable.'); break
      case 'Generate new': setGenerateNewAdvisorOpen(true); break
      case 'Generate in cloud': setError('Cloud generation is not connected yet. Use Generate new for the local draft generator.'); break
      case 'Timetable': case 'View timetable': setSection(null); break
      case 'Classrooms view': setWhose('Classrooms'); setFilter(''); break
      case 'Teachers view': setWhose('Teachers'); setFilter(''); break
      case 'Summary': setStatus('Summary · ' + data.lessons.length + ' lessons across ' + data.days.length + ' days'); break
      case 'Zoom': setStatus('Use browser zoom to adjust the timetable scale.'); break
      case 'Constraints': setSection('Constraints'); break
      case 'Subjects': setSection(null); setSetupTab('subjects'); setSettingsOpen(true); break
      case 'Teachers': setSection(null); setTeachersOpen(true); break
      case 'Classes': setSection(null); setClassesOpen(true); break
      case 'Students': case 'Relations': case 'Lessons': setSection(action); break
    }
  }
  return <main className="phikila-tt">
    <header className="phikila-tt-heading"><div><p className="phikila-tt-eyebrow">PHIKILA · TIMETABLE MODULE</p><h1>{data.schoolName || 'School timetable'}</h1><p className="phikila-tt-subtitle">Academic year {data.academicYear} · Weekly timetable editor</p></div><div className="phikila-tt-heading-actions"><span className={'phikila-tt-status-dot ' + (loading ? 'is-loading' : '')} /><span>{loading ? 'Loading' : 'Workspace'}</span><button className="phikila-tt-button" onClick={() => void load()} disabled={loading}>Reload</button></div></header>
    <AscTimetableMenu onNavigate={name => { const action = name.replace(/\n/g, ' '); onAction((action === 'Students / Seminars' ? 'Students' : action) as Action) }} />
    {classesOpen && <ClassesWorkspaceModule classes={classes} lessons={data.lessons} days={data.days} periods={data.periods} teachers={teachers} subjects={subjects} classrooms={rooms} details={data.classDetails || {}} onClose={() => setClassesOpen(false)} onSave={(nextClasses, nextLessons, nextDetails) => { setData(current => ({ ...current, specification: { ...current.specification, classes: unique(nextClasses) }, lessons: nextLessons, classDetails: nextDetails })); setStatus('Class changes updated in the workspace · remember to Save'); setError('') }} />}
    {teachersOpen && <TeachersWorkspaceModule teachers={teachers} lessons={data.lessons} details={data.teacherDetails || {}} savedWorkloads={savedTeacherWorkloads} onClose={() => setTeachersOpen(false)} onSaveAll={async (nextTeachers, nextDetails) => { const nextData = { ...data, specification: { ...data.specification, teachers: nextTeachers }, teacherDetails: nextDetails }; const ok = await persistWorkspace(nextData, 'save teacher records'); if (!ok) return false; try { const check = await apiFetch<{ data: Workspace | null }>('/api/v1/timetable/workspace'); const saved = normaliseWorkspace(check.data || EMPTY); const expected = unique(nextTeachers); const actual = unique(saved.specification.teachers || []); const detailsPresent = expected.every(name => actual.includes(name) && !!saved.teacherDetails?.[name]); if (!detailsPresent) { setError('The database did not confirm every teacher record. Keep this window open and retry saving.'); setStatus('Teacher save could not be verified'); return false; } setStatus('Teacher records saved and verified in the database'); return true; } catch (caught) { setError(friendlyApiError(caught, 'verify saved teacher records')); setStatus('Teacher save could not be verified · keep this window open and retry'); return false; } }} onOpenContract={teacher => setContractTeacher(teacher)} days={data.days} periods={data.periods} />}
    {contractTeacher && <TeacherContractDialog teacher={contractTeacher} short={data.teacherDetails?.[contractTeacher]?.short || ''} lessons={data.lessons.filter(lesson => lesson.teacher === contractTeacher || lesson.teacher.startsWith(contractTeacher + ' ('))} periods={data.periods} subjects={subjects} classes={classes} teachers={teachers} classrooms={rooms} teacherDetails={data.teacherDetails || {}} onClose={() => setContractTeacher(null)} onNew={() => setNewLessonTeacher(contractTeacher)} onEdit={lesson => { setContractTeacher(null); openEditor(lesson.day, lesson.period, lesson) }} onRemove={lesson => { setData(current => ({ ...current, lessons: current.lessons.filter(item => item.id !== lesson.id) })); setStatus('Teacher lesson removed · remember to Save') }} onCopyTo={(lesson, targetClass) => { const conflict = data.lessons.some(item => item.day === lesson.day && item.period === lesson.period && (item.className === targetClass || item.teacher === lesson.teacher || (lesson.room && item.room === lesson.room))); if (conflict) { setError('Cannot copy this lesson to ' + targetClass + ': the class, teacher, or classroom is already occupied at that time.'); return; } setData(current => ({ ...current, lessons: [...current.lessons, { ...lesson, id: makeId(), className: targetClass, locked: false }] })); setError(''); setStatus('Lesson copied to ' + targetClass + ' · remember to Save'); }} />}
    {newLessonTeacher && <NewLessonDialog defaultTeacher={{ name: newLessonTeacher, short: data.teacherDetails?.[newLessonTeacher]?.short || '' }} subjects={subjects} classes={classes} teachers={teachers} classrooms={rooms} teacherDetails={data.teacherDetails || {}} onCancel={() => setNewLessonTeacher(null)} onSave={lessonDraft => { const teacherName = teachers.find(name => lessonDraft.teacher === name || lessonDraft.teacher === name + (data.teacherDetails?.[name]?.short ? ' (' + data.teacherDetails[name].short + ')' : '')) || newLessonTeacher; const requested = Math.max(1, Math.min(10, Number(lessonDraft.count) || 1)); const span = lessonDraft.length === 'Triple' ? 3 : lessonDraft.length === 'Double' ? 2 : 1; const available: {day:string;period:number}[] = []; for (const day of data.days) for (let period = 0; period < data.periods.length; period++) { if (data.periods[period].type === 'break' || /break|lunch|recess/i.test(data.periods[period].name)) continue; if (period + span > data.periods.length) continue; const run = Array.from({length:span}, (_, offset) => period + offset); if (run.some(index => data.periods[index].type === 'break' || /break|lunch|recess/i.test(data.periods[index].name))) continue; const occupied = data.lessons.some(item => item.day === day && run.includes(item.period) && (item.className === lessonDraft.class || item.teacher === teacherName || (lessonDraft.room && item.room === lessonDraft.room))); if (!occupied) available.push({day, period}); } const chosen: {day:string;period:number}[] = []; for (const slot of available) { if (chosen.some(item => item.day === slot.day && Array.from({length:span}, (_, offset) => item.period + offset).some(index => index >= slot.period && index < slot.period + span))) continue; chosen.push(slot); if (chosen.length === requested) break; } if (chosen.length < requested) { setError('Not enough free timetable slots for ' + requested + ' lesson(s) with this teacher, class, and room.'); return; } const additions: Lesson[] = []; for (const slot of chosen) for (let offset = 0; offset < span; offset++) additions.push({ id: makeId(), day: slot.day, period: slot.period + offset, className: lessonDraft.class, subject: lessonDraft.subject, teacher: teacherName, room: lessonDraft.room, locked: false }); setData(current => ({ ...current, lessons: [...current.lessons, ...additions] })); setNewLessonTeacher(null); setStatus('Added ' + requested + ' weekly lesson(s) · remember to Save'); setError(''); }} />}
    {!(settingsOpen && setupTab === 'subjects') && <div className="phikila-tt-subbar"><strong>{whose === 'All' ? 'Whole school' : whose === 'Classes' ? 'Class timetable' : whose === 'Teachers' ? 'Teacher timetable' : 'Classroom timetable'}</strong>{filterOptions.length > 0 && <select aria-label={'Filter by ' + whose.toLowerCase()} value={filter} onChange={event => setFilter(event.target.value)}><option value="">All {whose.toLowerCase()}</option>{filterOptions.map(option => <option key={option}>{option}</option>)}</select>}<span className="phikila-tt-subbar-spacer" /><span>{data.lessons.length} lessons</span><button className="phikila-tt-button phikila-tt-button-primary" onClick={() => openEditor(data.days[0], 0)}>+ Add lesson</button></div>}
    {error && <div className="phikila-tt-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {section && <section className="phikila-tt-info-panel"><div className="phikila-tt-specification"><div className="phikila-tt-panel-heading"><div><h2>{section}</h2><p>Manage the saved {section.toLowerCase()} catalogue. Changes are included when you save the workspace.</p></div><button className="phikila-tt-button" onClick={() => { setSection(null); setSpecValue('') }}>Close</button></div>{(['Subjects', 'Classes', 'Teachers'].includes(section)) ? <><form className="phikila-tt-spec-add" onSubmit={event => { event.preventDefault(); const key = section === 'Subjects' ? 'subjects' : section === 'Classes' ? 'classes' : 'teachers'; const value = specValue.trim(); if (!value) return; setData(current => ({ ...current, specification: { ...current.specification, [key]: unique([...current.specification[key], value]) } })); setSpecValue('') }}><input aria-label={'New ' + section.slice(0, -1)} placeholder={'Add ' + section.toLowerCase().replace(/s$/, '')} value={specValue} onChange={event => setSpecValue(event.target.value)} /><button className="phikila-tt-button phikila-tt-button-primary" type="submit">Add</button></form><ul className="phikila-tt-spec-list">{(section === 'Subjects' ? data.specification.subjects : section === 'Classes' ? data.specification.classes : data.specification.teachers).map(item => <li key={item}><span>{item}</span><button type="button" className="phikila-tt-button phikila-tt-danger" onClick={() => { const key = section === 'Subjects' ? 'subjects' : section === 'Classes' ? 'classes' : 'teachers'; setData(current => ({ ...current, specification: { ...current.specification, [key]: current.specification[key].filter(value => value !== item) } })) }}>Remove</button></li>)}</ul></> : <p>Student records and lesson relations need dedicated data models; they are not edited in this workspace yet.</p>}</div></section>}
    {settingsOpen && <section className={'phikila-tt-settings ' + ((setupTab === 'basic' || setupTab === 'bell') ? 'phikila-tt-school-window' : '')}>
      {(setupTab === 'basic' || setupTab === 'bell') && <><header className="phikila-tt-school-titlebar"><strong>Settings - {data.schoolName} {data.academicYear}</strong><button type="button" aria-label="Close school settings" onClick={() => setSettingsOpen(false)}>×</button></header><nav className="phikila-tt-setup-tabs" aria-label="School settings sections"><button type="button" className={setupTab === 'basic' ? 'is-active' : ''} onClick={() => setSetupTab('basic')}>Basic data</button><button type="button" className={setupTab === 'bell' ? 'is-active' : ''} onClick={() => setSetupTab('bell')}>Bell times / Periods</button></nav></>}
      {setupTab === 'basic' && <div className="phikila-tt-school-form">
        <label>School name<input value={data.schoolName} onChange={event => setData(current => ({ ...current, schoolName: event.target.value }))} /></label>
        <label>Academic year<input value={data.academicYear} onChange={event => setData(current => ({ ...current, academicYear: event.target.value }))} /></label>
        <label>Registration name<input value={data.registrationName} onChange={event => setData(current => ({ ...current, registrationName: event.target.value }))} placeholder="Optional registration name" /></label>
        <label>Periods per day<select value={data.periodsPerDay} onChange={event => setData(current => ({ ...current, periodsPerDay: Number(event.target.value) }))}>{Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>Number of school days<select value={data.numberOfDays} onChange={event => setData(current => { const days = DAYS.slice(0, Number(event.target.value)); return { ...current, numberOfDays: Number(event.target.value), days } })}>{[5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>Weekend<select value={data.weekend} onChange={event => setData(current => ({ ...current, weekend: event.target.value }))}><option>Saturday - Sunday</option><option>Friday - Saturday</option></select></label>
        <p className="phikila-tt-help">School day count controls the displayed days. Existing lessons on removed days are retained in saved data but hidden until those days are enabled again.</p>
        <div className="phikila-tt-school-quick-actions">
          <button type="button" className="phikila-tt-button" onClick={() => setPeriodsMasterOpen(true)}>Rename periods / Bell times</button>
          <button type="button" className="phikila-tt-button" onClick={() => setDaysDialogOpen(true)}>Rename days</button>
          <button type="button" className="phikila-tt-button phikila-tt-button-primary" onClick={() => setBreakDialog({ index: null, form: makeBreakForm() })}>＋ Add break between lessons</button>
        </div>
      </div>}
      {setupTab === 'bell' && <div>
        <div className="phikila-tt-bell-actions"><span>Manage teaching periods and configure breaks, their position, and print options.</span><button className="phikila-tt-button" onClick={() => setData(current => ({ ...current, periods: [...current.periods, { name: 'New period', short: 'P' + (current.periods.filter(p => p.type !== 'break').length + 1), start: '13:00', end: '13:40', type: 'lesson' }] }))}>+ Add period</button><button className="phikila-tt-button phikila-tt-button-primary" onClick={() => setBreakDialog({ index: null, form: makeBreakForm() })}>+ Add break between lessons</button></div>
        <div className="phikila-tt-period-list">{data.periods.map((period,index)=><div className={'phikila-tt-period-row ' + (period.type === 'break' ? 'phikila-tt-break-editor-row' : '')} key={index}>
          <span className="phikila-tt-period-kind">{period.type === 'break' ? 'Break' : 'Lesson'}</span>
          <input aria-label={'Period '+(index+1)+' name'} value={period.name} onChange={event=>setData(current=>({...current,periods:current.periods.map((item,i)=>i===index?{...item,name:event.target.value}:item)}))}/>
          <input aria-label={'Period '+(index+1)+' start'} type="time" value={period.start} onChange={event=>setData(current=>({...current,periods:current.periods.map((item,i)=>i===index?{...item,start:event.target.value}:item)}))}/>
          <input aria-label={'Period '+(index+1)+' end'} type="time" value={period.end} onChange={event=>setData(current=>({...current,periods:current.periods.map((item,i)=>i===index?{...item,end:event.target.value}:item)}))}/>
          <div className="phikila-tt-period-actions">{period.type === 'break' && <button className="phikila-tt-button" onClick={()=>setBreakDialog({index,form:periodToBreakForm(period)})}>Edit break</button>}<button className="phikila-tt-button phikila-tt-danger" onClick={()=>setData(current=>({...current,periods:current.periods.filter((_,i)=>i!==index),lessons:current.lessons.filter(lesson=>lesson.period!==index).map(lesson=>({...lesson,period:lesson.period>index?lesson.period-1:lesson.period}))}))}>Delete</button></div>
        </div>)}</div>
      </div>}
      {setupTab === 'subjects' && <div className="phikila-tt-subjects-manager">
        <div className="phikila-tt-subjects-heading"><strong>Enter subjects</strong><span>Choose a subject to edit its details.</span></div>
        <div className="phikila-tt-subjects-layout"><div className="phikila-tt-subject-table-wrap"><table className="phikila-tt-subject-table"><thead><tr><th>Name</th><th>Short</th><th>Count</th><th>Time off</th><th>Distribution</th><th>Homework</th></tr></thead><tbody>{data.specification.subjects.map(item=>{const detail=data.subjectDetails?.[item];return <tr key={item} onClick={()=>setSelectedSubject(item)} onDoubleClick={()=>{setSelectedSubject(item);setSubjectLessonsOpen(item)}} title="Double-click to open this subject's lessons" className={selectedSubject===item?'is-selected':''}><td><span className="phikila-tt-subject-color" style={{background:detail?.color||'#1a3a8a'}}/> {item}</td><td>{detail?.short||item.slice(0,4).toUpperCase()}</td><td>{data.lessons.filter(lesson=>lesson.subject===item).length}</td><td><span className="phikila-tt-timeoff-preview">{(detail?.timeOffGrid||[]).flat().filter(value=>value===2).length} unavailable</span></td><td>{detail?.distrib||'Ideal'}</td><td>{detail?.classrooms?.join(', ')||''}</td></tr>})}</tbody></table></div>
        <aside className="phikila-tt-subject-actions"><button className="phikila-tt-button phikila-tt-button-primary" onClick={()=>setSubjectDialog({mode:'new',form:{title:'',short:'',color:'#1a3a8a',number:'',customFields:'',classrooms:[]}})}>＋ New</button><button className="phikila-tt-button" disabled={!selectedSubject} onClick={()=>{if(!selectedSubject)return;const detail=data.subjectDetails?.[selectedSubject];setSubjectDialog({mode:'edit',originalName:selectedSubject,form:{title:selectedSubject,short:detail?.short||selectedSubject.slice(0,4).toUpperCase(),color:detail?.color||'#1a3a8a',number:detail?.number||'',customFields:detail?.customFields||'',classrooms:detail?.classrooms||[]}})}}>Edit</button><button className="phikila-tt-button phikila-tt-danger" disabled={!selectedSubject} onClick={()=>{if(!selectedSubject)return;const removed=selectedSubject;const nextData:Workspace={...data,specification:{...data.specification,subjects:data.specification.subjects.filter(value=>value!==removed)},subjectDetails:Object.fromEntries(Object.entries(data.subjectDetails||{}).filter(([key])=>key!==removed))};void persistWorkspace(nextData,'remove subject').then(saved=>{if(saved)setSelectedSubject(null)})}}>Remove</button><div className="phikila-tt-subject-actions-spacer"/><button className="phikila-tt-button" disabled={!selectedSubject} onClick={()=>selectedSubject&&setSubjectLessonsOpen(selectedSubject)}>Lessons</button><button className="phikila-tt-button" disabled={!selectedSubject} onClick={()=>selectedSubject&&setSubjectTimeOffOpen(selectedSubject)}>Time off</button><button className="phikila-tt-button" disabled={!selectedSubject} onClick={()=>{if(!selectedSubject)return;const current=data.subjectDetails?.[selectedSubject]?.distrib||'Ideal';const value=window.prompt('Subject distribution preference (for example: Ideal, Balanced, or Avoid):',current);if(value===null)return;const name=selectedSubject;const details={...(data.subjectDetails||{}),[name]:{short:data.subjectDetails?.[name]?.short||name.slice(0,4).toUpperCase(),color:data.subjectDetails?.[name]?.color||'#1a3a8a',number:data.subjectDetails?.[name]?.number||'',customFields:data.subjectDetails?.[name]?.customFields||'',classrooms:data.subjectDetails?.[name]?.classrooms||[],timeOffGrid:data.subjectDetails?.[name]?.timeOffGrid||[],distrib:value.trim()||'Ideal'}};const nextData:Workspace={...data,subjectDetails:details};void persistWorkspace(nextData,'save subject constraints')}}>Constraints</button></aside></div>
        {subjectDialog && <SubjectEditorDialog value={subjectDialog.form} classrooms={data.specification.classrooms} mode={subjectDialog.mode} onChange={form=>setSubjectDialog(current=>current?{...current,form}:current)} onClose={()=>setSubjectDialog(null)} onSave={async()=>{const form=subjectDialog.form;const name=form.title.trim();if(!name){setError('Enter a subject title.');return}const oldName=subjectDialog.originalName;if(data.specification.subjects.some(value=>value!==oldName&&value.toLowerCase()===name.toLowerCase())){setError('A subject with this title already exists.');return}const subjects=data.specification.subjects.filter(value=>value!==oldName);const details={...(data.subjectDetails||{})};if(oldName)delete details[oldName];details[name]={short:form.short.trim()||name.slice(0,4).toUpperCase(),color:form.color,number:form.number,customFields:form.customFields,classrooms:form.classrooms};const nextData:Workspace={...data,specification:{...data.specification,subjects:subjectDialog.mode==='new'?[...subjects,name]:data.specification.subjects.map(value=>value===oldName?name:value)},subjectDetails:details,lessons:oldName?data.lessons.map(lesson=>lesson.subject===oldName?{...lesson,subject:name}:lesson):data.lessons};setError('');setStatus('Saving subject to the school database…');try{const result=await apiFetch<{data:Workspace;updated_at:string|null}>('/api/v1/timetable/workspace',{method:'PUT',body:JSON.stringify({data:nextData})});setData(normaliseWorkspace(result.data||nextData));setSelectedSubject(name);setSubjectDialog(null);setError('');setStatus('Subject saved to the school database · '+new Date().toLocaleTimeString())}catch(caught){setError(friendlyApiError(caught,'save subject to school database'));setStatus('Subject was not saved. Correct the error and try again.')}}} />}
      </div>}
      {subjectLessonsOpen && <SubjectLessonsDialog subject={subjectLessonsOpen} lessons={data.lessons.filter(lesson=>lesson.subject===subjectLessonsOpen)} onClose={()=>setSubjectLessonsOpen(null)} onEdit={lesson=>setLessonDialog(lesson)} onNew={()=>{const subject=subjectLessonsOpen;if(!subject)return;const availablePeriod=data.periods.findIndex(item=>item.type!=='break'&&!/break|lunch|recess/i.test(item.name));const period=availablePeriod<0?0:availablePeriod;const availableDay=data.days.find(day=>!data.lessons.some(lesson=>lesson.day===day&&lesson.period===period))||data.days[0]||'Monday';const initial:Lesson={id:'',day:availableDay,period,className:classes[0]||'Form 1A',subject,teacher:teachers[0]||'Teacher',room:'',locked:false};setSubjectLessonsOpen(null);setLessonDialog(initial)}} />}
      {lessonDialog && <LessonDialog initial={lessonDialog} teachersList={teachers} subjectsList={subjects} classesList={classes} classroomsList={rooms} onInfo={message=>setStatus(message)} lessonsPerWeek={data.lessons.filter(item=>item.subject===lessonDialog.subject&&item.className===lessonDialog.className).length} onClose={()=>setLessonDialog(null)} onSave={async updated=>{const isNew=!lessonDialog.id;const nextLesson:Lesson={...lessonDialog,id:isNew?makeId():lessonDialog.id,teacher:updated.teacher,subject:updated.subject,className:updated.className,room:updated.room};const nextData:Workspace={...data,lessons:isNew?[...data.lessons,nextLesson]:data.lessons.map(item=>item.id===lessonDialog.id?nextLesson:item),specification:{...data.specification,subjects:unique([...data.specification.subjects,updated.subject]),classes:unique([...data.specification.classes,updated.className]),teachers:unique([...data.specification.teachers,updated.teacher]),classrooms:unique([...data.specification.classrooms,...(updated.room?[updated.room]:[])])}};setError('');setStatus('Saving lesson to the school database…');try{const result=await apiFetch<{data:Workspace;updated_at:string|null}>('/api/v1/timetable/workspace',{method:'PUT',body:JSON.stringify({data:nextData})});const saved=normaliseWorkspace(result.data||nextData);setData(saved);setSelectedSubject(updated.subject);setLessonDialog(null);setStatus('Lesson saved to the school database · '+new Date().toLocaleTimeString())}catch(caught){setError(friendlyApiError(caught,'save lesson to school database'));setStatus('Lesson was not saved. Correct the error and try again.')}}} />}
      {subjectTimeOffOpen && <SubjectTimeOffDialog subject={subjectTimeOffOpen} days={data.days} periods={data.periods} initialGrid={data.subjectDetails?.[subjectTimeOffOpen]?.timeOffGrid} onClose={()=>setSubjectTimeOffOpen(null)} onSave={grid=>{const subject=subjectTimeOffOpen;if(!subject)return;const detail=data.subjectDetails?.[subject];const nextData:Workspace={...data,subjectDetails:{...(data.subjectDetails||{}),[subject]:{short:detail?.short||subject.slice(0,4).toUpperCase(),color:detail?.color||'#1a3a8a',number:detail?.number||'',customFields:detail?.customFields||'',classrooms:detail?.classrooms||[],distrib:detail?.distrib||'Ideal',timeOffGrid:grid}}};void persistWorkspace(nextData,'save subject time off').then(saved=>{if(saved)setSubjectTimeOffOpen(null)})}} />}
      {setupTab === 'classes' && <div><form className="phikila-tt-spec-add" onSubmit={event=>{event.preventDefault();const value=catalogueValue.trim();if(!value)return;setData(current=>({...current,specification:{...current.specification,classes:unique([...current.specification.classes,value])}}));setCatalogueValue('')}}><input aria-label="New class" placeholder="Enter class name" value={catalogueValue} onChange={event=>setCatalogueValue(event.target.value)}/><button className="phikila-tt-button phikila-tt-button-primary" type="submit">Add</button></form><ul className="phikila-tt-spec-list">{data.specification.classes.map(item=><li key={item}><span>{item}</span><button className="phikila-tt-button phikila-tt-danger" onClick={()=>setData(current=>({...current,specification:{...current.specification,classes:current.specification.classes.filter(value=>value!==item)}}))}>Remove</button></li>)}</ul></div>}
      <div className="phikila-tt-settings-save"><button className="phikila-tt-button" onClick={() => setSettingsOpen(false)}>Close</button><button type="button" className="phikila-tt-button phikila-tt-button-primary" onClick={() => void save()}>{setupTab === 'subjects' ? 'Save subjects' : setupTab === 'classes' ? 'Save classes' : 'Save school settings'}</button></div>
    </section>}
    {periodsMasterOpen && <PeriodsMaster
      initialPeriods={data.periods}
      onClose={() => setPeriodsMasterOpen(false)}
      onSaveAll={async (periods, oldIndexToNewIndex) => {
        const lessons = data.lessons.flatMap(lesson => {
          const nextPeriod = oldIndexToNewIndex[lesson.period]
          return nextPeriod === undefined ? [] : [{ ...lesson, period: nextPeriod }]
        })
        const nextData: Workspace = { ...data, periods, periodsPerDay: periods.filter(period => period.type !== 'break').length, lessons }
        const saved = await persistWorkspace(nextData, 'save periods and bell times')
        if (!saved) throw new Error('Periods could not be saved to the school database.')
      }}
    />}
    {daysDialogOpen && <DaysDialog
      initialDays={data.days}
      initialDetails={data.dayDetails}
      onClose={() => setDaysDialogOpen(false)}
      onSave={async (entries: DayEntry[]) => {
        const days = entries.map(day => day.name.trim())
        const dayDetails = Object.fromEntries(entries.map(day => [day.name.trim(), { short: day.short, desc: day.desc, combinedDays: day.combinedDays }]))
        const renamedDays = new Map(entries.filter(day => day.originalName).map(day => [day.originalName as string, day.name.trim()]))
        const nextData: Workspace = { ...data, days, dayDetails, numberOfDays: days.length, lessons: data.lessons.map(lesson => ({ ...lesson, day: renamedDays.get(lesson.day) || lesson.day })) }
        if (await persistWorkspace(nextData, 'save school days')) setDaysDialogOpen(false)
      }}
    />}
    {breakDialog && <BreakEditorDialog value={breakDialog.form} lessonCount={data.periods.filter(p => p.type !== 'break').length} onChange={form => setBreakDialog(current => current ? {...current,form} : current)} onClose={() => setBreakDialog(null)} onSave={() => {
      const form = breakDialog.form;
      const minutes = (time: string) => { const parts = time.split(':').map(Number); return parts[0]*60+parts[1]; };
      const duration = minutes(form.end)-minutes(form.start);
      if (!form.name.trim() || duration <= 0) { setError('Enter a break name and an end time later than the start time.'); return; }
      setData(current => {
        const existing = breakDialog.index === null ? null : current.periods[breakDialog.index];
        const breakPeriod: Period = { ...(existing || {}), name: form.name.trim(), short: form.short.trim() || form.name.trim(), start: form.start, end: form.end, len: duration, type: 'break', position: form.position, textForPrintouts: form.textForPrintouts, printSummary: form.printSummary, printTeacher: form.printTeacher, printClass: form.printClass, printClassroom: form.printClassroom, printInBells: form.printInBells, doubleCannotSpan: form.doubleCannotSpan };
        if (breakDialog.index !== null) return {...current, periods: current.periods.map((p,i) => i === breakDialog.index ? breakPeriod : p)};
        const lessons = current.periods.filter(p => p.type !== 'break');
        const existingBreaks = current.periods.filter(p => p.type === 'break').map(p => p.position !== undefined ? p : ({...p, position: current.periods.slice(0, current.periods.indexOf(p)).filter(item => item.type !== 'break').length}));
        const breaks = [...existingBreaks, breakPeriod];
        const ordered: Period[] = [];
        for (let pos=0; pos<=lessons.length; pos++) {
          breaks.filter(b => (b.position === undefined ? lessons.length : b.position) === pos).forEach(b => ordered.push(b));
          if (pos < lessons.length) ordered.push(lessons[pos]);
        }
        const lessonsUpdated = current.lessons.map(lesson => {
          const old = current.periods[lesson.period];
          if (!old || old.type === 'break') return lesson;
          return {...lesson,period:Math.max(0,ordered.indexOf(old))};
        });
        return {...current, periods: ordered, lessons: lessonsUpdated};
      });
      setBreakDialog(null); setError(''); setStatus('Break configured · remember to Save');
    }} />}

    {!(settingsOpen && setupTab === 'subjects') && <section className="phikila-tt-grid-panel"><div className="phikila-tt-panel-heading"><div><h2>Weekly timetable</h2><p>Select a lesson to edit it, or choose an empty cell to add one.</p></div><div className="phikila-tt-grid-legend"><span><i className="legend-lesson" /> Lesson</span><span><i className="legend-locked" /> Locked ({data.lessons.filter(lesson => lesson.locked).length})</span><span className="phikila-tt-verification-indicator">Verification: {conflicts.length ? conflicts.length + ' potential conflict(s)' : 'No local conflicts'}</span></div></div><div className="phikila-tt-grid-scroll"><table className="phikila-tt-grid phikila-tt-grid-days-rows"><thead><tr><th className="period-col">Day</th>{data.periods.map((period, periodIndex) => <th key={period.name + periodIndex} className={(period.type === 'break' || /break|lunch|recess|games/i.test(period.name)) ? 'phikila-tt-break-heading' : ''}>{period.name}<small>{period.start}–{period.end}</small></th>)}</tr></thead><tbody>{data.days.map(day => <tr key={day}><th className="period-cell">{day}</th>{data.periods.map((period, periodIndex) => { const isBreak = period.type === 'break' || /break|lunch|recess|games/i.test(period.name); const lessons = visibleLessons.filter(lesson => lesson.day === day && lesson.period === periodIndex); return <td key={period.name + periodIndex} className={'phikila-tt-cell ' + (isBreak ? 'phikila-tt-break-cell' : '')}>{lessons.map(lesson => <button key={lesson.id} className={'phikila-tt-lesson ' + (lesson.locked ? 'is-locked' : '')} onClick={() => openEditor(day, periodIndex, lesson)}><span className="phikila-tt-lesson-class">{lesson.className}{lesson.locked ? ' · Locked' : ''}</span><strong>{lesson.subject}</strong><span>{lesson.teacher}</span>{lesson.room && <small>{lesson.room}</small>}</button>)}{!isBreak && <button className="phikila-tt-add-cell" onClick={() => openEditor(day, periodIndex)}>+ Add lesson</button>}{isBreak && <span className="phikila-tt-break-label">{period.name}</span>}</td> })}</tr>)}</tbody></table></div></section>}
    {!(settingsOpen && setupTab === 'subjects') && <footer className="phikila-tt-footer"><span>{status}</span><span>{conflicts.length ? conflicts.length + ' potential conflict(s)' : 'No local same-slot conflicts detected'}</span><button className="phikila-tt-button phikila-tt-button-primary" onClick={() => void save()}>Save workspace</button></footer>}
    {editor && <div className="phikila-tt-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditor(null) }}><section className="phikila-tt-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-editor-title"><div className="phikila-tt-panel-heading"><div><h2 id="lesson-editor-title">{editor.lesson ? 'Edit lesson' : 'Add lesson'}</h2><p>{editor.day} · {data.periods[editor.period]?.name}</p></div><button className="phikila-tt-button" onClick={() => setEditor(null)}>Close</button></div><form onSubmit={submitLesson}><label>Class<input required list="tt-classes" value={form.className} onChange={event => setForm(current => ({ ...current, className: event.target.value }))} /><datalist id="tt-classes">{classes.map(value => <option key={value} value={value} />)}</datalist></label><label>Subject<input required list="tt-subjects" value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} /><datalist id="tt-subjects">{subjects.map(value => <option key={value} value={value} />)}</datalist></label><label>Teacher<input required list="tt-teachers" value={form.teacher} onChange={event => setForm(current => ({ ...current, teacher: event.target.value }))} /><datalist id="tt-teachers">{teachers.map(value => <option key={value} value={value} />)}</datalist></label><label>Classroom<input list="tt-rooms" value={form.room} onChange={event => setForm(current => ({ ...current, room: event.target.value }))} /><datalist id="tt-rooms">{rooms.map(value => <option key={value} value={value} />)}</datalist></label><label className="phikila-tt-checkbox"><input type="checkbox" checked={form.locked} onChange={event => setForm(current => ({ ...current, locked: event.target.checked }))} /> Lock this lesson in place</label><div className="phikila-tt-modal-actions">{editor.lesson && <button type="button" className="phikila-tt-button phikila-tt-danger" onClick={deleteLesson}>Delete lesson</button>}<span /><button type="button" className="phikila-tt-button" onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="phikila-tt-button phikila-tt-button-primary">Save lesson</button></div></form></section></div>}
    {previewOpen && <div className="phikila-tt-modal-backdrop"><section className="phikila-tt-preview" role="dialog" aria-modal="true" aria-labelledby="tt-preview-title"><div className="phikila-tt-panel-heading"><div><h2 id="tt-preview-title">Print preview · {data.schoolName}</h2><p>Academic year {data.academicYear}</p></div><div><button className="phikila-tt-button" onClick={() => setPreviewOpen(false)}>Close</button> <button className="phikila-tt-button phikila-tt-button-primary" onClick={() => window.print()}>Print</button></div></div><div className="phikila-tt-grid-scroll"><table className="phikila-tt-grid"><thead><tr><th>Period</th>{data.days.map(day => <th key={day}>{day}</th>)}</tr></thead><tbody>{data.periods.map((period, index) => <tr key={period.name + index}><th>{period.name}<small>{period.start}–{period.end}</small></th>{data.days.map(day => <td key={day}>{data.lessons.filter(lesson => lesson.day === day && lesson.period === index).map(lesson => <div className="phikila-tt-print-lesson" key={lesson.id}><strong>{lesson.className} · {lesson.subject}</strong><br />{lesson.teacher}{lesson.room ? ' · ' + lesson.room : ''}</div>)}</td>)}</tr>)}</tbody></table></div></section></div>}
    {advisorOpen && <AdvisorDialog classes={classes} lessons={data.lessons} days={data.days} periods={data.periods} onClose={() => setAdvisorOpen(false)} />}
    {generateNewAdvisorOpen && <GenerateNewAdvisor classes={classes} lessons={data.lessons} days={data.days} periods={data.periods} classDetails={data.classDetails || {}} teacherDetails={data.teacherDetails || {}} subjectDetails={data.subjectDetails || {}} onGenerate={() => { const result = generateSchedule(data); if (result.error) { setError(result.error); setStatus('Generation stopped · existing timetable preserved'); setGenerateNewAdvisorOpen(false) } else { setData(current => ({ ...current, lessons: result.lessons })); setError(''); setStatus('Generated a conflict-free draft for ' + result.lessons.length + ' lessons · review and Save'); setGenerateNewAdvisorOpen(false) } }} onClose={() => setGenerateNewAdvisorOpen(false)} />}
    <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={event => { openJson(event.target.files?.[0]); event.currentTarget.value = '' }} />
  </main>
}

type BreakForm = { name: string; short: string; position: number; start: string; end: string; textForPrintouts: string; printSummary: boolean; printTeacher: boolean; printClass: boolean; printClassroom: boolean; printInBells: string; doubleCannotSpan: boolean }
function makeBreakForm(): BreakForm { return {name:'',short:'',position:1,start:'10:20',end:'10:50',textForPrintouts:'',printSummary:true,printTeacher:true,printClass:true,printClassroom:true,printInBells:'All classes',doubleCannotSpan:true} }
function periodToBreakForm(period: Period): BreakForm { return {name:period.name,short:period.short || period.name,position:period.position ?? 1,start:period.start,end:period.end,textForPrintouts:period.textForPrintouts || '',printSummary:period.printSummary ?? true,printTeacher:period.printTeacher ?? true,printClass:period.printClass ?? true,printClassroom:period.printClassroom ?? true,printInBells:period.printInBells || 'All classes',doubleCannotSpan:period.doubleCannotSpan ?? true} }

function SubjectEditorDialog({value,classrooms,mode,onChange,onClose,onSave}:{value:SubjectForm;classrooms:string[];mode:'new'|'edit';onChange:(value:SubjectForm)=>void;onClose:()=>void;onSave:()=>void}) {
 const update=<K extends keyof SubjectForm,>(key:K,next:SubjectForm[K])=>onChange({...value,[key]:next});
 return <div className="phikila-tt-modal-backdrop"><section className="phikila-tt-subject-dialog" role="dialog" aria-modal="true" aria-labelledby="tt-subject-dialog-title"><header><strong id="tt-subject-dialog-title">Subject - {mode==='edit'?'Edit':'New'}</strong><button type="button" onClick={onClose}>×</button></header><div className="phikila-tt-subject-dialog-body">
 <label>Subject title<input autoFocus value={value.title} onChange={e=>update('title',e.target.value)}/></label><label>Short<input value={value.short} onChange={e=>update('short',e.target.value)}/></label>
 <details><summary>Custom fields</summary><label>Custom field notes<textarea value={value.customFields} onChange={e=>update('customFields',e.target.value)} placeholder="Optional subject notes"/></label></details>
 <fieldset><legend>Color / Picture</legend><div className="phikila-tt-subject-color-picker"><div style={{background:value.color}}/><input aria-label="Subject color" type="color" value={value.color} onChange={e=>update('color',e.target.value)}/><span>{value.color.toUpperCase()}</span></div></fieldset>
 <fieldset><legend>Classrooms</legend><div className="phikila-tt-subject-classrooms">{classrooms.length?classrooms.map(room=><label key={room}><input type="checkbox" checked={value.classrooms.includes(room)} onChange={e=>update('classrooms',e.target.checked?[...value.classrooms,room]:value.classrooms.filter(item=>item!==room))}/>{room}</label>):<p>Add classrooms under School settings first.</p>}</div><button type="button" className="phikila-tt-button" onClick={()=>update('classrooms',[...classrooms])}>Select all classrooms</button></fieldset>
 <label>Number<input value={value.number} onChange={e=>update('number',e.target.value)}/></label></div><footer><button className="phikila-tt-button" onClick={onClose}>Cancel</button><button className="phikila-tt-button phikila-tt-button-primary" onClick={onSave}>OK</button></footer></section></div>
}

function BreakEditorDialog({value,lessonCount,onChange,onClose,onSave}:{value:BreakForm;lessonCount:number;onChange:(value:BreakForm)=>void;onClose:()=>void;onSave:()=>void}) {
  const update = <K extends keyof BreakForm,>(key:K,next:BreakForm[K]) => onChange({...value,[key]:next});
  const minutes = (time:string) => { const parts=time.split(':').map(Number); return parts[0]*60+parts[1]; };
  return <div className="phikila-tt-break-backdrop" role="presentation"><section className="phikila-tt-break-dialog" role="dialog" aria-modal="true" aria-labelledby="phikila-break-title">
    <header className="phikila-tt-break-dialog-header"><h2 id="phikila-break-title">Period · Break settings</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
    <div className="phikila-tt-break-dialog-body">
      <label>Name of the break<input autoFocus value={value.name} onChange={e=>update('name',e.target.value)} /></label>
      <label>Short<input value={value.short} onChange={e=>update('short',e.target.value)} /></label>
      <label>Break position<select value={value.position} onChange={e=>update('position',Number(e.target.value))}>{Array.from({length:lessonCount+1},(_,i)=><option key={i} value={i}>Before period {i}{i===0?' (start of day)':' (lesson '+i+')'}</option>)}</select></label>
      <fieldset><legend>Start / End</legend><div className="phikila-tt-break-time"><input aria-label="Break starts" type="time" value={value.start} onChange={e=>update('start',e.target.value)}/><input aria-label="Break ends" type="time" value={value.end} onChange={e=>update('end',e.target.value)}/><span>{minutes(value.end)-minutes(value.start)} min</span></div></fieldset>
      <fieldset><legend>Break</legend><label>Text for printouts<input value={value.textForPrintouts} onChange={e=>update('textForPrintouts',e.target.value)}/></label></fieldset>
      <fieldset><legend>Printouts</legend>
        {([['printSummary','Print in summary timetables'],['printTeacher',"Print in individual teachers' timetables"],['printClass','Print in individual class timetables'],['printClassroom','Print in individual classroom timetables']] as const).map(([key,label])=><label className="phikila-tt-break-check" key={key}><input type="checkbox" checked={value[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}
        <label>Print in bells<select value={value.printInBells} onChange={e=>update('printInBells',e.target.value)}><option>All classes</option><option>Selected classes</option><option>None</option></select></label>
      </fieldset>
      <label className="phikila-tt-break-check"><input type="checkbox" checked={value.doubleCannotSpan} onChange={e=>update('doubleCannotSpan',e.target.checked)}/>Double lessons cannot span this break.</label>
    </div>
    <footer className="phikila-tt-break-dialog-footer"><button className="phikila-tt-button phikila-tt-button-primary" onClick={onSave}>OK</button><button className="phikila-tt-button" onClick={onClose}>Cancel</button></footer>
  </section></div>
}

function normaliseWorkspace(value: Partial<Workspace>): Workspace {
  const days = Array.isArray(value.days) && value.days.length ? value.days.filter(day => typeof day === 'string' && day.trim()) : [...DAYS]
  const periods = Array.isArray(value.periods) && value.periods.length ? value.periods.filter(period => period && typeof period.name === 'string').map(period => ({ ...period, name: period.name, start: period.start || '', end: period.end || '', type: period.type === 'break' || /break|lunch|recess|games/i.test(period.name) ? 'break' as const : 'lesson' as const })) : DEFAULT_PERIODS.map(period => ({ ...period }))
  const lessons = Array.isArray(value.lessons) ? value.lessons.filter(lesson => lesson && typeof lesson.day === 'string' && Number.isInteger(lesson.period) && lesson.period >= 0 && lesson.period < periods.length && lesson.className && lesson.subject && lesson.teacher).map(lesson => ({ id: String(lesson.id || makeId()), day: lesson.day, period: lesson.period, className: String(lesson.className), subject: String(lesson.subject), teacher: String(lesson.teacher), room: String(lesson.room || ''), locked: Boolean(lesson.locked) })) : []
  const rawSpec = value.specification as Partial<Specification> | undefined
  const specification: Specification = {
    subjects: Array.isArray(rawSpec?.subjects) ? unique(rawSpec.subjects.filter(item => typeof item === 'string')) : [...EMPTY.specification.subjects],
    classes: Array.isArray(rawSpec?.classes) ? unique(rawSpec.classes.filter(item => typeof item === 'string')) : [...EMPTY.specification.classes],
    teachers: Array.isArray(rawSpec?.teachers) ? unique(rawSpec.teachers.filter(item => typeof item === 'string')) : [...EMPTY.specification.teachers],
    classrooms: Array.isArray(rawSpec?.classrooms) ? unique(rawSpec.classrooms.filter(item => typeof item === 'string')) : [...EMPTY.specification.classrooms],
  }
  return { dayDetails: value.dayDetails && typeof value.dayDetails === 'object' ? value.dayDetails : {}, classDetails: value.classDetails && typeof value.classDetails === 'object' ? value.classDetails as Record<string, ClassDetail> : {}, schoolName: String(value.schoolName || EMPTY.schoolName), academicYear: String(value.academicYear || EMPTY.academicYear), registrationName: String(value.registrationName || ''), subjectDetails: value.subjectDetails && typeof value.subjectDetails === 'object' ? value.subjectDetails : {}, teacherDetails: value.teacherDetails && typeof value.teacherDetails === 'object' ? value.teacherDetails : {}, periodsPerDay: Number(value.periodsPerDay) || Math.max(1, periods.filter(period => period.type !== 'break' && !/break|lunch|recess|games/i.test(period.name)).length), numberOfDays: Number(value.numberOfDays) || days.length, weekend: String(value.weekend || 'Saturday - Sunday'), workZero: Boolean(value.workZero), days, periods, lessons, specification }
}
function findConflicts(data: Workspace): string[] {
  const issues: string[] = []
  data.lessons.forEach((first, index) => data.lessons.slice(index + 1).forEach(second => {
    if (first.day !== second.day || first.period !== second.period) return
    if (first.className === second.className) issues.push(first.day + ' · ' + data.periods[first.period]?.name + ': ' + first.className + ' has overlapping lessons')
    if (first.teacher === second.teacher) issues.push(first.day + ' · ' + data.periods[first.period]?.name + ': ' + first.teacher + ' is double-booked')
    if (first.room && first.room === second.room) issues.push(first.day + ' · ' + data.periods[first.period]?.name + ': ' + first.room + ' is double-booked')
  }))
  return Array.from(new Set(issues))
}

type GenerationResult = { lessons: Lesson[]; error?: string }

/** Greedy, constraint-aware draft placement. Locked lessons are never moved. */
function generateSchedule(data: Workspace): GenerationResult {
  const locked = data.lessons.filter(lesson => lesson.locked)
  const movable = data.lessons.filter(lesson => !lesson.locked)
  const lockedConflicts = findConflicts({ ...data, lessons: locked })
  if (lockedConflicts.length) {
    return { lessons: data.lessons, error: 'Locked lessons conflict with each other. Resolve these first: ' + lockedConflicts.slice(0, 3).join(' · ') }
  }
  const lockedTimeOffConflicts = locked.filter(lesson => {
    const dayIndex = data.days.indexOf(lesson.day)
    if (dayIndex < 0) return false
    return data.classDetails?.[lesson.className]?.timeOffGrid?.[dayIndex]?.[lesson.period] === 2
      || data.teacherDetails?.[lesson.teacher]?.timeOffGrid?.[dayIndex]?.[lesson.period] === 2
      || data.subjectDetails?.[lesson.subject]?.timeOffGrid?.[dayIndex]?.[lesson.period] === 2
  })
  if (lockedTimeOffConflicts.length) {
    return { lessons: data.lessons, error: 'Locked lessons fall inside configured class, teacher, or subject time-off. Resolve those constraints first: ' + lockedTimeOffConflicts.slice(0, 3).map(lesson => lesson.className + ' · ' + lesson.subject + ' · ' + lesson.day).join(' · ') }
  }

  const usablePeriods = data.periods.map((period, index) => ({ period, index }))
    .filter(({ period }) => !/break|lunch|recess/i.test(period.name))
    .map(({ index }) => index)
  const slots = data.days.flatMap(day => usablePeriods.map(period => ({ day, period })))
  if (!slots.length && movable.length) {
    return { lessons: data.lessons, error: 'No teaching periods are available. Rename break/lunch rows or add a teaching period.' }
  }

  const placed: Lesson[] = [...locked]
  const resourceCount = (lesson: Lesson) => movable.filter(other =>
    other.id !== lesson.id && (other.className === lesson.className || other.teacher === lesson.teacher || (!!lesson.room && other.room === lesson.room))
  ).length
  const ordered = [...movable].sort((a, b) => resourceCount(b) - resourceCount(a))
  const isUnavailable = (lesson: Lesson, day: string, period: number) => {
    const dayIndex = data.days.indexOf(day)
    if (dayIndex < 0) return true
    return data.classDetails?.[lesson.className]?.timeOffGrid?.[dayIndex]?.[period] === 2
      || data.teacherDetails?.[lesson.teacher]?.timeOffGrid?.[dayIndex]?.[period] === 2
      || data.subjectDetails?.[lesson.subject]?.timeOffGrid?.[dayIndex]?.[period] === 2
  }
  const conflictsAt = (lesson: Lesson, day: string, period: number) => placed.some(other =>
    other.day === day && other.period === period &&
    (other.className === lesson.className || other.teacher === lesson.teacher || (!!lesson.room && other.room === lesson.room))
  )
  const score = (lesson: Lesson, day: string, period: number) => {
    const sameClassDay = placed.filter(item => item.className === lesson.className && item.day === day).length
    const sameTeacherDay = placed.filter(item => item.teacher === lesson.teacher && item.day === day).length
    const slotLoad = placed.filter(item => item.day === day && item.period === period).length
    return sameClassDay * 100 + sameTeacherDay * 20 + slotLoad
  }

  const unscheduled: Lesson[] = []
  for (const lesson of ordered) {
    const candidates = slots
      .filter(slot => !isUnavailable(lesson, slot.day, slot.period) && !conflictsAt(lesson, slot.day, slot.period))
      .sort((a, b) => score(lesson, a.day, a.period) - score(lesson, b.day, b.period))
    const slot = candidates[0]
    if (!slot) {
      unscheduled.push(lesson)
      continue
    }
    placed.push({ ...lesson, day: slot.day, period: slot.period })
  }
  if (unscheduled.length) {
    return {
      lessons: data.lessons,
      error: 'Could not place ' + unscheduled.length + ' lesson(s) without class, teacher, or room clashes. Existing timetable was left unchanged; add teaching periods or review resource assignments.',
    }
  }
  return { lessons: placed }
}




type NewLessonDraft = { teacher: string; subject: string; class: string; count: number; length: string; room: string; homeClassroom: boolean }
function NewLessonDialog({ defaultTeacher, subjects, classes, teachers, classrooms, teacherDetails, onSave, onCancel }: { defaultTeacher: { name: string; short: string }; subjects: string[]; classes: string[]; teachers: string[]; classrooms: string[]; teacherDetails: Record<string, TeacherDetail>; onSave: (lesson: NewLessonDraft) => void; onCancel: () => void }) {
  const [teacher, setTeacher] = useState(defaultTeacher.name)
  const [subject, setSubject] = useState('')
  const [className, setClassName] = useState('')
  const [count, setCount] = useState('1')
  const [length, setLength] = useState('Single')
  const [homeClassroom, setHomeClassroom] = useState(true)
  const [sharedRoom, setSharedRoom] = useState(false)
  const [teacherRooms, setTeacherRooms] = useState(false)
  const [subjectRooms, setSubjectRooms] = useState(false)
  const [room, setRoom] = useState('')
  const [otherRoom, setOtherRoom] = useState('Other available classrooms')
  const [error, setError] = useState('')
  const teacherOptions = unique([defaultTeacher.name, ...teachers]).map(name => ({name, short: teacherDetails[name]?.short || (name === defaultTeacher.name ? defaultTeacher.short : '')}))
  const selectedRoom = room || (otherRoom !== 'Other available classrooms' ? otherRoom : '')
  const submit = () => { if (!subject) { setError('Select subject'); return } if (!className) { setError('Select class'); return } if (!teacher) { setError('Select teacher'); return } onSave({teacher, subject, class:className, count:Number(count), length, room:selectedRoom === 'Other available classrooms' ? '' : selectedRoom, homeClassroom}) }
  return <div className="phikila-tt-teachers-overlay" role="dialog" aria-modal="true" aria-label="New lesson" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="phikila-tt-new-lesson-window"><header className="phikila-tt-teachers-title"><strong>◫ Lesson</strong><button type="button" onClick={onCancel} aria-label="Close lesson dialog">×</button></header>
      <div className="phikila-tt-new-lesson-body">
        <div className="phikila-tt-new-lesson-card"><span className="phikila-tt-new-lesson-icon">♟</span><div className="phikila-tt-new-lesson-content"><label>Teacher</label><div className="phikila-tt-new-lesson-row"><select value={teacher} onChange={event => setTeacher(event.target.value)}>{teacherOptions.map(item => <option key={item.name} value={item.name}>{item.name}{item.short ? ' ('+item.short+')' : ''}</option>)}</select><button type="button" onClick={() => setTeacher(teacherOptions.find(item => item.name !== teacher)?.name || teacher)}>More teachers</button></div></div></div>
        <div className="phikila-tt-new-lesson-card"><span className="phikila-tt-new-lesson-icon">▣</span><div className="phikila-tt-new-lesson-content"><label>Subject</label><select value={subject} onChange={event => setSubject(event.target.value)}><option value="">Select subject</option>{subjects.map(item => <option key={item}>{item}</option>)}</select></div></div>
        <div className="phikila-tt-new-lesson-card"><span className="phikila-tt-new-lesson-icon">♧</span><div className="phikila-tt-new-lesson-content"><label>Class</label><select value={className} onChange={event => setClassName(event.target.value)}><option value="">Select class</option>{classes.map(item => <option key={item}>{item}</option>)}</select><button type="button" onClick={() => setError('Joint classes are not configured in the current timetable data model.')}>Joint classes</button></div></div>
        <div className="phikila-tt-new-lesson-card"><span className="phikila-tt-new-lesson-icon">▦</span><div className="phikila-tt-new-lesson-content"><label>Lessons/week</label><div className="phikila-tt-new-lesson-row"><select value={count} onChange={event => setCount(event.target.value)}>{Array.from({length:10},(_,i)=>String(i+1)).map(n=><option key={n}>{n}</option>)}</select><select value={length} onChange={event => setLength(event.target.value)}><option>Single</option><option>Double</option><option>Triple</option></select><span>Length applies to consecutive periods.</span></div></div></div>
        <div className="phikila-tt-new-lesson-card"><span className="phikila-tt-new-lesson-icon">⌂</span><div className="phikila-tt-new-lesson-content"><label>Classrooms</label><div className="phikila-tt-new-lesson-checks"><label><input type="checkbox" checked={homeClassroom} onChange={event => setHomeClassroom(event.target.checked)} /> Home classroom</label><label><input type="checkbox" checked={teacherRooms} onChange={event => setTeacherRooms(event.target.checked)} /> Teacher's classrooms</label><label><input type="checkbox" checked={sharedRoom} onChange={event => setSharedRoom(event.target.checked)} /> Shared room</label><label><input type="checkbox" checked={subjectRooms} onChange={event => setSubjectRooms(event.target.checked)} /> Subject's classrooms</label></div><div className="phikila-tt-new-lesson-row"><select value={room} onChange={event => setRoom(event.target.value)}><option value="">Choose classroom</option>{classrooms.map(item => <option key={item}>{item}</option>)}</select><input value={otherRoom} onChange={event => setOtherRoom(event.target.value)} aria-label="Other classroom" /></div><p className="phikila-tt-new-lesson-note">The timetable stores one classroom per lesson. Classroom preference checkboxes are not saved separately.</p></div></div>
        {error && <p className="phikila-tt-new-lesson-error" role="alert">{error}</p>}
      </div><footer className="phikila-tt-new-lesson-footer"><button type="button" onClick={onCancel}>Cancel</button><span /><button type="button" onClick={submit}>OK</button></footer>
    </section>
  </div>
}

type ContractLesson = Lesson
function TeacherContractDialog({ teacher, short, lessons, periods, subjects, classes, teachers, classrooms, teacherDetails, onClose, onNew, onEdit, onRemove, onCopyTo }: { teacher: string; short: string; lessons: ContractLesson[]; periods: Period[]; subjects: string[]; classes: string[]; teachers: string[]; classrooms: string[]; teacherDetails: Record<string, TeacherDetail>; onClose: () => void; onNew: () => void; onEdit: (lesson: ContractLesson) => void; onRemove: (lesson: ContractLesson) => void; onCopyTo: (lesson: ContractLesson, targetClass: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(lessons[0]?.id || null)
  const selectedLesson = lessons.find(lesson => lesson.id === selectedId)
  const weeklyCount = (lesson: ContractLesson) => lessons.filter(item => item.subject === lesson.subject && item.className === lesson.className).length
  const lengthLabel = (lesson: ContractLesson) => {
    const adjacent = lessons.some(item => item.id !== lesson.id && item.subject === lesson.subject && item.className === lesson.className && item.day === lesson.day && Math.abs(item.period - lesson.period) === 1)
    return adjacent ? 'Double' : 'Single'
  }
  const copyTo = () => {
    if (!selectedLesson) return
    const target = window.prompt('Copy this lesson to which class?', classes.find(name => name !== selectedLesson.className) || '')
    if (!target) return
    if (!classes.includes(target)) { window.alert('Choose a class from the configured class list.'); return }
    if (target === selectedLesson.className) { window.alert('Choose a different class.'); return }
    onCopyTo(selectedLesson, target)
  }
  return <div className="phikila-tt-teachers-overlay phikila-tt-contract-overlay" role="dialog" aria-modal="true" aria-label={teacher + ' contract'} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="phikila-tt-contract-window">
      <header className="phikila-tt-teachers-title"><strong>Contract</strong><button type="button" onClick={onClose} aria-label="Close contract">×</button></header>
      <div className="phikila-tt-contract-header"><span className="phikila-tt-contract-cap" aria-hidden="true">♟</span><div><strong>{teacher}</strong><span>{teacherDetails[teacher]?.number || short || 'Teacher contract and assigned lessons'}</span></div></div>
      <div className="phikila-tt-contract-table-wrap"><table className="phikila-tt-contract-table"><thead><tr><th>Subject</th><th>Teacher</th><th>Class</th><th>Day</th><th>Period</th><th>Count</th><th>Length</th><th>Classroom</th></tr></thead><tbody>
        {lessons.map(lesson => <tr key={lesson.id} onClick={() => setSelectedId(lesson.id)} onDoubleClick={() => onEdit(lesson)} title="Double-click to edit this timetable entry" className={selectedId === lesson.id ? 'is-selected' : ''}><td><span className="phikila-tt-contract-code">{lesson.subject}</span></td><td>{lesson.teacher}</td><td>{lesson.className}</td><td>{lesson.day}</td><td>{periods[lesson.period]?.name || 'Period ' + (lesson.period + 1)}</td><td className="phikila-tt-contract-center">{weeklyCount(lesson)}</td><td>{lengthLabel(lesson)}</td><td>{lesson.room || '—'}</td></tr>)}
      </tbody></table>{lessons.length === 0 && <p className="phikila-tt-teachers-empty">No timetable lessons are assigned to this teacher yet. Choose New lesson to add one.</p>}</div>
      <footer className="phikila-tt-contract-footer"><button type="button" onClick={onNew}>New lesson</button><button type="button" disabled={!selectedLesson} onClick={() => selectedLesson && onEdit(selectedLesson)}>Edit lesson</button><button type="button" disabled={!selectedLesson} onClick={() => { if (selectedLesson && window.confirm('Remove this lesson from the timetable?')) onRemove(selectedLesson) }}>Remove</button><button type="button" disabled={!selectedLesson || classes.length < 2} onClick={copyTo}>Copy to</button><button type="button" onClick={onNew}>Add more</button><span /><button type="button" onClick={onClose}>Close</button></footer>
    </section>
  </div>
}

type TeacherDraft = TeacherDetail & { name: string; savedWorkload?: number }
type SavedTeacherSource = { id?: string | number; name?: string; first_name?: string; last_name?: string; firstName?: string; lastName?: string; staff_number?: string; subject_specialization?: string; subject?: string; short?: string; code?: string; color?: string; email?: string; phone?: string; count?: number | string; workload?: number | string; profile?: Record<string, unknown> }
function TeachersWorkspaceModule({ teachers, lessons, details, savedWorkloads = {}, onClose, onSaveAll, onOpenContract, days, periods }: { teachers: string[]; lessons: Lesson[]; details: Record<string, TeacherDetail>; savedWorkloads?: Record<string, number>; onClose: () => void; onSaveAll: (teachers: string[], details: Record<string, TeacherDetail>) => Promise<boolean | void>; onOpenContract: (teacher: string) => void; days: string[]; periods: Period[] }) {
  const blankDetail = (): TeacherDetail => ({ firstName: '', short: '', color: '#1e40af', classTeacher: '', contract: '', email: '', phone: '', title1: '', title2: '', number: '', male: false, timeOffGrid: days.map(() => periods.map(() => 0)) })
  const initialRecords = teachers.map(name => ({ name, ...blankDetail(), ...(details[name] || {}), savedWorkload: savedWorkloads[name] }))
  const [records, setRecords] = useState<TeacherDraft[]>(initialRecords)
  const initialSnapshot = useRef(JSON.stringify(initialRecords))
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState('')
  const [selected, setSelected] = useState(0)
  const [mode, setMode] = useState<'list' | 'edit' | 'timeoff'>('list')
  const [draft, setDraft] = useState<TeacherDraft | null>(null)
  const [editingExisting, setEditingExisting] = useState(false)
  const [timeOff, setTimeOff] = useState<number[][]>([])
  const selectedRecord = records[selected]
  const startNew = () => { setEditingExisting(false); setDraft({ name: '', ...blankDetail() }); setMode('edit') }
  const startEdit = () => { if (selectedRecord) { const lastName = selectedRecord.firstName && selectedRecord.name.toLowerCase().startsWith(selectedRecord.firstName.toLowerCase() + ' ') ? selectedRecord.name.slice(selectedRecord.firstName.length).trim() : selectedRecord.name; setEditingExisting(true); setDraft({ ...selectedRecord, name: lastName }); setMode('edit') } }
  const persistRecords = async (nextRecords: TeacherDraft[], closeOnSuccess = false) => {
    if (saving) return false
    setSaving(true)
    setSaveFeedback('Saving teacher records to the database…')
    try {
      const nextTeachers = nextRecords.map(teacher => teacher.name.trim())
      const nextDetails: Record<string, TeacherDetail> = {}
      nextRecords.forEach(({ name, savedWorkload: _savedWorkload, ...detail }) => { nextDetails[name.trim()] = detail })
      const confirmed = await onSaveAll(nextTeachers, nextDetails)
      if (confirmed === false) { setSaveFeedback('Save was not confirmed. Your changes are still here; retry Save All.') ; return false }
      initialSnapshot.current = JSON.stringify(nextRecords)
      setSaveFeedback('Saved and verified in the school database.')
      if (closeOnSuccess) onClose()
      return true
    } catch (caught) {
      setSaveFeedback('Save failed. Your edits remain in this window. Retry Save All. ' + (caught instanceof Error ? caught.message : ''))
      return false
    } finally { setSaving(false) }
  }
  const saveDraft = () => {
    if (!draft?.name.trim() && !draft?.firstName.trim()) { window.alert('Enter a first name or last name'); return }
    const next = [...records]
    const fullName = `${draft.firstName.trim()} ${draft.name.trim()}`.trim()
    if (records.some((teacher, index) => index !== selected && teacher.name.toLowerCase() === fullName.toLowerCase())) { window.alert('A teacher with that name already exists'); return }
    const clean = { ...draft, name: fullName }
    if (editingExisting && selectedRecord) next[selected] = clean
    else next.push(clean)
    setRecords(next); setSelected(editingExisting && selectedRecord ? selected : next.length - 1); setMode('list'); setDraft(null)
    void persistRecords(next)
  }
  const openTimeOff = () => { if (!selectedRecord) return; setTimeOff(days.map((_, row) => periods.map((_, column) => selectedRecord.timeOffGrid[row]?.[column] ?? 0))); setMode('timeoff') }
  const saveTimeOff = () => { const next = records.map((teacher, index) => index === selected ? { ...teacher, timeOffGrid: timeOff } : teacher); setRecords(next); setMode('list'); void persistRecords(next) }
  const hasUnsavedChanges = () => JSON.stringify(records) !== initialSnapshot.current
  const closeList = () => {
    if (saving) return
    if (hasUnsavedChanges() && !window.confirm('You have teacher changes that are not saved to the database. Close without saving?')) return
    onClose()
  }
  const leaveEdit = () => {
    if (draft && !window.confirm('Discard the current unsaved teacher edits?')) return
    setDraft(null); setMode('list')
  }
  const saveAll = async () => { await persistRecords(records, true) }
  return <div className="phikila-tt-teachers-overlay" role="dialog" aria-modal="true" aria-label="Teachers">
    <section className="phikila-tt-teachers-window">
      <header className="phikila-tt-teachers-title"><strong>{mode === 'timeoff' ? 'Time off' : mode === 'edit' ? 'Teacher' : 'Teachers'}</strong><button type="button" onClick={mode === 'list' ? closeList : leaveEdit} aria-label="Close" disabled={saving}>×</button></header>
      {mode === 'list' && <>
        <div className="phikila-tt-teachers-caption">Enter teachers · changes auto-save when you confirm an edit. Use Save All &amp; Close to verify and finish.</div>
        {saveFeedback && <p role="status" aria-live="polite" style={{margin:'8px 0',padding:'8px 10px',borderRadius:5,background:saveFeedback.startsWith('Save was not confirmed') || saveFeedback.startsWith('Save failed') ? '#fff1f2' : '#eff6ff',color:saveFeedback.startsWith('Save was not confirmed') || saveFeedback.startsWith('Save failed') ? '#9f1239' : '#1e40af',fontSize:12}}>{saveFeedback}</p>}
        <div className="phikila-tt-teachers-body"><div className="phikila-tt-teachers-table-wrap"><table className="phikila-tt-teachers-table"><thead><tr><th>Name</th><th>Short</th><th>Count</th><th>Time off</th><th>Class teacher</th><th>App</th></tr></thead><tbody>
          {records.map((teacher, index) => <tr key={teacher.name} onClick={() => setSelected(index)} onDoubleClick={() => { setSelected(index); onOpenContract(teacher.name) }} title="Double-click to open teacher contract" className={selected === index ? 'is-selected' : ''}><td><span className="phikila-tt-teacher-color" style={{ background: teacher.color }} />{teacher.firstName && !teacher.name.toLowerCase().startsWith(teacher.firstName.toLowerCase() + ' ') ? teacher.firstName + ' ' + teacher.name : teacher.name}</td><td>{teacher.short}</td><td>{(lessons.filter(lesson => lesson.teacher === teacher.name || lesson.teacher.startsWith(teacher.name + ' (')).length || teacher.savedWorkload || 0)}</td><td><span className="phikila-tt-timeoff-preview">{teacher.timeOffGrid.flat().filter(value => value === 2).length} unavailable</span></td><td>{teacher.classTeacher}</td><td><span title="Teacher profile is stored in the school workspace">✓</span></td></tr>)}
        </tbody></table>{records.length === 0 && <p className="phikila-tt-teachers-empty">No teachers are configured yet. Select New to add one.</p>}</div>
        <aside className="phikila-tt-teachers-actions"><button type="button" onClick={startNew}>＋ New</button><button type="button" disabled={!selectedRecord} onClick={startEdit}>Edit</button><button type="button" disabled={!selectedRecord || saving} onClick={() => { const next = records.filter((_, index) => index !== selected); setRecords(next); setSelected(Math.max(0, selected - 1)); void persistRecords(next) }}>− Remove</button><div className="phikila-tt-teachers-spacer" /><button type="button" disabled={!selectedRecord} onClick={() => selectedRecord && onOpenContract(selectedRecord.name)}>Lessons</button><button type="button" disabled={!selectedRecord} onClick={openTimeOff}>Time off</button><button type="button" disabled={!selectedRecord || saving} onClick={() => { const name = window.prompt('Class teacher for class', selectedRecord?.classTeacher || ''); if (name !== null && selectedRecord) { const next = records.map((teacher, index) => index === selected ? { ...teacher, classTeacher: name } : teacher); setRecords(next); void persistRecords(next) } }}>Class teacher</button><button type="button" className="is-primary" onClick={() => void saveAll()} disabled={saving}>{saving ? 'Saving and verifying…' : 'Save All &amp; Close'}</button></aside></div>
      </>}
      {mode === 'edit' && draft && <div className="phikila-tt-teacher-form">
        <label>Last name / teacher name<input autoFocus value={draft.name} onChange={event => setDraft(current => current ? { ...current, name: event.target.value, short: current.short || event.target.value.substring(0, 4).toUpperCase() } : current)} /></label>
        <label>First name<input value={draft.firstName} onChange={event => setDraft(current => current ? { ...current, firstName: event.target.value } : current)} /></label>
        <label>Short<input value={draft.short} onChange={event => setDraft(current => current ? { ...current, short: event.target.value } : current)} /></label>
        <label>Teacher's contract<input value={draft.contract} onChange={event => setDraft(current => current ? { ...current, contract: event.target.value } : current)} /></label>
        <label>E-mail<input type="email" value={draft.email} onChange={event => setDraft(current => current ? { ...current, email: event.target.value } : current)} /></label>
        <label>Phone<input value={draft.phone} onChange={event => setDraft(current => current ? { ...current, phone: event.target.value } : current)} /></label>
        <label>Title<input value={draft.title1} onChange={event => setDraft(current => current ? { ...current, title1: event.target.value } : current)} /></label>
        <label>Title 2<input value={draft.title2} onChange={event => setDraft(current => current ? { ...current, title2: event.target.value } : current)} /></label>
        <label>Number<input value={draft.number} onChange={event => setDraft(current => current ? { ...current, number: event.target.value } : current)} /></label>
        <label>Class teacher for class<input value={draft.classTeacher} onChange={event => setDraft(current => current ? { ...current, classTeacher: event.target.value } : current)} /></label>
        <label>Color<input type="color" value={draft.color} onChange={event => setDraft(current => current ? { ...current, color: event.target.value } : current)} /></label>
        <div className="phikila-tt-teacher-form-actions"><button type="button" onClick={leaveEdit}>Cancel</button><button type="button" className="is-primary" onClick={saveDraft} disabled={saving}>{saving ? 'Saving…' : 'OK'}</button></div>
      </div>}
      {mode === 'timeoff' && <div className="phikila-tt-teacher-timeoff"><p>Click a cell to cycle available, conditional, and unavailable.</p><div className="phikila-tt-teacher-time-grid" style={{ gridTemplateColumns: `72px repeat(${Math.max(1, periods.length)}, minmax(30px, 1fr))` }}><div />{periods.map((period, index) => <strong key={index} title={period.name}>{period.short || period.name || String(index + 1)}</strong>)}{days.map((day, row) => <><strong key={day}>{day.slice(0, 3)}</strong>{(timeOff[row] || []).map((value, column) => <button type="button" key={column} title={value === 0 ? 'Available' : value === 1 ? 'Conditional' : 'Unavailable'} onClick={() => setTimeOff(current => current.map((values, r) => r === row ? values.map((cell, c) => c === column ? (cell + 1) % 3 : cell) : values))}>{value === 0 ? '✓' : value === 1 ? '?' : '×'}</button>)}</>)}</div><div className="phikila-tt-teacher-form-actions"><button type="button" onClick={() => setMode('list')}>Cancel</button><button type="button" className="is-primary" onClick={saveTimeOff}>OK</button></div></div>}
    </section>
  </div>
}


function SubjectLessonsDialog({ subject, lessons, onClose, onEdit, onNew }: { subject: string; lessons: Lesson[]; onClose: () => void; onEdit: (lesson: Lesson) => void; onNew: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(lessons[0]?.id || null)
  const selectedLesson = lessons.find(lesson => lesson.id === selectedId)
  return <div className="phikila-tt-teachers-overlay" role="dialog" aria-modal="true" aria-label={"Lessons for " + subject}>
    <section className="phikila-tt-teachers-window">
      <header className="phikila-tt-teachers-title"><strong>Lessons for subject · {subject}</strong><button type="button" onClick={onClose} aria-label="Close">×</button></header>
      <div className="phikila-tt-teachers-caption">Saved timetable lessons for this subject. Edit opens the existing timetable lesson editor.</div>
      <div className="phikila-tt-teachers-table-wrap"><table className="phikila-tt-teachers-table"><thead><tr><th>Day</th><th>Period</th><th>Class</th><th>Teacher</th><th>Classroom</th></tr></thead><tbody>
        {lessons.map(lesson=><tr key={lesson.id} onClick={()=>setSelectedId(lesson.id)} onDoubleClick={()=>onEdit(lesson)} className={selectedId===lesson.id?'is-selected':''} title="Double-click to edit this lesson"><td>{lesson.day}</td><td>{lesson.period+1}</td><td>{lesson.className}</td><td>{lesson.teacher}</td><td>{lesson.room||'—'}</td></tr>)}
      </tbody></table>{lessons.length===0&&<p className="phikila-tt-teachers-empty">No saved lessons use this subject yet.</p>}</div>
      <div className="phikila-tt-teacher-form-actions"><button type="button" onClick={onClose}>Close</button><button type="button" disabled={!selectedLesson} onClick={()=>selectedLesson&&onEdit(selectedLesson)}>Edit lesson</button><button type="button" className="is-primary" onClick={onNew}>New lesson</button></div>
    </section>
  </div>
}

type LessonDialogForm = { teacher: string; subject: string; className: string; group: string; lessonsPerWeek: number; type: string; homeClassroom: boolean; sharedRoom: boolean; teachersClassrooms: boolean; subjectsClassrooms: boolean; otherClassrooms: string; room: string }
function LessonDialog({ initial, teachersList, subjectsList, classesList, classroomsList, onInfo, lessonsPerWeek, onSave, onClose }: { initial: Lesson; teachersList: string[]; subjectsList: string[]; classesList: string[]; classroomsList: string[]; onInfo: (message: string) => void; lessonsPerWeek: number; onSave: (form: LessonDialogForm) => void | Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<LessonDialogForm>(() => ({teacher:initial.teacher,subject:initial.subject,className:initial.className,group:'Entire class',lessonsPerWeek:Math.max(1,lessonsPerWeek||1),type:'Single',homeClassroom:true,sharedRoom:false,teachersClassrooms:false,subjectsClassrooms:false,otherClassrooms:'',room:initial.room||''}))
  const patch = <K extends keyof LessonDialogForm,>(key: K, value: LessonDialogForm[K]) => setForm(current=>({...current,[key]:value}))
  const fieldStyle: React.CSSProperties = {minWidth:0,width:'100%',height:32,border:'1px solid #aeb7c4',borderRadius:4,padding:'4px 7px',background:'#fff',color:'#1f2937',fontSize:13}
  const rowStyle: React.CSSProperties = {display:'grid',gridTemplateColumns:'minmax(110px, 145px) minmax(0,1fr)',gap:12,alignItems:'center',padding:'10px 12px',border:'1px solid #d7dce3',borderRadius:6,background:'#f8fafc'}
  return <div className="phikila-tt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Lesson details" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section style={{width:'min(720px, calc(100vw - 24px))',maxHeight:'90vh',overflowY:'auto',background:'#eef1f5',border:'1px solid #9ca3af',borderRadius:8,boxShadow:'0 18px 55px #0004',padding:14,color:'#111827'}}>
      <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'2px 2px 12px',borderBottom:'1px solid #cbd5e1',marginBottom:12}}><strong style={{fontSize:16}}>Lesson</strong><button type="button" onClick={onClose} aria-label="Close lesson dialog">×</button></header>
      <div style={{display:'grid',gap:8}}>
        <div style={rowStyle}><label htmlFor="lesson-dialog-teacher">Teacher</label><div style={{display:'flex',gap:8}}><select id="lesson-dialog-teacher" style={fieldStyle} value={form.teacher} onChange={e=>patch('teacher',e.target.value)}>{unique([form.teacher,...teachersList]).map(t=><option key={t} value={t}>{t}</option>)}</select><button type="button" onClick={()=>onInfo('Add or manage teacher records in the Teachers workspace.')}>More teachers</button></div></div>
        <div style={rowStyle}><label htmlFor="lesson-dialog-subject">Subject</label><select id="lesson-dialog-subject" style={fieldStyle} value={form.subject} onChange={e=>patch('subject',e.target.value)}>{unique([form.subject,...subjectsList]).map(s=><option key={s} value={s}>{s}</option>)}</select></div>
        <div style={rowStyle}><label htmlFor="lesson-dialog-class">Class / group</label><div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(120px, .8fr)',gap:8}}><select id="lesson-dialog-class" style={fieldStyle} value={form.className} onChange={e=>patch('className',e.target.value)}>{unique([form.className,...classesList]).map(c=><option key={c} value={c}>{c}</option>)}</select><select aria-label="Class group" style={fieldStyle} value={form.group} onChange={e=>patch('group',e.target.value)}>{['Entire class','Group 1','Group 2','Half class'].map(g=><option key={g}>{g}</option>)}</select><div style={{gridColumn:'1 / -1',display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" onClick={()=>onInfo('Joint classes require a shared-class assignment in the timetable data model; no changes have been made.')}>Joint classes</button><button type="button" onClick={()=>onInfo('Class divisions are not yet stored separately in the timetable data model; no changes have been made.')}>Add division</button></div></div></div>
        <div style={rowStyle}><label htmlFor="lesson-dialog-count">Lessons/week</label><div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:8}}><select id="lesson-dialog-count" style={fieldStyle} value={form.lessonsPerWeek} onChange={e=>patch('lessonsPerWeek',Number(e.target.value))}>{Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select><select aria-label="Lesson type" style={fieldStyle} value={form.type} onChange={e=>patch('type',e.target.value)}>{['Single','Double','Triple'].map(t=><option key={t}>{t}</option>)}</select><button type="button" style={{gridColumn:'1 / -1'}} onClick={()=>onInfo('Additional week/term schedules are not yet stored separately in the timetable data model.')}>More weeks/terms</button><small style={{gridColumn:'1 / -1',color:'#64748b'}}>Currently assigned: {lessonsPerWeek} timetable period(s).</small></div></div>
        <div style={rowStyle}><span>Classrooms</span><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>{([['homeClassroom','Home classroom'],['teachersClassrooms',"Teacher's classrooms"],['sharedRoom','Shared room'],['subjectsClassrooms',"Subject's classrooms"]] as const).map(([key,label])=><label key={key} style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><input type="checkbox" checked={form[key]} onChange={e=>patch(key,e.target.checked)}/>{label}</label>)}<select aria-label="Available classroom" style={{...fieldStyle,gridColumn:'1 / -1'}} value={form.room} onChange={e=>patch('room',e.target.value)}><option value="">No classroom selected</option>{unique([form.room,...classroomsList].filter(Boolean)).map(room=><option key={room} value={room}>{room}</option>)}</select><input aria-label="Other available classrooms" style={{...fieldStyle,gridColumn:'1 / -1'}} placeholder="Other available classrooms" value={form.otherClassrooms} onChange={e=>patch('otherClassrooms',e.target.value)}/><button type="button" style={{gridColumn:'1 / -1'}} onClick={()=>onInfo('Manage available classroom records in the school setup workspace.')}>More classrooms</button></div></div>
      </div>
      <p style={{fontSize:11,color:'#64748b',margin:'10px 2px 0'}}>This workspace stores lessons by timetable slot. Group, lesson-count/type preferences, and classroom preference checkboxes are not saved as separate fields; teacher, subject, class, and selected classroom are saved.</p>
      <footer style={{display:'flex',gap:8,alignItems:'center',marginTop:14,paddingTop:12,borderTop:'1px solid #cbd5e1'}}><button type="button" onClick={onClose}>Cancel</button><span style={{flex:1}}/><button type="button" onClick={()=>onInfo('Help: select the teacher, subject, class, and classroom for this timetable lesson.')}>Help</button><button type="button" onClick={()=>void onSave(form)} style={{minWidth:110,fontWeight:600}}>OK</button></footer>
    </section>
  </div>
}

function SubjectTimeOffDialog({ subject, days, periods, initialGrid, onClose, onSave }: { subject: string; days: string[]; periods: Period[]; initialGrid?: number[][]; onClose: () => void; onSave: (grid: number[][]) => void }) {
  const [grid, setGrid] = useState<number[][]>(()=>days.map((_,row)=>periods.map((_,column)=>initialGrid?.[row]?.[column]??0)));
  return <div className="phikila-tt-teachers-overlay" role="dialog" aria-modal="true" aria-label={"Time off for " + subject}>
    <section className="phikila-tt-teachers-window">
      <header className="phikila-tt-teachers-title"><strong>Subject time off · {subject}</strong><button type="button" onClick={onClose} aria-label="Close">×</button></header>
      <div className="phikila-tt-teacher-timeoff"><p>Click a cell to cycle Available, Conditional, and Unavailable. Save workspace to persist the changes.</p>
        <div className="phikila-tt-teacher-time-grid" style={{gridTemplateColumns:`72px repeat(${Math.max(1,periods.length)}, minmax(30px, 1fr))`}}>
          <div />{periods.map((period,index)=><strong key={index} title={period.name}>{period.short||period.name||String(index+1)}</strong>)}
          {days.map((day,row)=><React.Fragment key={day}><strong>{day.slice(0,3)}</strong>{periods.map((period,column)=>{const value=grid[row]?.[column]??0;return <button type="button" key={period.name+column} title={value===0?'Available':value===1?'Conditional':'Unavailable'} onClick={()=>setGrid(current=>current.map((values,r)=>r===row?values.map((cell,c)=>c===column?(cell+1)%3:cell):values))}>{value===0?'✓':value===1?'?':'×'}</button>})}</React.Fragment>)}
        </div>
      </div>
      <div className="phikila-tt-teacher-form-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="is-primary" onClick={()=>onSave(grid)}>OK</button></div>
    </section>
  </div>
}
