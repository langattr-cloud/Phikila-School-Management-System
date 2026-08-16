import { useCallback } from 'react'
import { Badge, EmptyState, ErrorState, LoadingBlock, Skeleton } from '../components/States'
import { Alert } from '../components/Alert'
import { QualityBars } from '../components/QualityBars'
import { SchoolIcon, UserIcon, GridIcon, CheckIcon, SparkIcon } from '../components/icons'
import { friendlyApiError, api } from '../lib/api'
import { finance } from '../lib/finance'
import { students } from '../lib/students'
import { useAsync } from '../lib/useAsync'
import { displayName, useAuth } from '../lib/auth'
import { Link } from '../lib/router'
import { scheduling, type Dashboard } from '../lib/scheduling'
import '../../src/dashboard.css'

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value || 0)
}

function Metric({ label, value, detail, loading, icon, tone = 'navy', to }: { label:string; value:string|number; detail:string; loading:boolean; icon:React.ReactNode; tone?:'navy'|'gold'|'green'|'danger'; to:string }) {
  return <div className="dashboard-metric">
    <div className="dashboard-metric__top"><span className={`dashboard-metric__icon dashboard-metric__icon--${tone}`}>{icon}</span><Badge tone="success">Live</Badge></div>
    <div className="dashboard-metric__label">{label}</div>
    <div className="dashboard-metric__value">{loading ? <Skeleton width="4rem" height="1.7rem" /> : value}</div>
    <div className="dashboard-metric__detail">{loading ? <Skeleton width="80%" /> : detail}</div>
    <Link className="dashboard-metric__link" to={to}>View details →</Link>
  </div>
}

