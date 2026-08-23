import { useEffect, useMemo, useState } from 'react'
import { Alert } from './Alert'
import { useToast } from './Toast'
import { api, type Grade } from '../lib/api'
import { scheduling, type Requirement, type SchoolClass, type Subject, type Teacher } from '../lib/scheduling'

type Role = 'Subject teacher' | 'Class teacher' | 'Both'
type Draft = { id: string; subjectId: string; gradeId: string; lessons: string; role: Role }

const newRow = (): Draft => ({ id: crypto.randomUUID(), subjectId: '', gradeId: '', lessons: '1', role: 'Subject teacher' })

export function TeacherAssignments() {
  const { notify } = useToast()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [teacherId, setTeacherId] = useState('')
  const [rows, setRows] = useState<Draft[]>([])
  const [original, setOriginal] = useState<Requirement[]>([])
  const [classTeacherGrades, setClassTeacherGrades] = useState<string[]>([])
  const [originalClassTeacherGrades, setOriginalClassTeacherGrades] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [teacherData, subjectData, gradeData, classData, requirementData] = await Promise.all([scheduling.teachers(), scheduling.subjects(), api.grades(), scheduling.classes(), scheduling.requirements()])
      setTeachers(teacherData); setSubjects(subjectData); setGrades(gradeData); setClasses(classData); setRequirements(requirementData)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load teacher assignments.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const selectedTeacher = teachers.find(t => String(t.id) === teacherId)
  const teacherRequirements = useMemo(() => requirements.filter(r => r.teacher_id === Number(teacherId)), [requirements, teacherId])
  const subjectNames = useMemo(() => new Map(subjects.map(s => [s.id, s.name])), [subjects])

  function openAssignments() {
    if (!teacherId) return
    const existing = teacherRequirements
    setOriginal(existing)
    setRows(existing.map(r => ({ id: `existing-${r.id}`, subjectId: String(r.subject_id), gradeId: String(classes.find(c => c.id === r.class_id)?.grade ? grades.find(g => g.name === classes.find(c => c.id === r.class_id)?.grade)?.id ?? '' : ''), lessons: String(r.periods_per_week), role: 'Subject teacher' as Role })))
    const assigned = classes.filter(c => c.class_teacher_id === Number(teacherId)).map(c => String(grades.find(g => g.name === c.grade || g.code === c.grade)?.id ?? '')) .filter(Boolean)
    setClassTeacherGrades(assigned); setOriginalClassTeacherGrades(assigned); setError(null); setOpen(true)
  }

  function updateRow(id: string, key: keyof Draft, value: string) { setRows(current => current.map(row => row.id === id ? { ...row, [key]: value } : row)) }
  function addRow() { setRows(current => [...current, newRow()]) }
  function removeRow(id: string) { setRows(current => current.filter(row => row.id !== id)) }

  async function saveAll() {
    if (!selectedTeacher) return
    const valid = rows.every(r => r.subjectId && r.gradeId && Number(r.lessons) >= 1)
    if (!valid) { setError('Every subject assignment needs a subject, grade and at least one lesson per week.'); return }
    setSaving(true); setError(null)
    try {
      const desired = rows.map(r => ({ subjectId: Number(r.subjectId), gradeId: Number(r.gradeId), lessons: Number(r.lessons), role: r.role }))
      const classByGrade = new Map(grades.map(g => [g.id, classes.find(c => c.grade === g.name || c.grade === g.code)]))
      for (const old of original) await scheduling.deleteRequirement(old.id)
      for (const row of desired) {
        const grade = grades.find(g => g.id === row.gradeId)
        const klass = grade ? classByGrade.get(grade.id) : undefined
        if (!klass) throw new Error(`No class has been configured for ${grade?.name ?? 'the selected grade'}.`)
        await scheduling.createRequirement({ class_id: klass.id, subject_id: row.subjectId, teacher_id: selectedTeacher.id, periods_per_week: row.lessons, double_periods: 0 })
      }
      for (const grade of grades) {
        const klass = classByGrade.get(grade.id)
        if (!klass) continue
        const shouldBeClassTeacher = classTeacherGrades.includes(String(grade.id))
        const wasClassTeacher = originalClassTeacherGrades.includes(String(grade.id))
        if (shouldBeClassTeacher !== wasClassTeacher || (shouldBeClassTeacher && klass.class_teacher_id !== selectedTeacher.id)) await scheduling.updateClass(klass.id, { class_teacher_id: shouldBeClassTeacher ? selectedTeacher.id : null })
      }
      notify(`Assignments for ${selectedTeacher.name} saved.`, 'success'); setOpen(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save teacher assignments.') } finally { setSaving(false) }
  }

  return <section className="card section teacher-assignment-section">
    <div className="section__header"><div><p className="eyebrow">Teaching allocation</p><h2 className="section__title">Assign subjects, workload and roles</h2><p className="section__description">Select a teacher, add all subjects and weekly lessons, assign class-teacher grades, then save everything together.</p></div></div>
    {error && !open && <Alert tone="error">{error}</Alert>}
    <div className="streams-toolbar"><div><label className="label" htmlFor="assignment-teacher">Teacher</label><select id="assignment-teacher" className="input" value={teacherId} onChange={e => setTeacherId(e.target.value)} disabled={loading}><option value="">Select teacher</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}{t.code ? ` (${t.code})` : ''}</option>)}</select></div><button className="button button--primary" type="button" disabled={!teacherId || loading} onClick={openAssignments}>Assign subjects & roles</button></div>
    {open && <div className="streams-modal-backdrop"><div className="card streams-modal teacher-assignment-modal" role="dialog" aria-modal="true" aria-labelledby="teacher-assignment-title"><div className="grades-modal__header"><div><p className="eyebrow">Teacher workload</p><h2 id="teacher-assignment-title" className="section__title">{selectedTeacher?.name}</h2><p className="section__description">Assign multiple subjects, weekly lessons and class-teacher roles.</p></div><button className="button button--ghost button--sm" type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></div>{error && <Alert tone="error">{error}</Alert>}<div className="teacher-assignment__rows">{rows.map((row, index) => <div className="teacher-assignment__row" key={row.id}><div className="teacher-assignment__row-number">{index + 1}</div><div><label className="label">Subject</label><select className="input" value={row.subjectId} onChange={e => updateRow(row.id, 'subjectId', e.target.value)}><option value="">Select subject</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div><label className="label">Grade</label><select className="input" value={row.gradeId} onChange={e => updateRow(row.id, 'gradeId', e.target.value)}><option value="">Select grade</option>{grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div><div><label className="label">Lessons/week</label><input className="input" type="number" min="1" max="40" value={row.lessons} onChange={e => updateRow(row.id, 'lessons', e.target.value)} /></div><div><label className="label">Role</label><select className="input" value={row.role} onChange={e => updateRow(row.id, 'role', e.target.value)}><option>Subject teacher</option><option>Class teacher</option><option>Both</option></select></div><button className="button button--ghost button--sm teacher-assignment__remove" type="button" onClick={() => removeRow(row.id)}>Remove</button></div>)}{!rows.length && <p className="section__description">No subject assignments yet. Click Add to start.</p>}<button className="button button--ghost" type="button" onClick={addRow}>+ Add subject</button></div><div className="teacher-assignment__class-teacher"><div><strong>Class teacher grades</strong><p className="section__description">Select every grade this teacher is the class teacher for.</p></div><div className="teacher-assignment__grade-list">{grades.map(g => <label key={g.id} className="teacher-assignment__grade"><input type="checkbox" checked={classTeacherGrades.includes(String(g.id))} onChange={e => setClassTeacherGrades(current => e.target.checked ? [...current, String(g.id)] : current.filter(id => id !== String(g.id)))} />{g.name}</label>)}</div></div><div className="streams-modal__actions"><button className="button button--ghost" type="button" onClick={() => setOpen(false)} disabled={saving}>Cancel</button><button className="button button--primary" type="button" onClick={() => void saveAll()} disabled={saving}>{saving ? 'Saving…' : 'Save all assignments'}</button></div></div></div>}
  </section>
}
