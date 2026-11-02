import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { EmptyState, LoadingBlock } from '../components/States'
import { apiFetch, friendlyApiError } from '../lib/api'
import { useToast } from '../components/Toast'
import { usePlatformSession } from '../lib/session'

type Book = { id: number; title: string; author?: string | null; grade?: string; subject?: string; total_copies?: number }
type TimetableWorkspace = { data?: { specification?: { teachers?: string[]; classes?: string[]; subjects?: string[] }; lessons?: Array<{ className: string; subject: string; teacher: string }>; classDetails?: Record<string, { grade?: string }> } | null }
type DirectoryTeacher = { id: number; name: string }
type DirectoryStudent = { id: number; admission_number: string; name: string; current_class: string | null }
type TeacherInventorySummary = { teachers: Array<{ teacher_id: number; teacher_name: string; total_copies: number; grades: Array<{ grade: string; total_copies: number; subjects: Array<{ subject: string; total_copies: number; titles: Array<{ book_id: number; title: string; total_copies: number; copies: Array<{ copy_id: string; copy_number: string; status: string; current_holder_type: string; current_holder_name: string | null }> }> }> }> }>; all_teachers: { teacher_id: null; teacher_name: string; total_copies: number; grades: Array<{ grade: string; total_copies: number; subjects: Array<{ subject: string; total_copies: number; titles: Array<{ book_id: number; title: string; total_copies: number; copies: Array<{ copy_id: string; copy_number: string; status: string; current_holder_type: string; current_holder_name: string | null }> }> }> }> } | null }
type Copy = {
  id: string; book_id: number; copy_number: string; status: 'available' | 'with_teacher' | 'with_student' | 'lost' | 'unreconciled' | 'excluded'
  current_holder_type: 'library' | 'teacher' | 'student' | 'unverified'; current_holder_id: number | null
  current_holder_name: string | null; condition: 'good' | 'damaged' | 'lost'; due_date?: string | null
  book?: { id: number; title: string } | null
}
type Movement = { id: number; action: string; from_holder_name?: string | null; to_holder_name?: string | null; condition: string; performed_at: string; notes?: string | null }
type Stats = { total_titles: number; total_copies: number; available_copies: number; with_teachers: number; with_students: number; lost_copies: number; excluded_copies: number; unreconciled_copies: number }
type Reconciliation = { outstanding_count: number; with_teachers: number; with_students: number; lost_count: number; unreconciled_count: number; outstanding_copies: Copy[] }
type TeacherAccountability = {
  total_accountable: number; with_students: number; retained_by_teachers: number; lost: number
  teachers: Array<{ teacher_id: number; teacher_name: string; total_accountable: number; with_students: number; retained_by_teacher: number; lost: number;
    copies: Array<{ copy_id: string; book_id: number; copy_number: string; book_title: string; status: string; current_holder_type: string; current_holder_name: string | null; condition: string; student_id: number | null; student_name: string | null }> }>
}

const actionLabels: Record<string, string> = {
  issue_to_teacher: 'Library → Teacher',
  issue_to_student: 'Teacher → Student',
  student_return_to_teacher: 'Student → Teacher',
  teacher_return_to_library: 'Teacher → Library',
  mark_lost: 'Mark copy lost',
  reconcile_copy: 'Verify a legacy copy',
  exclude_before_issue: 'Exclude missing copy before issue',
  restore_excluded_copy: 'Restore previously excluded copy',
}
const statusLabel = (status: Copy['status']) => ({ available: 'In library', with_teacher: 'With teacher', with_student: 'With student', lost: 'Lost', unreconciled: 'Needs physical verification', excluded: 'Missing before issue — excluded' })[status]

