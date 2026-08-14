import { useCallback } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState, LoadingBlock, Skeleton } from '../components/States'
import { CalendarIcon, LayersIcon, SchoolIcon } from '../components/icons'
import { api, friendlyApiError, type AcademicYear, type Level, type SchoolProfile, type Term } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { displayName, useAuth } from '../lib/auth'
import { Link } from '../lib/router'

type Summary = {
  school: SchoolProfile | null
  years: AcademicYear[]
  terms: Term[]
  levels: Level[]
}

/**
 * The dashboard reads only what the backend actually exposes. Any resource the
 * API cannot provide (e.g. no school profile created yet) is shown as an empty
 * state rather than an invented figure.
 */
async function loadSummary(): Promise<Summary> {
  const asList = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
  const [school, years, terms, levels] = await Promise.all([
    api.school().catch(() => null),
    api.academicYears().catch(() => []),
    api.terms().catch(() => []),
    api.levels().catch(() => []),
  ])
  return {
    school: school && typeof school === 'object' ? school : null,
    years: asList<AcademicYear>(years),
    terms: asList<Term>(terms),
    levels: asList<Level>(levels),
  }
}

function SummaryCard({
  label,
  value,
  detail,
  loading,
  icon,
  to,
}: {
  label: string
  value: string | number
  detail: string
  loading: boolean
  icon: React.ReactNode
  to: string
}) {
  return (
    <li className="summary-card">
      <Link className="summary-card__link" to={to}>
        <span className="summary-card__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="summary-card__label">{label}</span>
        <span className="summary-card__value">
          {loading ? <Skeleton width="3rem" height="1.6rem" /> : value}
        </span>
        <span className="summary-card__detail">{loading ? <Skeleton width="70%" /> : detail}</span>
      </Link>
    </li>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const toMessage = useCallback((error: unknown) => friendlyApiError(error, 'load your dashboard'), [])
  const { data, loading, error, reload } = useAsync(loadSummary, toMessage)

  const currentYear = data?.years.find((year) => year.is_current) ?? data?.years[0] ?? null
  const currentTerm = data?.terms.find((term) => term.is_current) ?? null

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${displayName(user)}.`}
      />

      {error ? (
        <ErrorState
          title="Dashboard could not load"
          message={error}
          onRetry={reload}
          retryLabel="Reload dashboard"
        />
      ) : (
        <>
          <section aria-labelledby="overview-heading" className="section">
            <h2 className="section__title" id="overview-heading">
              Overview
            </h2>
            <ul className="summary-grid">
              <SummaryCard
                label="School profile"
                value={loading ? '—' : data?.school ? 'Set up' : 'Not set up'}
                detail={data?.school?.name ?? 'No school profile has been created yet.'}
                loading={loading}
                icon={<SchoolIcon />}
                to="/school"
              />
              <SummaryCard
                label="Academic years"
                value={data?.years.length ?? 0}
                detail={currentYear ? `Current: ${currentYear.name}` : 'No academic year recorded.'}
                loading={loading}
                icon={<CalendarIcon />}
                to="/academics"
              />
              <SummaryCard
                label="Terms"
                value={data?.terms.length ?? 0}
                detail={currentTerm ? `Current: ${currentTerm.name}` : 'No current term marked.'}
                loading={loading}
                icon={<CalendarIcon />}
                to="/academics"
              />
              <SummaryCard
                label="Levels"
                value={data?.levels.length ?? 0}
                detail={
                  (data?.levels.length ?? 0) > 0
                    ? 'Class levels configured for this school.'
                    : 'No levels configured yet.'
                }
                loading={loading}
                icon={<LayersIcon />}
                to="/levels"
              />
            </ul>
          </section>

          <div className="dashboard-columns">
            <section aria-labelledby="calendar-heading" className="card section">
              <h2 className="section__title" id="calendar-heading">
                Current academic period
              </h2>
              {loading ? (
                <LoadingBlock label="Loading the current academic period" rows={3} />
              ) : currentYear ? (
                <dl className="detail-list">
                  <div>
                    <dt>Academic year</dt>
                    <dd>
                      {currentYear.name}{' '}
                      {currentYear.is_current && <Badge tone="success">Current</Badge>}
                    </dd>
                  </div>
                  <div>
                    <dt>Runs from</dt>
                    <dd>
                      {currentYear.start_date} to {currentYear.end_date}
                    </dd>
                  </div>
                  <div>
                    <dt>Term</dt>
                    <dd>{currentTerm ? currentTerm.name : 'No term marked as current'}</dd>
                  </div>
                </dl>
              ) : (
                <EmptyState
                  title="No academic year yet"
                  description="Academic years, terms, and levels appear here once they exist in the system."
                  icon={<CalendarIcon width={22} height={22} />}
                  action={
                    <Link className="button button--secondary button--sm" to="/academics">
                      Open academic calendar
                    </Link>
                  }
                />
              )}
            </section>

            <section aria-labelledby="quick-actions-heading" className="card section">
              <h2 className="section__title" id="quick-actions-heading">
                Quick actions
              </h2>
              <ul className="quick-actions">
                <li>
                  <Link className="quick-action" to="/school">
                    <SchoolIcon width={18} height={18} />
                    Review the school profile
                  </Link>
                </li>
                <li>
                  <Link className="quick-action" to="/academics">
                    <CalendarIcon width={18} height={18} />
                    View academic years and terms
                  </Link>
                </li>
                <li>
                  <Link className="quick-action" to="/levels">
                    <LayersIcon width={18} height={18} />
                    View levels
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  )
}
