import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { Field } from '../components/Field'
import { LayersIcon, SearchIcon } from '../components/icons'
import { friendlyApiError } from '../lib/api'
import { scheduling } from '../lib/scheduling'
import { useToast } from '../components/Toast'

type Constraint = {
  id: number
  kind?: string
  scope?: string
  target_id?: number | null
  is_hard?: boolean
  weight?: number | null
  params?: Record<string, unknown>
  enabled?: boolean
  note?: string | null
}

export function ConstraintsPage() {
  const { notify } = useToast()
  const [rows, setRows] = useState<Constraint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('soft')
  const [weight, setWeight] = useState('1')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows((await scheduling.constraints()) as Constraint[]) }
    catch (err) { setError(friendlyApiError(err, 'load scheduling constraints')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term)) : rows
  }, [rows, query])

  async function create() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      // Maps onto the solver's real constraint model: a school-wide rule that
      // is either hard (must hold) or soft (weighted preference).
      await scheduling.createConstraint({
        kind: 'school_rule',
        scope: 'school',
        is_hard: kind === 'hard',
        weight: Number(weight) || 1,
        note: name.trim(),
      })
      notify('Constraint added.', 'success'); setName(''); setFormOpen(false); await load()
    } catch (err) { notify(friendlyApiError(err, 'create the constraint'), 'error') }
    finally { setSaving(false) }
  }

  async function remove(id: number) {
    try { await scheduling.deleteConstraint(id); notify('Constraint removed.', 'success'); await load() }
    catch (err) { notify(friendlyApiError(err, 'remove the constraint'), 'error') }
  }

  const columns: Column<Constraint>[] = [
    { key: 'name', header: 'Constraint', render: (row) => String(row.note ?? row.kind ?? `Constraint #${row.id}`) },
    { key: 'kind', header: 'Type', render: (row) => <Badge tone={row.is_hard ? 'warning' : 'success'}>{row.is_hard ? 'Hard rule' : 'Soft preference'}</Badge> },
    { key: 'weight', header: 'Weight', render: (row) => row.weight == null ? '—' : String(row.weight) },
  ]

  return <>
    <PageHeader title="Scheduling constraints" description="Rules and preferences the timetable solver must respect or optimize." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Timetable' }, { label: 'Constraints' }]} actions={<button className="button button--primary button--sm" type="button" onClick={() => setFormOpen((value) => !value)}>Add constraint</button>} />
    {formOpen && <section className="card section">
      <h2 className="section__title">New constraint</h2>
      <Alert tone="info">The backend remains the authority for supported constraint types and validation.</Alert>
      <div className="form form--grid">
        <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Type" value={kind} onChange={(e) => setKind(e.target.value)} hint="hard or soft" />
        <Field label="Weight" type="number" min={1} value={weight} onChange={(e) => setWeight(e.target.value)} />
        <div className="form__row form--grid__full"><button className="button button--primary" type="button" disabled={!name.trim() || saving} onClick={() => void create()}>{saving ? 'Saving…' : 'Save constraint'}</button><button className="button button--secondary" type="button" onClick={() => setFormOpen(false)}>Cancel</button></div>
      </div>
    </section>}
    {error ? <ErrorState title="Constraints could not load" message={error} onRetry={load} /> : <section className="card section">
      <div className="toolbar"><div className="search"><SearchIcon className="search__icon" width={18} height={18} /><label className="visually-hidden" htmlFor="constraint-search">Search constraints</label><input id="constraint-search" className="input input--search" type="search" placeholder="Search constraints" value={query} onChange={(e) => setQuery(e.target.value)} /></div>{!loading && <span className="toolbar__count">{filtered.length} of {rows.length}</span>}</div>
      <DataTable caption="Scheduling constraints" columns={columns} rows={filtered} rowKey={(row) => row.id} loading={loading} loadingLabel="Loading constraints" empty={<EmptyState title="No constraints yet" description="Add constraints when the school needs rules beyond the default scheduling engine." icon={<LayersIcon width={22} height={22} />} />} rowActions={(row) => <button className="button button--ghost button--sm" type="button" onClick={() => void remove(row.id)}>Delete</button>} />
    </section>}
  </>
}
