import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { apiFetch, friendlyApiError } from '../lib/api'
import './timetable-module.css'

type Lesson = { id: string; day: string; period: number; className: string; subject: string; teacher: string; room: string; locked: boolean }
type Period = { name: string; start: string; end: string; type?: 'lesson' | 'break'; short?: string; len?: number; position?: number; textForPrintouts?: string; printSummary?: boolean; printTeacher?: boolean; printClass?: boolean; printClassroom?: boolean; printInBells?: string; doubleCannotSpan?: boolean }
type Specification = { subjects: string[]; classes: string[]; teachers: string[]; classrooms: string[] }
type SubjectDetail = { short: string; color: string; number: string; customFields: string; classrooms: string[] }
type SubjectForm = { title: string; short: string; color: string; number: string; customFields: string; classrooms: string[] }
type Workspace = { schoolName: string; academicYear: string; registrationName: string; periodsPerDay: number; numberOfDays: number; weekend: string; workZero: boolean; days: string[]; periods: Period[]; lessons: Lesson[]; specification: Specification; subjectDetails?: Record<string, SubjectDetail> }
type Whose = 'All' | 'Classes' | 'Teachers' | 'Classrooms'
type Action = 'New' | 'Open' | 'Save' | 'Save As' | 'Print' | 'Print preview' | 'Exit' | 'Import' | 'Export' | 'Settings' | 'Subjects' | 'Classes' | 'Classrooms' | 'Teachers' | 'Lessons' | 'Students' | 'Relations' | 'Timetable' | 'Summary' | 'Zoom' | 'Generate new' | 'Generate in cloud' | 'Test' | 'Verification' | 'School' | 'Year/Class Online' | 'Bell times' | 'Constraints' | 'Contents' | 'Questions/Comments' | 'Questions? / Write us' | 'About' | 'Generate' | 'Help' | 'Timetables Online'

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
  return <button type="button" className="phikila-ribbon-button" onClick={onClick}><span className={'phikila-ribbon-icon tint-' + (tint || 'neutral')} aria-hidden="true">{glyph}</span><span>{label}</span></button>
}

