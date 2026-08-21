import { useCallback, useMemo, useState, type FormEvent } from 'react'
import './streams.css'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { CalendarIcon, SearchIcon } from '../components/icons'
import { api, friendlyApiError, type AcademicYear, type Term } from '../lib/api'
import { useAsync } from '../lib/useAsync'

type Data = { years: AcademicYear[]; terms: Term[] }
type Editing = { kind: 'year'; row: AcademicYear } | { kind: 'term'; row: Term }

async function loadAcademics(): Promise<Data> {
  const [years, terms] = await Promise.all([api.academicYears(), api.terms()])
  return { years: Array.isArray(years) ? years : [], terms: Array.isArray(terms) ? terms : [] }
}

export function AcademicsPage() {
  const toMessage = useCallback((error: unknown) => friendlyApiError(error, 'load the academic calendar'), [])
  const { data, loading, error, reload } = useAsync<Data>(loadAcademics, toMessage)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [current, setCurrent] = useState(false)
  const [status, setStatus] = useState('ACTIVE')
  const [academicYearId, setAcademicYearId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const term = query.trim().toLowerCase()
  const years = useMemo(() => (Array.isArray(data?.years) ? data.years : []).filter(year => !term || year.name.toLowerCase().includes(term)), [data, term])
  const terms = useMemo(() => (Array.isArray(data?.terms) ? data.terms : []).filter(item => !term || item.name.toLowerCase().includes(term)), [data, term])

  function openYearEdit(row: AcademicYear) {
    setEditing({ kind: 'year', row }); setName(row.name); setStart(row.start_date); setEnd(row.end_date)
    setCurrent(row.is_current === true); setStatus(row.status || 'ACTIVE'); setAcademicYearId(''); setSaveError(null)
  }
  function openTermEdit(row: Term) {
    setEditing({ kind: 'term', row }); setName(row.name); setStart(row.start_date || ''); setEnd(row.end_date || '')
    setCurrent(row.is_current === true); setStatus(''); setAcademicYearId(String(row.academic_year_id)); setSaveError(null)
  }
  function closeEdit() { if (!saving) setEditing(null) }

  async function save(e: FormEvent) {
    e.preventDefault(); if (!editing) return
    setSaving(true); setSaveError(null)
    try {
      if (editing.kind === 'year') {
        await api.updateAcademicYear(editing.row.id, { name: name.trim(), start_date: start, end_date: end, is_current: current, status: status.trim() || 'ACTIVE' })
      } else {
        await api.updateTerm(editing.row.id, { name: name.trim(), start_date: start || null, end_date: end || null, is_current: current, academic_year_id: Number(academicYearId) })
      }
      setEditing(null); await reload()
    } catch (e) { setSaveError(friendlyApiError(e, `save ${editing.kind === 'year' ? 'academic year' : 'term'}`)) }
    finally { setSaving(false) }
  }

  const yearColumns: Column<AcademicYear>[] = [
    { key: 'name', header: 'Academic year', render: row => row.name },
    { key: 'start', header: 'Starts', render: row => row.start_date },
    { key: 'end', header: 'Ends', render: row => row.end_date },
    { key: 'status', header: 'Status', render: row => row.is_current ? <Badge tone="success">Current</Badge> : <Badge>{row.status || 'Recorded'}</Badge> },
    { key: 'actions', header: 'Actions', render: row => <button type="button" className="button button--ghost button--sm" onClick={() => openYearEdit(row)}>Edit</button> },
  ]
  const termColumns: Column<Term>[] = [
    { key: 'name', header: 'Term', render: row => row.name },
    { key: 'start', header: 'Starts', render: row => row.start_date || 'Not set' },
    { key: 'end', header: 'Ends', render: row => row.end_date || 'Not set' },
    { key: 'status', header: 'Status', render: row => row.is_current ? <Badge tone="success">Current</Badge> : <Badge>Scheduled</Badge> },
    { key: 'actions', header: 'Actions', render: row => <button type="button" className="button button--ghost button--sm" onClick={() => openTermEdit(row)}>Edit</button> },
  ]

  return <>
    <PageHeader title="Academic calendar" description="Academic years and terms recorded for this school." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Academic calendar' }]} />
    {error ? <ErrorState title="Academic calendar could not load" message={error} onRetry={reload} /> : <>
      <div className="toolbar"><div className="search"><SearchIcon className="search__icon" width={18} height={18} /><label className="visually-hidden" htmlFor="academics-search">Search academic years and terms</label><input id="academics-search" className="input input--search" type="search" placeholder="Search by name" value={query} onChange={e => setQuery(e.target.value)} /></div>{query && <button type="button" className="button button--ghost button--sm" onClick={() => setQuery('')}>Clear search</button>}</div>
      <section className="card section" aria-labelledby="years-heading"><h2 className="section__title" id="years-heading">Academic years</h2><DataTable caption="Academic years" columns={yearColumns} rows={years} rowKey={row => row.id} loading={loading} loadingLabel="Loading academic years" empty={<EmptyState title={query ? 'No matching academic years' : 'No academic years found'} description={query ? 'No academic year matches your search. Clear the search to see everything.' : 'Academic years appear here once they have been created in the system.'} icon={<CalendarIcon width={22} height={22} />} />} /></section>
      <section className="card section" aria-labelledby="terms-heading"><h2 className="section__title" id="terms-heading">Terms</h2><DataTable caption="Terms" columns={termColumns} rows={terms} rowKey={row => row.id} loading={loading} loadingLabel="Loading terms" empty={<EmptyState title={query ? 'No matching terms' : 'No terms found'} description={query ? 'No term matches your search. Clear the search to see everything.' : 'Terms appear here once they have been added to an academic year.'} icon={<CalendarIcon width={22} height={22} />} />} /></section>
    </>}
    {editing && <div className="streams-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeEdit() }}><div className="card streams-modal" role="dialog" aria-modal="true" aria-labelledby="edit-academic-title"><h2 className="section__title" id="edit-academic-title">Edit {editing.kind === 'year' ? 'academic year' : 'term'}</h2><form onSubmit={save}>
      <label className="label" htmlFor="academic-name">Name</label><input id="academic-name" className="input" value={name} onChange={e => setName(e.target.value)} required />
      {editing.kind === 'term' && <><label className="label" htmlFor="academic-year">Academic year</label><select id="academic-year" className="input" value={academicYearId} onChange={e => setAcademicYearId(e.target.value)} required>{years.map(year => <option key={year.id} value={year.id}>{year.name}</option>)}</select></>}
      <label className="label" htmlFor="academic-start">Start date</label><input id="academic-start" className="input" type="date" value={start} onChange={e => setStart(e.target.value)} required={editing.kind === 'year'} />
      <label className="label" htmlFor="academic-end">End date</label><input id="academic-end" className="input" type="date" value={end} onChange={e => setEnd(e.target.value)} required={editing.kind === 'year'} />
      {editing.kind === 'year' && <><label className="label" htmlFor="academic-status">Status</label><input id="academic-status" className="input" value={status} onChange={e => setStatus(e.target.value)} required /></>}
      <label className="label"><input type="checkbox" checked={current} onChange={e => setCurrent(e.target.checked)} /> Current {editing.kind === 'year' ? 'academic year' : 'term'}</label>
      {saveError && <p className="error">{saveError}</p>}<div className="streams-modal__actions"><button type="button" className="button button--ghost" onClick={closeEdit} disabled={saving}>Cancel</button><button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Saving…' : `Save ${editing.kind === 'year' ? 'academic year' : 'term'}`}</button></div>
    </form></div></div>}
  </>
}
