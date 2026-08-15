import { useCallback } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState, LoadingBlock, Skeleton } from '../components/States'
import { Alert } from '../components/Alert'
import { QualityBars } from '../components/QualityBars'
import {
  CalendarIcon,
  LayersIcon,
  SchoolIcon,
  UserIcon,
} from '../components/icons'
import { friendlyApiError } from '../lib/api'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { displayName, useAuth } from '../lib/auth'
import { Link } from '../lib/router'
import { scheduling, type Dashboard } from '../lib/scheduling'

function SummaryCard({
  label,
  value,
  detail,
  loading,
  icon,
  to,
  tone,
}: {
  label: string
  value: string | number
  detail: string
  loading: boolean
  icon: React.ReactNode
  to: string
  tone?: 'danger' | 'warning'
}) {
  return (
    <li className="summary-card">
      <Link className="summary-card__link" to={to}>
        <span className="summary-card__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="summary-card__label">{label}</span>
        <span className={`summary-card__value ${tone ? `summary-card__value--${tone}` : ''}`}>
          {loading ? <Skeleton width="3rem" height="1.6rem" /> : value}
        </span>
        <span className="summary-card__detail">{loading ? <Skeleton width="70%" /> : detail}</span>
      </Link>
    </li>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const toMessage = useCallback(
    (error: unknown) => friendlyApiError(error, 'load your dashboard'),
    [],
  )
  const { data, loading, error, reload } = useAsync<Dashboard>(scheduling.dashboard, toMessage)

  // Fetch school profile and academic data from the database
  const schoolQuery = useAsync(api.school, toMessage)
  const yearsQuery = useAsync(api.academicYears, toMessage)
  const termsQuery = useAsync(api.terms, toMessage)
  const levelsQuery = useAsync(api.levels, toMessage)

  const hard = data?.conflicts.hard ?? 0
  const soft = data?.conflicts.soft ?? 0
  const version = data?.version ?? null
  const setupIncomplete =
    !loading && (data?.counts.teachers ?? 0) === 0 && (data?.counts.classes ?? 0) === 0

  const school = schoolQuery.data
  const currentYear = yearsQuery.data?.find((y) => y.is_current)
  const currentTerm = termsQuery.data?.find((t) => t.is_current)

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${displayName(user)}.`}
        actions={
          <>
            <Link className="button button--secondary button--sm" to="/timetable">
              Open timetable
            </Link>
            <Link className="button button--primary button--sm" to="/scheduling/generate">
              Generate
            </Link>
          </>
        }
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
          {setupIncomplete && (
            <Alert tone="info" title="Set up your school">
              Add your teachers, subjects, classes and rooms, then define what each class studies
              each week. <Link to="/setup/teachers">Start with teachers</Link>.
            </Alert>
          )}

          {data && !data.solver_available && (
            <Alert tone="error" title="Scheduling engine unavailable">
              Timetables cannot be generated on this server because the optimisation engine is not
              installed.
            </Alert>
          )}

          {/* ---- School Profile ---- */}
          {school && (
            <section aria-labelledby="school-heading" className="section card">
              <h2 className="section__title" id="school-heading">
                School Profile
              </h2>
              <div className="dashboard-columns dashboard-columns--two">
                <div className="detail-list detail-list--two">
                  <dl className="detail-list__full">
                    <dt>School name</dt>
                    <dd>{school.name || 'Not set'}</dd>
                  </dl>
                  <dl>
                    <dt>Code</dt>
                    <dd>{school.code || '—'}</dd>
                  </dl>
                  <dl>
                    <dt>County</dt>
                    <dd>{school.county || '—'}</dd>
                  </dl>
                  <dl>
                    <dt>Email</dt>
                    <dd>{school.email || '—'}</dd>
                  </dl>
                  <dl>
                    <dt>Phone</dt>
                    <dd>{school.phone || '—'}</dd>
                  </dl>
                  <dl>
                    <dt>Principal</dt>
                    <dd>{school.principal_name || '—'}</dd>
                  </dl>
                  <dl>
                    <dt>Motto</dt>
                    <dd className="detail-list__full">{school.motto || '—'}</dd>
                  </dl>
                </div>
              </div>
            </section>
          )}

          {schoolQuery.error && !schoolQuery.loading && (
            <Alert tone="info" title="School profile not set up yet">
              <Link to="/setup/school">Set up your school profile</Link> to see it here.
            </Alert>
          )}

          {/* ---- Academic Overview ---- */}
          <section aria-labelledby="academic-heading" className="section">
            <h2 className="section__title" id="academic-heading">
              Academic Overview
            </h2>
            <ul className="summary-grid">
              <SummaryCard
                label="Academic years"
                value={yearsQuery.data?.length ?? 0}
                detail={currentYear ? `Current: ${currentYear.name}` : 'No active year'}
                loading={yearsQuery.loading}
                icon={<CalendarIcon />}
                to="/setup/academic-years"
              />
              <SummaryCard
                label="Terms"
                value={termsQuery.data?.length ?? 0}
                detail={currentTerm ? `Current: ${currentTerm.name}` : 'No active term'}
                loading={termsQuery.loading}
                icon={<CalendarIcon />}
                to="/setup/academic-years"
              />
              <SummaryCard
                label="Levels"
                value={levelsQuery.data?.length ?? 0}
                detail={levelsQuery.data?.length ? 'Grade levels defined' : 'No levels set up'}
                loading={levelsQuery.loading}
                icon={<LayersIcon />}
                to="/setup/levels"
              />
              <SummaryCard
                label="School status"
                value={school?.is_active !== false ? 'Active' : 'Inactive'}
                detail={school ? (school.sub_county ? `${school.sub_county}, ${school.county}` : 'Location not set') : 'Set up school'}
                loading={schoolQuery.loading}
                icon={<SchoolIcon />}
                to="/setup/school"
              />
            </ul>
          </section>

          {/* ---- School Overview (scheduling) ---- */}
          <section aria-labelledby="overview-heading" className="section">
            <h2 className="section__title" id="overview-heading">
              Scheduling Overview
            </h2>
            <ul className="summary-grid">
              <SummaryCard
                label="Teachers"
                value={data?.counts.teachers ?? 0}
                detail="Staff available for scheduling"
                loading={loading}
                icon={<UserIcon />}
                to="/setup/teachers"
              />
              <SummaryCard
                label="Classes"
                value={data?.counts.classes ?? 0}
                detail="Teaching groups"
                loading={loading}
                icon={<SchoolIcon />}
                to="/setup/classes"
              />
              <SummaryCard
                label="Subjects"
                value={data?.counts.subjects ?? 0}
                detail="Subjects on the curriculum"
                loading={loading}
                icon={<LayersIcon />}
                to="/setup/subjects"
              />
              <SummaryCard
                label="Rooms"
                value={data?.counts.rooms ?? 0}
                detail="Bookable spaces"
                loading={loading}
                icon={<SchoolIcon />}
                to="/setup/rooms"
              />
            </ul>
          </section>

          <section aria-labelledby="status-heading" className="section">
            <h2 className="section__title" id="status-heading">
              Timetable status
            </h2>
            <ul className="summary-grid">
              <SummaryCard
                label="Scheduled lessons"
                value={data?.lessons.scheduled ?? 0}
                detail={`of ${data?.lessons.required ?? 0} required each week`}
                loading={loading}
                icon={<CalendarIcon />}
                to="/timetable"
              />
              <SummaryCard
                label="Unassigned"
                value={data?.lessons.unassigned ?? 0}
                detail={
                  (data?.lessons.unassigned ?? 0) > 0
                    ? 'Lessons still to be placed'
                    : 'Every lesson is placed'
                }
                loading={loading}
                icon={<CalendarIcon />}
                to="/scheduling/requirements"
                tone={(data?.lessons.unassigned ?? 0) > 0 ? 'warning' : undefined}
              />
              <SummaryCard
                label="Hard conflicts"
                value={hard}
                detail={hard > 0 ? 'Must be resolved before publishing' : 'None — ready to publish'}
                loading={loading}
                icon={<LayersIcon />}
                to="/timetable"
                tone={hard > 0 ? 'danger' : undefined}
              />
              <SummaryCard
                label="Warnings"
                value={soft}
                detail={soft > 0 ? 'Preferences not fully met' : 'All preferences met'}
                loading={loading}
                icon={<LayersIcon />}
                to="/timetable"
                tone={soft > 0 ? 'warning' : undefined}
              />
            </ul>
          </section>

          <div className="dashboard-columns">
            <section aria-labelledby="quality-heading" className="card section">
              <div className="panel__head">
                <h2 className="section__title" id="quality-heading">
                  Timetable quality
                </h2>
                {version && (
                  <Badge tone={version.status === 'published' ? 'success' : 'warning'}>
                    v{version.number} {version.status}
                  </Badge>
                )}
              </div>
              {loading ? (
                <LoadingBlock label="Loading the quality score" rows={4} />
              ) : version ? (
                <QualityBars quality={data?.quality ?? {}} />
              ) : (
                <EmptyState
                  title="No timetable yet"
                  description="Generate a timetable to see its quality score and where it can improve."
                  icon={<CalendarIcon width={22} height={22} />}
                  action={
                    <Link className="button button--primary button--sm" to="/scheduling/generate">
                      Generate a timetable
                    </Link>
                  }
                />
              )}
            </section>

            <section aria-labelledby="activity-heading" className="card section">
              <h2 className="section__title" id="activity-heading">
                Recent activity
              </h2>
              {loading ? (
                <LoadingBlock label="Loading recent activity" rows={3} />
              ) : (data?.recent.length ?? 0) === 0 ? (
                <EmptyState
                  title="Nothing yet"
                  description="Changes to your timetable will appear here."
                />
              ) : (
                <ul className="activity-list">
                  {data!.recent.map((entry, index) => (
                    <li className="activity" key={index}>
                      <span className="activity__dot" aria-hidden="true" />
                      <div>
                        <p className="activity__summary">{entry.summary}</p>
                        <p className="activity__meta">
                          {entry.actor ?? 'system'}
                          {entry.at ? ` · ${new Date(entry.at).toLocaleString()}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  )
}
