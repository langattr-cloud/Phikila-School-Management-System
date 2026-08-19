import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { friendlyApiError } from '../lib/api'
import { attendance, type AttendanceSession, type AttendanceContext, type AttendanceStatus } from '../lib/attendance'
import { students, type Student } from '../lib/students'

export default function AttendancePage() {
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null)
  const [classStudents, setClassStudents] = useState<Student[]>([])
  const [showNewSession, setShowNewSession] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try { setSessions(await attendance.listSessions()) }
    catch (err) { setError(friendlyApiError(err, 'load attendance')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function openSession(context: AttendanceContext, date: string) {
    try {
      const session = await attendance.openSession(context, date)
      setSessions((current) => [session, ...current])
      setShowNewSession(false)
    } catch (err) { setError(friendlyApiError(err, 'open attendance session')) }
  }

  async function markStudent(studentId: number, status: AttendanceStatus) {
    if (!selectedSession) return
    try {
      await attendance.mark(selectedSession.id, studentId, status)
      const updated = await attendance.listSessions({
        academic_year_id: selectedSession.academic_year_id,
        level_id: selectedSession.level_id,
        grade_id: selectedSession.grade_id,
        stream_id: selectedSession.stream_id,
      })
      const current = updated.find((x) => x.id === selectedSession.id)
      if (current) setSelectedSession(current)
    } catch (err) { setError(friendlyApiError(err, 'mark attendance')) }
  }

  async function selectSession(session: AttendanceSession) {
    setSelectedSession(session)
    try {
      const result = await students.list({ academic_year_id: session.academic_year_id, level_id: session.level_id, grade_id: session.grade_id, stream_id: session.stream_id, page_size: 100 })
      setClassStudents(result.items)
    } catch (err) { setError(friendlyApiError(err, 'load stream students')) }
  }

  async function bulkPresent() {
    if (!selectedSession || !classStudents.length) return
    try {
      await attendance.bulkMark(selectedSession.id, classStudents.map((s) => s.id), 'present')
      await load()
      setSelectedSession(null)
    } catch (err) { setError(friendlyApiError(err, 'bulk mark')) }
  }

  return (
    <div>
      <PageHeader title="Attendance" description="Track student attendance by academic year, level, grade, stream and date." actions={<button className="button button--primary button--sm" onClick={() => setShowNewSession(!showNewSession)}>{showNewSession ? '✕ Close' : '+ Open Register'}</button>} />
      {error && <Alert tone="error">{error}</Alert>}
      {showNewSession && <NewSessionForm onSubmit={openSession} onCancel={() => setShowNewSession(false)} />}
      {selectedSession && <MarkingPanel session={selectedSession} students={classStudents} onMark={markStudent} onBulkPresent={bulkPresent} onClose={() => setSelectedSession(null)} />}
      {loading ? <LoadingBlock label="Loading attendance" rows={4} /> : !sessions.length ? <EmptyState title="No attendance sessions" description="Open a register for an academic stream to start tracking attendance." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {sessions.map((s) => <div key={s.id} className="card" style={{ padding: 'var(--space-3)', cursor: 'pointer' }} onClick={() => selectSession(s)}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><strong>Year #{s.academic_year_id} · Level #{s.level_id} · Grade #{s.grade_id} · Stream #{s.stream_id}</strong> — {s.date}<span style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem', marginLeft: 'var(--space-2)' }}>{s.records?.length || 0} records</span></div><Badge tone={s.status === 'open' ? 'success' : 'warning'}>{s.status}</Badge></div></div>)}
        </div>
      )}
    </div>
  )
}

function NewSessionForm({ onSubmit, onCancel }: { onSubmit: (context: AttendanceContext, date: string) => void; onCancel: () => void }) {
  const [academicYearId, setAcademicYearId] = useState('')
  const [levelId, setLevelId] = useState('')
  const [gradeId, setGradeId] = useState('')
  const [streamId, setStreamId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const ready = academicYearId && levelId && gradeId && streamId && date
  return <div className="card section" style={{ marginBottom: 'var(--space-4)' }}><h2 className="section__title">Open Attendance Register</h2><div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>{[["Academic Year", academicYearId, setAcademicYearId], ["Level", levelId, setLevelId], ["Grade", gradeId, setGradeId], ["Stream", streamId, setStreamId]].map(([label, value, setter]) => <div className="field" key={String(label)}><label className="field__label">{String(label)}</label><input className="input" type="number" value={String(value)} onChange={(e) => (setter as (v: string) => void)(e.target.value)} placeholder="ID" /></div>)}<div className="field"><label className="field__label">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div><button className="button button--primary" disabled={!ready} onClick={() => onSubmit({ academic_year_id: Number(academicYearId), level_id: Number(levelId), grade_id: Number(gradeId), stream_id: Number(streamId) }, date)}>Open</button><button className="button button--secondary" onClick={onCancel}>Cancel</button></div></div>
}

function MarkingPanel({ session, students: studs, onMark, onBulkPresent, onClose }: { session: AttendanceSession; students: Student[]; onMark: (studentId: number, status: AttendanceStatus) => void; onBulkPresent: () => void; onClose: () => void }) {
  return <div className="card section" style={{ marginBottom: 'var(--space-4)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}><h2 className="section__title" style={{ marginBottom: 0 }}>Mark Attendance — {session.date}</h2><div style={{ display: 'flex', gap: 'var(--space-2)' }}><button className="button button--primary button--sm" onClick={onBulkPresent}>✓ All Present</button><button className="button button--ghost button--sm" onClick={onClose}>✕</button></div></div>{studs.length === 0 ? <p style={{ color: 'var(--color-ink-muted)' }}>No students in this stream.</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>{studs.map((s) => { const record = session.records?.find((r) => r.student_id === s.id); return <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)' }}><span>{s.first_name} {s.last_name} <span style={{ color: 'var(--color-ink-muted)', fontSize: '0.8rem' }}>({s.admission_number})</span></span><div style={{ display: 'flex', gap: 'var(--space-1)' }}>{(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map((st) => <button key={st} className={`button button--sm ${record?.status === st ? 'button--primary' : 'button--ghost'}`} onClick={() => onMark(s.id, st)}>{st.charAt(0).toUpperCase()}</button>)}</div></div> })}</div>}</div>
}
