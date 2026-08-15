import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { SearchIcon } from '../components/icons'
import { friendlyApiError } from '../lib/api'
import { platform } from '../lib/platform'

type Entry = { id: number; at: string; actor: string | null; action: string; summary: string }

export function PlatformAuditPage() {
  const [rows, setRows] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows(await platform.audit(100)) }
    catch (err) { setError(friendlyApiError(err, 'load platform audit activity')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const term = query.trim().toLowerCase()
  const filtered = term ? rows.filter((row) => `${row.actor ?? ''} ${row.action} ${row.summary}`.toLowerCase().includes(term)) : rows
  const columns: Column<Entry>[] = [
    { key: 'at', header: 'Time', render: (row) => new Date(row.at).toLocaleString() },
    { key: 'actor', header: 'Actor', render: (row) => row.actor ?? 'system' },
    { key: 'action', header: 'Action', render: (row) => <Badge>{row.action}</Badge> },
    { key: 'summary', header: 'Activity', render: (row) => row.summary },
  ]

  return <>
    <PageHeader title="Platform audit" description="Administrative activity across schools, memberships, access and platform configuration." breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Audit' }]} />
    {error ? <ErrorState title="Audit activity could not load" message={error} onRetry={load} /> : loading ? <section className="card section"><LoadingBlock label="Loading audit activity" rows={8} /></section> : <section className="card section">
      <div className="toolbar"><div className="search"><SearchIcon className="search__icon" width={18} height={18} /><label className="visually-hidden" htmlFor="platform-audit-search">Search audit activity</label><input id="platform-audit-search" className="input input--search" type="search" placeholder="Search actor, action or activity" value={query} onChange={(e) => setQuery(e.target.value)} /></div><span className="toolbar__count">{filtered.length} of {rows.length}</span></div>
      <DataTable caption="Platform audit activity" columns={columns} rows={filtered} rowKey={(row) => row.id} loading={false} loadingLabel="Loading audit activity" empty={<EmptyState title="No audit activity" description="Platform administrative actions will appear here." />} />
    </section>}
  </>
}
