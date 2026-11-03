import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from '../components/Alert'
import { LoadingBlock } from '../components/States'
import { apiFetch, friendlyApiError } from '../lib/api'
import { useToast } from '../components/Toast'
import { usePlatformSession } from '../lib/session'

type Book = { id: number; title: string; author?: string | null; grade?: string; subject?: string; total_copies?: number }
type Copy = { id: string; book_id: number; copy_number: string; status: 'available' | 'with_teacher' | 'with_student' | 'lost' | 'unreconciled' | 'excluded'; current_holder_type: string; current_holder_id: number | null; current_holder_name: string | null; condition: string; book?: { id: number; title: string } | null }
type Stats = { total_titles: number; total_copies: number; available_copies: number; with_teachers: number; with_students: number; lost_copies: number; excluded_copies: number; unreconciled_copies: number }
type PlatformLibraryOverview = { school_count: number; schools: Array<{ school_id: number; school_name: string; total_titles: number; total_copies: number; available_copies: number; with_teachers: number; with_students: number; lost_copies: number }> }
type Timetable = { data?: { lessons?: Array<{ className: string; subject: string; teacher: string }>; classDetails?: Record<string, { grade?: string }> } | null }
type Teacher = { id: number; name: string }
type Allocation = { copy_id: string; copy_number: string; book_title: string; accountable_teacher_name: string; student_name: string; student_admission_number: string | null; student_class: string | null; student_issue_at: string | null; status?: string }

const panelStyle: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 24, boxShadow: '0 12px 32px rgba(35, 20, 75, .08)', border: '1px solid rgba(20,20,40,.06)' }
const fieldStyle: React.CSSProperties = { width: '100%', border: '2px solid #d9d5e8', borderRadius: 12, padding: '11px 13px', background: '#fff', color: '#202044', minWidth: 0 }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#66647a', marginBottom: 7 }
const gradientButton: React.CSSProperties = { border: 0, borderRadius: 999, padding: '12px 20px', color: '#fff', fontWeight: 800, background: 'linear-gradient(100deg,#6337d7,#df4d9a)', cursor: 'pointer' }

function scopedLibraryFetch<T>(path: string, schoolId: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('X-School-Id', schoolId)
  return apiFetch<T>(path, { ...init, headers })
}

