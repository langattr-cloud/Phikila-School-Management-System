import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { Field } from '../components/Field'
import { LayersIcon, SearchIcon, UserIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Room, type RoomInput, type SchoolClass, type SchoolClassInput, type Subject, type SubjectInput, type Teacher, type TeacherInput } from '../lib/scheduling'
import { AvailabilityEditor } from '../components/AvailabilityEditor'

type Kind = 'teachers' | 'subjects' | 'classes' | 'rooms'
type Row = Teacher | Subject | SchoolClass | Room

const TITLES: Record<Kind, { title: string; description: string; singular: string }> = {
  teachers: { title: 'Teachers', description: 'Staff, their limits and when they are unavailable.', singular: 'teacher' },
  subjects: { title: 'Subjects', description: 'What is taught, and how each subject should be scheduled.', singular: 'subject' },
  classes: { title: 'Classes', description: 'Teaching groups that cannot be in two places at once.', singular: 'class' },
  rooms: { title: 'Rooms', description: 'Rooms and specialist spaces treated as bookable resources.', singular: 'room' },
}

export function SetupPage({ kind }: { kind: Kind }) {
  const { notify } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { const data = await (kind === 'teachers' ? scheduling.teachers() : kind === 'subjects' ? scheduling.subjects() : kind === 'classes' ? scheduling.classes() : scheduling.rooms()); setRows(data as Row[]) }
    catch (err) { setError(friendlyApiError(err, `load ${kind}`)) }
    finally { setLoading(false) }
  }, [kind])
  useEffect(() => { setQuery(''); setEditing(null); void load() }, [load])
  const filtered = useMemo(() => { const term = query.trim().toLowerCase(); if (!term) return rows; return rows.filter(row => row.name.toLowerCase().includes(term) || row.code.toLowerCase().includes(term)) }, [rows, query])
  async function remove(row: Row) {
    try { await (kind === 'teachers' ? scheduling.deleteTeacher(row.id) : kind === 'subjects' ? scheduling.deleteSubject(row.id) : kind === 'classes' ? scheduling.deleteClass(row.id) : scheduling.deleteRoom(row.id)); notify(`${TITLES[kind].singular} removed.`, 'success'); await load() }
    catch (err) { notify(friendlyApiError(err, `remove the ${TITLES[kind].singular}`), 'error') }
  }
  const columns = useMemo<Column<Row>[]>(() => {
    const base: Column<Row>[] = [{ key: 'name', header: 'Name', render: row => row.name }, { key: 'code', header: 'Code', render: row => row.code }]
    if (kind === 'teachers') base.push({ key: 'dept', header: 'Department', render: row => (row as Teacher).department || '—' }, { key: 'max', header: 'Max/day', render: row => (row as Teacher).max_lessons_per_day }, { key: 'avail', header: 'Availability', render: row => { const blocked = Object.values((row as Teacher).unavailable ?? {}).flat().length; return blocked ? <Badge tone="warning">{blocked} blocked</Badge> : <Badge tone="success">Full week</Badge> } })
    if (kind === 'subjects') base.push({ key: 'morning', header: 'Timing', render: row => (row as Subject).prefers_morning ? <Badge>Prefers morning</Badge> : <Badge>Any time</Badge> }, { key: 'room', header: 'Room type', render: row => (row as Subject).required_room_type || 'Any' })
    if (kind === 'classes') base.push({ key: 'grade', header: 'Grade', render: row => (row as SchoolClass).grade || '—' }, { key: 'size', header: 'Students', render: row => (row as SchoolClass).student_count })
    if (kind === 'rooms') base.push({ key: 'type', header: 'Type', render: row => (row as Room).room_type }, { key: 'cap', header: 'Capacity', render: row => (row as Room).capacity }, { key: 'building', header: 'Building', render: row => (row as Room).building || '—' })
    return base
  }, [kind])
  const info = TITLES[kind]
  return <><PageHeader title={info.title} description={info.description} breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Setup' }, { label: info.title }]} actions={<button type="button" className="button button--primary button--sm" onClick={() => setEditing('new')}>Add {info.singular}</button>} />{editing && <ResourceForm kind={kind} initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await load() }} />}{error ? <ErrorState title={`${info.title} could not load`} message={error} onRetry={load} /> : <section className="card section"><div className="toolbar"><div className="search"><SearchIcon className="search__icon" width={18} height={18} /><label className="visually-hidden" htmlFor="setup-search">Search {info.title.toLowerCase()}</label><input id="setup-search" className="input input--search" type="search" placeholder="Search by name or code" value={query} onChange={event => setQuery(event.target.value)} /></div>{query && <button type="button" className="button button--ghost button--sm" onClick={() => setQuery('')}>Clear search</button>}{!loading && <span className="toolbar__count">{filtered.length} of {rows.length}</span>}</div><DataTable caption={info.title} columns={columns} rows={filtered} rowKey={row => row.id} loading={loading} loadingLabel={`Loading ${info.title.toLowerCase()}`} empty={<EmptyState title={query ? `No matching ${info.title.toLowerCase()}` : `No ${info.title.toLowerCase()} yet`} description={query ? 'Nothing matches your search. Clear it to see everything.' : `Add your first ${info.singular} to start building the timetable.`} icon={kind === 'teachers' ? <UserIcon width={22} height={22} /> : <LayersIcon width={22} height={22} />} action={!query ? <button type="button" className="button button--primary button--sm" onClick={() => setEditing('new')}>Add {info.singular}</button> : undefined} />} rowActions={row => <><button type="button" className="button button--ghost button--sm" onClick={() => setEditing(row)}>Edit</button><button type="button" className="button button--ghost button--sm" onClick={() => remove(row)}>Delete</button></>} /></section>}</>
}

