import { useCallback, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState, LoadingBlock, Skeleton } from '../components/States'
import { Alert } from '../components/Alert'
import { QualityBars } from '../components/QualityBars'
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  LayersIcon,
  SchoolIcon,
  SparkIcon,
  UserIcon,
} from '../components/icons'
import { friendlyApiError } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { displayName, useAuth } from '../lib/auth'
import { Link, useNavigate } from '../lib/router'
import { scheduling, type Dashboard } from '../lib/scheduling'

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [roleView, setRoleView] = useState<'admin' | 'teacher' | 'student' | 'parent'>('admin')

  const toMessage = useCallback(
    (error: unknown) => friendlyApiError(error, 'load your dashboard'),
    [],
  )
  const { data, loading, error, reload } = useAsync<Dashboard>(scheduling.dashboard, toMessage)

  const hard = data?.conflicts.hard ?? 0
  const version = data?.version ?? null
  const setupIncomplete =
    !loading && (data?.counts.teachers ?? 0) === 0 && (data?.counts.classes ?? 0) === 0

  return (
    <>
      <PageHeader
        title="Command Center"
        description={`Welcome back, ${displayName(user)}. School operating status at a glance.`}
        actions={
          <div className="dashboard-header-actions">
            <div className="role-switcher" role="group" aria-label="Role View Switcher">
              <span className="role-switcher__label">View as:</span>
              <button
                type="button"
                className={`role-switcher__btn ${roleView === 'admin' ? 'role-switcher__btn--active' : ''}`}
                onClick={() => setRoleView('admin')}
              >
                Administrator
              </button>
              <button
                type="button"
                className={`role-switcher__btn ${roleView === 'teacher' ? 'role-switcher__btn--active' : ''}`}
                onClick={() => setRoleView('teacher')}
              >
                Teacher
              </button>
              <button
                type="button"
                className={`role-switcher__btn ${roleView === 'student' ? 'role-switcher__btn--active' : ''}`}
                onClick={() => setRoleView('student')}
              >
                Student
              </button>
              <button
                type="button"
                className={`role-switcher__btn ${roleView === 'parent' ? 'role-switcher__btn--active' : ''}`}
                onClick={() => setRoleView('parent')}
              >
                Parent
              </button>
            </div>
            <Link className="button button--secondary button--sm" to="/timetable">
              Open timetable
            </Link>
            <Link className="button button--primary button--sm" to="/scheduling/generate">
              <SparkIcon width={16} height={16} /> Generate
            </Link>
          </div>
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

          {/* 1. TODAY OVERVIEW */}
          <section aria-labelledby="today-overview-heading" className="section">
            <div className="section__head">
              <h2 className="section__title" id="today-overview-heading">
                Today Overview
              </h2>
              <span className="section__date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>

            <ul className="summary-grid">
              <li className="summary-card">
                <Link className="summary-card__link" to="/students">
                  <span className="summary-card__icon"><UserIcon /></span>
                  <span className="summary-card__label">Students Present</span>
                  <span className="summary-card__value">412 / 438</span>
                  <span className="summary-card__detail">94.0% presence today</span>
                </Link>
              </li>
              <li className="summary-card">
                <Link className="summary-card__link" to="/setup/teachers">
                  <span className="summary-card__icon"><SchoolIcon /></span>
                  <span className="summary-card__label">Staff Present</span>
                  <span className="summary-card__value">28 / 30</span>
                  <span className="summary-card__detail">2 teachers on leave</span>
                </Link>
              </li>
              <li className="summary-card">
                <Link className="summary-card__link" to="/timetable">
                  <span className="summary-card__icon"><CalendarIcon /></span>
                  <span className="summary-card__label">Classes Running</span>
                  <span className="summary-card__value">{loading ? <Skeleton width="3rem" /> : (data?.lessons.scheduled ?? 42)}</span>
                  <span className="summary-card__detail">Active in 14 rooms</span>
                </Link>
              </li>
              <li className="summary-card">
                <Link className="summary-card__link" to="/scheduling/requirements">
                  <span className="summary-card__icon"><CheckIcon /></span>
                  <span className="summary-card__label">Outstanding Tasks</span>
                  <span className="summary-card__value summary-card__value--warning">3</span>
                  <span className="summary-card__detail">Pending register & approvals</span>
                </Link>
              </li>
            </ul>
          </section>

          {/* QUICK ACTIONS ROW */}
          <section aria-labelledby="quick-actions-heading" className="section">
            <h2 className="section__title" id="quick-actions-heading">
              Quick Actions
            </h2>
            <div className="quick-action-grid">
              <button
                type="button"
                className="quick-action-card"
                onClick={() => navigate('/students?action=new')}
              >
                <div className="quick-action-card__icon"><UserIcon width={20} height={20} /></div>
                <div className="quick-action-card__text">
                  <span className="quick-action-card__title">Add student</span>
                  <span className="quick-action-card__sub">Register learner profile</span>
                </div>
              </button>

              <button
                type="button"
                className="quick-action-card"
                onClick={() => navigate('/setup/classes')}
              >
                <div className="quick-action-card__icon"><SchoolIcon width={20} height={20} /></div>
                <div className="quick-action-card__text">
                  <span className="quick-action-card__title">Create class</span>
                  <span className="quick-action-card__sub">Set up stream or form</span>
                </div>
              </button>

              <button
                type="button"
                className="quick-action-card"
                onClick={() => navigate('/scheduling/generate')}
              >
                <div className="quick-action-card__icon"><SparkIcon width={20} height={20} /></div>
                <div className="quick-action-card__text">
                  <span className="quick-action-card__title">Generate timetable</span>
                  <span className="quick-action-card__sub">Run CP-SAT solver</span>
                </div>
              </button>

              <button
                type="button"
                className="quick-action-card"
                onClick={() => navigate('/students?tab=attendance')}
              >
                <div className="quick-action-card__icon"><CalendarIcon width={20} height={20} /></div>
                <div className="quick-action-card__text">
                  <span className="quick-action-card__title">Record attendance</span>
                  <span className="quick-action-card__sub">Take class register</span>
                </div>
              </button>

              <button
                type="button"
                className="quick-action-card"
                onClick={() => navigate('/?action=announcement')}
              >
                <div className="quick-action-card__icon"><LayersIcon width={20} height={20} /></div>
                <div className="quick-action-card__text">
                  <span className="quick-action-card__title">Send announcement</span>
                  <span className="quick-action-card__sub">Broadcast school alert</span>
                </div>
              </button>
            </div>
          </section>

          {/* MAIN 2-COLUMN COMMAND GRID */}
          <div className="dashboard-columns">
            {/* LEFT COLUMN: NEEDS ATTENTION & UPCOMING */}
            <div className="dashboard-col">
              {/* 2. NEEDS ATTENTION */}
              <section aria-labelledby="needs-attention-heading" className="card section">
                <div className="panel__head">
                  <h2 className="section__title" id="needs-attention-heading">
                    Needs Attention
                  </h2>
                  <Badge tone={hard > 0 ? 'danger' : 'success'}>
                    {hard > 0 ? `${hard} Urgent Issues` : 'All Systems Clear'}
                  </Badge>
                </div>

                <div className="attention-list">
                  {hard > 0 ? (
                    <div className="attention-item attention-item--danger">
                      <AlertIcon className="attention-item__icon" />
                      <div className="attention-item__content">
                        <strong className="attention-item__title">Timetable Conflicts ({hard})</strong>
                        <p className="attention-item__desc">Overlapping teacher or room assignments require resolution.</p>
                      </div>
                      <Link to="/timetable" className="button button--secondary button--sm">Resolve →</Link>
                    </div>
                  ) : (
                    <div className="attention-item attention-item--success">
                      <CheckIcon className="attention-item__icon" />
                      <div className="attention-item__content">
                        <strong className="attention-item__title">Timetable Integrity</strong>
                        <p className="attention-item__desc">No hard scheduling conflicts detected in current schedule.</p>
                      </div>
                    </div>
                  )}

                  <div className="attention-item attention-item--warning">
                    <AlertIcon className="attention-item__icon" />
                    <div className="attention-item__content">
                      <strong className="attention-item__title">Attendance Anomalies (8)</strong>
                      <p className="attention-item__desc">Form 3A and 4B reported unusual absenteeism this morning.</p>
                    </div>
                    <Link to="/students?tab=attendance" className="button button--secondary button--sm">Review →</Link>
                  </div>

                  <div className="attention-item attention-item--info">
                    <LayersIcon className="attention-item__icon" />
                    <div className="attention-item__content">
                      <strong className="attention-item__title">Pending Approvals (3)</strong>
                      <p className="attention-item__desc">New staff account requests awaiting administrative approval.</p>
                    </div>
                    <Link to="/platform/requests" className="button button--secondary button--sm">Review →</Link>
                  </div>
                </div>
              </section>

              {/* 3. UPCOMING SCHEDULE & DEADLINES */}
              <section aria-labelledby="upcoming-heading" className="card section">
                <h2 className="section__title" id="upcoming-heading">
                  Upcoming & Schedule
                </h2>
                <ul className="upcoming-list">
                  <li className="upcoming-item">
                    <div className="upcoming-item__time">
                      <span className="upcoming-item__hour">10:00 AM</span>
                      <span className="upcoming-item__tag">Class</span>
                    </div>
                    <div className="upcoming-item__info">
                      <strong className="upcoming-item__title">Mathematics — Form 3A</strong>
                      <span className="upcoming-item__sub">Room 102 · Mr. Banda</span>
                    </div>
                  </li>
                  <li className="upcoming-item">
                    <div className="upcoming-item__time">
                      <span className="upcoming-item__hour">11:30 AM</span>
                      <span className="upcoming-item__tag upcoming-item__tag--exam">Exam</span>
                    </div>
                    <div className="upcoming-item__info">
                      <strong className="upcoming-item__title">Physics Mid-Term Assessment</strong>
                      <span className="upcoming-item__sub">Main Hall · Form 4</span>
                    </div>
                  </li>
                  <li className="upcoming-item">
                    <div className="upcoming-item__time">
                      <span className="upcoming-item__hour">02:00 PM</span>
                      <span className="upcoming-item__tag upcoming-item__tag--event">Event</span>
                    </div>
                    <div className="upcoming-item__info">
                      <strong className="upcoming-item__title">Staff & Departmental Briefing</strong>
                      <span className="upcoming-item__sub">Staff Room · All Teachers</span>
                    </div>
                  </li>
                </ul>
              </section>
            </div>

            {/* RIGHT COLUMN: TIMETABLE QUALITY & ACTIVITY */}
            <div className="dashboard-col">
              <section aria-labelledby="quality-heading" className="card section">
                <div className="panel__head">
                  <h2 className="section__title" id="quality-heading">
                    Timetable Quality
                  </h2>
                  {version && (
                    <Badge tone={version.status === 'published' ? 'success' : 'warning'}>
                      v{version.number} {version.status}
                    </Badge>
                  )}
                </div>
                {loading ? (
                  <LoadingBlock label="Loading quality score" rows={4} />
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
                  Recent System Activity
                </h2>
                {loading ? (
                  <LoadingBlock label="Loading activity" rows={3} />
                ) : (data?.recent.length ?? 0) === 0 ? (
                  <EmptyState
                    title="Nothing yet"
                    description="Changes to your school records and timetable will appear here."
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
          </div>
        </>
      )}
    </>
  )
}
