import { useCallback, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { LayersIcon, SearchIcon } from '../components/icons'
import { api, friendlyApiError, type Level } from '../lib/api'
import { useAsync } from '../lib/useAsync'

const PAGE_SIZE = 10

export function LevelsPage() {
  const toMessage = useCallback((error: unknown) => friendlyApiError(error, 'load levels'), [])
  const { data, loading, error, reload } = useAsync<Level[]>(api.levels, toMessage)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const term = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    const rows = (Array.isArray(data) ? data : []).filter(
      (level) => !term || level.name.toLowerCase().includes(term) || level.code.toLowerCase().includes(term),
    )
    return [...rows].sort((a, b) => a.display_order - b.display_order)
  }, [data, term])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const columns: Column<Level>[] = [
    { key: 'name', header: 'Level', render: (row) => row.name },
    { key: 'code', header: 'Code', render: (row) => row.code },
    { key: 'order', header: 'Order', render: (row) => row.display_order },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.status === false ? <Badge tone="warning">Inactive</Badge> : <Badge tone="success">Active</Badge>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Levels"
        description="Class levels configured for this school."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Levels' }]}
      />

      {error ? (
        <ErrorState title="Levels could not load" message={error} onRetry={reload} />
      ) : (
        <section className="card section">
          <div className="toolbar">
            <div className="search">
              <SearchIcon className="search__icon" width={18} height={18} />
              <label className="visually-hidden" htmlFor="levels-search">
                Search levels
              </label>
              <input
                id="levels-search"
                className="input input--search"
                type="search"
                placeholder="Search by name or code"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
              />
            </div>
            {query && (
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => {
                  setQuery('')
                  setPage(1)
                }}
              >
                Clear search
              </button>
            )}
          </div>

          <DataTable
            caption="Levels"
            columns={columns}
            rows={visible}
            rowKey={(row) => row.id}
            loading={loading}
            loadingLabel="Loading levels"
            empty={
              <EmptyState
                title={query ? 'No matching levels' : 'No levels found'}
                description={
                  query
                    ? 'No level matches your search. Clear the search to see everything.'
                    : 'Levels appear here once they have been created for this school.'
                }
                icon={<LayersIcon width={22} height={22} />}
              />
            }
          />

          {!loading && filtered.length > PAGE_SIZE && (
            <nav className="pagination" aria-label="Levels pagination">
              <button
                type="button"
                className="button button--secondary button--sm"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span aria-live="polite">
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                className="button button--secondary button--sm"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={currentPage === pageCount}
              >
                Next
              </button>
            </nav>
          )}
        </section>
      )}
    </>
  )
}