export default function LibraryPage() {
  const { notify } = useToast()
  const { session: platformSession } = usePlatformSession()
  const isSuperAdmin = platformSession?.is_super_admin ?? false
  const [platformOverview, setPlatformOverview] = useState<PlatformLibraryOverview | null>(null)
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [availableSchools, setAvailableSchools] = useState<Array<{ id: number; name: string; role: string }>>([])
  const schoolChoices = useMemo(
    () => isSuperAdmin && platformOverview
      ? platformOverview.schools.map(school => ({ id: school.school_id, name: school.school_name, role: 'super_admin' }))
      : availableSchools,
    [isSuperAdmin, platformOverview, availableSchools],
  )
  const [books, setBooks] = useState<Book[]>([])
  const [copies, setCopies] = useState<Copy[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [timetable, setTimetable] = useState<Timetable['data']>(null)
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loadWarnings, setLoadWarnings] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedBookId, setSelectedBookId] = useState('')
  const [viewBookId, setViewBookId] = useState('')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [typedRange, setTypedRange] = useState('')
  const [selectedCopyIds, setSelectedCopyIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSuperAdmin && !selectedSchoolId && schoolChoices.length === 1) setSelectedSchoolId(String(schoolChoices[0].id))
  }, [isSuperAdmin, selectedSchoolId, schoolChoices])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setLoadWarnings([])
    try {
      const entitledSchools = await apiFetch<Array<{ id: number; name: string; role: string }>>('/api/v1/library/available-schools')
      setAvailableSchools(entitledSchools)
      if (isSuperAdmin && !selectedSchoolId) {
        const overview = await apiFetch<PlatformLibraryOverview>('/api/v1/library/platform-overview')
        setPlatformOverview(overview)
        setBooks([]); setCopies([]); setStats(null); setTimetable(null); setTeachers([]); setAllocations([])
        return
      }
      if (!selectedSchoolId) { setBooks([]); setCopies([]); setStats(null); setTimetable(null); setTeachers([]); setAllocations([]); return }
      setPlatformOverview(null)
      const [bookRows, copyRows, overview] = await Promise.all([
        scopedLibraryFetch<Book[]>('/api/v1/library/books', selectedSchoolId),
        scopedLibraryFetch<Copy[]>('/api/v1/library/copies', selectedSchoolId),
        scopedLibraryFetch<Stats>('/api/v1/library/books/stats', selectedSchoolId),
      ])
      setBooks(bookRows)
      setCopies(copyRows)
      setStats(overview)
      const [workspace, directory, studentRows] = await Promise.allSettled([
        scopedLibraryFetch<Timetable>('/api/v1/timetable/workspace', selectedSchoolId),
        scopedLibraryFetch<Teacher[]>('/api/v1/library/teacher-directory', selectedSchoolId),
        scopedLibraryFetch<{ items: Allocation[] }>('/api/v1/library/student-allocations', selectedSchoolId),
      ])
      const warnings: string[] = []
      if (workspace.status === 'fulfilled') setTimetable(workspace.value.data ?? null)
      else { setTimetable(null); warnings.push('Timetable data could not be loaded. Teacher, subject and grade choices may be incomplete.') }
      if (directory.status === 'fulfilled') setTeachers(directory.value)
      else { setTeachers([]); warnings.push('Teacher directory could not be loaded. Issuing to teachers is unavailable until it recovers.') }
      if (studentRows.status === 'fulfilled') setAllocations(studentRows.value.items ?? [])
      else { setAllocations([]); warnings.push('Student allocation records could not be loaded. The student list is not being treated as empty inventory.') }
      setLoadWarnings(warnings)
    } catch (err) {
      setError(friendlyApiError(err, 'load the Library dashboard'))
    } finally {
      setLoading(false)
    }
  }, [isSuperAdmin, selectedSchoolId])

  useEffect(() => { void load() }, [load])

  const assignments = useMemo(() => {
    const byName = new Map(teachers.map(t => [t.name.trim().toLocaleLowerCase(), t]))
    return (timetable?.lessons ?? []).map(lesson => {
      const className = String(lesson.className ?? '').trim()
      const grade = String(timetable?.classDetails?.[className]?.grade ?? className.match(/(?:grade|form|year)\s*\d+/i)?.[0] ?? '').trim()
      const teacherName = String(lesson.teacher ?? '').trim()
      const teacher = byName.get(teacherName.toLocaleLowerCase())
      return { teacherId: teacher?.id ?? null, teacherName, subject: String(lesson.subject ?? '').trim(), grade }
    }).filter(row => row.teacherId != null && row.teacherName && row.subject && row.grade)
  }, [timetable, teachers])

  const teacherOptions = useMemo(() => {
    const map = new Map<number, string>()
    assignments.forEach(row => map.set(row.teacherId as number, row.teacherName))
    return [...map].map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name))
  }, [assignments])
  const teacherAssignments = assignments.filter(row => String(row.teacherId) === selectedTeacherId)
  const subjectOptions = [...new Set(teacherAssignments.map(row => row.subject))].sort()
  const gradeOptions = [...new Set(teacherAssignments.filter(row => row.subject === selectedSubject).map(row => row.grade))].sort()
  const bookOptions = books.filter(book => book.grade?.toLocaleLowerCase() === selectedGrade.toLocaleLowerCase() && book.subject?.toLocaleLowerCase() === selectedSubject.toLocaleLowerCase())
  const availableCopies = copies.filter(copy => copy.book_id === Number(selectedBookId) && copy.status === 'available').sort((a,b) => a.copy_number.localeCompare(b.copy_number, undefined, { numeric: true }))
  const selectedTeacher = teacherOptions.find(t => String(t.id) === selectedTeacherId)
  const selectedBook = books.find(book => String(book.id) === selectedBookId)
  const visibleAllocations = allocations.filter(row => !viewBookId || row.book_title === books.find(book => String(book.id) === viewBookId)?.title)

  function applyRange(fromText: string, toText: string) {
    const from = Number.parseInt(fromText, 10)
    const to = Number.parseInt(toText, 10)
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
      setError('Enter a valid copy range, with the first copy no greater than the last copy.')
      return
    }
    const chosen = availableCopies.filter(copy => {
      const number = Number.parseInt(copy.copy_number.split('/')[0], 10)
      return Number.isInteger(number) && number >= from && number <= to
    })
    setSelectedCopyIds(chosen.map(copy => copy.id))
    setError(chosen.length ? null : 'No available physical copies match that range.')
  }

  function applyTypedRange() {
    const match = typedRange.trim().match(/^(\d+)\s*\/\s*\d+\s+to\s+(\d+)\s*\/\s*\d+$/i)
    if (!match) {
      setError('Use the format 01/25 to 20/25.')
      return
    }
    applyRange(match[1], match[2])
  }

  async function issueToTeacher() {
    if (!selectedTeacher || !selectedBook || selectedCopyIds.length === 0) {
      setError('Select a teacher, book title and at least one available physical copy.')
      return
    }
    setSaving(true)
    setError(null)
    let issued = 0
    const failures: string[] = []
    const failedCopyIds: string[] = []
    for (const copyId of selectedCopyIds) {
      try {
        await scopedLibraryFetch<Copy>(`/api/v1/library/copies/${copyId}/movements`, selectedSchoolId, {
          method: 'POST',
          body: JSON.stringify({
            action: 'issue_to_teacher',
            to_holder_id: selectedTeacher.id,
            to_holder_name: selectedTeacher.name,
            condition: 'good',
            due_date: dueDate || null,
            notes: `Issued from Library dashboard · ${selectedBook.title}`,
          }),
        })
        issued += 1
      } catch (err) {
        failedCopyIds.push(copyId)
        failures.push(friendlyApiError(err, `issue copy ${copies.find(copy => copy.id === copyId)?.copy_number ?? copyId}`))
      }
    }
    await load()
    setSelectedCopyIds(failedCopyIds)
    if (!failedCopyIds.length) { setRangeFrom(''); setRangeTo(''); setTypedRange(''); setDueDate('') }
    if (issued) notify(`${issued} physical book copy/copies issued to ${selectedTeacher.name}.`, 'success')
    if (failures.length) setError(`${issued} issued successfully; ${failures.length} failed. Failed copies remain selected for review. ${failures[0]}`)
    setSaving(false)
  }

  async function returnToLibrary(copy: Copy) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await scopedLibraryFetch(`/api/v1/library/copies/${copy.id}/movements`, selectedSchoolId, { method: 'POST', body: JSON.stringify({ action: 'teacher_return_to_library', condition: copy.condition || 'good', notes: 'Return accepted by Library.' }) })
      notify(`Copy ${copy.copy_number} returned to the Library.`, 'success')
      await load()
    } catch (err) {
      setError(friendlyApiError(err, `return copy ${copy.copy_number} to the Library`))
    } finally { setSaving(false) }
  }

  if (isSuperAdmin && !selectedSchoolId) return <div style={{ minHeight: '100%', background: '#f7f3ff', padding: 'clamp(14px,2.5vw,28px)', borderRadius: 18 }}>
    <div style={{ background: 'linear-gradient(105deg,#2a0a6b,#5b2be0,#2a7fff)', color: '#fff', borderRadius: 18, padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
      <div><h1 style={{ margin: 0, fontSize: 25, fontWeight: 900 }}>Library · Platform overview</h1><p style={{ margin: '5px 0 0', opacity: .85, fontSize: 13 }}>Read-only inventory summary for schools with Library entitlement enabled.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} style={{ ...gradientButton, background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.35)' }}>{loading ? 'Refreshing…' : 'Refresh overview'}</button>
    </div>
    {error && <div style={{ marginBottom: 18 }}><Alert tone="error">{error}</Alert></div>}
    {schoolChoices.length > 0 && <div style={{ ...panelStyle, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><label style={{ flex: '1 1 260px' }}><span style={labelStyle}>Open a school Library workspace</span><select style={fieldStyle} value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)}><option value="">Platform overview</option>{schoolChoices.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label></div>}
    {loading ? <LoadingBlock label="Loading platform Library overview" rows={4} /> : platformOverview && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#ede9fe', borderRadius: 15, padding: 16, color: '#5b21b6' }}><div style={{ fontSize: 12, fontWeight: 800 }}>Enabled schools</div><div style={{ fontSize: 28, fontWeight: 900 }}>{platformOverview.school_count}</div></div>
        <div style={{ background: '#dbeafe', borderRadius: 15, padding: 16, color: '#1d4ed8' }}><div style={{ fontSize: 12, fontWeight: 800 }}>Registered titles</div><div style={{ fontSize: 28, fontWeight: 900 }}>{platformOverview.schools.reduce((n, row) => n + row.total_titles, 0)}</div></div>
        <div style={{ background: '#dcfce7', borderRadius: 15, padding: 16, color: '#15803d' }}><div style={{ fontSize: 12, fontWeight: 800 }}>Physical copies</div><div style={{ fontSize: 28, fontWeight: 900 }}>{platformOverview.schools.reduce((n, row) => n + row.total_copies, 0)}</div></div>
        <div style={{ background: '#ffedd5', borderRadius: 15, padding: 16, color: '#c2410c' }}><div style={{ fontSize: 12, fontWeight: 800 }}>Lost copies</div><div style={{ fontSize: 28, fontWeight: 900 }}>{platformOverview.schools.reduce((n, row) => n + row.lost_copies, 0)}</div></div>
      </div>
      <section style={panelStyle}>
        <h2 style={{ margin: '0 0 14px', fontSize: 19, fontWeight: 900, color: '#202044' }}>School Library inventory</h2>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720, fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left', color: '#66647a', borderBottom: '2px solid #eceaf1' }}>{['School','Titles','Copies','Available','With teachers','With students','Lost'].map(label => <th key={label} style={{ padding: 10 }}>{label}</th>)}</tr></thead>
          <tbody>{platformOverview.schools.map(row => <tr key={row.school_id} style={{ borderBottom: '1px solid #eceaf1' }}><td style={{ padding: 10, fontWeight: 800 }}>{row.school_name}</td><td style={{ padding: 10 }}>{row.total_titles}</td><td style={{ padding: 10 }}>{row.total_copies}</td><td style={{ padding: 10 }}>{row.available_copies}</td><td style={{ padding: 10 }}>{row.with_teachers}</td><td style={{ padding: 10 }}>{row.with_students}</td><td style={{ padding: 10 }}>{row.lost_copies}</td></tr>)}</tbody>
        </table>{!platformOverview.schools.length && <p style={{ color: '#777', padding: 16 }}>No active schools currently have Library enabled.</p>}</div>
      </section>
    </>}
  </div>

  return <div style={{ minHeight: '100%', background: '#f7f3ff', padding: 'clamp(14px,2.5vw,28px)', borderRadius: 18 }}>
    <div style={{ background: 'linear-gradient(105deg,#2a0a6b,#5b2be0,#2a7fff)', color: '#fff', borderRadius: 18, padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#fb923c,#ec4899,#3b82f6)', display: 'grid', placeItems: 'center', fontSize: 25 }}>📚</div>
        <div><div style={{ fontSize: 23, fontWeight: 900 }}>Library System</div><div style={{ fontSize: 12, opacity: .82 }}>Books · Teachers · Students · Reports</div></div>
      </div>
      <button type="button" onClick={() => void load()} style={{ ...gradientButton, background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.35)' }}>Refresh dashboard</button>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
      <div><h1 style={{ color: '#1a1a5e', fontSize: 'clamp(24px,3vw,32px)', fontWeight: 900, margin: 0 }}>Library Workflow Dashboard</h1><p style={{ color: '#6b6880', margin: '5px 0 0' }}>Manage book issues to teachers and monitor books currently issued to students.</p></div>
      {isSuperAdmin && <button type="button" onClick={() => setSelectedSchoolId('')} style={{ ...gradientButton, background: '#5b21b6' }}>Back to platform overview</button>}
    </div>
    {(schoolChoices.length > 1 || isSuperAdmin && selectedSchoolId) && <div style={{ ...panelStyle, marginBottom: 18 }}><label><span style={labelStyle}>School workspace</span><select style={fieldStyle} value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)}>{isSuperAdmin && <option value="">Platform overview</option>}{schoolChoices.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label></div>}
    {!selectedSchoolId && !isSuperAdmin && <div style={panelStyle}><h2 style={{ marginTop: 0 }}>Select a school</h2><p>Your account has access to more than one school. Choose the school whose Library records you want to open.</p><select style={fieldStyle} value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)}><option value="">Choose school…</option>{schoolChoices.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}</select></div>}

    {error && <div style={{ marginBottom: 18 }}><Alert tone="error">{error}</Alert></div>}
    {loadWarnings.length > 0 && !loading && <div style={{ marginBottom: 18 }}><Alert tone="warning">{loadWarnings.join(' ')}</Alert></div>}
    {loading ? <LoadingBlock label="Loading Library records" rows={5} /> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 12, marginBottom: 22 }}>
        {[
          { label: 'Registered titles', value: stats?.total_titles ?? 0, tint: '#ede9fe', color: '#5b21b6' },
          { label: 'Physical copies', value: stats?.total_copies ?? 0, tint: '#dbeafe', color: '#1d4ed8' },
          { label: 'Available', value: stats?.available_copies ?? 0, tint: '#dcfce7', color: '#15803d' },
          { label: 'With teachers', value: stats?.with_teachers ?? 0, tint: '#ffedd5', color: '#c2410c' },
          { label: 'With students', value: stats?.with_students ?? 0, tint: '#cffafe', color: '#0e7490' },
        ].map(item => <div key={item.label} style={{ background: item.tint, borderRadius: 15, padding: '15px 17px' }}><div style={{ color: item.color, fontSize: 12, fontWeight: 800 }}>{item.label}</div><div style={{ color: item.color, fontSize: 27, fontWeight: 900 }}>{item.value}</div></div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,390px),1fr))', gap: 20, alignItems: 'start' }}>
        <section style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center' }}>👤</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#202044' }}>Librarian Issue to Teacher</h2>
            <span style={{ border: '1px solid #ddd6fe', color: '#5b21b6', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 800 }}>Issue books</span>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <label><span style={labelStyle}>Teacher</span><select style={{ ...fieldStyle, borderColor: '#60a5fa', background: '#eff6ff' }} value={selectedTeacherId} onChange={e => { setSelectedTeacherId(e.target.value); setSelectedSubject(''); setSelectedGrade(''); setSelectedBookId(''); setSelectedCopyIds([]) }}><option value="">Select teacher from saved timetable…</option>{teacherOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <div><span style={labelStyle}>Subject and grade · from timetable</span><div style={{ ...fieldStyle, borderColor: '#4ade80', background: '#f0fdf4', fontWeight: 800 }}>{selectedSubject && selectedGrade ? `${selectedSubject} — ${selectedGrade}` : 'Select a teacher and subject'}</div></div>
            <label><span style={labelStyle}>Subject</span><select style={fieldStyle} value={selectedSubject} onChange={e => { setSelectedSubject(e.target.value); setSelectedGrade(''); setSelectedBookId(''); setSelectedCopyIds([]) }} disabled={!selectedTeacherId}><option value="">Select subject…</option>{subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
            <label><span style={labelStyle}>Grade</span><select style={fieldStyle} value={selectedGrade} onChange={e => { setSelectedGrade(e.target.value); setSelectedBookId(''); setSelectedCopyIds([]) }} disabled={!selectedSubject}><option value="">Select grade…</option>{gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}</select></label>
            <label><span style={labelStyle}>Book title</span><select style={{ ...fieldStyle, borderColor: '#fb923c', background: '#fff7ed' }} value={selectedBookId} onChange={e => { setSelectedBookId(e.target.value); setSelectedCopyIds([]); setRangeFrom(''); setRangeTo('') }} disabled={!selectedGrade}><option value="">Select registered title…</option>{bookOptions.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select>{selectedGrade && bookOptions.length === 0 && <small style={{ color: '#777' }}>No registered titles match this grade and subject.</small>}</label>

            <label><span style={labelStyle}>Due date (optional)</span><input type="date" style={fieldStyle} value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
            <div style={{ background: '#f8f5ff', border: '1px solid #e9ddff', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#5b21b6' }}>1. Select a physical copy range · 2. Or type a range</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 12, alignItems: 'end' }}>
                <label><span style={labelStyle}>From</span><select style={fieldStyle} value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} disabled={!availableCopies.length}><option value="">From…</option>{availableCopies.map(c => <option key={c.id} value={c.copy_number.split('/')[0]}>{c.copy_number}</option>)}</select></label>
                <label><span style={labelStyle}>To</span><select style={fieldStyle} value={rangeTo} onChange={e => setRangeTo(e.target.value)} disabled={!availableCopies.length}><option value="">To…</option>{availableCopies.map(c => <option key={c.id} value={c.copy_number.split('/')[0]}>{c.copy_number}</option>)}</select></label>
                <button type="button" onClick={() => applyRange(rangeFrom, rangeTo)} disabled={!rangeFrom || !rangeTo} style={{ ...gradientButton, borderRadius: 12, padding: '12px 14px' }}>Apply</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input aria-label="Type copy range" style={{ ...fieldStyle, fontFamily: 'monospace' }} value={typedRange} onChange={e => setTypedRange(e.target.value)} placeholder="01/25 to 20/25" />
                <button type="button" onClick={applyTypedRange} style={{ ...gradientButton, borderRadius: 12 }}>Apply</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
                {selectedCopyIds.map(id => {
                  const copy = availableCopies.find(c => c.id === id)
                  return copy ? <span key={id} style={{ background: 'linear-gradient(100deg,#6337d7,#df4d9a)', color: '#fff', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 800 }}>{copy.copy_number}</span> : null
                })}
                {!selectedCopyIds.length && <span style={{ color: '#777', fontSize: 12 }}>No copies selected</span>}
              </div>
              <div style={{ color: '#66647a', fontSize: 12, marginTop: 9 }}>{availableCopies.length} available copies for this title.</div>
            </div>

            <button type="button" onClick={() => void issueToTeacher()} disabled={saving || !selectedTeacher || !selectedBook || !selectedCopyIds.length} style={{ ...gradientButton, width: '100%', padding: '14px 18px', opacity: saving || !selectedTeacher || !selectedBook || !selectedCopyIds.length ? .55 : 1 }}>{saving ? 'Issuing copies…' : '→ Issue to Teacher'}</button>
            <p style={{ color: '#777', fontSize: 12, textAlign: 'center', margin: 0 }}>Issuing {selectedCopyIds.length} selected physical copy/copies. Each copy is recorded separately in the custody register.</p>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#2dd4bf', color: '#fff', display: 'grid', placeItems: 'center' }}>📋</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#202044' }}>Books Issued to Students</h2>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 16 }}><span style={{ fontSize: 13, fontWeight: 800, color: '#66647a' }}>View:</span><select style={{ ...fieldStyle, maxWidth: 270, background: '#f5f3ff' }} value={viewBookId} onChange={e => setViewBookId(e.target.value)}><option value="">All book titles</option>{books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
          <div style={{ overflowX: 'auto', border: '1px solid #e5e2ec', borderRadius: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 510, fontSize: 13 }}>
              <thead><tr style={{ background: '#f8fafc', color: '#66647a', textAlign: 'left', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>{['Student ID','Student name','Class','Book no.','Status'].map(label => <th key={label} style={{ padding: 11 }}>{label}</th>)}</tr></thead>
              <tbody>
                {visibleAllocations.map((row, index) => <tr key={row.copy_id} style={{ borderTop: '1px solid #eceaf1' }}>
                  <td style={{ padding: 11, fontWeight: 800 }}>{row.student_admission_number ?? '—'}</td>
                  <td style={{ padding: 11 }}>{row.student_name}</td>
                  <td style={{ padding: 11 }}>{row.student_class ?? '—'}</td>
                  <td style={{ padding: 11, fontWeight: 800 }}>{row.copy_number}</td>
                  <td style={{ padding: 11 }}><span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 999, padding: '5px 9px', fontWeight: 800, fontSize: 11 }}>{row.status === 'with_student' ? 'With student' : row.status ?? 'Current custody'}</span></td>
                </tr>)}
                {!visibleAllocations.length && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#777' }}>No student-held copies are currently recorded for this selection.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: '#777', fontSize: 12, marginTop: 12 }}><span>Showing {visibleAllocations.length} current student-held copies</span><span>Live custody records</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(115px,1fr))', gap: 8, marginTop: 22 }}>
            <div style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 800 }}>Issued: {stats?.with_students ?? 0}</div>
            <div style={{ background: '#fff7ed', color: '#c2410c', borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 800 }}>With teachers: {stats?.with_teachers ?? 0}</div>
            <div style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 800 }}>Teachers: {teacherOptions.length}</div>
          </div>
        </section>
      </div>

      <section style={{ ...panelStyle, marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div><h2 style={{ fontSize: 18, fontWeight: 900, color: '#202044', margin: 0 }}>Physical copy register</h2><p style={{ color: '#777', fontSize: 13, margin: '5px 0 0' }}>Every physical copy and its current custody status.</p></div>
          <span style={{ fontSize: 12, color: '#66647a' }}>{copies.length} registered copies</span>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620, fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: '#66647a', borderBottom: '2px solid #eceaf1' }}>{['Book title','Copy no.','Status','Current holder','Condition','Action'].map(label => <th key={label} style={{ padding: 10 }}>{label}</th>)}</tr></thead>
            <tbody>{copies.map(copy => <tr key={copy.id} style={{ borderBottom: '1px solid #eceaf1' }}><td style={{ padding: 10 }}>{copy.book?.title ?? books.find(b => b.id === copy.book_id)?.title ?? `Book #${copy.book_id}`}</td><td style={{ padding: 10, fontWeight: 800 }}>{copy.copy_number}</td><td style={{ padding: 10 }}>{({ available: 'In library', with_teacher: 'With teacher', with_student: 'With student', lost: 'Lost', unreconciled: 'Needs verification', excluded: 'Excluded' } as Record<string,string>)[copy.status] ?? copy.status}</td><td style={{ padding: 10 }}>{copy.current_holder_name ?? 'Library'}</td><td style={{ padding: 10 }}>{copy.condition}</td><td style={{ padding: 10 }}>{copy.status === 'with_teacher' && <button type="button" disabled={saving} onClick={() => void returnToLibrary(copy)} style={{ ...gradientButton, padding: '7px 11px', fontSize: 11, opacity: saving ? .55 : 1 }}>Accept return</button>}</td></tr>)}</tbody>
          </table>
          {!copies.length && <p style={{ color: '#777', padding: 16 }}>No physical copies have been registered.</p>}
        </div>
      </section>
    </>}
  </div>
}