function ResourceForm({ kind, initial, onCancel, onSaved }: { kind: Kind; initial: Row | null; onCancel: () => void; onSaved: () => void }) {
  const { notify } = useToast(); const [values, setValues] = useState<Record<string, unknown>>(() => defaults(kind, initial)); const [errors, setErrors] = useState<Record<string, string>>({}); const [saving, setSaving] = useState(false); const [formError, setFormError] = useState<string | null>(null)
  const set = (key: string, value: unknown) => setValues(current => ({ ...current, [key]: value }))
  async function submit(event: FormEvent) { event.preventDefault(); if (saving) return; const next: Record<string, string> = {}; if (!String(values.name ?? '').trim()) next.name = 'Enter a name.'; if (!String(values.code ?? '').trim()) next.code = 'Enter a short code.'; setErrors(next); setFormError(null); if (Object.keys(next).length) return; setSaving(true); try { const id = initial?.id; const save = { teachers: id ? () => scheduling.updateTeacher(id, values as TeacherInput) : () => scheduling.createTeacher(values as TeacherInput), subjects: id ? () => scheduling.updateSubject(id, values as SubjectInput) : () => scheduling.createSubject(values as SubjectInput), classes: id ? () => scheduling.updateClass(id, values as SchoolClassInput) : () => scheduling.createClass(values as SchoolClassInput), rooms: id ? () => scheduling.updateRoom(id, values as RoomInput) : () => scheduling.createRoom(values as RoomInput) }[kind] as () => Promise<unknown>; await save(); notify(initial ? 'Changes saved.' : 'Added.', 'success'); onSaved() } catch (err) { setFormError(friendlyApiError(err, 'save those details')) } finally { setSaving(false) } }
  return <section className="card section"><h2 className="section__title">{initial ? `Edit ${TITLES[kind].singular}` : `New ${TITLES[kind].singular}`}</h2>{formError && <Alert tone="error">{formError}</Alert>}<form className="form form--grid" onSubmit={submit} noValidate><Field label="Name" required value={String(values.name ?? '')} onChange={event => set('name', event.target.value)} error={errors.name} /><Field label="Code" required hint="A short unique identifier, e.g. MATH or T01." value={String(values.code ?? '')} onChange={event => set('code', event.target.value)} error={errors.code} />{kind === 'teachers' && <><Field label="Department" value={String(values.department ?? '')} onChange={event => set('department', event.target.value)} /><Field label="Maximum lessons per day" type="number" min={1} max={20} required value={String(values.max_lessons_per_day ?? 7)} onChange={event => set('max_lessons_per_day', Number(event.target.value))} /><Field label="Maximum consecutive lessons" type="number" min={1} max={20} required value={String(values.max_consecutive ?? 4)} onChange={event => set('max_consecutive', Number(event.target.value))} /></>}{kind === 'subjects' && <><Field label="Required room type" hint="Leave blank for any room. Use 'lab' for practicals." value={String(values.required_room_type ?? '')} onChange={event => set('required_room_type', event.target.value || null)} /><fieldset className="fieldset"><legend className="field__label">Scheduling preferences</legend><label className="checkbox"><input type="checkbox" checked={Boolean(values.prefers_morning)} onChange={event => set('prefers_morning', event.target.checked)} />Prefer morning periods</label><label className="checkbox"><input type="checkbox" checked={Boolean(values.prefers_double)} onChange={event => set('prefers_double', event.target.checked)} />Prefer double periods</label><label className="checkbox"><input type="checkbox" checked={Boolean(values.spread_across_week)} onChange={event => set('spread_across_week', event.target.checked)} />Spread across the week</label></fieldset></>}{kind === 'classes' && <><Field label="Grade" value={String(values.grade ?? '')} onChange={event => set('grade', event.target.value)} /><Field label="Number of students" type="number" min={1} required value={String(values.student_count ?? 40)} onChange={event => set('student_count', Number(event.target.value))} /></>}{kind === 'rooms' && <><Field label="Room type" hint="classroom, lab, computer, hall…" required value={String(values.room_type ?? 'classroom')} onChange={event => set('room_type', event.target.value)} /><Field label="Capacity" type="number" min={1} required value={String(values.capacity ?? 40)} onChange={event => set('capacity', Number(event.target.value))} /><Field label="Building" value={String(values.building ?? '')} onChange={event => set('building', event.target.value)} /></>}{(kind === 'teachers' || kind === 'rooms' || kind === 'classes') && <div className="form--grid__full"><AvailabilityEditor value={(values.unavailable as Record<string, number[]>) ?? {}} onChange={next => set('unavailable', next)} /></div>}<div className="form__row form--grid__full"><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button className="button button--secondary" type="button" onClick={onCancel}>Cancel</button></div></form></section>
}

function defaults(kind: Kind, initial: Row | null): Record<string, unknown> {
  if (initial) return { ...initial }
  if (kind === 'teachers') return { name: '', code: '', department: '', max_lessons_per_day: 7, max_consecutive: 4, unavailable: {}, is_active: true }
  if (kind === 'subjects') return { name: '', code: '', colour: '#0F2A47', prefers_morning: false, prefers_double: false, spread_across_week: true, required_room_type: null }
  if (kind === 'classes') return { name: '', code: '', grade: '', student_count: 40, unavailable: {} }
  return { name: '', code: '', room_type: 'classroom', capacity: 40, building: '', unavailable: {} }
}
