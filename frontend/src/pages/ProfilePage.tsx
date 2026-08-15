import { useCallback } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, ErrorState, LoadingBlock } from '../components/States'
import { api, friendlyApiError, type Identity } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { displayName, useAuth } from '../lib/auth'

export function ProfilePage() {
  const { user } = useAuth()
  const toMessage = useCallback((error: unknown) => friendlyApiError(error, 'load your profile'), [])
  const { data, loading, error, reload } = useAsync<Identity>(api.me, toMessage)

  return (
    <>
      <PageHeader
        title="My profile"
        description="Details from your signed-in account, verified by the backend."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'My profile' }]}
      />

      <section className="card section">
        <h2 className="section__title">Account</h2>
        <dl className="detail-list detail-list--two">
          <div>
            <dt>Name</dt>
            <dd>{displayName(user)}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email ?? 'Not available'}</dd>
          </div>
        </dl>
      </section>

      <section className="card section">
        <h2 className="section__title">Backend verification</h2>
        {loading ? (
          <LoadingBlock label="Verifying your account with the API" rows={2} />
        ) : error ? (
          <ErrorState title="Could not verify your account" message={error} onRetry={reload} />
        ) : data ? (
          <dl className="detail-list detail-list--two">
            <div>
              <dt>Verified email</dt>
              <dd>{data.email ?? 'Not available'}</dd>
            </div>
            <div>
              <dt>Access level</dt>
              <dd>
                <Badge tone="success">{data.role || 'authenticated'}</Badge>
              </dd>
            </div>
            <div className="detail-list__full">
              <dt>Permissions</dt>
              <dd>
                School permissions are assigned by an administrator and enforced by the backend on
                every request.
              </dd>
            </div>
          </dl>
        ) : null}
      </section>
    </>
  )
}
