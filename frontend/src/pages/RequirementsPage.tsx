import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { CalendarIcon, SearchIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { api, type Grade, type Level, type Stream } from '../lib/api'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Requirement, type SchoolClass, type Subject, type Teacher } from '../lib/scheduling'

type Data = { requirements: Requirement[]; classes: SchoolClass[]; levels: Level[]; grades: Grade[]; streams: Stream[]; subjects: Subject[]; teachers: Teacher[] }
type DraftAllocation = { id: string; teacher_id: string; level_id: string; grade_id: string; class_id: string; subject_id: string; periods_per_week: number; double_periods: number }
type ClassOption = { value: string; label: string; stream: Stream | null; classRow: SchoolClass | null }
type TeacherSummary = { teacher_id: number; teacher_name: string; total_workload: number; allocations: Requirement[] }

export function RequirementsPage() {
  const { notify } = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [drafts, setDrafts] = useState<DraftAllocation[]>([])
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [editingSavedId, setEditingSavedId] = useState<number | null>(null)
  const [expandedTeacher, setExpandedTeacher] = useState<number | null>(null)
  const [form, setForm] = useState({ teacher_id: '', level_id: '', grade_id: '', class_id: '', subject_id: '', periods_per_week: 4, double_lesson: false })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [requirements, years, classes, levels, grades, subjects, teachers] = await Promise.all([scheduling.requirements(), api.academicYears(), scheduling.classes(), api.levels(), api.grades(), scheduling.subjects(), scheduling.teachers()])
      const streamGroups = await Promise.all(years.flatMap((year) => grades.map((grade) => api.streams(year.id, grade.id).catch(() => []))))
      const streams = streamGroups.flat().filter((stream, index, all) => all.findIndex((item) => item.id === stream.id) === index && stream.status === 'ACTIVE')
      setData({ requirements, classes, levels: levels.filter((level) => level.status !== false), grades: grades.filter((grade) => grade.status !== false), streams, subjects, teachers })
    } catch (err) { setError(friendlyApiError(err, 'load teaching allocations')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const ready = Boolean(data && data.levels.length && data.grades.length && data.subjects.length && data.teachers.length && (data.classes.length || data.streams.length))
  const selectedLevelId = Number(form.level_id) || null
  const selectedGradeId = Number(form.grade_id) || null
  const filteredGrades = useMemo(() => data?.grades.filter((grade) => !selectedLevelId || grade.level_id === selectedLevelId) ?? [], [data, selectedLevelId])
  const filteredStreams = useMemo(() => !data || !selectedGradeId ? [] : data.streams.filter((stream) => stream.grade_id === selectedGradeId && (!selectedLevelId || stream.level_id === selectedLevelId)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [data, selectedGradeId, selectedLevelId])
  const classOptions = useMemo<ClassOption[]>(() => {
    if (!data || !selectedGradeId) return []
    const grade = data.grades.find((item) => item.id === selectedGradeId)
    const options: ClassOption[] = data.classes.filter((item) => !item.grade || item.grade.trim().toLowerCase() === grade?.name.trim().toLowerCase()).map((item) => ({ value: `class:${item.id}`, label: item.name, stream: null, classRow: item }))
    const existingNames = new Set(options.map((item) => item.label.trim().toLowerCase()))
    filteredStreams.forEach((stream) => { if (!existingNames.has(stream.name.trim().toLowerCase())) options.push({ value: `stream:${stream.id}`, label: stream.name, stream, classRow: null }) })
    return options.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
  }, [data, selectedGradeId, filteredStreams])

  const filtered = useMemo(() => {
    const rows = data?.requirements ?? []
    const term = query.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.class_name, row.subject_name, row.teacher_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)))
  }, [data, query])

  const teacherSummaries = useMemo<TeacherSummary[]>(() => {
    const grouped = new Map<number, TeacherSummary>()
    filtered.forEach((row) => {
      const id = Number(row.teacher_id ?? 0)
      if (!grouped.has(id)) grouped.set(id, { teacher_id: id, teacher_name: row.teacher_name ?? 'Unassigned', total_workload: 0, allocations: [] })
      const summary = grouped.get(id)!
      summary.total_workload += Number(row.periods_per_week || 0)
      summary.allocations.push(row)
    })
    return Array.from(grouped.values()).sort((a, b) => a.teacher_name.localeCompare(b.teacher_name))
  }, [filtered])

  const gradeLabel = useCallback((row: Requirement) => {
    const className = String(row.class_name ?? '—').trim()
    if (className === '—' || /^\d/.test(className)) return className
    const subjectGrade = data?.grades.find((grade) => String(grade.name).trim().toLowerCase() === className.toLowerCase())
    if (subjectGrade) return className
    const matchingClass = data?.classes.find((item) => String(item.name).trim().toLowerCase() === className.toLowerCase())
    const gradeName = matchingClass?.grade?.trim() ?? ''
    if (gradeName && !className.toLowerCase().startsWith(gradeName.toLowerCase())) return `${gradeName}${className}`
    const matchingStream = data?.streams.find((stream) => String(stream.name).trim().toLowerCase() === className.toLowerCase())
    const streamGrade = data?.grades.find((grade) => grade.id === matchingStream?.grade_id)?.name?.trim() ?? ''
    return streamGrade && !className.toLowerCase().startsWith(streamGrade.toLowerCase()) ? `${streamGrade}${className}` : className
  }, [data])

  const draftRows = useMemo(() => drafts.map((draft) => {
    const gradeName = data?.grades.find((item) => String(item.id) === draft.grade_id)?.name?.trim() ?? ''
    const classRow = data?.classes.find((item) => String(item.id) === draft.class_id)
    const streamOption = classOptions.find((item) => item.value === draft.class_id)
    const rawClassName = classRow?.name ?? streamOption?.label ?? '—'
    const className = gradeName && rawClassName !== '—' && !rawClassName.toLowerCase().startsWith(gradeName.toLowerCase()) ? `${gradeName}${rawClassName}` : rawClassName
    return { ...draft, teacher_name: data?.teachers.find((item) => String(item.id) === draft.teacher_id)?.name ?? '—', class_name: className, subject_name: data?.subjects.find((item) => String(item.id) === draft.subject_id)?.name ?? '—' }
  }), [drafts, data, classOptions])

  function changeLevel(value: string) { setForm((current) => ({ ...current, level_id: value, grade_id: '', class_id: '' })) }
  function changeGrade(value: string) { setForm((current) => ({ ...current, grade_id: value, class_id: '' })) }
  function resetDraftForm() { setEditingDraftId(null); setEditingSavedId(null); setForm({ teacher_id: '', level_id: '', grade_id: '', class_id: '', subject_id: '', periods_per_week: 4, double_lesson: false }) }

  async function addDraft(event: FormEvent) {
    event.preventDefault()
    if (!form.teacher_id || !form.level_id || !form.grade_id || !form.class_id || !form.subject_id) { notify('Select a teacher, level, grade/class/stream and subject.', 'error'); return }
    const option = classOptions.find((item) => item.value === form.class_id)
    if (!option) { notify('The selected grade/class/stream could not be found.', 'error'); return }
    let classId = option.classRow?.id
    if (!classId && option.stream) {
      try {
        const existing = (data?.classes ?? []).find((item) => item.name.trim().toLowerCase() === option.stream!.name.trim().toLowerCase() || (item.code && option.stream!.code && item.code === option.stream!.code))
        const classRow = existing ?? await scheduling.createClass({ name: option.stream.name, code: option.stream.code ?? `STREAM-${option.stream.id}`, grade: data?.grades.find((grade) => grade.id === selectedGradeId)?.name })
        classId = classRow.id
        setData((current) => current ? { ...current, classes: current.classes.some((item) => item.id === classRow.id) ? current.classes : [...current.classes, classRow] } : current)
      } catch (err) { notify(friendlyApiError(err, 'prepare that stream for scheduling'), 'error'); return }
    }
    if (!classId) return
    const duplicate = drafts.some((item) => item.id !== editingDraftId && item.teacher_id === form.teacher_id && item.class_id === String(classId) && item.subject_id === form.subject_id)
    if (duplicate) { notify('That teacher, class and subject allocation is already in the list.', 'error'); return }
    const draft: DraftAllocation = { id: editingDraftId ?? `${Date.now()}-${Math.random()}`, teacher_id: form.teacher_id, level_id: form.level_id, grade_id: form.grade_id, class_id: String(classId), subject_id: form.subject_id, periods_per_week: Number(form.periods_per_week), double_periods: form.double_lesson ? 1 : 0 }
    setDrafts((current) => editingDraftId ? current.map((item) => item.id === editingDraftId ? draft : item) : [...current, draft])
    notify(editingDraftId ? 'Allocation updated.' : 'Allocation added to the list. Save when finished.', 'success')
    resetDraftForm()
  }

  function editDraft(draft: DraftAllocation) {
    setEditingDraftId(draft.id)
    setForm({ teacher_id: draft.teacher_id, level_id: draft.level_id, grade_id: draft.grade_id, class_id: draft.class_id, subject_id: draft.subject_id, periods_per_week: draft.periods_per_week, double_lesson: draft.double_periods > 0 })
  }
  function deleteDraft(id: string) { setDrafts((current) => current.filter((item) => item.id !== id)); if (editingDraftId === id) resetDraftForm(); notify('Allocation removed from the list.', 'success') }

  async function saveAllocations() {
    if (!drafts.length || saving) return
    setSaving(true)
    try { for (const draft of drafts) await scheduling.createRequirement({ class_id: Number(draft.class_id), subject_id: Number(draft.subject_id), teacher_id: Number(draft.teacher_id), periods_per_week: draft.periods_per_week, double_periods: draft.double_periods }); const count = drafts.length; setDrafts([]); notify(`${count} teaching allocation${count === 1 ? '' : 's'} saved.`, 'success'); await load() }
    catch (err) { notify(friendlyApiError(err, 'save teaching allocations'), 'error') }
    finally { setSaving(false) }
  }

  async function remove(row: Requirement) { try { await scheduling.deleteRequirement(row.id); notify('Teaching allocation removed.', 'success'); await load() } catch (err) { notify(friendlyApiError(err, 'remove that allocation'), 'error') } }

  function editSaved(row: Requirement) {
    const grade = data?.grades.find((item) => String(item.name).trim().toLowerCase() === String(row.class_name ?? '').trim().toLowerCase())
    const matchingClass = data?.classes.find((item) => String(item.name).trim().toLowerCase() === String(row.class_name ?? '').trim().toLowerCase())
    const matchingStream = data?.streams.find((stream) => String(stream.name).trim().toLowerCase() === String(row.class_name ?? '').trim().toLowerCase())
    const gradeId = grade?.id ?? matchingClass?.grade_id ?? matchingStream?.grade_id ?? null
    const levelId = data?.grades.find((item) => item.id === gradeId)?.level_id ?? null
    const classRow = matchingClass ?? (matchingStream ? data?.classes.find((item) => item.name.trim().toLowerCase() === matchingStream.name.trim().toLowerCase()) : null)
    setEditingSavedId(Number(row.id))
    setForm({ teacher_id: String(row.teacher_id ?? ''), level_id: String(levelId ?? ''), grade_id: String(gradeId ?? ''), class_id: classRow ? String(classRow.id) : '', subject_id: String(row.subject_id ?? ''), periods_per_week: Number(row.periods_per_week ?? 4), double_lesson: Number(row.double_periods ?? 0) > 0 })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveSavedEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingSavedId) return
    try {
      await scheduling.deleteRequirement(editingSavedId)
      await scheduling.createRequirement({ class_id: Number(form.class_id), subject_id: Number(form.subject_id), teacher_id: Number(form.teacher_id), periods_per_week: Number(form.periods_per_week), double_periods: form.double_lesson ? 1 : 0 })
      notify('Teaching allocation updated.', 'success')
      resetDraftForm()
      await load()
    } catch (err) { notify(friendlyApiError(err, 'update teaching allocation'), 'error') }
  }

  const summaryColumns: Column<TeacherSummary>[] = [
    { key: 'teacher', header: 'Teacher', render: (row) => row.teacher_name },
    { key: 'workload', header: 'Total workload', render: (row) => `${row.total_workload} lesson${row.total_workload === 1 ? '' : 's'}` },
    { key: 'details', header: 'Details', render: (row) => <button type="button" className="button button--ghost button--sm" onClick={() => setExpandedTeacher((current) => current === row.teacher_id ? null : row.teacher_id)}>{expandedTeacher === row.teacher_id ? 'Hide subjects' : 'View subjects'}</button> },
  ]
  const draftColumns: Column<(typeof draftRows)[number]>[] = [
    { key: 'teacher', header: 'Teacher', render: (row) => row.teacher_name },
    { key: 'class', header: 'Grade', render: (row) => row.class_name },
    { key: 'subject', header: 'Subject', render: (row) => row.subject_name },
    { key: 'workload', header: 'Workload', render: (row) => `${row.periods_per_week} lesson${row.periods_per_week === 1 ? '' : 's'}` },
    { key: 'double', header: 'DL', render: (row) => row.double_periods ? <Badge>DL</Badge> : '—' },
    { key: 'actions', header: 'Actions', render: (row) => <div className="form__row"><button type="button" className="button button--ghost button--sm" onClick={() => editDraft(row)}>Edit</button><button type="button" className="button button--ghost button--sm" onClick={() => deleteDraft(row.id)}>Delete</button></div> },
  ]

  return <>
    <PageHeader title="Teaching allocations" description="Assign each teacher to a level, then choose only the grades and streams belonging to that level." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Teaching Allocations' }]} />
    {error ? <ErrorState title="Teaching allocations could not load" message={error} onRetry={load} /> : <>
      {!ready && !loading && <Alert tone="info" title="Set up academic levels, grades, teachers and subjects first">Teaching allocations need academic levels and grades before streams can be selected.</Alert>}
      {ready && data && <section className="card section">
        <div className="toolbar"><div><h2 className="section__title">{editingDraftId || editingSavedId ? 'Edit teaching allocation' : 'Add teaching allocation'}</h2><p className="section__description">Select Level → Grade → Class / Stream.</p></div>{drafts.length > 0 && <Badge>{drafts.length} unsaved</Badge>}</div>
        <form className="form form--grid" onSubmit={editingSavedId ? saveSavedEdit : addDraft}>
          <div className="field"><label className="field__label" htmlFor="allocation-teacher">Teacher</label><select id="allocation-teacher" className="input input--select" value={form.teacher_id} onChange={(event) => setForm({ ...form, teacher_id: event.target.value })} required><option value="">Select a teacher</option>{data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label className="field__label" htmlFor="allocation-level">Level</label><select id="allocation-level" className="input input--select" value={form.level_id} onChange={(event) => changeLevel(event.target.value)} required><option value="">Select a level</option>{data.levels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label className="field__label" htmlFor="allocation-grade">Grade</label><select id="allocation-grade" className="input input--select" value={form.grade_id} onChange={(event) => changeGrade(event.target.value)} disabled={!form.level_id} required><option value="">{form.level_id ? 'Select a grade' : 'Select a level first'}</option>{filteredGrades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label className="field__label" htmlFor="allocation-class">Class / Stream</label><select id="allocation-class" className="input input--select" value={form.class_id} onChange={(event) => setForm({ ...form, class_id: event.target.value })} disabled={!form.grade_id} required><option value="">{form.grade_id ? (classOptions.length ? 'Select a class / stream' : 'No streams captured for this grade') : 'Select a grade first'}</option>{classOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <div className="field"><label className="field__label" htmlFor="allocation-subject">Subject</label><select id="allocation-subject" className="input input--select" value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} required><option value="">Select a subject</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label className="field__label" htmlFor="allocation-workload">Workload</label><select id="allocation-workload" className="input input--select" value={form.periods_per_week} onChange={(event) => setForm({ ...form, periods_per_week: Number(event.target.value) })} required>{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} lesson{value === 1 ? '' : 's'}</option>)}</select></div>
          <div className="field form--grid__full"><label className="form__check"><input type="checkbox" checked={form.double_lesson} onChange={(event) => setForm({ ...form, double_lesson: event.target.checked })} /><span>Include a double lesson</span></label></div>
          <div className="form__row form--grid__full"><button className="button button--primary" type="submit">{editingSavedId ? 'Update allocation' : editingDraftId ? 'Update allocation' : '+ Add allocation'}</button>{(editingDraftId || editingSavedId) && <button type="button" className="button button--ghost" onClick={resetDraftForm}>Cancel</button>}</div>
        </form>
      </section>}

      {ready && draftRows.length > 0 && <section className="card section"><div className="toolbar"><div><h2 className="section__title">Allocations to save</h2><p className="section__description">Review the allocations before saving.</p></div><div className="form__row"><button type="button" className="button button--ghost" onClick={() => { setDrafts([]); resetDraftForm() }} disabled={saving}>Clear</button><button type="button" className="button button--primary" onClick={saveAllocations} disabled={saving}>{saving ? 'Saving…' : `Save ${draftRows.length} allocation${draftRows.length === 1 ? '' : 's'}`}</button></div></div><DataTable caption="Allocations to save" columns={draftColumns} rows={draftRows} rowKey={(row) => row.id} /></section>}

      <section className="card section"><div className="toolbar"><div><h2 className="section__title">Saved teaching allocations</h2><p className="section__description">Teacher totals are shown here. Select a teacher to view all subjects and detailed workloads.</p></div><div className="search"><SearchIcon className="search__icon" width={18} height={18} /><label className="visually-hidden" htmlFor="allocation-search">Search allocations</label><input id="allocation-search" className="input input--search" type="search" placeholder="Search teacher or subject" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
        <DataTable caption="Teacher workload summary" columns={summaryColumns} rows={teacherSummaries} rowKey={(row) => row.teacher_id} loading={loading} loadingLabel="Loading teaching allocations" empty={<EmptyState title={query ? 'No matching allocations' : 'No teaching allocations yet'} description={query ? 'Nothing matches your search.' : 'Add an allocation above, then save it.'} icon={<CalendarIcon width={22} height={22} />} />} />
        {expandedTeacher !== null && (() => { const summary = teacherSummaries.find((item) => item.teacher_id === expandedTeacher); if (!summary) return null; const detailColumns: Column<Requirement>[] = [{ key: 'subject', header: 'Subject', render: (row) => row.subject_name ?? '—' }, { key: 'class', header: 'Grade', render: (row) => gradeLabel(row) }, { key: 'workload', header: 'Workload', render: (row) => `${row.periods_per_week} lesson${row.periods_per_week === 1 ? '' : 's'}` }, { key: 'double', header: 'DL', render: (row) => row.double_periods ? <Badge>DL</Badge> : '—' }]; return <div className="section" aria-label={`${summary.teacher_name} subject details`}><div className="toolbar"><div><h3 className="section__title">{summary.teacher_name} — subjects</h3><p className="section__description">Detailed workload report.</p></div><Badge>{summary.total_workload} lessons</Badge></div><DataTable caption={`${summary.teacher_name} subject workload`} columns={detailColumns} rows={summary.allocations} rowKey={(row) => row.id} rowActions={(row) => <div className="form__row"><button type="button" className="button button--ghost button--sm" onClick={() => editSaved(row)}>Edit</button><button type="button" className="button button--ghost button--sm" onClick={() => remove(row)}>Delete</button></div>} /></div> })()}
      </section>
    </>}
  </>
}
