import { useCallback } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState, LoadingBlock } from '../components/States'
import { SchoolIcon } from '../components/icons'
import { api, ApiError, friendlyApiError, type SchoolProfile } from '../lib/api'
import { useAsync } from '../lib/useAsync'

export function SchoolPage() {
  const toMessage = useCallback(
    (error: unknown) =>
      error instanceof ApiError && error.status === 404
        ? 'NOT_FOUND'
        : friendlyApiError(error, 'load the school profile'),
    [],
  )
  const { data, loading, error, reload } = useAsync<SchoolProfile>(api.school, toMessage)

  return (
    <>
      <PageHeader
        title="School profile"
        description="Registration and contact details held for this school."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'School profile' }]}
      />

      <section className="card section">
        {loading ? (
          <LoadingBlock label="Loading the school profile" rows={5} />
        ) : error === 'NOT_FOUND' ? (
          <EmptyState
            title="No school profile yet"
            description="A school profile has not been created for this system. An administrator can create it through the API or an administrative tool."
            icon={<SchoolIcon width={22} height={22} />}
          />
        ) : error ? (
          <ErrorState title="School profile could not load" message={error} onRetry={reload} />
        ) : data ? (
          <dl className="detail-list detail-list--two">
            <div>
              <dt>Name</dt>
              <dd>{data.name}</dd>
            </div>
            <div>
              <dt>Code</dt>
              <dd>{data.code || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>County</dt>
              <dd>{data.county || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Sub-county</dt>
              <dd>{data.sub_county || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{data.email || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{data.phone || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Principal</dt>
              <dd>{data.principal_name || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {data.is_active === false ? (
                  <Badge tone="warning">Inactive</Badge>
                ) : (
                  <Badge tone="success">Active</Badge>
                )}
              </dd>
            </div>
            {data.motto && (
              <div className="detail-list__full">
                <dt>Motto</dt>
                <dd>{data.motto}</dd>
              </div>
            )}
          </dl>
        ) : null}
      </section>
    </>
  )
}
