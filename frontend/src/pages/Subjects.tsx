import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { Field } from '../components/Field'
import { LayersIcon, SearchIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Room, type Subject, type SubjectInput } from '../lib/scheduling'

type SubjectFormProps = { initial: Subject | null; rooms: Room[]; onCancel: () => void; onSaved: () => void }

function SubjectForm({ initial, rooms, onCancel, onSaved }: SubjectFormProps) {
  const { notify } = useToast()
  const [values, setValues] = useState({ name: initial?.name ?? '', code: initial?.code ?? '', colour: initial?.colour ?? '#0F2A47', room_id: String((initial as Subject & { room_id?: number | null } | null)?.room_id ?? '') })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!values.name.trim() || !values.code.trim()) { setFormError('Enter the subject name and code.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload: SubjectInput = { name: values.name.trim(), code: values.code.trim(), colour: values.colour, room_id: values.room_id ? Number(values.room_id) : null, prefers_morning: initial?.prefers_morning ?? false, prefers_double: initial?.prefers_double ?? false, spread_across_week: initial?.spread_across_week ?? true, required_room_type: initial?.required_room_type ?? null }
      if (initial) await scheduling.updateSubject(initial.id, payload); else await scheduling.createSubject(payload)
      notify(initial ? 'Subject saved.' : 'Subject added.', 'success'); onSaved()
    } catch (err) { setFormError(friendlyApiError(err, 'save subject')) } finally { setSaving(false) }
  }

  return <section className="card section"><h2 className="section__title">{initial ? `Edit ${initial.name}` : 'New subject'}</h2>{formError && <Alert tone="error">{formError}</Alert>}<form className="form form--grid subject-simple-form" onSubmit={submit} noValidate><Field label="Subject name" required value={values.name} onChange={(event) => set('name', event.target.value)} /><Field label="Code" required value={values.code} onChange={(event) => set('code', event.target.value)} /><div className="field"><label className="field__label" htmlFor="subject-colour">Color</label><div className="subject-color-input"><input id="subject-colour" type="color" value={values.colour} onChange={(event) => set('colour', event.target.value)} /><input className="input" value={values.colour} onChange={(event) => set('colour', event.target.value)} aria-label="Color hex value" /></div></div><div className="field"><label className="field__label" htmlFor="subject-room">Room <span className="field__optional">(optional)</span></label><select id="subject-room" className="input" value={values.room_id} onChange={(event) => set('room_id', event.target.value)}><option value="">No preferred room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.code ? ` (${room.code})` : ''}</option>)}</select></div><div className="form__row form--grid__full"><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button className="button button--secondary" type="button" onClick={onCancel}>Cancel</button></div></form></section>
}

export default function Subjects() {
  const { notify } = useToast(); const [rows, setRows] = useState<Subject[]>([]); const [rooms, setRooms] = useState<Room[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [query, setQuery] = useState(''); const [editing, setEditing] = useState<Subject | 'new' | null>(null); const [savingRowId, setSavingRowId] = useState<number | null>(null)
  const load = useCallback(async () => { setLoading(true); setError(null); try { const [subjects, availableRooms] = await Promise.all([scheduling.subjects(), scheduling.rooms()]); setRows(subjects); setRooms(availableRooms) } catch (err) { setError(friendlyApiError(err, 'load subjects')) } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => { const term = query.trim().toLowerCase(); return term ? rows.filter((row) => row.name.toLowerCase().includes(term) || (row.code ?? '').toLowerCase().includes(term)) : rows }, [rows, query])
  async function remove(row: Subject) { try { await scheduling.deleteSubject(row.id); notify('Subject removed.', 'success'); await load() } catch (err) { notify(friendlyApiError(err, 'remove the subject'), 'error') } }
  async function saveSubject(row: Subject) { if (savingRowId !== null) return; setSavingRowId(row.id); try { await scheduling.updateSubject(row.id, { name: row.name, code: row.code, colour: row.colour, prefers_morning: row.prefers_morning, prefers_double: row.prefers_double, spread_across_week: row.spread_across_week, required_room_type: row.required_room_type }); notify(`${row.name} saved.`, 'success'); await load() } catch (err) { notify(friendlyApiError(err, 'save subject'), 'error') } finally { setSavingRowId(null) } }
  const columns = useMemo<Column<Subject>[]>(() => [{ key: 'name', header: 'Name', render: (row) => row.name }, { key: 'code', header: 'Code', render: (row) => row.code }, { key: 'color', header: 'Color', render: (row) => <span className="subject-color" style={{ backgroundColor: row.colour }} aria-label={`Subject color ${row.colour}`} /> }], [])

  return <><PageHeader title="Subjects" description="Define subjects independently. Grade and weekly lesson counts are managed with class requirements, not on the subject record." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Setup' }, { label: 'Subjects' }]} actions={<button type="button" className="button button--primary button--sm" onClick={() => setEditing('new')}>Add subject</button>} />{editing && <SubjectForm initial={editing === 'new' ? null : editing} rooms={rooms} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await load() }} />}{error ? <ErrorState title="Subjects could not load" message={error} onRetry={load} /> : <section className="card section"><div className="toolbar"><div className="search"><SearchIcon className="search__icon" width={18} height={18} /><label className="visually-hidden" htmlFor="subjects-search">Search subjects</label><input id="subjects-search" className="input input--search" type="search" placeholder="Search by name or code" value={query} onChange={(event) => setQuery(event.target.value)} /></div>{query && <button type="button" className="button button--ghost button--sm" onClick={() => setQuery('')}>Clear search</button>}{!loading && <span className="toolbar__count">{filtered.length} of {rows.length}</span>}</div><DataTable caption="Subjects" columns={columns} rows={filtered} rowKey={(row) => row.id} loading={loading} loadingLabel="Loading subjects" empty={<EmptyState title={query ? 'No matching subjects' : 'No subjects yet'} description={query ? 'Nothing matches your search. Clear it to see everything.' : 'Add your first subject to start building the timetable.'} icon={<LayersIcon width={22} height={22} />} action={!query ? <button type="button" className="button button--primary button--sm" onClick={() => setEditing('new')}>Add subject</button> : undefined} />} rowActions={(row) => <><button type="button" className="button button--primary button--sm" disabled={savingRowId !== null} onClick={() => void saveSubject(row)}>{savingRowId === row.id ? 'Saving…' : 'Save'}</button><button type="button" className="button button--ghost button--sm" onClick={() => setEditing(row)}>Edit</button><button type="button" className="button button--ghost button--sm" onClick={() => void remove(row)}>Delete</button></>} /></section>}</>
}