function MainMenu({ onAction, whose, onWhoseChange }: { onAction: (action: Action) => void; whose: Whose; onWhoseChange: (value: Whose) => void }) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const menus: Record<string, Action[]> = {
    Main: ['New', 'Open', 'Save', 'Print', 'Print preview', 'Exit'],
    File: ['New', 'Open', 'Save', 'Save As', 'Import', 'Export', 'Print', 'Print preview', 'Settings', 'Exit'],
    Specification: ['Subjects', 'Classes', 'Classrooms', 'Teachers', 'Students', 'Relations', 'Lessons'],
    View: ['Timetable', 'Summary', 'Zoom'],
    Timetable: ['Generate new', 'Generate in cloud', 'Test', 'Verification'],
    Options: ['School', 'Bell times', 'Year/Class Online', 'Constraints'],
    Help: ['Contents', 'Questions/Comments', 'About'],
  }
  const items: { label: Action; glyph: string; tint?: string }[] = [
    { label: 'New', glyph: '▤' }, { label: 'Open', glyph: '▱' }, { label: 'Save', glyph: '▣' },
    { label: 'Print', glyph: '▧' }, { label: 'Print preview', glyph: '▤', tint: 'blue' },
    { label: 'Subjects', glyph: '◈', tint: 'blue' }, { label: 'Classes', glyph: '▦', tint: 'gold' },
    { label: 'Classrooms', glyph: '▣', tint: 'gold' }, { label: 'Teachers', glyph: '♙', tint: 'purple' },
    { label: 'Students', glyph: '♟', tint: 'purple' }, { label: 'Relations', glyph: '⇄', tint: 'purple' },
    { label: 'Test', glyph: '✓', tint: 'teal' }, { label: 'Generate new', glyph: '✳', tint: 'pink' },
    { label: 'Generate in cloud', glyph: '☁', tint: 'pink' }, { label: 'Verification', glyph: '✓', tint: 'teal' },
    { label: 'School', glyph: '⌂', tint: 'blue' }, { label: 'Year/Class Online', glyph: '◎', tint: 'gold' },
    { label: 'Questions/Comments', glyph: '?', tint: 'blue' },
  ]
  const ribbonButton = (item: { label: Action; glyph: string; tint?: string }) => <RibbonButton key={item.label} label={item.label} glyph={item.glyph} tint={item.tint} onClick={() => onAction(item.label)} />
  return <div className="phikila-ribbon">
    <nav className="phikila-menu-bar" aria-label="Timetable menus">
      {Object.entries(menus).map(([name, actions]) => <div className="phikila-menu" key={name}>
        <button className={'phikila-menu-trigger ' + (activeMenu === name ? 'is-open' : '')} aria-expanded={activeMenu === name} onMouseEnter={() => { if (activeMenu) setActiveMenu(name) }} onClick={() => setActiveMenu(activeMenu === name ? null : name)}>{name}</button>
        {activeMenu === name && <div className="phikila-menu-dropdown" role="menu">{actions.map(action => <button key={action} role="menuitem" className="phikila-menu-item" onClick={() => { setActiveMenu(null); onAction(action) }}>{action}</button>)}</div>}
      </div>)}
    </nav>
    <div className="phikila-ribbon-scroll"><div className="phikila-ribbon-row">
      <div className="phikila-ribbon-group phikila-ribbon-group-all">{items.map(ribbonButton)}</div>
    </div></div>
    <div className="phikila-ribbon-filter"><div className="phikila-whose"><label htmlFor="phikila-whose">Show:</label><select id="phikila-whose" value={whose} onChange={event => onWhoseChange(event.target.value as Whose)}><option>All</option><option>Classes</option><option>Teachers</option><option>Classrooms</option></select><span>Filter the weekly timetable</span></div></div>
  </div>
}

