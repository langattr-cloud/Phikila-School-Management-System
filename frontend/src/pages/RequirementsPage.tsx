import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { SearchIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { api, type Level } from '../lib/api'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Requirement, type SchoolClass, type Subject, type Teacher } from '../lib/scheduling'

type Data = { requirements: Requirement[]; classes: SchoolClass[]; levels: Level[]; subjects: Subject[]; teachers: Teacher[] }
type DraftAllocation = { id: string; teacher_id: string; level_id: string; class_id: string; subject_id: string; periods_per_week: number; double_periods: number }
type TeacherSummary = { teacher_id: number; teacher_name: string; total_workload: number; allocations: Requirement[] }

const WITHOUT_TEACHER = '__without_teacher__'

const numericPrefix = (value: unknown) => {
  const match = String(value ?? '').match(/\d+/)
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER
}

const naturalCompare = (a: unknown, b: unknown) => {
  const an = numericPrefix(a)
  const bn = numericPrefix(b)
  if (an !== bn) return an - bn
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' })
}

const normalizedTeacherId = (value: string | number | null | undefined) => {
  if (value === WITHOUT_TEACHER || value == null || String(value).trim() === '') return null
  return Number(value)
}

const isActiveLevel = (level: Level) => level.status === true || String(level.status ?? '').toUpperCase() === 'ACTIVE'

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
  const [form, setForm] = useState({ teacher_id: '', level_id: '', class_id: '', subject_id: '', periods_per_week: 4, double_lesson: false })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [requirements, classes, levels, subjects, teachers] = await Promise.all([
        scheduling.requirements(),
        scheduling.classes(),
        api.levels(),
        scheduling.subjects(),
        scheduling.teachers(),
      ])
      setData({
        requirements,
        classes,
        levels: levels.filter(isActiveLevel),
        subjects,
        teachers,
      })
    } catch (err) {
      setError(friendlyApiError(err, 'load teaching allocations'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const ready = Boolean(data && data.levels.length && data.subjects.length && data.classes.length)
  const orderedLevels = useMemo(() => data?.levels.slice().sort((a, b) => naturalCompare(a.name, b.name)) ?? [], [data])
  const selectedLevelId = Number(form.level_id) || null

  const orderedClasses = useMemo(() => {
    if (!data) return []
    return data.classes
      .filter((item) => selectedLevelId == null || Number(item.level_id) === selectedLevelId)
      .slice()
      .sort((a, b) => naturalCompare(a.code || a.name, b.code || b.name))
  }, [data, selectedLevelId])

  const filteredRequirements = useMemo(() => {
    const rows = data?.requirements ?? []
    const term = query.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.teacher_name, row.class_name, row.subject_name].some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [data, query])

  const teacherSummaries = useMemo<TeacherSummary[]>(() => {
    const grouped = new Map<number, TeacherSummary>()
    filteredRequirements.forEach((row) => {
      const id = Number(row.teacher_id ?? 0)
      if (!grouped.has(id)) grouped.set(id, { teacher_id: id, teacher_name: row.teacher_name ?? 'Without Teacher', total_workload: 0, allocations: [] })
      const summary = grouped.get(id)!
      summary.total_workload += Number(row.periods_per_week || 0)
      summary.allocations.push(row)
    })
    return Array.from(grouped.values()).sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, undefined, { sensitivity: 'base' }))
  }, [filteredRequirements])

  const draftRows = useMemo(() => drafts.map((draft) => {
    const classRow = data?.classes.find((item) => String(item.id) === draft.class_id)
    return {
      ...draft,
      teacher_name: draft.teacher_id === WITHOUT_TEACHER ? 'Without Teacher' : data?.teachers.find((item) => String(item.id) === draft.teacher_id)?.name ?? '—',
      class_name: classRow ? `${classRow.name} (${classRow.code})` : '—',
      subject_name: data?.subjects.find((item) => String(item.id) === draft.subject_id)?.name ?? '—',
    }
  }), [drafts, data])

  function resetForm() {
    setEditingDraftId(null)
    setEditingSavedId(null)
    setForm({ teacher_id: '', level_id: '', class_id: '', subject_id: '', periods_per_week: 4, double_lesson: false })
  }

  function changeLevel(value: string) {
    setForm((current) => ({ ...current, level_id: value, class_id: '' }))
  }

  function existingDuplicate(teacherId: string, classId: number, subjectId: string, ignoreId?: number) {
    const targetTeacherId = normalizedTeacherId(teacherId)
    return (data?.requirements ?? []).find((row) =>
      normalizedTeacherId(row.teacher_id) === targetTeacherId &&
      Number(row.class_id) === Number(classId) &&
      Number(row.subject_id) === Number(subjectId) &&
      Number(row.id) !== Number(ignoreId ?? 0)
    )
  }

  async function addDraft(event: FormEvent) {
    event.preventDefault()
    if (!form.teacher_id || !form.level_id || !form.class_id || !form.subject_id) {
      notify('Select teacher, level, class code and subject.', 'error')
      return
    }

    const classId = Number(form.class_id)
    const duplicateSaved = existingDuplicate(form.teacher_id, classId, form.subject_id, editingSavedId ?? undefined)
    const duplicateDraft = drafts.some((item) =>
      item.id !== editingDraftId &&
      normalizedTeacherId(item.teacher_id) === normalizedTeacherId(form.teacher_id) &&
      Number(item.class_id) === classId &&
      Number(item.subject_id) === Number(form.subject_id)
    )

    if (duplicateSaved || duplicateDraft) {
      const subject = data?.subjects.find((item) => Number(item.id) === Number(form.subject_id))?.name ?? 'this subject'
      const teacher = form.teacher_id === WITHOUT_TEACHER ? 'Without Teacher' : data?.teachers.find((item) => Number(item.id) === Number(form.teacher_id))?.name ?? 'this teacher'
      const schoolClass = data?.classes.find((item) => Number(item.id) === classId)
      notify(`${teacher} is already allocated ${subject} for ${schoolClass?.name ?? 'this class'}. The same details already exist.`, 'warning')
      return
    }

    const draft: DraftAllocation = {
      id: editingDraftId ?? `${Date.now()}-${Math.random()}`,
      teacher_id: form.teacher_id,
      level_id: form.level_id,
      class_id: String(classId),
      subject_id: form.subject_id,
      periods_per_week: Number(form.periods_per_week),
      double_periods: form.double_lesson ? 1 : 0,
    }

    setDrafts((current) => editingDraftId ? current.map((item) => item.id === editingDraftId ? draft : item) : [...current, draft])
    notify(editingDraftId ? 'Allocation updated.' : 'Allocation added.', 'success')
    resetForm()
  }

  function editDraft(draft: DraftAllocation) {
    setEditingDraftId(draft.id)
    setForm({ teacher_id: draft.teacher_id, level_id: draft.level_id, class_id: draft.class_id, subject_id: draft.subject_id, periods_per_week: draft.periods_per_week, double_lesson: draft.double_periods > 0 })
  }

  function deleteDraft(id: string) {
    setDrafts((current) => current.filter((item) => item.id !== id))
    if (editingDraftId === id) resetForm()
    notify('Allocation removed.', 'success')
  }

  async function saveAllocations() {
    if (!drafts.length || saving) return
    setSaving(true)
    try {
      for (const draft of drafts) {
        const duplicate = existingDuplicate(draft.teacher_id, Number(draft.class_id), draft.subject_id)
        if (duplicate) throw new Error(`The same allocation already exists for ${duplicate.teacher_name ?? 'Without Teacher'}, ${duplicate.class_name ?? 'this class'} and ${duplicate.subject_name ?? 'this subject'}.`)
        await scheduling.createRequirement({ class_id: Number(draft.class_id), subject_id: Number(draft.subject_id), teacher_id: normalizedTeacherId(draft.teacher_id), periods_per_week: draft.periods_per_week, double_periods: draft.double_periods })
      }
      const count = drafts.length
      setDrafts([])
      notify(`${count} allocation${count === 1 ? '' : 's'} saved.`, 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'save teaching allocations'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function editSaved(row: Requirement) {
    const schoolClass = data?.classes.find((item) => Number(item.id) === Number(row.class_id))
    const levelId = schoolClass?.level_id ?? ''
    setEditingSavedId(Number(row.id))
    setForm({ teacher_id: row.teacher_id == null ? WITHOUT_TEACHER : String(row.teacher_id), level_id: String(levelId), class_id: String(row.class_id), subject_id: String(row.subject_id), periods_per_week: Number(row.periods_per_week ?? 4), double_lesson: Number(row.double_periods ?? 0) > 0 })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveSavedEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingSavedId) return
    if (!form.teacher_id || !form.level_id || !form.class_id || !form.subject_id) {
      notify('Select teacher, level, class code and subject.', 'error')
      return
    }
    const duplicate = existingDuplicate(form.teacher_id, Number(form.class_id), form.subject_id, editingSavedId)
    if (duplicate) {
      notify('The same teacher, class code and subject details already exist.', 'warning')
      return
    }
    try {
      await scheduling.deleteRequirement(editingSavedId)
      await scheduling.createRequirement({ class_id: Number(form.class_id), subject_id: Number(form.subject_id), teacher_id: normalizedTeacherId(form.teacher_id), periods_per_week: Number(form.periods_per_week), double_periods: form.double_lesson ? 1 : 0 })
      notify('Teaching allocation updated.', 'success')
      resetForm()
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'update teaching allocation'), 'error')
    }
  }

  async function remove(row: Requirement) {
    try {
      await scheduling.deleteRequirement(row.id)
      notify('Teaching allocation removed.', 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'remove that allocation'), 'error')
    }
  }

  const summaryColumns: Column<TeacherSummary>[] = [
    { key: 'teacher', header: 'Teacher', render: (row) => row.teacher_name },
    { key: 'workload', header: 'Total Work Load', render: (row) => `${row.total_workload} lesson${row.total_workload === 1 ? '' : 's'}` },
    { key: 'details', header: 'View', render: (row) => <button type="button" className="button button--ghost button--sm" onClick={() => setExpandedTeacher((current) => current === row.teacher_id ? null : row.teacher_id)}>{expandedTeacher === row.teacher_id ? 'Hide' : 'View'}</button> },
  ]

  const draftColumns: Column<(typeof draftRows)[number]>[] = [
    { key: 'teacher', header: 'Teacher', render: (row) => row.teacher_name },
    { key: 'class', header: 'Class code', render: (row) => row.class_name },
    { key: 'subject', header: 'Subject', render: (row) => row.subject_name },
    { key: 'workload', header: 'Lessons / week', render: (row) => `${row.periods_per_week} lesson${row.periods_per_week === 1 ? '' : 's'}` },
    { key: 'double', header: 'Double lesson', render: (row) => row.double_periods ? <Badge>Yes</Badge> : 'No' },
    { key: 'actions', header: 'Actions', render: (row) => <div className="form__row"><button type="button" className="button button--ghost button--sm" onClick={() => editDraft(row)}>Edit</button><button type="button" className="button button--ghost button--sm" onClick={() => deleteDraft(row.id)}>Delete</button></div> },
  ]

  return <>
    <PageHeader title="Teaching Allocations" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Scheduling' }, { label: 'Teaching Allocations' }]} />
    {error ? <ErrorState title="Teaching allocations could not load" message={error} onRetry={load} /> : <>
      {!ready && !loading && <Alert tone="info" title="Complete academic setup first">Teaching allocations require academic levels, classes and subjects.</Alert>}

      {ready && data && <section className="card section">
        <div className="toolbar">
          <h2 className="section__title">{editingDraftId || editingSavedId ? 'Edit Teaching Allocation' : 'Teaching Allocation'}</h2>
          {(editingDraftId || editingSavedId) && <button type="button" className="button button--ghost" onClick={resetForm}>Cancel</button>}
        </div>
        <form className="form--grid" onSubmit={editingSavedId ? saveSavedEdit : addDraft}>
          <label><span>Teacher</span><select value={form.teacher_id} onChange={(event) => setForm((current) => ({ ...current, teacher_id: event.target.value }))}><option value="">Select teacher</option><option value={WITHOUT_TEACHER}>Without Teacher</option>{data.teachers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((teacher: Teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
          <label><span>Level</span><select value={form.level_id} onChange={(event) => changeLevel(event.target.value)}><option value="">Select level</option>{orderedLevels.map((level: Level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
          <label><span>Class code</span><select value={form.class_id} onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value }))} disabled={!form.level_id}><option value="">{form.level_id ? (orderedClasses.length ? 'Select class code' : 'No class codes available') : 'Select level first'}</option>{orderedClasses.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.code} — {schoolClass.name}</option>)}</select></label>
          <label><span>Subject</span><select value={form.subject_id} onChange={(event) => setForm((current) => ({ ...current, subject_id: event.target.value }))}><option value="">Select subject</option>{data.subjects.slice().sort((a, b) => a.name.localeCompare(b.name)).map((subject: Subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label><span>Lessons per week</span><select value={form.periods_per_week} onChange={(event) => setForm((current) => ({ ...current, periods_per_week: Number(event.target.value) }))}>{Array.from({ length: 20 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Double lesson</span><select value={form.double_lesson ? 'yes' : 'no'} onChange={(event) => setForm((current) => ({ ...current, double_lesson: event.target.value === 'yes' }))}><option value="no">No</option><option value="yes">Yes</option></select></label>
          <div className="form__actions"><button type="submit" className="button button--primary">{editingSavedId ? 'Update Allocation' : 'Add'}</button></div>
        </form>
      </section>}

      {ready && data && <section className="section">
        <div className="toolbar"><h2 className="section__title">Pending Allocations</h2>{drafts.length > 0 && <button type="button" className="button button--primary" onClick={() => void saveAllocations()} disabled={saving}>{saving ? 'Saving…' : `Save selected allocation${drafts.length === 1 ? '' : 's'}`}</button>}</div>
        {drafts.length ? <DataTable caption="Pending teaching allocations" columns={draftColumns} rows={draftRows} rowKey={(row) => row.id} empty={<EmptyState title="No pending allocations" description="Add an allocation above." />} /> : <EmptyState title="No pending allocations" description="Add an allocation above." />}
      </section>}

      {ready && data && <section className="section">
        <div className="toolbar"><h2 className="section__title">Teacher Work Load</h2><label className="search"><SearchIcon width={18} height={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teacher, class, subject…" /></label></div>
        {loading ? <div className="muted">Loading…</div> : teacherSummaries.length === 0 ? <EmptyState title="No allocations found" description="Add an allocation above or adjust your search." /> : <>
          <DataTable caption="Teacher workload summaries" columns={summaryColumns} rows={teacherSummaries} rowKey={(row) => row.teacher_id} empty={<EmptyState title="No allocations found" description="Add an allocation above or adjust your search." />} />
          {expandedTeacher !== null && <div className="section__content">
            <h3 className="section__title">{teacherSummaries.find((summary) => summary.teacher_id === expandedTeacher)?.teacher_name ?? 'Teacher'} — subjects and classes</h3>
            <DataTable caption="Teacher subject and class allocations" columns={[
              { key: 'class', header: 'Class', render: (row: Requirement) => { const schoolClass = data.classes.find((item) => Number(item.id) === Number(row.class_id)); return schoolClass ? `${schoolClass.code} — ${schoolClass.name}` : row.class_name ?? '—' } },
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