export default function LibraryPage() {
  const { notify } = useToast()
  const { session: platformSession, loading: platformSessionLoading, error: platformSessionError, reload: reloadPlatformSession } = usePlatformSession()
  const librarySchools = useMemo(() => (platformSession?.schools ?? []).filter(school => school.modules?.includes('library')), [platformSession?.schools])
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  // Never infer a school, even when the account currently has only one.
  // The user must explicitly choose the tenant whose Library is being opened.
  const activeSchoolId = selectedSchoolId
  const libraryFetch = useCallback(<T,>(path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (activeSchoolId) headers.set('X-School-Id', activeSchoolId)
    return apiFetch<T>(path, { ...init, headers })
  }, [activeSchoolId])
  const [books, setBooks] = useState<Book[]>([])
  const [timetable, setTimetable] = useState<TimetableWorkspace['data']>(null)
  const [teacherDirectory, setTeacherDirectory] = useState<DirectoryTeacher[]>([])
  const [studentDirectory, setStudentDirectory] = useState<DirectoryStudent[]>([])
  const [studentAllocations, setStudentAllocations] = useState<Array<{ copy_id: string; copy_number: string; book_title: string; accountable_teacher_name: string; student_name: string; student_admission_number: string | null; student_class: string | null; student_issue_at: string | null }>>([])
  const [copies, setCopies] = useState<Copy[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null)
  const [teacherAccountability, setTeacherAccountability] = useState<TeacherAccountability | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [selectedCopy, setSelectedCopy] = useState('')
  const [issueTeacherId, setIssueTeacherId] = useState('')
  const [issueSubject, setIssueSubject] = useState('')
  const [issueGrade, setIssueGrade] = useState('')
  const [issueBookId, setIssueBookId] = useState('')
  const [action, setAction] = useState('issue_to_teacher')
  const [holderId, setHolderId] = useState('')
  const [toHolderType, setToHolderType] = useState<'library' | 'teacher'>('library')
  const [holderName, setHolderName] = useState('')
  const [condition, setCondition] = useState<'good' | 'damaged'>('good')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [filterBook, setFilterBook] = useState('all')
  const [showNewBook, setShowNewBook] = useState(false)
  const [newBookGrade, setNewBookGrade] = useState('')
  const [newBookSubject, setNewBookSubject] = useState('')
  const [showInventorySummary, setShowInventorySummary] = useState(false)
  const [inventoryTeacher, setInventoryTeacher] = useState('all')
  const [teacherInventory, setTeacherInventory] = useState<TeacherInventorySummary | null>(null)
  const [loadingInventorySummary, setLoadingInventorySummary] = useState(false)
  const [newBookTitle, setNewBookTitle] = useState('')
  const [newBookAuthor, setNewBookAuthor] = useState('')
  const [newBookCopies, setNewBookCopies] = useState('1')
  const [addingBook, setAddingBook] = useState(false)
  const [loading, setLoading] = useState(false)
  const loadSequence = useRef(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    if (!activeSchoolId) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const [bookRows, copyRows, overview, outstanding, teacherRegister] = await Promise.all([
        libraryFetch<Book[]>('/api/v1/library/books'),
        libraryFetch<Copy[]>('/api/v1/library/copies'),
        libraryFetch<Stats>('/api/v1/library/books/stats'),
        libraryFetch<Reconciliation>('/api/v1/library/reconciliation'),
        libraryFetch<TeacherAccountability>('/api/v1/library/teacher-accountability'),
      ])
      if (sequence !== loadSequence.current) return
      setBooks(bookRows); setCopies(copyRows); setStats(overview); setReconciliation(outstanding); setTeacherAccountability(teacherRegister)
      const [workspaceResult, directoryResult, studentsResult, allocationsResult] = await Promise.allSettled([
        libraryFetch<TimetableWorkspace>('/api/v1/timetable/workspace'),
        libraryFetch<DirectoryTeacher[]>('/api/v1/library/teacher-directory'),
        libraryFetch<DirectoryStudent[]>('/api/v1/library/student-directory'),
        libraryFetch<{ items: typeof studentAllocations }>('/api/v1/library/student-allocations'),
      ])
      if (sequence !== loadSequence.current) return
      if (workspaceResult.status === 'fulfilled') setTimetable(workspaceResult.value.data ?? null)
      else setTimetable(null)
      if (directoryResult.status === 'fulfilled') setTeacherDirectory(directoryResult.value.filter(item => Number.isSafeInteger(Number(item.id)) && String(item.name ?? '').trim()).map(item => ({ id: Number(item.id), name: String(item.name).trim() })))
      else setTeacherDirectory([])
      if (studentsResult.status === 'fulfilled') setStudentDirectory(studentsResult.value)
      else setStudentDirectory([])
      if (allocationsResult.status === 'fulfilled') setStudentAllocations(allocationsResult.value.items ?? [])
      else setStudentAllocations([])
    } catch (err) {
      if (sequence === loadSequence.current) setError(friendlyApiError(err, 'load the library register'))
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [activeSchoolId, libraryFetch])

  useEffect(() => { void load() }, [load])

  // Refresh the dashboard-granted school memberships whenever Library opens.
  // This makes newly granted school access available without requiring sign-out.
  useEffect(() => { reloadPlatformSession() }, [reloadPlatformSession])

  useEffect(() => {
    if (selectedSchoolId && !librarySchools.some(school => String(school.id) === selectedSchoolId)) {
      setSelectedSchoolId('')
      setBooks([]); setCopies([]); setMovements([]); setStats(null)
      setTeacherAccountability(null); setReconciliation(null); setTeacherDirectory([])
      setStudentDirectory([]); setStudentAllocations([]); setTimetable(null)
    }
  }, [librarySchools, selectedSchoolId])

  const timetableAssignments = useMemo(() => {
    const lessons = timetable?.lessons ?? []
    const classDetails = timetable?.classDetails ?? {}
    const directoryByName = new Map(teacherDirectory.map(teacher => [teacher.name.trim().toLocaleLowerCase(), teacher]))
    return lessons.map(lesson => {
      const className = String(lesson.className ?? '').trim()
      const grade = String(classDetails[className]?.grade ?? className.match(/(?:grade|form|year)\s*\d+/i)?.[0] ?? '').trim()
      const teacherName = String(lesson.teacher ?? '').trim()
      const directoryTeacher = directoryByName.get(teacherName.toLocaleLowerCase())
      return { grade, className, subject: String(lesson.subject ?? '').trim(), teacherName, teacherId: directoryTeacher?.id ?? null }
    }).filter(item => item.grade && item.subject && item.teacherName)
  }, [timetable, teacherDirectory])
  const timetableGrades = useMemo(() => Array.from(new Set(timetableAssignments.map(item => item.grade))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [timetableAssignments])
  const timetableSubjects = useMemo(() => Array.from(new Set(timetableAssignments.filter(item => item.grade === newBookGrade).map(item => item.subject))).sort(), [timetableAssignments, newBookGrade])
  const issueTeachers = useMemo(() => {
    const byId = new Map<number, string>()
    for (const assignment of timetableAssignments) if (assignment.teacherId != null) byId.set(assignment.teacherId, assignment.teacherName)
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [timetableAssignments])
  const issueTeacherAssignments = useMemo(() => timetableAssignments.filter(item => String(item.teacherId) === issueTeacherId), [timetableAssignments, issueTeacherId])
  const issueSubjects = useMemo(() => Array.from(new Set(issueTeacherAssignments.map(item => item.subject))).sort(), [issueTeacherAssignments])
  const issueGrades = useMemo(() => Array.from(new Set(issueTeacherAssignments.filter(item => item.subject.toLocaleLowerCase() === issueSubject.toLocaleLowerCase()).map(item => item.grade))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [issueTeacherAssignments, issueSubject])
  const issueBooks = useMemo(() => books.filter(book => String(book.grade ?? '').toLocaleLowerCase() === issueGrade.toLocaleLowerCase() && String(book.subject ?? '').toLocaleLowerCase() === issueSubject.toLocaleLowerCase() && copies.some(copy => copy.book_id === book.id && copy.status === 'available')), [books, copies, issueGrade, issueSubject])
  const issueBookCopies = useMemo(() => copies.filter(copy => copy.book_id === Number(issueBookId) && copy.status === 'available').sort((a, b) => a.copy_number.localeCompare(b.copy_number, undefined, { numeric: true })), [copies, issueBookId])
  const eligibleTeacherReceivers = issueTeachers

  const eligibleCopies = useMemo(() => copies.filter(copy => {
    if (action === 'issue_to_teacher') return copy.status === 'available'
    if (action === 'issue_to_student') return copy.status === 'with_teacher'
    if (action === 'student_return_to_teacher') return copy.status === 'with_student'
    if (action === 'teacher_return_to_library') return copy.status === 'with_teacher'
    if (action === 'reconcile_copy') return copy.status === 'unreconciled'
    if (action === 'exclude_before_issue') return copy.status === 'available'
    if (action === 'restore_excluded_copy') return copy.status === 'excluded'
    return copy.status === 'with_teacher' || copy.status === 'with_student' || copy.status === 'unreconciled'
  }), [copies, action])

  const visibleCopies = useMemo(() => filterBook === 'all' ? copies : copies.filter(copy => String(copy.book_id) === filterBook), [copies, filterBook])

  useEffect(() => {
    if (selectedCopy && !eligibleCopies.some(copy => copy.id === selectedCopy)) setSelectedCopy('')
  }, [eligibleCopies, selectedCopy])

  const showReceiver = ['issue_to_teacher', 'issue_to_student', 'student_return_to_teacher'].includes(action) || (action === 'reconcile_copy' && toHolderType !== 'library')

  async function submitMovement(event: FormEvent) {
    event.preventDefault()
    if (!selectedCopy) { setError('Select a physical book copy first.'); return }
    setSaving(true); setError(null)
    try {
      await libraryFetch<Copy>(`/api/v1/library/copies/${selectedCopy}/movements`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          to_holder_type: action === 'reconcile_copy' ? toHolderType : null,
          to_holder_id: showReceiver ? Number(action === 'issue_to_teacher' ? holderId : holderId) : null,
          to_holder_name: showReceiver ? holderName.trim() : null,
          condition,
          due_date: dueDate || null,
          notes: notes.trim() || null,
        }),
      })
      notify('Book custody movement recorded.', 'success')
      setHolderId(''); setHolderName(''); setIssueTeacherId(''); setIssueSubject(''); setIssueGrade(''); setIssueBookId(''); setDueDate(''); setNotes('')
      await load()
      const history = await libraryFetch<Movement[]>(`/api/v1/library/copies/${selectedCopy}/movements`)
      setMovements(history)
    } catch (err) { setError(friendlyApiError(err, 'record this book movement')) }
    finally { setSaving(false) }
  }

  async function createBook(event: FormEvent) {
    event.preventDefault()
    const count = Number(newBookCopies)
    if (!newBookTitle.trim() || !timetableGrades.includes(newBookGrade) || !timetableSubjects.includes(newBookSubject) || !Number.isSafeInteger(count) || count < 1 || count > 5000) {
      setError('Choose a grade and subject from the saved timetable, then enter a title and a whole-number copy count between 1 and 5,000.')
      return
    }
    setAddingBook(true); setError(null)
    try {
      await libraryFetch<Book>('/api/v1/library/books', {
        method: 'POST',
        body: JSON.stringify({ title: newBookTitle.trim(), grade: newBookGrade.trim(), subject: newBookSubject.trim(), author: newBookAuthor.trim() || null, total_copies: count, available_copies: count }),
      })
      setNewBookTitle(''); setNewBookAuthor(''); setNewBookGrade(''); setNewBookSubject(''); setNewBookCopies('1'); setShowNewBook(false)
      notify('Book title and numbered physical copies created.', 'success')
      await load()
    } catch (err) { setError(friendlyApiError(err, 'add this book title')) }
    finally { setAddingBook(false) }
  }

  async function toggleInventorySummary() {
    if (showInventorySummary) { setShowInventorySummary(false); return }
    setLoadingInventorySummary(true); setError(null)
    try {
      setTeacherInventory(await libraryFetch<TeacherInventorySummary>('/api/v1/library/teacher-inventory-summary?teacher_id=' + encodeURIComponent(inventoryTeacher)))
      setShowInventorySummary(true)
    } catch (err) { setError(friendlyApiError(err, 'load grade and subject book totals')) }
    finally { setLoadingInventorySummary(false) }
  }

  async function changeInventoryTeacher(value: string) {
    setInventoryTeacher(value); setLoadingInventorySummary(true); setError(null)
    try { setTeacherInventory(await libraryFetch<TeacherInventorySummary>('/api/v1/library/teacher-inventory-summary?teacher_id=' + encodeURIComponent(value))) }
    catch (err) { setError(friendlyApiError(err, 'filter teacher inventory totals')) }
    finally { setLoadingInventorySummary(false) }
  }

  async function openHistory(copyId: string) {
    setSelectedCopy(copyId)
    try { setMovements(await libraryFetch<Movement[]>(`/api/v1/library/copies/${copyId}/movements`)) }
    catch (err) { setError(friendlyApiError(err, 'load book movement history')) }
  }

  if (!activeSchoolId) return <div className="library-page">
    <PageHeader title="Library & Book Custody" description="Select a school to access its Library register and manage book records and custody." />
    {platformSessionLoading ? <LoadingBlock label="Checking your school access" rows={2} /> : <>
      {platformSessionError
        ? <section className="card section"><Alert tone="error">{platformSessionError} The preview API must be connected to the matching feature-branch backend before school entitlements can load.</Alert><button className="button button--secondary button--sm" type="button" onClick={reloadPlatformSession}>Retry access check</button></section>
        : librarySchools.length
        ? <section className="card section">
            <label className="field">
              <span className="field__label">School</span>
              <select className="input" value={selectedSchoolId} onChange={event => setSelectedSchoolId(event.target.value)}>
                <option value="">Select a school</option>
                {librarySchools.map(school => <option key={school.id} value={String(school.id)}>{school.name}</option>)}
              </select>
            </label>
            <p style={{ color: 'var(--color-ink-muted)', marginBottom: 0 }}>Only active schools with Library enabled are listed. Platform administrators can manage the school’s module access in Platform administration; other users also need an authorized school role.</p>
            <button className="button button--secondary button--sm" type="button" onClick={reloadPlatformSession}>Refresh school access</button>
          </section>
        : <section className="card section">
            {platformSession?.is_super_admin ? <Alert tone="info">No active school currently has Library enabled. Open Platform → Schools, select the school, and enable Library under School module access.</Alert> : <Alert tone="info">No active school with Library access is available to your account. Ask your school administrator to confirm that the school is active and Library is enabled, then refresh this page.</Alert>}
            <button className="button button--secondary button--sm" type="button" onClick={reloadPlatformSession}>Refresh school access</button>
          </section>}
    </>}
  </div>

  return <div className="library-page">
    {librarySchools.length > 0 && <section className="card section" style={{ marginBottom: 'var(--space-3)' }}>
      <label className="field">
        <span className="field__label">Selected school</span>
        <select className="input" value={activeSchoolId} onChange={event => {
          setSelectedSchoolId(event.target.value)
          setBooks([]); setCopies([]); setMovements([]); setStats(null)
          setTeacherAccountability(null); setReconciliation(null); setTimetable(null)
          setTeacherDirectory([]); setStudentDirectory([]); setStudentAllocations([])
          setSelectedCopy('')
        }}>
          <option value="">Select a school</option>
          {librarySchools.map(school => <option key={school.id} value={String(school.id)}>{school.name}</option>)}
        </select>
      </label>
    </section>}
    <PageHeader title="Library & Book Custody" description="Track each numbered copy through the required Library → Teacher → Student → Teacher → Library hand-off." actions={<button className="button button--primary button--sm" onClick={() => setShowNewBook(value => !value)}>{showNewBook ? 'Cancel' : 'Add book title'}</button>} />
    {!activeSchoolId && <Alert tone="info">Select a school with Library entitlement before viewing or changing its Library register.</Alert>}
    {showNewBook && <section className="card section" style={{ marginBottom: 'var(--space-4)' }}><h2 className="section__title">Add a catalogue title</h2><form onSubmit={createBook} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(13rem,1fr))', gap: 'var(--space-3)', alignItems: 'end' }}><label className="field"><span className="field__label">Grade (from timetable)</span><select className="input" required value={newBookGrade} onChange={e => { setNewBookGrade(e.target.value); setNewBookSubject('') }}><option value="">Select timetable grade…</option>{timetableGrades.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select></label><label className="field"><span className="field__label">Subject (from timetable)</span><select className="input" required value={newBookSubject} onChange={e => setNewBookSubject(e.target.value)} disabled={!newBookGrade}><option value="">Select timetable subject…</option>{timetableSubjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}</select></label><label className="field"><span className="field__label">Book title</span><input className="input" required value={newBookTitle} onChange={e => setNewBookTitle(e.target.value)} placeholder="e.g. Skills in English Grade 9" /></label><label className="field"><span className="field__label">Author (optional)</span><input className="input" value={newBookAuthor} onChange={e => setNewBookAuthor(e.target.value)} /></label><label className="field"><span className="field__label">Number of physical copies</span><input className="input" type="number" min="1" max="5000" required value={newBookCopies} onChange={e => setNewBookCopies(e.target.value)} /></label><button className="button button--primary" type="submit" disabled={addingBook}>{addingBook ? 'Creating…' : 'Create title & copies'}</button></form><p style={{ color: 'var(--color-ink-muted)', marginBottom: 0 }}>Grades and subjects are read from saved timetable lessons and class grade metadata. Copies are numbered automatically, for example 01/25 through 25/25. {timetableGrades.length === 0 ? 'No timetable assignments were found; save the timetable before creating a catalogue title.' : ''}</p></section>}
    {error && <Alert tone="error">{error}</Alert>}
    {loading ? <LoadingBlock label="Loading library register" rows={5} /> : <>
      <section className="card section" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div><h2 className="section__title" style={{ marginBottom: '.25rem' }}>Teacher book accountability</h2><p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>Choose a teacher or All Teachers. Student-held copies remain accountable until the librarian accepts them.</p></div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" aria-label="Filter inventory by teacher" value={inventoryTeacher} onChange={e => void changeInventoryTeacher(e.target.value)} disabled={loadingInventorySummary} style={{ minWidth: '12rem' }}>
              <option value="all">All Teachers</option>
              {(teacherAccountability?.teachers ?? []).map(teacher => <option key={teacher.teacher_id} value={String(teacher.teacher_id)}>{teacher.teacher_name}</option>)}
            </select>
            <button className="button button--secondary button--sm" onClick={() => void toggleInventorySummary()} disabled={loadingInventorySummary}>{loadingInventorySummary ? 'Loading…' : showInventorySummary ? 'Hide report' : 'View report'}</button>
          </div>
        </div>
        {showInventorySummary && teacherInventory && <div style={{ marginTop: 'var(--space-3)' }}>
          {(inventoryTeacher === 'all' ? (teacherInventory.all_teachers ? [teacherInventory.all_teachers] : []) : teacherInventory.teachers).map(teacher => <div key={teacher.teacher_id ?? 'all'}>
            <h3 style={{ margin: 'var(--space-3) 0' }}>{teacher.teacher_name} — {teacher.total_copies} accountable copies</h3>
            {teacher.grades.map(grade => <details key={grade.grade} open style={{ borderTop: '1px solid var(--color-line)', padding: 'var(--space-3) 0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{grade.grade} — {grade.total_copies} copies</summary>
              {grade.subjects.map(subject => <details key={subject.subject} style={{ margin: 'var(--space-2) 0 var(--space-2) var(--space-3)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{subject.subject} — {subject.total_copies} copies</summary>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem', marginTop: 'var(--space-2)' }}>
                  <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-line)' }}>{['Book title', 'Copies', 'Physical copy numbers'].map(label => <th key={label} style={{ padding: 'var(--space-2)' }}>{label}</th>)}</tr></thead>
                  <tbody>{subject.titles.map(title => <tr key={title.book_id} style={{ borderBottom: '1px solid var(--color-line)' }}><td style={{ padding: 'var(--space-2)' }}>{title.title}</td><td style={{ padding: 'var(--space-2)', fontWeight: 700 }}>{title.total_copies}</td><td style={{ padding: 'var(--space-2)' }}>{title.copies.map(copy => copy.copy_number).join(', ')}</td></tr>)}</tbody>
                </table>
                <p style={{ textAlign: 'right', fontWeight: 700 }}>Total {subject.subject} {grade.grade}: {subject.total_copies}</p>
              </details>)}
              <p style={{ textAlign: 'right', color: 'var(--color-ink-muted)' }}>Total {grade.grade}: {grade.total_copies}</p>
            </details>)}
          </div>)}
          {((inventoryTeacher === 'all' && !teacherInventory.all_teachers) || (inventoryTeacher !== 'all' && teacherInventory.teachers.length === 0)) && <EmptyState title="No accountable copies" description="No physical copies are currently assigned to this selection." />}
        </div>}
      </section>

      <div className="summary-grid" style={{ marginBottom: 'var(--space-4)' }}>
        {[
          ['Physical copies', stats?.total_copies ?? 0],
          ['Available in library', stats?.available_copies ?? 0],
          ['With teachers', stats?.with_teachers ?? 0],
          ['With students', stats?.with_students ?? 0],
          ['Lost', stats?.lost_copies ?? 0],
          ['Excluded before issue', stats?.excluded_copies ?? 0],
          ['Legacy copies to verify', stats?.unreconciled_copies ?? 0],
        ].map(([label, value]) => <section className="card section" key={label}><p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>{label}</p><strong style={{ fontSize: '1.65rem' }}>{value}</strong></section>)}
      </div>

      <section className="card section" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="section__title">Teacher accountability register</h2>
        <p style={{ color: 'var(--color-ink-muted)', marginTop: 0 }}>A teacher remains accountable for every copy issued by the librarian, including copies currently reissued to students. Only a recorded teacher-to-library return removes a copy from this account.</p>
        <div className="summary-grid" style={{ marginBottom: 'var(--space-3)' }}>
          {[
            ['Copies on teacher accounts', teacherAccountability?.total_accountable ?? 0],
            ['Currently with students', teacherAccountability?.with_students ?? 0],
            ['Retained by teachers', teacherAccountability?.retained_by_teachers ?? 0],
            ['Lost while accountable', teacherAccountability?.lost ?? 0],
          ].map(([label, value]) => <div className="card section" key={label}><p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>{label}</p><strong style={{ fontSize: '1.5rem' }}>{value}</strong></div>)}
        </div>
        {(teacherAccountability?.teachers.length ?? 0) === 0 ? <EmptyState title="No outstanding teacher accounts" description="Copies appear here after the librarian issues them to a teacher." /> :
          teacherAccountability?.teachers.map(teacher => <details key={teacher.teacher_id} style={{ borderTop: '1px solid var(--color-line)', padding: 'var(--space-3) 0' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{teacher.teacher_name} · {teacher.total_accountable} accountable · {teacher.with_students} with students · {teacher.retained_by_teacher} retained · {teacher.lost} lost</summary>
            <div style={{ overflowX: 'auto', marginTop: 'var(--space-2)' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
              <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-line)' }}>{['Book','Copy','Current location','Student','Condition','Status'].map(label => <th key={label} style={{ padding: 'var(--space-2)' }}>{label}</th>)}</tr></thead>
              <tbody>{teacher.copies.map(copy => <tr key={copy.copy_id} style={{ borderBottom: '1px solid var(--color-line)' }}>
                <td style={{ padding: 'var(--space-2)' }}>{copy.book_title}</td><td style={{ padding: 'var(--space-2)', fontWeight: 700 }}>{copy.copy_number}</td>
                <td style={{ padding: 'var(--space-2)' }}>{copy.current_holder_type === 'student' ? 'Student' : 'Teacher'} · {copy.current_holder_name ?? 'Unknown'}</td>
                <td style={{ padding: 'var(--space-2)' }}>{copy.student_name ?? '—'}{copy.student_id ? ' (#' + copy.student_id + ')' : ''}</td>
                <td style={{ padding: 'var(--space-2)' }}>{copy.condition}</td><td style={{ padding: 'var(--space-2)' }}>{copy.status}</td>
              </tr>)}</tbody>
            </table></div>
          </details>)}
      </section>

      <section className="card section" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="section__title">Learner allocation register</h2>
        <p style={{ color: 'var(--color-ink-muted)', marginTop: 0 }}>Read-only register of numbered copies currently held by students. Teachers record student issues and returns; the librarian can review these allocations but cannot edit them here.</p>
        {studentAllocations.length === 0 ? <EmptyState title="No current student allocations" description="Copies appear here after a teacher issues them to students." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}><thead><tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-line)' }}>{['Student','Admission number','Current class','Book title','Copy number','Accountable teacher','Issued'].map(label => <th key={label} style={{ padding: 'var(--space-2)' }}>{label}</th>)}</tr></thead><tbody>{studentAllocations.map(item => <tr key={item.copy_id} style={{ borderBottom: '1px solid var(--color-line)' }}><td style={{ padding: 'var(--space-2)' }}>{item.student_name}</td><td style={{ padding: 'var(--space-2)' }}>{item.student_admission_number ?? '—'}</td><td style={{ padding: 'var(--space-2)' }}>{item.student_class ?? '—'}</td><td style={{ padding: 'var(--space-2)' }}>{item.book_title}</td><td style={{ padding: 'var(--space-2)', fontWeight: 700 }}>{item.copy_number}</td><td style={{ padding: 'var(--space-2)' }}>{item.accountable_teacher_name}</td><td style={{ padding: 'var(--space-2)' }}>{item.student_issue_at ? new Date(item.student_issue_at).toLocaleString() : '—'}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="card section" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="section__title">Record a book hand-off</h2>
        <p style={{ color: 'var(--color-ink-muted)', marginTop: 0 }}>Choose the correct transition. The system checks the current holder and rejects skipped steps.</p>
        <form onSubmit={submitMovement} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(13rem,1fr))', gap: 'var(--space-3)', alignItems: 'end' }}>
          <label className="field"><span className="field__label">Movement</span><select className="input" value={action} onChange={e => { setAction(e.target.value); setSelectedCopy(''); setIssueTeacherId(''); setIssueSubject(''); setIssueGrade(''); setIssueBookId(''); setHolderId(''); setHolderName('') }}>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {action === 'issue_to_teacher' ? <>
            <label className="field"><span className="field__label">Teacher</span><select className="input" required value={issueTeacherId} onChange={e => { const value = e.target.value; const teacher = issueTeachers.find(item => String(item.id) === value); setIssueTeacherId(value); setHolderId(value); setHolderName(teacher?.name ?? ''); setIssueSubject(''); setIssueGrade(''); setIssueBookId(''); setSelectedCopy('') }}><option value="">Select teacher…</option>{issueTeachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
            <label className="field"><span className="field__label">Subject assigned to teacher</span><select className="input" required value={issueSubject} onChange={e => { setIssueSubject(e.target.value); setIssueGrade(''); setIssueBookId(''); setSelectedCopy('') }} disabled={!issueTeacherId}><option value="">Select subject…</option>{issueSubjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}</select></label>
            <label className="field"><span className="field__label">Grade</span><select className="input" required value={issueGrade} onChange={e => { setIssueGrade(e.target.value); setIssueBookId(''); setSelectedCopy('') }} disabled={!issueSubject}><option value="">Select grade…</option>{issueGrades.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select></label>
            <label className="field"><span className="field__label">Registered book title</span><select className="input" required value={issueBookId} onChange={e => { setIssueBookId(e.target.value); setSelectedCopy('') }} disabled={!issueGrade}><option value="">Select available title…</option>{issueBooks.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select>{issueGrade && issueBooks.length === 0 && <small style={{ color: 'var(--color-ink-muted)' }}>No registered titles for this grade and subject currently have available copies.</small>}</label>
            <label className="field"><span className="field__label">Available physical copy number</span><select className="input" required value={selectedCopy} onChange={e => setSelectedCopy(e.target.value)} disabled={!issueBookId}><option value="">Select copy number…</option>{issueBookCopies.map(copy => <option key={copy.id} value={copy.id}>{copy.copy_number}</option>)}</select></label>
          </> : <label className="field"><span className="field__label">Physical book copy</span><select className="input" required value={selectedCopy} onChange={e => setSelectedCopy(e.target.value)}><option value="">Select copy…</option>{eligibleCopies.map(copy => <option key={copy.id} value={copy.id}>{copy.book?.title ?? `Book #${copy.book_id}`} · {copy.copy_number} · {copy.current_holder_name ?? 'Library'}</option>)}</select></label>}
          {action === 'reconcile_copy' && <label className="field"><span className="field__label">Verified physical holder</span><select className="input" value={toHolderType} onChange={e => setToHolderType(e.target.value as 'library' | 'teacher')}><option value="library">Returned to library</option><option value="teacher">With a teacher</option></select></label>}
          
          {showReceiver && action === 'issue_to_student' && <label className="field"><span className="field__label">Student (from Student module)</span><select className="input" required value={holderId} onChange={e => { const value = e.target.value; const student = studentDirectory.find(item => String(item.id) === value); setHolderId(value); setHolderName(student?.name ?? '') }}><option value="">Select student…</option>{studentDirectory.map(student => <option key={student.id} value={student.id}>{student.admission_number} · {student.name}{student.current_class ? ` · ${student.current_class}` : ''}</option>)}</select>{studentDirectory.length === 0 && <small style={{ color: 'var(--color-ink-muted)' }}>No active students were returned by the Student module.</small>}</label>}
          {showReceiver && action === 'student_return_to_teacher' && <>
            <label className="field"><span className="field__label">Receiving teacher ID</span><input className="input" type="number" min="1" required value={holderId} onChange={e => setHolderId(e.target.value)} placeholder="Your teacher record ID" /></label>
            <label className="field"><span className="field__label">Receiving teacher name</span><input className="input" required value={holderName} onChange={e => setHolderName(e.target.value)} placeholder="Your full name" /></label>
          </>}
          <label className="field"><span className="field__label">Condition at hand-off</span><select className="input" value={condition} onChange={e => setCondition(e.target.value as 'good' | 'damaged')}><option value="good">Good</option><option value="damaged">Damaged</option></select></label>
          <label className="field"><span className="field__label">Due date (optional)</span><input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}><span className="field__label">Notes (optional)</span><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder={action === 'exclude_before_issue' || action === 'restore_excluded_copy' ? 'Required reason for this register change…' : 'Class, subject, condition notes…'} /></label>
          <div><button className="button button--primary" type="submit" disabled={saving || (action === 'issue_to_teacher' ? (!selectedCopy || !issueTeacherId || !issueSubject || !issueGrade || !issueBookId) : eligibleCopies.length === 0)}>{saving ? 'Saving…' : 'Record hand-off'}</button></div>
        </form>
        {eligibleCopies.length === 0 && <p style={{ color: 'var(--color-ink-muted)', marginBottom: 0 }}>No copies currently qualify for this movement.</p>}
      </section>

      <section className="card section" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div><h2 className="section__title" style={{ marginBottom: '.25rem' }}>Outstanding book reconciliation</h2><p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>{reconciliation?.outstanding_count ?? 0} copies remain outside the library.</p></div>
          <button className="button button--secondary button--sm" onClick={load}>Refresh register</button>
        </div>
        {(reconciliation?.outstanding_copies.length ?? 0) === 0 ? <EmptyState title="All copies are in the library" description="No outstanding teacher or student holdings are recorded." /> : <div style={{ overflowX: 'auto', marginTop: 'var(--space-3)' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-line)' }}>{['Book title','Copy number','Current holder','Holder type','Condition','Due date'].map(x => <th key={x} style={{ padding: 'var(--space-2)' }}>{x}</th>)}</tr></thead>
          <tbody>{reconciliation?.outstanding_copies.map(copy => <tr key={copy.id} style={{ borderBottom: '1px solid var(--color-line)' }}><td style={{ padding: 'var(--space-2)' }}>{copy.book?.title ?? `Book #${copy.book_id}`}</td><td style={{ padding: 'var(--space-2)', fontWeight: 700 }}>{copy.copy_number}</td><td style={{ padding: 'var(--space-2)' }}>{copy.current_holder_name ?? 'Unknown'}</td><td style={{ padding: 'var(--space-2)' }}>{copy.current_holder_type}</td><td style={{ padding: 'var(--space-2)' }}>{copy.condition}</td><td style={{ padding: 'var(--space-2)' }}>{copy.due_date ?? '—'}</td></tr>)}</tbody>
        </table></div>}
      </section>

      <section className="card section">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 className="section__title" style={{ margin: 0 }}>Physical copy register</h2>
          <select className="input" style={{ maxWidth: '20rem' }} value={filterBook} onChange={e => setFilterBook(e.target.value)}><option value="all">All titles</option>{books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 'var(--space-3)' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-line)' }}>{['Title','Copy ID','Status','Current holder','Condition','History'].map(x => <th key={x} style={{ padding: 'var(--space-2)' }}>{x}</th>)}</tr></thead>
          <tbody>{visibleCopies.map(copy => <tr key={copy.id} style={{ borderBottom: '1px solid var(--color-line)' }}><td style={{ padding: 'var(--space-2)' }}>{copy.book?.title ?? `Book #${copy.book_id}`}</td><td style={{ padding: 'var(--space-2)', fontWeight: 700 }}>{copy.copy_number}</td><td style={{ padding: 'var(--space-2)' }}>{statusLabel(copy.status)}</td><td style={{ padding: 'var(--space-2)' }}>{copy.current_holder_name ?? 'Library'}</td><td style={{ padding: 'var(--space-2)' }}>{copy.condition}</td><td style={{ padding: 'var(--space-2)' }}><button className="button button--ghost button--sm" onClick={() => void openHistory(copy.id)}>View history</button></td></tr>)}</tbody>
        </table></div>
        {visibleCopies.length === 0 && <EmptyState title="No physical copies registered" description="Add catalogue titles and run the library custody migration to populate the copy register." />}
        {movements.length > 0 && <div style={{ marginTop: 'var(--space-4)' }}><h3 className="section__title">Movement history · {copies.find(copy => copy.id === selectedCopy)?.copy_number}</h3><ol style={{ paddingLeft: '1.25rem' }}>{movements.map(move => <li key={move.id} style={{ padding: '.4rem 0' }}><strong>{actionLabels[move.action] ?? move.action}</strong> · {move.from_holder_name ?? 'Library'} → {move.to_holder_name ?? 'Library'} · {move.condition} · {new Date(move.performed_at).toLocaleString()}{move.notes ? <div style={{ color: 'var(--color-ink-muted)' }}>{move.notes}</div> : null}</li>)}</ol></div>}
      </section>
    </>}
  </div>
}
