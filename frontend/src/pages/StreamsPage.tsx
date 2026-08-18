import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { LayersIcon, SearchIcon } from '../components/icons'
import { api, friendlyApiError, type Grade, type Stream, type StreamStudent } from '../lib/api'
import { useAsync } from '../lib/useAsync'

export function StreamsPage() {
  const { data: grades, loading: gradesLoading, error: gradesError, reload: reloadGrades } = useAsync<Grade[]>(api.grades, (e) => friendlyApiError(e, 'load grades'))
  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null)
  const [streams, setStreams] = useState<Stream[]>([])
  const [loadingStreams, setLoadingStreams] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null)
  const [students, setStudents] = useState<StreamStudent[]>([])
  const [allStudents, setAllStudents] = useState<StreamStudent[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [capacity, setCapacity] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [assignmentStudentId, setAssignmentStudentId] = useState('')

  const activeGrades = useMemo(() => (grades || []).filter((grade) => grade.status !== false).sort((a, b) => a.display_order - b.display_order), [grades])

  useEffect(() => {
    if (selectedGradeId === null && activeGrades.length) setSelectedGradeId(activeGrades[0].id)
  }, [activeGrades, selectedGradeId])

  const loadStreams = useCallback(async () => {
    if (selectedGradeId === null) return
    setLoadingStreams(true)
    setStreamError(null)
    try {
      setStreams(await api.streams(selectedGradeId))
    } catch (error) {
      setStreamError(friendlyApiError(error, 'load streams'))
    } finally {
      setLoadingStreams(false)
    }
  }, [selectedGradeId])

  useEffect(() => { void loadStreams() }, [loadStreams])

  async function viewStudents(stream: Stream) {
    setSelectedStream(stream)
    setAssignmentStudentId('')
    try {
      const [members, roster] = await Promise.all([api.streamStudents(stream.id), api.students()])
      setStudents(members)
      setAllStudents(roster.items)
    } catch (error) {
      setStreamError(friendlyApiError(error, 'load stream students'))
    }
  }

  function openCreate() {
    setSelectedStream(null)
    setName('')
    setCode('')
    setCapacity('')
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(stream: Stream) {
    setSelectedStream(stream)
    setName(stream.name)
    setCode(stream.code || '')
    setCapacity(stream.capacity?.toString() || '')
    setFormError(null)
    setShowForm(true)
  }

  async function saveStream(event: React.FormEvent) {
    event.preventDefault()
    if (selectedGradeId === null || !name.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      if (selectedStream) {
        await api.updateStream(selectedStream.id, { name: name.trim(), code: code.trim() || null, capacity: capacity ? Number(capacity) : null })
      } else {
        await api.createStream({ level_id: selectedGradeId, name: name.trim(), code: code.trim() || null, capacity: capacity ? Number(capacity) : null })
      }
      setShowForm(false)
      await loadStreams()
    } catch (error) {
      setFormError(friendlyApiError(error, 'save stream'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleStream(stream: Stream) {
    try {
      await api.updateStream(stream.id, { status: !stream.status })
      await loadStreams()
      if (selectedStream?.id === stream.id) setSelectedStream({ ...stream, status: !stream.status })
    } catch (error) {
      setStreamError(friendlyApiError(error, 'change stream status'))
    }
  }

  async function assignStudent(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedStream || !assignmentStudentId) return
    try {
      await api.assignStudentToStream(selectedStream.id, Number(assignmentStudentId))
      await viewStudents(selectedStream)
      setAssignmentStudentId('')
    } catch (error) {
      setStreamError(friendlyApiError(error, 'assign student'))
    }
  }

  const unassignedStudents = allStudents.filter((student) => student.stream_id !== selectedStream?.id)
  const columns: Column<Stream>[] = [
    { key: 'name', header: 'Stream', render: (row) => <strong>{row.name}</strong> },
    { key: 'code', header: 'Code', render: (row) => row.code || '—' },
    { key: 'capacity', header: 'Capacity', render: (row) => row.capacity ?? 'No limit' },
    { key: 'status', header: 'Status', render: (row) => row.status ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Inactive</Badge> },
    { key: 'actions', header: 'Actions', render: (row) => (
      <div className="table-actions">
        <button type="button" className="button button--ghost button--sm" onClick={() => void viewStudents(row)}>Students</button>
        <button type="button" className="button button--ghost button--sm" onClick={() => openEdit(row)}>Edit</button>
        <button type="button" className="button button--ghost button--sm" onClick={() => void toggleStream(row)}>{row.status ? 'Deactivate' : 'Activate'}</button>
      </div>
    ) },
  ]

  return (
    <>
      <PageHeader
        title="Streams"
        description="Manage student groupings within each grade. Stream names are configured by the school."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Streams' }]}
      />

      {gradesError ? <ErrorState title="Grades could not load" message={gradesError} onRetry={reloadGrades} /> : (
        <>
          <section className="card section">
            <div className="toolbar">
              <div>
                <label className="label" htmlFor="stream-grade">Grade</label>
                <select id="stream-grade" className="input" value={selectedGradeId ?? ''} onChange={(event) => { setSelectedGradeId(Number(event.target.value)); setSelectedStream(null) }} disabled={gradesLoading || !activeGrades.length}>
                  {!activeGrades.length && <option value="">No grades configured</option>}
                  {activeGrades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
                </select>
              </div>
              <button type="button" className="button button--primary" onClick={openCreate} disabled={selectedGradeId === null}>Create stream</button>
            </div>
          </section>

          {streamError && <ErrorState title="Streams could not be updated" message={streamError} onRetry={loadStreams} />}

          <section className="card section" aria-labelledby="streams-heading">
            <div className="section__header">
              <div>
                <h2 className="section__title" id="streams-heading">Streams</h2>
                <p className="section__description">Streams belonging to the selected grade.</p>
              </div>
            </div>
            <DataTable caption="Streams" columns={columns} rows={streams} rowKey={(row) => row.id} loading={loadingStreams} loadingLabel="Loading streams" empty={
              <EmptyState title="No streams configured" description="Create the first stream for this grade. The school can choose any name or code." icon={<LayersIcon width={22} height={22} />} />
            } />
          </section>

          {selectedStream && (
            <section className="card section" aria-labelledby="stream-students-heading">
              <div className="section__header">
                <div>
                  <h2 className="section__title" id="stream-students-heading">{selectedStream.name} students</h2>
                  <p className="section__description">Students currently assigned to this stream.</p>
                </div>
              </div>
              <form className="toolbar" onSubmit={assignStudent}>
                <div>
                  <label className="label" htmlFor="assign-student">Assign student</label>
                  <select id="assign-student" className="input" value={assignmentStudentId} onChange={(event) => setAssignmentStudentId(event.target.value)}>
                    <option value="">Select a student</option>
                    {unassignedStudents.map((student) => <option key={student.id} value={student.id}>{student.admission_number} — {student.first_name} {student.last_name}</option>)}
                  </select>
                </div>
                <button type="submit" className="button button--secondary" disabled={!assignmentStudentId}>Assign</button>
              </form>
              <DataTable caption={`${selectedStream.name} students`} columns={[
                { key: 'admission', header: 'Admission', render: (row) => row.admission_number },
                { key: 'name', header: 'Student', render: (row) => `${row.first_name} ${row.middle_name ? `${row.middle_name} ` : ''}${row.last_name}` },
                { key: 'status', header: 'Status', render: (row) => row.status },
              ] as Column<StreamStudent>[]} rows={students} rowKey={(row) => row.id} empty={<EmptyState title="No students in this stream" description="Assign students using the selector above." icon={<SearchIcon width={22} height={22} />} />} />
            </section>
          )}

          {showForm && (
            <div className="modal-backdrop" role="presentation">
              <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="stream-form-title">
                <h2 id="stream-form-title" className="section__title">{selectedStream ? 'Edit stream' : 'Create stream'}</h2>
                <p className="section__description">{activeGrades.find((grade) => grade.id === selectedGradeId)?.name}</p>
                <form onSubmit={saveStream}>
                  <label className="label" htmlFor="stream-name">Name</label>
                  <input id="stream-name" className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required autoFocus />
                  <label className="label" htmlFor="stream-code">Code <span className="muted">(optional)</span></label>
                  <input id="stream-code" className="input" value={code} onChange={(event) => setCode(event.target.value)} maxLength={30} />
                  <label className="label" htmlFor="stream-capacity">Capacity <span className="muted">(optional)</span></label>
                  <input id="stream-capacity" className="input" type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
                  {formError && <p className="form-error" role="alert">{formError}</p>}
                  <div className="modal__actions">
                    <button type="button" className="button button--ghost" onClick={() => setShowForm(false)}>Cancel</button>
                    <button type="submit" className="button button--primary" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save stream'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