export function DashboardPage() {
  const { user } = useAuth()
  const toMessage = useCallback((error: unknown) => friendlyApiError(error, 'load your dashboard'), [])
  const { data, loading, error, reload } = useAsync<Dashboard>(scheduling.dashboard, toMessage)
  const schoolQuery = useAsync(api.school, toMessage)
  const yearsQuery = useAsync(api.academicYears, toMessage)
  const termsQuery = useAsync(api.terms, toMessage)
  const levelsQuery = useAsync(api.levels, toMessage)
  const financeQuery = useAsync(finance.overview, toMessage)
  const studentsQuery = useAsync(() => students.list({ page: 1, page_size: 1 }), toMessage)

  const hard = data?.conflicts.hard ?? 0
  const soft = data?.conflicts.soft ?? 0
  const version = data?.version ?? null
  const school = schoolQuery.data
  const currentYear = yearsQuery.data?.find((y) => y.is_current)
  const currentTerm = termsQuery.data?.find((t) => t.is_current)
  const scheduled = data?.lessons.scheduled ?? 0
  const required = data?.lessons.required ?? 0
  const completion = required > 0 ? Math.min(100, Math.round((scheduled / required) * 100)) : 0
  const collectionRate = financeQuery.data && financeQuery.data.total_invoiced > 0
    ? Math.round((financeQuery.data.total_collected / financeQuery.data.total_invoiced) * 100) : 0

  return <div className="dashboard-page dashboard-page--premium">
    <div className="dashboard-hero">
      <div>
        <p className="dashboard-hero__eyebrow">Phikila School Management System</p>
        <h1 className="dashboard-hero__title">Good day, {displayName(user)}</h1>
        <p className="dashboard-hero__meta">{school?.name || 'School operations'} · {currentYear?.name || 'Academic year not set'} · {currentTerm?.name || 'Term not set'}</p>
      </div>
      <div className="dashboard-hero__actions">
        <Link className="button button--secondary button--sm" to="/timetable">Open timetable</Link>
        <Link className="button button--primary button--sm" to="/scheduling/generate">Generate timetable</Link>
      </div>
    </div>

    {error ? <ErrorState title="Dashboard could not load" message={error} onRetry={reload} retryLabel="Reload dashboard" /> : <>
      {(!school && !schoolQuery.loading) && <Alert tone="info" title="Complete your school profile"><Link to="/setup/school">Set up your school profile</Link> to unlock the full operations overview.</Alert>}
      {data && !data.solver_available && <Alert tone="error" title="Scheduling engine unavailable">Timetables cannot be generated until the optimisation engine is installed on the server.</Alert>}

      <section className="dashboard-metrics" aria-label="Key school metrics">
        <Metric label="Students" value={studentsQuery.data?.total ?? 0} detail="Total enrolled records" loading={studentsQuery.loading} icon={<UserIcon />} tone="navy" to="/students" />
        <Metric label="Teachers" value={data?.counts.teachers ?? 0} detail="Staff available for scheduling" loading={loading} icon={<UserIcon />} tone="green" to="/setup/teachers" />
        <Metric label="Classes" value={data?.counts.classes ?? 0} detail="Teaching groups" loading={loading} icon={<SchoolIcon />} tone="gold" to="/setup/classes" />
        <Metric label="Fee collection" value={money(financeQuery.data?.total_collected ?? 0)} detail={`${collectionRate}% of invoiced amount collected`} loading={financeQuery.loading} icon={<GridIcon />} tone="green" to="/finance" />
      </section>

      <div className="dashboard-grid--primary">
        <section className="card section dashboard-panel dashboard-panel--premium" aria-labelledby="finance-heading">
          <div className="dashboard-panel__head"><div><p className="dashboard-panel__eyebrow">Financial health</p><h2 className="dashboard-panel__title" id="finance-heading">Fee collection overview</h2></div><Link className="dashboard-panel__action" to="/finance">Open finance →</Link></div>
          {financeQuery.loading ? <LoadingBlock label="Loading financial overview" rows={3} /> : financeQuery.error ? <Alert tone="info">Finance summary is temporarily unavailable.</Alert> : <>
            <div className="dashboard-finance__amounts">
              <div className="dashboard-finance__amount"><span className="dashboard-finance__amount-label">Invoiced</span><span className="dashboard-finance__amount-value">{money(financeQuery.data?.total_invoiced ?? 0)}</span></div>
              <div className="dashboard-finance__amount"><span className="dashboard-finance__amount-label">Collected</span><span className="dashboard-finance__amount-value">{money(financeQuery.data?.total_collected ?? 0)}</span></div>
              <div className="dashboard-finance__amount"><span className="dashboard-finance__amount-label">Outstanding</span><span className="dashboard-finance__amount-value">{money(financeQuery.data?.total_outstanding ?? 0)}</span></div>
            </div>
            <div className="dashboard-progress" aria-label={`Fee collection ${collectionRate}%`}><div className="dashboard-progress__bar" style={{ width: `${collectionRate}%` }} /></div>
            <div className="dashboard-progress__meta"><span>{collectionRate}% collected</span><span>{financeQuery.data?.pending_count ?? 0} pending invoices</span></div>
          </>}
        </section>

        <section className="card section dashboard-panel dashboard-panel--premium" aria-labelledby="readiness-heading">
          <div className="dashboard-panel__head"><div><p className="dashboard-panel__eyebrow">Academic operations</p><h2 className="dashboard-panel__title" id="readiness-heading">Timetable readiness</h2></div>{version && <Badge tone={version.status === 'published' ? 'success' : 'warning'}>v{version.number} {version.status}</Badge>}</div>
          <div className="dashboard-quality">
            <div className="dashboard-quality__item"><div className="dashboard-quality__label">Lesson completion</div><div className="dashboard-quality__value">{completion}%</div><div className="dashboard-quality__bar"><div className="dashboard-quality__fill" style={{ width:`${completion}%` }} /></div></div>
            <div className="dashboard-quality__item"><div className="dashboard-quality__label">Hard conflicts</div><div className="dashboard-quality__value">{hard}</div><div className="dashboard-quality__bar"><div className="dashboard-quality__fill" style={{ width:`${hard ? 100 : 0}%` }} /></div></div>
            <div className="dashboard-quality__item"><div className="dashboard-quality__label">Unassigned</div><div className="dashboard-quality__value">{data?.lessons.unassigned ?? 0}</div><div className="dashboard-quality__bar"><div className="dashboard-quality__fill" style={{ width:`${data?.lessons.unassigned ? 100 : 0}%` }} /></div></div>
            <div className="dashboard-quality__item"><div className="dashboard-quality__label">Warnings</div><div className="dashboard-quality__value">{soft}</div><div className="dashboard-quality__bar"><div className="dashboard-quality__fill" style={{ width:`${soft ? 100 : 0}%` }} /></div></div>
          </div>
          <div style={{ marginTop:'.85rem' }}>{version ? <QualityBars quality={data?.quality ?? {}} /> : <Link className="button button--primary button--sm" to="/scheduling/generate">Generate a timetable</Link>}</div>
        </section>
      </div>

      <div className="dashboard-grid--primary">
        <section className="card section dashboard-panel dashboard-panel--premium" aria-labelledby="activity-heading">
          <div className="dashboard-panel__head"><div><p className="dashboard-panel__eyebrow">Live feed</p><h2 className="dashboard-panel__title" id="activity-heading">Recent activity</h2></div><Link className="dashboard-panel__action" to="/versions">View history →</Link></div>
          {loading ? <LoadingBlock label="Loading recent activity" rows={4} /> : (data?.recent.length ?? 0) === 0 ? <EmptyState title="Nothing yet" description="Changes to your timetable will appear here." /> : <ul className="dashboard-activity">{data!.recent.slice(0,6).map((entry,index)=><li className="dashboard-activity__item" key={`${entry.at ?? 'activity'}-${index}`}><span className="dashboard-activity__dot">{index+1}</span><div><p className="dashboard-activity__summary">{entry.summary}</p><p className="dashboard-activity__meta">{entry.actor ?? 'system'}{entry.at ? ` · ${new Date(entry.at).toLocaleString()}` : ''}</p></div></li>)}</ul>}
        </section>
        <section className="card section dashboard-panel dashboard-panel--premium" aria-labelledby="structure-heading">
          <div className="dashboard-panel__head"><div><p className="dashboard-panel__eyebrow">School structure</p><h2 className="dashboard-panel__title" id="structure-heading">Configuration health</h2></div><Link className="dashboard-panel__action" to="/setup/school">Manage →</Link></div>
          <ul className="summary-grid">
            <li><Link className="summary-card__link" to="/setup/academic-years"><span className="summary-card__label">Academic years</span><span className="summary-card__value">{yearsQuery.data?.length ?? 0}</span><span className="summary-card__detail">{currentYear?.name || 'Not set'}</span></Link></li>
            <li><Link className="summary-card__link" to="/setup/academic-years"><span className="summary-card__label">Terms</span><span className="summary-card__value">{termsQuery.data?.length ?? 0}</span><span className="summary-card__detail">{currentTerm?.name || 'Not set'}</span></Link></li>
            <li><Link className="summary-card__link" to="/setup/levels"><span className="summary-card__label">Levels</span><span className="summary-card__value">{levelsQuery.data?.length ?? 0}</span><span className="summary-card__detail">Grade levels</span></Link></li>
            <li><Link className="summary-card__link" to="/setup/school"><span className="summary-card__label">School</span><span className="summary-card__value">{school?.is_active !== false ? 'Active' : 'Inactive'}</span><span className="summary-card__detail">{school?.code || 'Profile setup'}</span></Link></li>
          </ul>
        </section>
      </div>

      <section className="section" style={{ padding:0, marginBottom:'1rem' }} aria-labelledby="actions-heading">
        <div className="dashboard-panel__head"><div><p className="dashboard-panel__eyebrow">Shortcuts</p><h2 className="dashboard-panel__title" id="actions-heading">Quick actions</h2></div></div>
        <div className="dashboard-quick-actions">
          <Link className="dashboard-quick-action" to="/students"><span className="dashboard-quick-action__icon"><UserIcon /></span><span><span className="dashboard-quick-action__title">Admit student</span><span className="dashboard-quick-action__detail">Add a new learner</span></span></Link>
          <Link className="dashboard-quick-action" to="/finance"><span className="dashboard-quick-action__icon"><GridIcon /></span><span><span className="dashboard-quick-action__title">Record payment</span><span className="dashboard-quick-action__detail">Manage school fees</span></span></Link>
          <Link className="dashboard-quick-action" to="/attendance"><span className="dashboard-quick-action__icon"><CheckIcon /></span><span><span className="dashboard-quick-action__title">Attendance</span><span className="dashboard-quick-action__detail">Review attendance</span></span></Link>
          <Link className="dashboard-quick-action" to="/scheduling/generate"><span className="dashboard-quick-action__icon"><SparkIcon /></span><span><span className="dashboard-quick-action__title">Generate timetable</span><span className="dashboard-quick-action__detail">Optimise the week</span></span></Link>
        </div>
      </section>

      {data && (hard > 0 || (data.lessons.unassigned ?? 0) > 0) && <div className="dashboard-alert"><Alert tone="error" title="Action required">There are unresolved scheduling items. Review the timetable before publishing it.</Alert></div>}
    </>}
  </div>
}
