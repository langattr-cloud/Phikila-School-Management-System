import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { SearchIcon } from '../components/icons'
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
  const selectedGradeId = Number(form.grade_id) || null
  const filteredGrades = useMemo(() => data?.grades.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) ?? [], [data])
  const filteredStreams = useMemo(() => !data || !selectedGradeId ? [] : data.streams.filter((stream) => stream.grade_id === selectedGradeId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [data, selectedGradeId])
  const classOptions = useMemo<ClassOption[]>(() => {
    if (!data || !selectedGradeId) return []
    const grade = data.grades.find((item) => item.id === selectedGradeId)
    const gradeName = grade?.name?.trim().toLowerCase() ?? ''
    const options: ClassOption[] = data.classes
      .filter((item) => {
        const classGradeId = item.grade_id == null ? null : Number(item.grade_id)
        const classGradeName = item.grade?.trim().toLowerCase() ?? ''
        return classGradeId === selectedGradeId || classGradeName === gradeName
      })
      .map((item) => ({ value: `class:${item.id}`, label: item.name, stream: null, classRow: item }))
    const existingNames = new Set(options.map((item) => item.label.trim().toLowerCase()))
    filteredStreams.forEach((stream) => {
      if (!existingNames.has(stream.name.trim().toLowerCase())) options.push({ value: `stream:${stream.id}`, label: stream.name, stream, classRow: null })
    })
    options.unshift({ value: `no-stream:${selectedGradeId}`, label: 'No stream', stream: null, classRow: options.find((item) => Boolean(item.classRow))?.classRow ?? null })
    return options
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

  const draftRows = useMemo(() => drafts.map((draft) => {
    const gradeName = data?.grades.find((item) => String(item.id) === draft.grade_id)?.name?.trim() ?? ''
    const classRow = data?.classes.find((item) => String(item.id) === draft.class_id)
    const streamOption = classOptions.find((item) => item.value === draft.class_id)
    const rawClassName = classRow?.name ?? streamOption?.label ?? '—'
    const className = gradeName && rawClassName !== '—' && !rawClassName.toLowerCase().startsWith(gradeName.toLowerCase()) ? `${gradeName} ${rawClassName}` : rawClassName
    return { ...draft, teacher_name: data?.teachers.find((item) => String(item.id) === draft.teacher_id)?.name ?? '—', class_name: className, subject_name: data?.subjects.find((item) => String(item.id) === draft.subject_id)?.name ?? '—' }
  }), [drafts, data, classOptions])

  function changeLevel(value: string) { setForm((current) => ({ ...current, level_id: value, grade_id: '', class_id: '' })) }
  function changeGrade(value: string) { setForm((current) => ({ ...current, grade_id: value, class_id: '' })) }
  function resetDraftForm() { setEditingDraftId(null); setEditingSavedId(null); setForm({ teacher_id: '', level_id: '', grade_id: '', class_id: '', subject_id: '', periods_per_week: 4, double_lesson: false }) }

  async function addDraft(event: FormEvent) {
    event.preventDefault()
    if (!form.teacher_id || !form.level_id || !form.grade_id || !form.class_id || !form.subject_id) { notify('Select teacher, academic level, grade, stream and subject.', 'error'); return }
    const option = classOptions.find((item) => item.value === form.class_id)
    if (!option) { notify('Select a valid stream.', 'error'); return }
    let classId = option.classRow?.id
    if (!classId && option.value.startsWith('no-stream:')) {
      try {
        const grade = data?.grades.find((item) => item.id === selectedGradeId)
        const existing = (data?.classes ?? []).find((item) => {
          const classGradeId = item.grade_id == null ? null : Number(item.grade_id)
          const classGradeName = item.grade?.trim().toLowerCase() ?? ''
          return classGradeId === selectedGradeId || classGradeName === grade?.name?.trim().toLowerCase()
        })
        const classRow = existing ?? await scheduling.createClass({ name: grade?.name ?? 'No stream', code: `NO-STREAM-${selectedGradeId}`, grade: grade?.name })
        classId = classRow.id
        setData((current) => current ? { ...current, classes: current.classes.some((item) => item.id === classRow.id) ? current.classes : [...current.classes, classRow] } : current)
      } catch (err) { notify(friendlyApiError(err, 'prepare this grade without a stream'), 'error'); return }
    }
    if (!classId && option.stream) {
      try {
        const existing = (data?.classes ?? []).find((item) => item.name.trim().toLowerCase() === option.stream!.name.trim().toLowerCase() || (item.code && option.stream!.code && item.code === option.stream!.code))
        const classRow = existing ?? await scheduling.createClass({ name: option.stream.name, code: option.stream.code ?? `STREAM-${option.stream.id}`, grade: data?.grades.find((grade) => grade.id === selectedGradeId)?.name })
        classId = classRow.id
        setData((current) => current ? { ...current, classes: current.classes.some((item) => item.id === classRow.id) ? current.classes : [...current.classes, classRow] } : current)
      } catch (err) { notify(friendlyApiError(err, 'prepare that stream for scheduling'), 'error'); return }
    }
    if (!classId) { notify('Select a stream or No stream for this grade before adding the allocation.', 'error'); return }
    const duplicate = drafts.some((item) => item.id !== editingDraftId && item.teacher_id === form.teacher_id && item.class_id === String(classId) && item.subject_id === form.subject_id)
    if (duplicate) { notify('That teacher, stream and subject allocation is already in the list.', 'error'); return }
    const draft: DraftAllocation = { id: editingDraftId ?? `${Date.now()}-${Math.random()}`, teacher_id: form.teacher_id, level_id: form.level_id, grade_id: form.grade_id, class_id: String(classId), subject_id: form.subject_id, periods_per_week: Number(form.periods_per_week), double_periods: form.double_lesson ? 1 : 0 }
    setDrafts((current) => editingDraftId ? current.map((item) => item.id === editingDraftId ? draft : item) : [...current, draft])
    notify(editingDraftId ? 'Allocation updated.' : 'Allocation added.', 'success')
    resetDraftForm()
  }

  function editDraft(draft: DraftAllocation) { setEditingDraftId(draft.id); setForm({ teacher_id: draft.teacher_id, level_id: draft.level_id, grade_id: draft.grade_id, class_id: draft.class_id, subject_id: draft.subject_id, periods_per_week: draft.periods_per_week, double_lesson: draft.double_periods > 0 }) }
  function deleteDraft(id: string) { setDrafts((current) => current.filter((item) => item.id !== id)); if (editingDraftId === id) resetDraftForm(); notify('Allocation removed.', 'success') }

  async function saveAllocations() {
    if (!drafts.length || saving) return
    setSaving(true)
    try { for (const draft of drafts) await scheduling.createRequirement({ class_id: Number(draft.class_id), subject_id: Number(draft.subject_id), teacher_id: Number(draft.teacher_id), periods_per_week: draft.periods_per_week, double_periods: draft.double_periods }); const count = drafts.length; setDrafts([]); notify(`${count} allocation${count === 1 ? '' : 's'} saved.`, 'success'); await load() }
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
    { key: 'class', header: 'Grade / Stream', render: (row) => row.class_name },
    { key: 'subject', header: 'Subject', render: (row) => row.subject_name },
    { key: 'workload', header: 'Lessons / week', render: (row) => `${row.periods_per_week} lesson${row.periods_per_week === 1 ? '' : 's'}` },
    { key: 'double', header: 'Double lesson', render: (row) => row.double_periods ? <Badge>Yes</Badge> : 'No' },
    { key: 'actions', header: 'Actions', render: (row) => <div className="form__row"><button type="button" className="button button--ghost button--sm" onClick={() => editDraft(row)}>Edit</button><button type="button" className="button button--ghost button--sm" onClick={() => deleteDraft(row.id)}>Delete</button></div> },
  ]

  return <>
    <PageHeader title="Teaching Allocations" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Teaching Allocations' }]} />
    {error ? <ErrorState title="Teaching allocations could not load" message={error} onRetry={load} /> : <>
      {!ready && !loading && <Alert tone="info" title="Complete academic setup first">Teaching allocations require academic levels, grades, teachers and subjects.</Alert>}
      {ready && data && <section className="card section">
        <div className="toolbar"><h2 className="section__title">{editingDraftId || editingSavedId ? 'Edit Teaching Allocation' : 'Add Teaching Allocation'}</h2><button type="button" className="button button--ghost" onClick={resetDraftForm}>Clear</button></div>
        <form className="form--grid" onSubmit={editingSavedId ? saveSavedEdit : addDraft}>
          <label><span>Teacher</span><select value={form.teacher_id} onChange={(event) => setForm((current) => ({ ...current, teacher_id: event.target.value }))}><option value="">Select teacher</option>{data.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
          <label><span>Academic level</span><select value={form.level_id} onChange={(event) => changeLevel(event.target.value)}><option value="">Select academic level</option>{data.levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
          <label><span>Grade</span><select value={form.grade_id} onChange={(event) => changeGrade(event.target.value)}><option value="">Select grade</option>{filteredGrades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
          <label><span>Stream</span><select value={form.class_id} onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value }))} disabled={!form.grade_id}><option value="">{form.grade_id ? 'Select stream' : 'Select grade first'}</option>{classOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>Subject</span><select value={form.subject_id} onChange={(event) => setForm((current) => ({ ...current, subject_id: event.target.value }))}><option value="">Select subject</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label><span>Lessons per week</span><select value={form.periods_per_week} onChange={(event) => setForm((current) => ({ ...current, periods_per_week: Number(event.target.value) }))}>{Array.from({ length: 20 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Double lesson</span><select value={form.double_lesson ? 'yes' : 'no'} onChange={(event) => setForm((current) => ({ ...current, double_lesson: event.target.value === 'yes' }))}><option value="no">No</option><option value="yes">Yes</option></select></label>
          <div className="form__actions"><button type="submit" className="button button--primary">{editingSavedId ? 'Update Allocation' : 'Add Allocation'}</button></div>
        </form>
      </section>}
      {ready && data && <section className="section">
        <div className="toolbar"><h2 className="section__title">Pending Allocations</h2>{drafts.length > 0 && <button type="button" className="button button--primary" onClick={saveAllocations} disabled={saving}>{saving ? 'Saving…' : `Save ${drafts.length} allocation${drafts.length === 1 ? '' : 's'}`}</button>}</div>
        {drafts.length ? <DataTable caption="Pending teaching allocations" columns={draftColumns} rows={draftRows} rowKey={(row) => row.id} empty={<EmptyState title="No pending allocations" description="Add an allocation above." />} /> : <EmptyState title="No pending allocations" description="Add an allocation above." />}
      </section>}
      {ready && data && <section className="section">
        <div className="toolbar"><h2 className="section__title">Saved Allocations</h2><label className="search"><SearchIcon width={18} height={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teacher, grade, subject…" /></label></div>
        {loading ? <div className="muted">Loading…</div> : teacherSummaries.length === 0 ? <EmptyState title="No allocations found" description="Add an allocation above or adjust your search." /> : <>
          <DataTable caption="Teacher workload summaries" columns={summaryColumns} rows={teacherSummaries} rowKey={(row) => row.teacher_id} empty={<EmptyState title="No allocations found" description="Add an allocation above or adjust your search." />} />
          {expandedTeacher !== null && <div className="section__content">
            <h3 className="section__title">{teacherSummaries.find((summary) => summary.teacher_id === expandedTeacher)?.teacher_name ?? 'Teacher'} — subjects</h3>
            <DataTable caption="Teacher subject allocations" columns={[
              { key: 'class', header: 'Grade / Stream', render: (row: Requirement) => row.class_name ?? '—' },
              { key: 'subject', header: 'Subject', render: (row: Requirement) => row.subject_name ?? '—' },
              { key: 'workload', header: 'Lessons / week', render: (row: Requirement) => `${row.periods_per_week} lesson${row.periods_per_week === 1 ? '' : 's'}` },
              { key: 'double', header: 'Double lesson', render: (row: Requirement) => Number(row.double_periods ?? 0) > 0 ? <Badge>Yes</Badge> : 'No' },
              { key: 'actions', header: 'Actions', render: (row: Requirement) => <div className="form__row"><button type="button" className="button button--ghost button--sm" onClick={() => editSaved(row)}>Edit</button><button type="button" className="button button--ghost button--sm" onClick={() => void remove(row)}>Delete</button></div> },
            ]} rows={teacherSummaries.find((summary) => summary.teacher_id === expandedTeacher)?.allocations ?? []} rowKey={(row) => row.id} empty={<EmptyState title="No allocations found" description="No saved allocations." />} />
          </div>}
        </>}
      </section>}
    </>}
  </>
}