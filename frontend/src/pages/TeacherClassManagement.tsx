import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiFetch, friendlyApiError, type SchoolClassSetup } from '../lib/api'
import { PageHeader } from '../components/PageHeader'

type Teacher = {
  id: string | number
  name: string
  code: string
  email?: string | null
  subject?: string | null
  unavailable: string[]
  color: string
  count: number
  first_name?: string
  last_name?: string
}
type SchoolClass = SchoolClassSetup & {
  display_name?: string | null
  class_teacher_id?: number | null
  student_count?: number
  count?: number
}
type Tab = 'teachers' | 'classes'
type TeacherForm = { name: string; code: string; email: string; subject: string; classId: string; color: string }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const PERIODS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
const styles = `
.staff-page{color:var(--text,#172033);padding:clamp(16px,3vw,30px);max-width:1440px;margin:0 auto}
.staff-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap;margin-bottom:22px}
.staff-head h1{font-size:clamp(24px,3vw,32px);margin:0 0 7px;font-weight:750;letter-spacing:-.6px}
.staff-muted{color:var(--muted,#697386);font-size:14px;margin:0}
.staff-actions{display:flex;gap:9px;flex-wrap:wrap}
.staff-btn{border:1px solid var(--border,#dce2ea);background:var(--surface,#fff);color:var(--text,#172033);padding:10px 14px;border-radius:9px;font-weight:650;cursor:pointer;font-size:13px}
.staff-btn.primary{background:#176b4d;border-color:#176b4d;color:white}.staff-btn:disabled{opacity:.55;cursor:not-allowed}
.staff-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:22px}
.staff-stat{border:1px solid var(--border,#e1e6ed);background:var(--surface,#fff);border-radius:12px;padding:17px}
.staff-stat span{font-size:12px;color:var(--muted,#697386);display:block;margin-bottom:8px}.staff-stat strong{font-size:26px;letter-spacing:-.5px}
.staff-panel{background:var(--surface,#fff);border:1px solid var(--border,#e1e6ed);border-radius:12px;overflow:hidden}
.staff-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:15px;border-bottom:1px solid var(--border,#e1e6ed)}
.staff-tabs{display:flex;gap:5px;background:var(--soft,#f3f5f8);padding:4px;border-radius:9px}
.staff-tab{border:0;background:transparent;padding:9px 13px;border-radius:7px;font-weight:650;color:var(--muted,#697386);cursor:pointer}
.staff-tab[aria-selected=true]{background:var(--surface,#fff);color:var(--text,#172033);box-shadow:0 1px 3px #00000012}
.staff-search{border:1px solid var(--border,#dce2ea);background:var(--surface,#fff);border-radius:8px;padding:10px 12px;min-width:220px;color:inherit;font:inherit;font-size:13px}
.staff-table-wrap{overflow:auto}.staff-table{width:100%;border-collapse:collapse;min-width:680px}
.staff-table th{text-align:left;color:var(--muted,#697386);font-size:11px;text-transform:uppercase;letter-spacing:.55px;background:var(--soft,#f7f8fa);padding:12px 15px;font-weight:700}
.staff-table td{padding:12px 15px;border-top:1px solid var(--border,#edf0f4);font-size:13px;vertical-align:middle}
.staff-name{font-weight:700;text-transform:capitalize}.staff-sub{display:block;font-size:11px;color:var(--muted,#697386);margin-top:3px}
.staff-code{display:inline-flex;align-items:center;justify-content:center;background:var(--soft,#f0f3f7);border-radius:6px;padding:5px 8px;font-weight:700;min-width:30px}
.staff-chip{display:inline-block;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:700;background:#e6f5ec;color:#176b4d}
.staff-week{display:grid;gap:5px;min-width:240px}.staff-day{display:grid;grid-template-columns:24px repeat(8,minmax(12px,1fr));align-items:center;gap:3px}
.staff-day-label{font-size:10px;color:var(--muted,#697386);font-weight:700}
.staff-slot{height:12px;border:1px solid #b8e3c6;background:#52b76d;border-radius:2px;cursor:pointer;padding:0}
.staff-slot.off{background:#d84b4b;border-color:#d84b4b}.staff-slot:disabled{cursor:wait;opacity:.65}
.staff-slot:focus-visible{outline:2px solid #176b4d;outline-offset:2px}
.staff-legend{display:flex;align-items:center;gap:12px;font-size:11px;color:var(--muted,#697386)}.staff-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;background:#52b76d}.staff-legend .off i{background:#d84b4b}
.staff-row-actions{display:flex;gap:6px}.staff-iconbtn{border:1px solid var(--border,#dce2ea);background:transparent;border-radius:7px;padding:6px 9px;cursor:pointer;color:inherit}
.staff-empty{padding:34px;text-align:center;color:var(--muted,#697386)}
.staff-modal-backdrop{position:fixed;inset:0;background:#10182880;display:flex;align-items:center;justify-content:center;padding:18px;z-index:1000}
.staff-modal{width:min(100%,520px);max-height:90vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#172033);border-radius:14px;padding:24px;box-shadow:0 20px 60px #0003}
.staff-modal h2{margin:0 0 5px;font-size:22px}.staff-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}
.staff-field{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:650}
.staff-field input,.staff-field select{width:100%;box-sizing:border-box;border:1px solid var(--border,#dce2ea);border-radius:8px;padding:11px;background:var(--surface,#fff);color:inherit;font:inherit;font-size:13px}
.staff-field.full{grid-column:1/-1}.staff-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}
.staff-note{padding:12px 15px;border-top:1px solid var(--border,#e1e6ed);color:var(--muted,#697386);font-size:12px}
.staff-error{margin:12px 0;padding:12px;border-radius:8px;background:#fff1f0;color:#a61b1b;font-size:13px}
@media(max-width:650px){.staff-stats{grid-template-columns:1fr}.staff-form{grid-template-columns:1fr}.staff-field.full{grid-column:auto}.staff-toolbar{align-items:stretch}.staff-search{min-width:0;width:100%;box-sizing:border-box}}
`

