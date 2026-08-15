import { useCallback, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { CalendarIcon, SearchIcon } from '../components/icons'
import { api, friendlyApiError, type AcademicYear, type Term } from '../lib/api'
import { useAsync } from '../lib/useAsync'

type Data = { years: AcademicYear[]; terms: Term[] }

async function loadAcademics(): Promise<Data> {
  const [years, terms] = await Promise.all([api.academicYears(), api.terms()])
  return {
    years: Array.isArray(years) ? years : [],
    terms: Array.isArray(terms) ? terms : [],
  }
}

export function AcademicsPage() {
  const toMessage = useCallback(
    (error: unknown) => friendlyApiError(error, 'load the academic calendar'),
    [],
  )
  const { data, loading, error, reload } = useAsync<Data>(loadAcademics, toMessage)
  const [query, setQuery] = useState('')

  const term = query.trim().toLowerCase()
  const years = useMemo(
    () => (Array.isArray(data?.years) ? data.years : []).filter((year) => !term || year.name.toLowerCase().includes(term)),
    [data, term],
  )
  const terms = useMemo(
    () => (Array.isArray(data?.terms) ? data.terms : []).filter((item) => !term || item.name.toLowerCase().includes(term)),
    [data, term],
  )

  const yearColumns: Column<AcademicYear>[] = [
    { key: 'name', header: 'Academic year', render: (row) => row.name },
    { key: 'start', header: 'Starts', render: (row) => row.start_date },
    { key: 'end', header: 'Ends', render: (row) => row.end_date },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.is_current ? <Badge tone="success">Current</Badge> : <Badge>{row.status || 'Recorded'}</Badge>,
    },
  ]

  const termColumns: Column<Term>[] = [
    { key: 'name', header: 'Term', render: (row) => row.name },
    { key: 'start', header: 'Starts', render: (row) => row.start_date || 'Not set' },
    { key: 'end', header: 'Ends', render: (row) => row.end_date || 'Not set' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (row.is_current ? <Badge tone="success">Current</Badge> : <Badge>Scheduled</Badge>),
    },
  ]

  return (
    <>
      <PageHeader
        title="Academic calendar"
        description="Academic years and terms recorded for this school."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Academic calendar' }]}
      />

      {error ? (
        <ErrorState title="Academic calendar could not load" message={error} onRetry={reload} />
      ) : (
        <>
          <div className="toolbar">
            <div className="search">
              <SearchIcon className="search__icon" width={18} height={18} />
              <label className="visually-hidden" htmlFor="academics-search">
                Search academic years and terms
              </label>
              <input
                id="academics-search"
                className="input input--search"
                type="search"
                placeholder="Search by name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {query && (
              <button type="button" className="button button--ghost button--sm" onClick={() => setQuery('')}>
                Clear search
              </button>
            )}
          </div>

          <section className="card section" aria-labelledby="years-heading">
            <h2 className="section__title" id="years-heading">
              Academic years
            </h2>
            <DataTable
              caption="Academic years"
              columns={yearColumns}
              rows={years}
              rowKey={(row) => row.id}
              loading={loading}
              loadingLabel="Loading academic years"
              empty={
                <EmptyState
                  title={query ? 'No matching academic years' : 'No academic years found'}
                  description={
                    query
                      ? 'No academic year matches your search. Clear the search to see everything.'
                      : 'Academic years appear here once they have been created in the system.'
                  }
                  icon={<CalendarIcon width={22} height={22} />}
                />
              }
            />
          </section>

          <section className="card section" aria-labelledby="terms-heading">
            <h2 className="section__title" id="terms-heading">
              Terms
            </h2>
            <DataTable
              caption="Terms"
              columns={termColumns}
              rows={terms}
              rowKey={(row) => row.id}
              loading={loading}
              loadingLabel="Loading terms"
              empty={
                <EmptyState
                  title={query ? 'No matching terms' : 'No terms found'}
                  description={
                    query
                      ? 'No term matches your search. Clear the search to see everything.'
                      : 'Terms appear here once they have been added to an academic year.'
                  }
                  icon={<CalendarIcon width={22} height={22} />}
                />
              }
            />
          </section>
        </>
      )}
    </>
  )
}
