import { useCallback } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { QualityBars } from '../components/QualityBars'
import { LayersIcon } from '../components/icons'
import { friendlyApiError } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { scheduling, type Analytics } from '../lib/scheduling'

/** Horizontal bar rendered next to a percentage value. */
function Meter({ value }: { value: number }) {
  const tone = value >= 85 ? 'good' : value >= 50 ? 'ok' : 'poor'
  return (
    <span className="meter">
      <span className={`meter__bar meter__bar--${tone}`} aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
      <span className="meter__value">{value}%</span>
    </span>
  )
}

export function SchedulingAnalyticsPage() {
  const toMessage = useCallback((error: unknown) => friendlyApiError(error, 'load analytics'), [])
  const { data, loading, error, reload } = useAsync<Analytics>(scheduling.analytics, toMessage)

  const teacherColumns: Column<Analytics['teachers'][number]>[] = [
    { key: 'name', header: 'Teacher', render: (row) => row.name },
    { key: 'lessons', header: 'Lessons', render: (row) => row.lessons },
    { key: 'free', header: 'Free periods', render: (row) => row.free_periods },
    {
      key: 'gaps',
      header: 'Gaps',
      render: (row) =>
        row.gaps > 0 ? <Badge tone="warning">{row.gaps}</Badge> : <Badge tone="success">0</Badge>,
    },
    { key: 'util', header: 'Utilisation', render: (row) => <Meter value={row.utilisation} /> },
  ]

  const roomColumns: Column<Analytics['rooms'][number]>[] = [
    { key: 'name', header: 'Room', render: (row) => row.name },
    { key: 'type', header: 'Type', render: (row) => row.type },
    { key: 'used', header: 'Periods used', render: (row) => row.used },
    { key: 'util', header: 'Utilisation', render: (row) => <Meter value={row.utilisation} /> },
  ]

  const classColumns: Column<Analytics['classes'][number]>[] = [
    { key: 'name', header: 'Class', render: (row) => row.name },
    { key: 'lessons', header: 'Lessons', render: (row) => row.lessons },
    { key: 'free', header: 'Free periods', render: (row) => row.free_periods },
    { key: 'busiest', header: 'Busiest day', render: (row) => `${row.busiest_day} lessons` },
    { key: 'quietest', header: 'Quietest day', render: (row) => `${row.quietest_day} lessons` },
  ]

  const empty = (
    <EmptyState
      title="No timetable data yet"
      description="Analytics appear once a timetable has been generated."
      icon={<LayersIcon width={22} height={22} />}
    />
  )

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Workload, utilisation and distribution across the current timetable."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Analytics' }]}
      />

      {error ? (
        <ErrorState title="Analytics could not load" message={error} onRetry={reload} />
      ) : (
        <>
          <section className="card section">
            <h2 className="section__title">Timetable quality</h2>
            <QualityBars quality={data?.quality ?? {}} />
          </section>

          <section className="card section">
            <h2 className="section__title">Teacher workload</h2>
            <DataTable
              caption="Teacher workload"
              columns={teacherColumns}
              rows={data?.teachers ?? []}
              rowKey={(row) => row.id}
              loading={loading}
              loadingLabel="Loading teacher workload"
              empty={empty}
            />
          </section>

          <section className="card section">
            <h2 className="section__title">Room utilisation</h2>
            <DataTable
              caption="Room utilisation"
              columns={roomColumns}
              rows={data?.rooms ?? []}
              rowKey={(row) => row.id}
              loading={loading}
              loadingLabel="Loading room utilisation"
              empty={empty}
            />
          </section>

          <section className="card section">
            <h2 className="section__title">Class distribution</h2>
            <DataTable
              caption="Class distribution"
              columns={classColumns}
              rows={data?.classes ?? []}
              rowKey={(row) => row.id}
              loading={loading}
              loadingLabel="Loading class analysis"
              empty={empty}
            />
          </section>
        </>
      )}
    </>
  )
}
