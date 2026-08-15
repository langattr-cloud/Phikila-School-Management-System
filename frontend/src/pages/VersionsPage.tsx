import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { LayersIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { useNavigate } from '../lib/router'
import { friendlyApiError } from '../lib/api'
import { scheduling, type AuditEntry, type Version } from '../lib/scheduling'

function when(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export function VersionsPage() {
  const { notify } = useToast()
  const navigate = useNavigate()
  const [versions, setVersions] = useState<Version[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [v, a] = await Promise.all([scheduling.versions(), scheduling.audit(40)])
      setVersions(v)
      setAudit(a)
    } catch (err) {
      setError(friendlyApiError(err, 'load timetable versions'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function restore(version: Version) {
    setBusy(version.id)
    try {
      const draft = await scheduling.restore(version.id)
      notify(`Restored as draft v${draft.number}.`, 'success')
      await load()
      navigate('/timetable')
    } catch (err) {
      notify(friendlyApiError(err, 'restore that version'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function publish(version: Version) {
    setBusy(version.id)
    try {
      await scheduling.publish(version.id)
      notify(`Published v${version.number}.`, 'success')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'publish that version'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const columns: Column<Version>[] = [
    { key: 'number', header: 'Version', render: (row) => `v${row.number}` },
    { key: 'label', header: 'Label', render: (row) => row.label || 'Generated' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge
          tone={row.status === 'published' ? 'success' : row.status === 'archived' ? 'neutral' : 'warning'}
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'quality',
      header: 'Quality',
      render: (row) => (row.quality?.overall !== undefined ? `${row.quality.overall}/100` : '—'),
    },
    { key: 'lessons', header: 'Lessons', render: (row) => String(row.stats?.placed ?? '—') },
    { key: 'created', header: 'Created', render: (row) => when(row.created_at) },
    { key: 'by', header: 'By', render: (row) => row.created_by || '—' },
  ]

  return (
    <>
      <PageHeader
        title="Versions"
        description="Every generated and published timetable, with a full change history."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Versions' }]}
      />

      {error ? (
        <ErrorState title="Versions could not load" message={error} onRetry={load} />
      ) : (
        <>
          <section className="card section">
            <h2 className="section__title">Timetable versions</h2>
            <DataTable
              caption="Timetable versions"
              columns={columns}
              rows={versions}
              rowKey={(row) => row.id}
              loading={loading}
              loadingLabel="Loading versions"
              empty={
                <EmptyState
                  title="No versions yet"
                  description="Each time you generate a timetable it is saved here as a new version."
                  icon={<LayersIcon width={22} height={22} />}
                />
              }
              rowActions={(row) => (
                <>
                  {row.status !== 'published' && (
                    <button
                      type="button"
                      className="button button--ghost button--sm"
                      onClick={() => publish(row)}
                      disabled={busy === row.id}
                    >
                      Publish
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button--ghost button--sm"
                    onClick={() => restore(row)}
                    disabled={busy === row.id}
                  >
                    {busy === row.id ? 'Working…' : 'Restore'}
                  </button>
                </>
              )}
            />
          </section>

          <section className="card section">
            <h2 className="section__title">Audit log</h2>
            {audit.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Changes to the timetable are recorded here with who made them."
              />
            ) : (
              <ol className="audit-list">
                {audit.map((entry) => (
                  <li className="audit-item" key={entry.id}>
                    <span className="audit-item__time">{when(entry.at)}</span>
                    <div className="audit-item__body">
                      <p className="audit-item__summary">{entry.summary}</p>
                      <p className="audit-item__meta">
                        <Badge>{entry.action}</Badge> {entry.actor || 'system'}
                      </p>
                      {entry.before && entry.after && (
                        <p className="audit-item__diff">
                          {JSON.stringify(entry.before)} → {JSON.stringify(entry.after)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </>
  )
}