const teacherName = (teacher: Teacher) => teacher.name || [teacher.first_name, teacher.last_name].filter(Boolean).join(' ')
const className = (schoolClass: SchoolClass) => schoolClass.display_name || schoolClass.name
const classCode = (schoolClass: SchoolClass) => schoolClass.code || ''
const defaultForm: TeacherForm = { name: '', code: '', email: '', subject: '', classId: '', color: '#176b4d' }

export default function TeacherClassManagement() {
  const [tab, setTab] = useState<Tab>('teachers')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | number | null>(null)
  const [form, setForm] = useState<TeacherForm>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [teacherRows, classRows] = await Promise.all([
        apiFetch<Teacher[]>('/api/v1/teachers'),
        apiFetch<SchoolClass[]>('/api/v1/academics/classes'),
      ])
      setTeachers(teacherRows.map(t => ({ ...t, name: teacherName(t), unavailable: Array.isArray(t.unavailable) ? t.unavailable : [], color: t.color || '#176b4d', count: Number(t.count) || 0 })))
      setClasses(classRows)
    } catch (e) {
      setError(friendlyApiError(e, 'load teachers and classes'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadRecords() }, [loadRecords])

  const assigned = useMemo(() => classes.filter(c => c.class_teacher_id != null).length, [classes])
  const visibleTeachers = useMemo(() => teachers.filter(t => [teacherName(t), t.code, t.email, t.subject, classes.find(c => String(c.class_teacher_id) === String(t.id))?.name].join(' ').toLowerCase().includes(query.toLowerCase())), [teachers, classes, query])
  const visibleClasses = useMemo(() => classes.filter(c => [className(c), classCode(c), teachers.find(t => String(t.id) === String(c.class_teacher_id))?.name].join(' ').toLowerCase().includes(query.toLowerCase())), [classes, teachers, query])

  const openTeacher = (teacher?: Teacher) => {
    setEditingId(teacher?.id ?? null)
    const assignedClass = teacher ? classes.find(c => String(c.class_teacher_id) === String(teacher.id)) : undefined
    setForm(teacher ? {
      name: teacherName(teacher),
      code: teacher.code || '',
      email: teacher.email || '',
      subject: teacher.subject || '',
      classId: assignedClass ? String(assignedClass.id) : '',
      color: teacher.color || '#176b4d',
    } : { ...defaultForm, code: String(Math.max(0, ...teachers.map(t => Number(t.code) || 0)) + 1) })
    setModal(true)
    setNotice('')
    setError('')
  }

  const saveTeacher = async (event: FormEvent) => {
    event.preventDefault()
    const name = form.name.trim()
    const code = form.code.trim()
    if (!name || !code) { setError('Teacher name and short code are required.'); return }
    if (teachers.some(t => t.code.toLowerCase() === code.toLowerCase() && String(t.id) !== String(editingId))) {
      setError('That teacher short code is already in use.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = { name, code, email: form.email.trim(), subject: form.subject.trim(), color: form.color }
      const saved = editingId == null
        ? await apiFetch<Teacher>('/api/v1/teachers', { method: 'POST', body: JSON.stringify({ ...payload, unavailable: [] }) })
        : await apiFetch<Teacher>(`/api/v1/teachers/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      const previousClass = classes.find(c => String(c.class_teacher_id) === String(saved.id))
      const desiredClassId = form.classId
      if (previousClass && String(previousClass.id) !== desiredClassId) {
        await apiFetch(`/api/v1/academics/classes/${previousClass.id}`, { method: 'PATCH', body: JSON.stringify({ class_teacher_id: null }) })
      }
      if (desiredClassId && (!previousClass || String(previousClass.id) !== desiredClassId)) {
        await apiFetch(`/api/v1/academics/classes/${desiredClassId}`, { method: 'PATCH', body: JSON.stringify({ class_teacher_id: Number(saved.id) }) })
      }
      setModal(false)
      setNotice(editingId == null ? 'Teacher added.' : 'Teacher updated.')
      await loadRecords()
    } catch (e) {
      setError(friendlyApiError(e, 'save teacher'))
    } finally {
      setSaving(false)
    }
  }

  const removeTeacher = async (teacher: Teacher) => {
    if (!window.confirm(`Remove ${teacherName(teacher)} from the teacher list?`)) return
    setSaving(true)
    setError('')
    try {
      const assignedClass = classes.find(c => String(c.class_teacher_id) === String(teacher.id))
      if (assignedClass) await apiFetch(`/api/v1/academics/classes/${assignedClass.id}`, { method: 'PATCH', body: JSON.stringify({ class_teacher_id: null }) })
      await apiFetch(`/api/v1/teachers/${teacher.id}`, { method: 'DELETE' })
      setNotice('Teacher removed.')
      await loadRecords()
    } catch (e) {
      setError(friendlyApiError(e, 'remove teacher'))
    } finally {
      setSaving(false)
    }
  }

  const toggleSlot = async (teacher: Teacher, slot: string) => {
    const unavailable = teacher.unavailable.includes(slot) ? teacher.unavailable.filter(s => s !== slot) : [...teacher.unavailable, slot]
    setTeachers(current => current.map(t => String(t.id) === String(teacher.id) ? { ...t, unavailable } : t))
    try {
      await apiFetch(`/api/v1/teachers/${teacher.id}/management-settings`, { method: 'PUT', body: JSON.stringify({ unavailable, color: teacher.color, count: teacher.count }) })
      setNotice(`Availability saved for ${teacherName(teacher)}.`)
    } catch (e) {
      setError(friendlyApiError(e, 'save teacher availability'))
      await loadRecords()
    }
  }

  const exportCsv = () => {
    const rows = tab === 'teachers'
      ? [['Name', 'Short code', 'Email', 'Class teacher', 'Subject', 'Unavailable periods'], ...teachers.map(t => [teacherName(t), t.code, t.email ?? '', classes.find(c => String(c.class_teacher_id) === String(t.id))?.name ?? '', t.subject ?? '', t.unavailable.join('; ')])]
      : [['Class', 'Short code', 'Student count', 'Class teacher'], ...classes.map(c => [className(c), classCode(c), String(c.count ?? c.student_count ?? 0), teachers.find(t => String(t.id) === String(c.class_teacher_id))?.name ?? ''])]
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `phikila-${tab}.csv`
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const saveJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ teachers, classes }, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'phikila-teachers-classes.json'
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="staff-page">
    <style>{styles}</style>
    <PageHeader title="Teachers & classes" description="Manage teacher records, class-teacher assignments and weekly availability." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'School setup', to: '/setup/school-structure' }, { label: 'Teachers & classes' }]} />
    <header className="staff-head"><div><p className="staff-muted">Teacher records and assignments are saved to the school database.</p></div><div className="staff-actions"><button className="staff-btn" onClick={saveJson} disabled={loading}>Export backup</button><button className="staff-btn" onClick={exportCsv} disabled={loading}>Export CSV</button><button className="staff-btn primary" onClick={() => openTeacher()} disabled={loading || saving}>＋ Add teacher</button></div></header>
    <section className="staff-stats" aria-label="Management summary"><div className="staff-stat"><span>Total teachers</span><strong>{teachers.length}</strong></div><div className="staff-stat"><span>Classes / streams</span><strong>{classes.length}</strong></div><div className="staff-stat"><span>Classes with a class teacher</span><strong>{assigned}</strong></div></section>
    {error && <div className="staff-error" role="alert">{error} <button className="staff-iconbtn" onClick={() => setError('')}>Dismiss</button></div>}
    {notice && <div role="status" className="staff-note">{notice} <button className="staff-iconbtn" onClick={() => setNotice('')}>Dismiss</button></div>}
    <section className="staff-panel">
      <div className="staff-toolbar"><div className="staff-tabs" role="tablist" aria-label="Records"><button className="staff-tab" role="tab" aria-selected={tab === 'teachers'} onClick={() => { setTab('teachers'); setQuery('') }}>Teachers ({teachers.length})</button><button className="staff-tab" role="tab" aria-selected={tab === 'classes'} onClick={() => { setTab('classes'); setQuery('') }}>Classes ({classes.length})</button></div><input className="staff-search" aria-label="Search records" placeholder={`Search ${tab}…`} value={query} onChange={e => setQuery(e.target.value)} /></div>
      {loading ? <div className="staff-empty" role="status">Loading teacher and class records…</div> : tab === 'teachers' ? <>
        <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Teacher</th><th>Short</th><th>Class teacher</th><th>Weekly availability · click to toggle</th><th>Actions</th></tr></thead><tbody>{visibleTeachers.map(t => {
          const assignedClass = classes.find(c => String(c.class_teacher_id) === String(t.id))
          return <tr key={t.id}><td><span className="staff-name">{teacherName(t)}</span><span className="staff-sub">{t.email || t.subject || 'Teacher record'}</span></td><td><span className="staff-code">{t.code}</span></td><td>{assignedClass ? <span className="staff-chip">{classCode(assignedClass) || className(assignedClass)}</span> : <span className="staff-muted">Not assigned</span>}</td><td><div className="staff-week" aria-label={`Availability for ${teacherName(t)}`}>{DAYS.map(day => <div className="staff-day" key={day}><span className="staff-day-label">{day}</span>{PERIODS.map(period => { const slot = `${day}-${period}`; const off = t.unavailable.includes(slot); return <button key={slot} type="button" className={`staff-slot ${off ? 'off' : ''}`} title={`${day} ${period}: ${off ? 'Unavailable' : 'Available'}`} aria-label={`${teacherName(t)}, ${day} ${period}, ${off ? 'unavailable' : 'available'}; toggle`} disabled={saving} onClick={() => void toggleSlot(t, slot)} /> })}</div>)}</div><span className="staff-sub">{t.unavailable.length} unavailable periods · 8 periods per day</span></td><td><div className="staff-row-actions"><button className="staff-iconbtn" onClick={() => openTeacher(t)} disabled={saving} aria-label={`Edit ${teacherName(t)}`}>Edit</button><button className="staff-iconbtn" onClick={() => void removeTeacher(t)} disabled={saving} aria-label={`Remove ${teacherName(t)}`}>Remove</button></div></td></tr>
        })}</tbody></table>{visibleTeachers.length === 0 && <div className="staff-empty">No teachers match your search.</div>}</div>
        <div className="staff-note"><div className="staff-legend"><span><i /> Available</span><span className="off"><i /> Unavailable / time off</span><span>Changes save to Supabase immediately.</span></div></div>
      </> : <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Class name</th><th>Short</th><th>Student count</th><th>Class teacher</th></tr></thead><tbody>{visibleClasses.map(c => <tr key={c.id}><td><span className="staff-name">{className(c)}</span></td><td><span className="staff-code">{classCode(c) || '—'}</span></td><td>{c.count ?? c.student_count ?? 0}</td><td>{teachers.find(t => String(t.id) === String(c.class_teacher_id))?.name || <span className="staff-muted">Not assigned</span>}</td></tr>)}</tbody></table>{visibleClasses.length === 0 && <div className="staff-empty">No classes match your search.</div>}<div className="staff-note">Classes are read from the canonical school setup. To add or remove classes, use School Structure; assign a class teacher by editing a teacher record.</div></div>}
    </section>
    {modal && <div className="staff-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setModal(false) }}><section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title"><h2 id="staff-modal-title">{editingId == null ? 'Add' : 'Edit'} teacher</h2><p className="staff-muted">Fields marked with * are required.</p><form onSubmit={saveTeacher}><div className="staff-form"><label className="staff-field full">Full name *<input autoFocus required maxLength={120} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></label><label className="staff-field">Short code *<input required maxLength={30} value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} /></label><label className="staff-field">Email<input type="email" maxLength={254} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></label><label className="staff-field">Subject / department<input maxLength={100} value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} /></label><label className="staff-field">Class teacher assignment<select value={form.classId} onChange={e => setForm(p => ({ ...p, classId: e.target.value }))}><option value="">Not assigned</option>{classes.map(c => <option key={c.id} value={String(c.id)}>{className(c)} ({classCode(c) || c.id})</option>)}</select></label><label className="staff-field">Availability color<input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} /></label></div><div className="staff-modal-actions"><button type="button" className="staff-btn" onClick={() => setModal(false)} disabled={saving}>Cancel</button><button type="submit" className="staff-btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save teacher'}</button></div></form></section></div>}
  </div>
}
