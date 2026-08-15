import { useCallback } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Layers3,
  School,
  Settings2,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState, LoadingBlock, Skeleton } from '../components/States'
import { Alert } from '../components/Alert'
import { QualityBars } from '../components/QualityBars'
import { friendlyApiError, api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { displayName, useAuth } from '../lib/auth'
import { Link } from '../lib/router'
import { scheduling, type Dashboard } from '../lib/scheduling'
import './DashboardPage.css'

type Tone = 'default' | 'warning' | 'danger' | 'success'

function MetricCard({
  label,
  value,
  detail,
  loading,
  icon,
  to,
  tone = 'default',
}: {
  label: string
  value: string | number
  detail: string
  loading: boolean
  icon: React.ReactNode
  to: string
  tone?: Tone
}) {
  return (
    <Link className={`dashboard-metric dashboard-metric--${tone}`} to={to}>
      <span className="dashboard-metric__icon" aria-hidden="true">{icon}</span>
      <span className="dashboard-metric__label">{label}</span>
      <span className="dashboard-metric__value">
        {loading ? <Skeleton width="3rem" height="1.9rem" /> : value}
      </span>
      <span className="dashboard-metric__detail">{loading ? <Skeleton width="80%" /> : detail}</span>
      <ArrowUpRight className="dashboard-metric__arrow" size={17} aria-hidden="true" />
    </Link>
  )
}

function ModuleCard({
  eyebrow,
  title,
  description,
  icon,
  to,
  stats,
}: {
  eyebrow: string
  title: string
  description: string
  icon: React.ReactNode
  to: string
  stats: Array<{ label: string; value: string | number }>
}) {
  return (
    <Link className="dashboard-module" to={to}>
      <div className="dashboard-module__head">
        <span className="dashboard-module__icon" aria-hidden="true">{icon}</span>
        <span className="dashboard-module__eyebrow">{eyebrow}</span>
        <ChevronRight className="dashboard-module__chevron" size={18} aria-hidden="true" />
      </div>
      <h3 className="dashboard-module__title">{title}</h3>
      <p className="dashboard-module__description">{description}</p>
      <div className="dashboard-module__stats">
        {stats.map((stat) => (
          <span key={stat.label} className="dashboard-module__stat">
            <strong>{stat.value}</strong>
            <small>{stat.label}</small>
          </span>
        ))}
      </div>
    </Link>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const toMessage = useCallback(
    (error: unknown) => friendlyApiError(error, 'load your dashboard'),
    [],
  )
  const { data, loading, error, reload } = useAsync<Dashboard>(scheduling.dashboard, toMessage)
  const schoolQuery = useAsync(api.school, toMessage)
  const yearsQuery = useAsync(api.academicYears, toMessage)
  const termsQuery = useAsync(api.terms, toMessage)
  const levelsQuery = useAsync(api.levels, toMessage)

  const hard = data?.conflicts.hard ?? 0
  const soft = data?.conflicts.soft ?? 0
  const unassigned = data?.lessons.unassigned ?? 0
  const scheduled = data?.lessons.scheduled ?? 0
  const required = data?.lessons.required ?? 0
  const version = data?.version ?? null
  const school = schoolQuery.data
  const currentYear = yearsQuery.data?.find((year) => year.is_current)
  const currentTerm = termsQuery.data?.find((term) => term.is_current)
  const setupIncomplete = !loading && (data?.counts.teachers ?? 0) === 0 && (data?.counts.classes ?? 0) === 0
  const hasAttention = setupIncomplete || hard > 0 || unassigned > 0 || soft > 0
  const systemReady = Boolean(data?.solver_available)

  return (
    <div className="dashboard-page">
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
          {schoolQuery.error && !schoolQuery.loading && (
            <Alert tone="info" title="School profile not set up yet">
              <Link to="/setup/school">Set up your school profile</Link> to complete your school workspace.
            </Alert>
          )}

          <section className="dashboard-hero" aria-labelledby="dashboard-hero-title">
            <div className="dashboard-hero__glow" aria-hidden="true" />
            <div className="dashboard-hero__copy">
              <span className="dashboard-hero__eyebrow">PHIKILA COMMAND CENTER</span>
              <h2 id="dashboard-hero-title">
                {school?.name || 'Your school'}
                <span>is {systemReady ? 'ready to operate' : 'waiting for setup'}.</span>
              </h2>
              <p>
                {currentYear?.name || 'Academic year not set'}
                {currentTerm ? ` · ${currentTerm.name}` : ''}
                {' · '}
                {systemReady ? 'Scheduling engine online' : 'Scheduling engine unavailable'}
              </p>
            </div>
            <div className="dashboard-hero__status">
              <span className={`dashboard-status-dot ${systemReady ? 'dashboard-status-dot--ok' : 'dashboard-status-dot--warn'}`} />
              <span>{systemReady ? 'Operations online' : 'Action required'}</span>
            </div>
          </section>

          {data && !data.solver_available && (
            <Alert tone="error" title="Scheduling engine unavailable">
              Timetables cannot be generated on this server because the optimisation engine is not installed.
            </Alert>
          )}

          <section className="dashboard-section" aria-labelledby="overview-title">
            <div className="dashboard-section__head">
              <div>
                <span className="dashboard-section__eyebrow">OVERVIEW</span>
                <h2 id="overview-title">Your school at a glance</h2>
              </div>
              <span className="dashboard-section__hint">Live from your school data</span>
            </div>
            <div className="dashboard-metrics">
              <MetricCard
                label="Teachers"
                value={data?.counts.teachers ?? 0}
                detail="Staff available for scheduling"
                loading={loading}
                icon={<UsersRound size={20} />}
                to="/setup/teachers"
              />
              <MetricCard
                label="Classes"
                value={data?.counts.classes ?? 0}
                detail="Teaching groups"
                loading={loading}
                icon={<School size={20} />}
                to="/setup/classes"
              />
              <MetricCard
                label="Subjects"
                value={data?.counts.subjects ?? 0}
                detail="Curriculum subjects"
                loading={loading}
                icon={<Layers3 size={20} />}
                to="/setup/subjects"
              />
              <MetricCard
                label="Rooms"
                value={data?.counts.rooms ?? 0}
                detail="Bookable spaces"
                loading={loading}
                icon={<GraduationCap size={20} />}
                to="/setup/rooms"
              />
            </div>
          </section>

          <section className="dashboard-main-grid" aria-label="Operational overview">
            <article className={`dashboard-panel dashboard-panel--attention ${hasAttention ? 'dashboard-panel--attention-open' : ''}`}>
              <div className="dashboard-panel__head">
                <div>
                  <span className="dashboard-section__eyebrow">NEEDS ATTENTION</span>
                  <h2>{hasAttention ? 'A few things need your attention.' : 'Everything looks in order.'}</h2>
                </div>
                {hasAttention ? <AlertTriangle size={22} aria-hidden="true" /> : <CheckCircle2 size={22} aria-hidden="true" />}
              </div>
              <div className="dashboard-attention-list">
                {hard > 0 && (
                  <Link to="/timetable" className="dashboard-attention-item dashboard-attention-item--danger">
                    <span className="dashboard-attention-item__count">{hard}</span>
                    <span><strong>Hard conflicts</strong><small>Must be resolved before publishing.</small></span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </Link>
                )}
                {unassigned > 0 && (
                  <Link to="/scheduling/requirements" className="dashboard-attention-item dashboard-attention-item--warning">
                    <span className="dashboard-attention-item__count">{unassigned}</span>
                    <span><strong>Unassigned lessons</strong><small>Lessons still need placement.</small></span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </Link>
                )}
                {soft > 0 && (
                  <Link to="/timetable" className="dashboard-attention-item">
                    <span className="dashboard-attention-item__count">{soft}</span>
                    <span><strong>Schedule warnings</strong><small>Preferences are not fully met.</small></span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </Link>
                )}
                {setupIncomplete && (
                  <Link to="/setup/teachers" className="dashboard-attention-item">
                    <span className="dashboard-attention-item__count"><Settings2 size={18} /></span>
                    <span><strong>Finish school setup</strong><small>Add your core teaching and class structure.</small></span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </Link>
                )}
                {!hasAttention && (
                  <div className="dashboard-empty-inline">
                    <CheckCircle2 size={18} />
                    <span>No unresolved scheduling issues are currently reported.</span>
                  </div>
                )}
              </div>
            </article>

            <article className="dashboard-panel">
              <div className="dashboard-panel__head">
                <div>
                  <span className="dashboard-section__eyebrow">TIMETABLE HEALTH</span>
                  <h2>{version ? `Version ${version.number}` : 'No timetable yet'}</h2>
                </div>
                {version && <Badge tone={version.status === 'published' ? 'success' : 'warning'}>{version.status}</Badge>}
              </div>
              {loading ? (
                <LoadingBlock label="Loading timetable health" rows={4} />
              ) : version ? (
                <>
                  <div className="dashboard-health-hero">
                    <span className="dashboard-health-hero__value">{required > 0 ? Math.round((scheduled / required) * 100) : 0}%</span>
                    <span className="dashboard-health-hero__copy">scheduled coverage</span>
                  </div>
                  <QualityBars quality={data?.quality ?? {}} />
                  <Link className="dashboard-panel__link" to="/timetable">Open timetable <ArrowUpRight size={16} /></Link>
                </>
              ) : (
                <EmptyState
                  title="No timetable yet"
                  description="Generate a timetable to start tracking quality and coverage."
                  icon={<CalendarDays width={22} height={22} />}
                  action={<Link className="button button--primary button--sm" to="/scheduling/generate">Generate timetable</Link>}
                />
              )}
            </article>
          </section>

          <section className="dashboard-section" aria-labelledby="modules-title">
            <div className="dashboard-section__head">
              <div>
                <span className="dashboard-section__eyebrow">WORKSPACES</span>
                <h2 id="modules-title">Manage the school</h2>
              </div>
            </div>
            <div className="dashboard-module-grid">
              <ModuleCard
                eyebrow="School profile"
                title={school?.name || 'School setup'}
                description="Identity, contacts, location and school-level configuration."
                icon={<School size={21} />}
                to="/setup/school"
                stats={[
                  { label: 'status', value: school?.is_active !== false ? 'Active' : 'Inactive' },
                  { label: 'code', value: school?.code || '—' },
                ]}
              />
              <ModuleCard
                eyebrow="Academics"
                title="Academic calendar"
                description="Years, terms, levels and the structure behind the school day."
                icon={<CalendarDays size={21} />}
                to="/setup/academic-years"
                stats={[
                  { label: 'years', value: yearsQuery.data?.length ?? 0 },
                  { label: 'terms', value: termsQuery.data?.length ?? 0 },
                ]}
              />
              <ModuleCard
                eyebrow="Curriculum"
                title="Teachers & subjects"
                description="Connect your teaching team, curriculum and class structure."
                icon={<UsersRound size={21} />}
                to="/setup/teachers"
                stats={[
                  { label: 'teachers', value: data?.counts.teachers ?? 0 },
                  { label: 'subjects', value: data?.counts.subjects ?? 0 },
                ]}
              />
              <ModuleCard
                eyebrow="Scheduling"
                title="Timetable operations"
                description="Build schedules, inspect constraints and monitor what needs attention."
                icon={<Sparkles size={21} />}
                to="/timetable"
                stats={[
                  { label: 'scheduled', value: scheduled },
                  { label: 'conflicts', value: hard },
                ]}
              />
            </div>
          </section>

          <section className="dashboard-section dashboard-section--activity" aria-labelledby="activity-title">
            <div className="dashboard-section__head">
              <div>
                <span className="dashboard-section__eyebrow">ACTIVITY</span>
                <h2 id="activity-title">Recent operations</h2>
              </div>
              {data?.recent.length ? <Link className="dashboard-panel__link" to="/timetable">View workspace <ArrowUpRight size={16} /></Link> : null}
            </div>
            {loading ? (
              <LoadingBlock label="Loading recent activity" rows={4} />
            ) : (data?.recent.length ?? 0) === 0 ? (
              <div className="dashboard-empty-inline dashboard-empty-inline--large">
                <Sparkles size={18} />
                <span>No recent timetable activity has been recorded yet.</span>
              </div>
            ) : (
              <ul className="dashboard-activity-list">
                {data!.recent.slice(0, 6).map((entry, index) => (
                  <li className="dashboard-activity" key={`${entry.summary}-${index}`}>
                    <span className="dashboard-activity__dot" aria-hidden="true" />
                    <div>
                      <strong>{entry.summary}</strong>
                      <span>{entry.actor ?? 'system'}{entry.at ? ` · ${new Date(entry.at).toLocaleString()}` : ''}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {levelsQuery.error && !levelsQuery.loading && (
            <Alert tone="info" title="Academic levels are not configured">
              <Link to="/setup/levels">Configure academic levels</Link> to complete the academic structure.
            </Alert>
          )}
        </>
      )}
    </div>
  )
}