export default function TimetableModule() {
  const [data, setData] = useState<Workspace>(EMPTY)
  const [whose, setWhose] = useState<Whose>('All')
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('Loading saved workspace…')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<{ day: string; period: number; lesson?: Lesson } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [setupTab, setSetupTab] = useState<'basic' | 'bell' | 'subjects' | 'classes'>('basic')
  const [catalogueValue, setCatalogueValue] = useState('')
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [subjectDialog, setSubjectDialog] = useState<{mode:'new'|'edit';originalName?:string;form:SubjectForm}|null>(null)
  const [breakDialog, setBreakDialog] = useState<{ index: number | null; form: BreakForm } | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [section, setSection] = useState<string | null>(null)
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

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await apiFetch<{ data: Workspace | null; updated_at: string | null }>('/api/v1/timetable/workspace')
      if (result.data) setData(normaliseWorkspace(result.data))
      setStatus(result.data ? 'Loaded shared workspace' : 'New workspace · save to sync across devices')
    } catch (caught) {
      setError(friendlyApiError(caught, 'load timetable workspace'))
      setStatus('Could not load workspace')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    setError('')
    try {
      const result = await apiFetch<{ data: Workspace; updated_at: string | null }>('/api/v1/timetable/workspace', { method: 'PUT', body: JSON.stringify({ data }) })
      if (result.data) setData(normaliseWorkspace(result.data))
      setStatus('Saved to the school database · ' + new Date().toLocaleTimeString())
    } catch (caught) { setError(friendlyApiError(caught, 'save timetable workspace')) }
  }
  const runTest = async () => {
    setError('')
    try {
      const result = await apiFetch<{ valid: boolean; lessons_checked: number; conflicts: { message: string }[] }>('/api/v1/timetable/test', { method: 'POST', body: JSON.stringify({ data }) })
      setStatus(result.valid ? 'Test passed · ' + result.lessons_checked + ' lessons checked' : 'Test found ' + result.conflicts.length + ' conflict(s)')
      if (result.conflicts.length) setError(result.conflicts.map(item => item.message).join(' · '))
    } catch (caught) { setError(friendlyApiError(caught, 'test timetable')) }
  }
  const openEditor = (day: string, period: number, lesson?: Lesson) => {
    setEditor({ day, period, lesson })
    setForm(lesson ? { className: lesson.className, subject: lesson.subject, teacher: lesson.teacher, room: lesson.room, locked: lesson.locked } : { className: classes[0] || 'Form 1A', subject: subjects[0] || 'Mathematics', teacher: teachers[0] || 'Teacher', room: '', locked: false })
  }
  const submitLesson = (event: FormEvent) => {
    event.preventDefault()
    if (!editor) return
    const lesson: Lesson = { id: editor.lesson ? editor.lesson.id : makeId(), day: editor.day, period: editor.period, ...form }
    setData(current => ({ ...current, lessons: editor.lesson ? current.lessons.map(item => item.id === lesson.id ? lesson : item) : current.lessons.concat(lesson) }))
    setEditor(null); setStatus('Lesson edited · remember to Save')
  }
  const deleteLesson = () => {
    if (!editor || !editor.lesson) return
    if (editor.lesson.locked && !window.confirm('This lesson is locked. Remove it anyway?')) return
    setData(current => ({ ...current, lessons: current.lessons.filter(item => item.id !== editor.lesson?.id) }))
    setEditor(null); setStatus('Lesson removed · remember to Save')
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
      case 'Test': case 'Verification': void runTest(); break
      case 'Generate': { const result = generateSchedule(data); if (result.error) { setError(result.error); setStatus('Generation stopped · existing timetable preserved') } else { setData(current => ({ ...current, lessons: result.lessons })); setError(''); setStatus('Generated a conflict-free draft for ' + result.lessons.length + ' lessons · review and Save') } break }
      case 'Help': case 'Contents': case 'Questions/Comments': case 'Questions? / Write us': case 'About': setStatus('Phikila Timetable Help · Use the menu bar for File, Specification, View, Timetable, Options, and Help actions.'); break
      case 'School': case 'Settings': setSetupTab('basic'); setSettingsOpen(true); break
      case 'Year/Class Online': case 'Timetables Online': setStatus('Year/Class Online · online publishing will be available after the timetable is generated and approved.'); break
      case 'Bell times': setSetupTab('bell'); setSettingsOpen(true); break
      case 'Exit': setStatus('Use the main application navigation to leave the timetable.'); break
      case 'Generate new': {
        const result = generateSchedule(data)
        if (result.error) {
          setError(result.error)
          setStatus('Generation stopped · existing timetable preserved')
        } else {
          setData(current => ({ ...current, lessons: result.lessons }))
          setError('')
          setStatus('Generated a conflict-free draft for ' + result.lessons.length + ' lessons · review and Save')
        }
        break
      }
      case 'Generate in cloud': setError('Cloud generation is not connected yet. Use Generate new for the local draft generator.'); break
      case 'Timetable': setSection(null); break
      case 'Summary': setStatus('Summary · ' + data.lessons.length + ' lessons across ' + data.days.length + ' days'); break
      case 'Zoom': setStatus('Use browser zoom to adjust the timetable scale.'); break
      case 'Constraints': setSection('Constraints'); break
      case 'Subjects': setSection(null); setSetupTab('subjects'); setSettingsOpen(true); break
      case 'Classes': case 'Classrooms': case 'Teachers': case 'Students': case 'Relations': case 'Lessons': setSection(action); break
    }
  }
  return <main className="phikila-tt">
    <header className="phikila-tt-heading"><div><p className="phikila-tt-eyebrow">PHIKILA · TIMETABLE MODULE</p><h1>{data.schoolName || 'School timetable'}</h1><p className="phikila-tt-subtitle">Academic year {data.academicYear} · Weekly timetable editor</p></div><div className="phikila-tt-heading-actions"><span className={'phikila-tt-status-dot ' + (loading ? 'is-loading' : '')} /><span>{loading ? 'Loading' : 'Workspace'}</span><button className="phikila-tt-button" onClick={() => void load()} disabled={loading}>Reload</button></div></header>
    <MainMenu onAction={onAction} whose={whose} onWhoseChange={value => { setWhose(value); setFilter('') }} />
    <div className="phikila-tt-subbar"><strong>{whose === 'All' ? 'Whole school' : whose === 'Classes' ? 'Class timetable' : whose === 'Teachers' ? 'Teacher timetable' : 'Classroom timetable'}</strong>{filterOptions.length > 0 && <select aria-label={'Filter by ' + whose.toLowerCase()} value={filter} onChange={event => setFilter(event.target.value)}><option value="">All {whose.toLowerCase()}</option>{filterOptions.map(option => <option key={option}>{option}</option>)}</select>}<span className="phikila-tt-subbar-spacer" /><span>{data.lessons.length} lessons</span><button className="phikila-tt-button phikila-tt-button-primary" onClick={() => openEditor(data.days[0], 0)}>+ Add lesson</button></div>
    {error && <div className="phikila-tt-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {section && <section className="phikila-tt-info-panel"><div className="phikila-tt-specification"><div className="phikila-tt-panel-heading"><div><h2>{section}</h2><p>Manage the saved {section.toLowerCase()} catalogue. Changes are included when you save the workspace.</p></div><button className="phikila-tt-button" onClick={() => { setSection(null); setSpecValue('') }}>Close</button></div>{(['Subjects', 'Classes', 'Teachers', 'Classrooms'].includes(section)) ? <><form className="phikila-tt-spec-add" onSubmit={event => { event.preventDefault(); const key = section === 'Subjects' ? 'subjects' : section === 'Classes' ? 'classes' : section === 'Teachers' ? 'teachers' : 'classrooms'; const value = specValue.trim(); if (!value) return; setData(current => ({ ...current, specification: { ...current.specification, [key]: unique([...current.specification[key], value]) } })); setSpecValue('') }}><input aria-label={'New ' + section.slice(0, -1)} placeholder={'Add ' + section.toLowerCase().replace(/s$/, '')} value={specValue} onChange={event => setSpecValue(event.target.value)} /><button className="phikila-tt-button phikila-tt-button-primary" type="submit">Add</button></form><ul className="phikila-tt-spec-list">{(section === 'Subjects' ? data.specification.subjects : section === 'Classes' ? data.specification.classes : section === 'Teachers' ? data.specification.teachers : data.specification.classrooms).map(item => <li key={item}><span>{item}</span><button type="button" className="phikila-tt-button phikila-tt-danger" onClick={() => { const key = section === 'Subjects' ? 'subjects' : section === 'Classes' ? 'classes' : section === 'Teachers' ? 'teachers' : 'classrooms'; setData(current => ({ ...current, specification: { ...current.specification, [key]: current.specification[key].filter(value => value !== item) } })) }}>Remove</button></li>)}</ul></> : <p>Student records and lesson relations need dedicated data models; they are not edited in this workspace yet.</p>}</div></section>}
    {settingsOpen && <section className="phikila-tt-settings">
      <div className="phikila-tt-panel-heading"><div><h2>School setup</h2><p>Configure school details, bell times, subjects and classes. Save to persist changes.</p></div><button className="phikila-tt-button" onClick={() => setSettingsOpen(false)}>Close</button></div>
      <div className="phikila-tt-setup-tabs" role="tablist" aria-label="School setup sections">
        <button role="tab" aria-selected={setupTab === 'basic'} className={setupTab === 'basic' ? 'is-active' : ''} onClick={() => setSetupTab('basic')}>School</button>
        <button role="tab" aria-selected={setupTab === 'bell'} className={setupTab === 'bell' ? 'is-active' : ''} onClick={() => setSetupTab('bell')}>Bell times / Periods</button>
        <button role="tab" aria-selected={setupTab === 'subjects'} className={setupTab === 'subjects' ? 'is-active' : ''} onClick={() => setSetupTab('subjects')}>Subjects</button>
        <button role="tab" aria-selected={setupTab === 'classes'} className={setupTab === 'classes' ? 'is-active' : ''} onClick={() => setSetupTab('classes')}>Classes</button>
      </div>
      {setupTab === 'basic' && <div className="phikila-tt-school-form">
        <label>School name<input value={data.schoolName} onChange={event => setData(current => ({ ...current, schoolName: event.target.value }))} /></label>
        <label>Academic year<input value={data.academicYear} onChange={event => setData(current => ({ ...current, academicYear: event.target.value }))} /></label>
        <label>Registration name<input value={data.registrationName} onChange={event => setData(current => ({ ...current, registrationName: event.target.value }))} placeholder="Optional registration name" /></label>
        <label>Periods per day<select value={data.periodsPerDay} onChange={event => setData(current => ({ ...current, periodsPerDay: Number(event.target.value) }))}>{Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>Number of school days<select value={data.numberOfDays} onChange={event => setData(current => { const days = DAYS.slice(0, Number(event.target.value)); return { ...current, numberOfDays: Number(event.target.value), days } })}>{[5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>Weekend<select value={data.weekend} onChange={event => setData(current => ({ ...current, weekend: event.target.value }))}><option>Saturday - Sunday</option><option>Friday - Saturday</option></select></label>
        <label className="phikila-tt-setup-checkbox"><input type="checkbox" checked={data.workZero} onChange={event => setData(current => ({ ...current, workZero: event.target.checked }))} /> Enable zero periods</label>
        <p className="phikila-tt-help">School day count controls the displayed days. Existing lessons on removed days are retained in saved data but hidden until those days are enabled again.</p>
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
        <div className="phikila-tt-subjects-layout"><div className="phikila-tt-subject-table-wrap"><table className="phikila-tt-subject-table"><thead><tr><th>Name</th><th>Short</th><th>Count</th><th>Time off</th><th>Distribution</th><th>Homework</th></tr></thead><tbody>{data.specification.subjects.map(item=>{const detail=data.subjectDetails?.[item];return <tr key={item} onClick={()=>setSelectedSubject(item)} className={selectedSubject===item?'is-selected':''}><td><span className="phikila-tt-subject-color" style={{background:detail?.color||'#1a3a8a'}}/> {item}</td><td>{detail?.short||item.slice(0,4).toUpperCase()}</td><td>0</td><td><span className="phikila-tt-timeoff-preview">Availability configurable</span></td><td>Ideal</td><td></td></tr>})}</tbody></table></div>
        <aside className="phikila-tt-subject-actions"><button className="phikila-tt-button phikila-tt-button-primary" onClick={()=>setSubjectDialog({mode:'new',form:{title:'',short:'',color:'#1a3a8a',number:'',customFields:'',classrooms:[]}})}>＋ New</button><button className="phikila-tt-button" disabled={!selectedSubject} onClick={()=>{if(!selectedSubject)return;const detail=data.subjectDetails?.[selectedSubject];setSubjectDialog({mode:'edit',originalName:selectedSubject,form:{title:selectedSubject,short:detail?.short||selectedSubject.slice(0,4).toUpperCase(),color:detail?.color||'#1a3a8a',number:detail?.number||'',customFields:detail?.customFields||'',classrooms:detail?.classrooms||[]}})}}>Edit</button><button className="phikila-tt-button phikila-tt-danger" disabled={!selectedSubject} onClick={()=>{if(!selectedSubject)return;setData(current=>({...current,specification:{...current.specification,subjects:current.specification.subjects.filter(value=>value!==selectedSubject)},subjectDetails:Object.fromEntries(Object.entries(current.subjectDetails||{}).filter(([key])=>key!==selectedSubject))}));setSelectedSubject(null)}}>Remove</button><div className="phikila-tt-subject-actions-spacer"/><button className="phikila-tt-button" disabled={!selectedSubject} onClick={()=>setStatus(selectedSubject?'Lessons for '+selectedSubject+' are shown in the timetable grid.':'Select a subject first.')}>Lessons</button><button className="phikila-tt-button" disabled={!selectedSubject} onClick={()=>setStatus('Time-off settings can be configured in a future timetable constraints update.')}>Time off</button><button className="phikila-tt-button" disabled={!selectedSubject} onClick={()=>setStatus('Subject constraints can be managed through the Constraints menu.')}>Constraints</button></aside></div>
        {subjectDialog && <SubjectEditorDialog value={subjectDialog.form} classrooms={data.specification.classrooms} mode={subjectDialog.mode} onChange={form=>setSubjectDialog(current=>current?{...current,form}:current)} onClose={()=>setSubjectDialog(null)} onSave={()=>{const form=subjectDialog.form;const name=form.title.trim();if(!name){setError('Enter a subject title.');return}const oldName=subjectDialog.originalName;if(data.specification.subjects.some(value=>value!==oldName&&value.toLowerCase()===name.toLowerCase())){setError('A subject with this title already exists.');return}setData(current=>{const subjects=current.specification.subjects.filter(value=>value!==oldName);const details={...(current.subjectDetails||{})};if(oldName)delete details[oldName];details[name]={short:form.short.trim()||name.slice(0,4).toUpperCase(),color:form.color,number:form.number,customFields:form.customFields,classrooms:form.classrooms};return {...current,specification:{...current.specification,subjects:subjectDialog.mode==='new'?[...subjects,name]:current.specification.subjects.map(value=>value===oldName?name:value)},subjectDetails:details,lessons:oldName?current.lessons.map(lesson=>lesson.subject===oldName?{...lesson,subject:name}:lesson):current.lessons}});setSelectedSubject(name);setSubjectDialog(null);setError('');setStatus('Subject saved · remember to Save workspace')}} />}
      </div>}
      {setupTab === 'classes' && <div><form className="phikila-tt-spec-add" onSubmit={event=>{event.preventDefault();const value=catalogueValue.trim();if(!value)return;setData(current=>({...current,specification:{...current.specification,classes:unique([...current.specification.classes,value])}}));setCatalogueValue('')}}><input aria-label="New class" placeholder="Enter class name" value={catalogueValue} onChange={event=>setCatalogueValue(event.target.value)}/><button className="phikila-tt-button phikila-tt-button-primary" type="submit">Add</button></form><ul className="phikila-tt-spec-list">{data.specification.classes.map(item=><li key={item}><span>{item}</span><button className="phikila-tt-button phikila-tt-danger" onClick={()=>setData(current=>({...current,specification:{...current.specification,classes:current.specification.classes.filter(value=>value!==item)}}))}>Remove</button></li>)}</ul></div>}
      <div className="phikila-tt-settings-save"><button className="phikila-tt-button phikila-tt-button-primary" onClick={() => void save()}>Save school settings</button></div>
    </section>}
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

    <section className="phikila-tt-grid-panel"><div className="phikila-tt-panel-heading"><div><h2>Weekly timetable</h2><p>Select a lesson to edit it, or choose an empty cell to add one.</p></div><div className="phikila-tt-grid-legend"><span><i className="legend-lesson" /> Lesson</span><span><i className="legend-locked" /> Locked ({data.lessons.filter(lesson => lesson.locked).length})</span><span className="phikila-tt-verification-indicator">Verification: {conflicts.length ? conflicts.length + ' potential conflict(s)' : 'No local conflicts'}</span></div></div><div className="phikila-tt-grid-scroll"><table className="phikila-tt-grid phikila-tt-grid-days-rows"><thead><tr><th className="period-col">Day</th>{data.periods.map((period, periodIndex) => <th key={period.name + periodIndex} className={(period.type === 'break' || /break|lunch|recess|games/i.test(period.name)) ? 'phikila-tt-break-heading' : ''}>{period.name}<small>{period.start}–{period.end}</small></th>)}</tr></thead><tbody>{data.days.map(day => <tr key={day}><th className="period-cell">{day}</th>{data.periods.map((period, periodIndex) => { const isBreak = period.type === 'break' || /break|lunch|recess|games/i.test(period.name); const lessons = visibleLessons.filter(lesson => lesson.day === day && lesson.period === periodIndex); return <td key={period.name + periodIndex} className={'phikila-tt-cell ' + (isBreak ? 'phikila-tt-break-cell' : '')}>{lessons.map(lesson => <button key={lesson.id} className={'phikila-tt-lesson ' + (lesson.locked ? 'is-locked' : '')} onClick={() => openEditor(day, periodIndex, lesson)}><span className="phikila-tt-lesson-class">{lesson.className}{lesson.locked ? ' · Locked' : ''}</span><strong>{lesson.subject}</strong><span>{lesson.teacher}</span>{lesson.room && <small>{lesson.room}</small>}</button>)}{!isBreak && <button className="phikila-tt-add-cell" onClick={() => openEditor(day, periodIndex)}>+ Add lesson</button>}{isBreak && <span className="phikila-tt-break-label">{period.name}</span>}</td> })}</tr>)}</tbody></table></div></section>
    <footer className="phikila-tt-footer"><span>{status}</span><span>{conflicts.length ? conflicts.length + ' potential conflict(s)' : 'No local same-slot conflicts detected'}</span><button className="phikila-tt-button phikila-tt-button-primary" onClick={() => void save()}>Save workspace</button></footer>
    {editor && <div className="phikila-tt-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditor(null) }}><section className="phikila-tt-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-editor-title"><div className="phikila-tt-panel-heading"><div><h2 id="lesson-editor-title">{editor.lesson ? 'Edit lesson' : 'Add lesson'}</h2><p>{editor.day} · {data.periods[editor.period]?.name}</p></div><button className="phikila-tt-button" onClick={() => setEditor(null)}>Close</button></div><form onSubmit={submitLesson}><label>Class<input required list="tt-classes" value={form.className} onChange={event => setForm(current => ({ ...current, className: event.target.value }))} /><datalist id="tt-classes">{classes.map(value => <option key={value} value={value} />)}</datalist></label><label>Subject<input required list="tt-subjects" value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} /><datalist id="tt-subjects">{subjects.map(value => <option key={value} value={value} />)}</datalist></label><label>Teacher<input required list="tt-teachers" value={form.teacher} onChange={event => setForm(current => ({ ...current, teacher: event.target.value }))} /><datalist id="tt-teachers">{teachers.map(value => <option key={value} value={value} />)}</datalist></label><label>Classroom<input list="tt-rooms" value={form.room} onChange={event => setForm(current => ({ ...current, room: event.target.value }))} /><datalist id="tt-rooms">{rooms.map(value => <option key={value} value={value} />)}</datalist></label><label className="phikila-tt-checkbox"><input type="checkbox" checked={form.locked} onChange={event => setForm(current => ({ ...current, locked: event.target.checked }))} /> Lock this lesson in place</label><div className="phikila-tt-modal-actions">{editor.lesson && <button type="button" className="phikila-tt-button phikila-tt-danger" onClick={deleteLesson}>Delete lesson</button>}<span /><button type="button" className="phikila-tt-button" onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="phikila-tt-button phikila-tt-button-primary">Save lesson</button></div></form></section></div>}
    {previewOpen && <div className="phikila-tt-modal-backdrop"><section className="phikila-tt-preview" role="dialog" aria-modal="true" aria-labelledby="tt-preview-title"><div className="phikila-tt-panel-heading"><div><h2 id="tt-preview-title">Print preview · {data.schoolName}</h2><p>Academic year {data.academicYear}</p></div><div><button className="phikila-tt-button" onClick={() => setPreviewOpen(false)}>Close</button> <button className="phikila-tt-button phikila-tt-button-primary" onClick={() => window.print()}>Print</button></div></div><div className="phikila-tt-grid-scroll"><table className="phikila-tt-grid"><thead><tr><th>Period</th>{data.days.map(day => <th key={day}>{day}</th>)}</tr></thead><tbody>{data.periods.map((period, index) => <tr key={period.name + index}><th>{period.name}<small>{period.start}–{period.end}</small></th>{data.days.map(day => <td key={day}>{data.lessons.filter(lesson => lesson.day === day && lesson.period === index).map(lesson => <div className="phikila-tt-print-lesson" key={lesson.id}><strong>{lesson.className} · {lesson.subject}</strong><br />{lesson.teacher}{lesson.room ? ' · ' + lesson.room : ''}</div>)}</td>)}</tr>)}</tbody></table></div></section></div>}
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
 <fieldset><legend>Classrooms</legend><div className="phikila-tt-subject-classrooms">{classrooms.length?classrooms.map(room=><label key={room}><input type="checkbox" checked={value.classrooms.includes(room)} onChange={e=>update('classrooms',e.target.checked?[...value.classrooms,room]:value.classrooms.filter(item=>item!==room))}/>{room}</label>):<p>Add classrooms under School settings first.</p>}</div><button type="button" className="phikila-tt-button" onClick={()=>update('classrooms',[...classrooms])}>Set for all lessons of this subject</button></fieldset>
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
  const lessons = Array.isArray(value.lessons) ? value.lessons.filter(lesson => lesson && days.includes(lesson.day) && Number.isInteger(lesson.period) && lesson.period >= 0 && lesson.period < periods.length && lesson.className && lesson.subject && lesson.teacher).map(lesson => ({ id: String(lesson.id || makeId()), day: lesson.day, period: lesson.period, className: String(lesson.className), subject: String(lesson.subject), teacher: String(lesson.teacher), room: String(lesson.room || ''), locked: Boolean(lesson.locked) })) : []
  const rawSpec = value.specification as Partial<Specification> | undefined
  const specification: Specification = {
    subjects: Array.isArray(rawSpec?.subjects) ? unique(rawSpec.subjects.filter(item => typeof item === 'string')) : [...EMPTY.specification.subjects],
    classes: Array.isArray(rawSpec?.classes) ? unique(rawSpec.classes.filter(item => typeof item === 'string')) : [...EMPTY.specification.classes],
    teachers: Array.isArray(rawSpec?.teachers) ? unique(rawSpec.teachers.filter(item => typeof item === 'string')) : [...EMPTY.specification.teachers],
    classrooms: Array.isArray(rawSpec?.classrooms) ? unique(rawSpec.classrooms.filter(item => typeof item === 'string')) : [...EMPTY.specification.classrooms],
  }
  return { schoolName: String(value.schoolName || EMPTY.schoolName), academicYear: String(value.academicYear || EMPTY.academicYear), registrationName: String(value.registrationName || ''), subjectDetails: value.subjectDetails && typeof value.subjectDetails === 'object' ? value.subjectDetails : {}, periodsPerDay: Number(value.periodsPerDay) || Math.max(1, periods.filter(period => period.type !== 'break' && !/break|lunch|recess|games/i.test(period.name)).length), numberOfDays: Number(value.numberOfDays) || days.length, weekend: String(value.weekend || 'Saturday - Sunday'), workZero: Boolean(value.workZero), days, periods, lessons, specification }
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
      .filter(slot => !conflictsAt(lesson, slot.day, slot.period))
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
