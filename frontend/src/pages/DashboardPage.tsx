import { useCallback } from 'react'
import { Badge, EmptyState, LoadingBlock, Skeleton } from '../components/States'
import { Alert } from '../components/Alert'
import { QualityBars } from '../components/QualityBars'
import { UserIcon, GridIcon, SparkIcon } from '../components/icons'
import { friendlyApiError, api, uniqueEducationLevels } from '../lib/api'
import { finance, type Payment, type PaymentInboxItem } from '../lib/finance'
import { students } from '../lib/students'
import { useAsync } from '../lib/useAsync'
import { displayName, useAuth } from '../lib/auth'
import { Link } from '../lib/router'
import { scheduling, type Dashboard } from '../lib/scheduling'
import '../../src/dashboard.css'
function money(value: number) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value || 0) }
function Metric({ label, value, detail, loading, icon, tone = 'navy', to }: { label:string; value:string|number; detail:string; loading:boolean; icon:React.ReactNode; tone?:'navy'|'gold'|'green'|'danger'; to:string }) { return <div className="dashboard-metric"><div className="dashboard-metric__top"><span className={`dashboard-metric__icon dashboard-metric__icon--${tone}`}>{icon}</span><Badge tone="success">Live</Badge></div><div className="dashboard-metric__label">{label}</div><div className="dashboard-metric__value">{loading ? <Skeleton width="4rem" height="1.7rem" /> : value}</div><div className="dashboard-metric__detail">{loading ? <Skeleton width="80%" /> : detail}</div><Link className="dashboard-metric__link" to={to}>View details →</Link></div> }
function TopHeader() {
  return <div className="dashboard-v2-card__top"><span className="dashboard-v2-card__symbol" aria-hidden="true">⊞</span><span className="dashboard-v2-live"><span />Live</span></div>
}

type FinanceActivity = { key:string; title:string; detail:string; status:string; kind:'payment'|'inbox'; at:string }
function activityDate(value?: string | null) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}
function paymentActivity(payment: Payment): FinanceActivity {
  const method = payment.payment_method ? 'via ' + payment.payment_method.replace(/_/g, ' ') : 'Payment recorded'
  return { key:'payment-' + payment.id, title:'Payment ' + (payment.reference_number || '#' + payment.id) + ' recorded', detail:money(payment.amount) + ' · ' + method + (payment.invoice_id ? ' · Invoice #' + payment.invoice_id : ''), status:payment.status || 'RECORDED', kind:'payment', at:payment.created_at || '' }
}
function inboxActivity(item: PaymentInboxItem): FinanceActivity {
  return { key:'inbox-' + item.id, title:'External payment ' + String(item.status || 'received').toLowerCase().replace(/_/g, ' '), detail:money(item.amount) + ' · ' + (item.source || item.payment_channel || 'External source') + (item.external_reference ? ' · Reference: ' + item.external_reference : ''), status:item.status || 'RECEIVED', kind:'inbox', at:item.received_at || item.created_at || '' }
}
export function DashboardPage() {
  const { user } = useAuth()
  const toMessage = useCallback((error: unknown) => friendlyApiError(error, 'load your dashboard'), [])
  const { data, loading, error, reload } = useAsync<Dashboard>(scheduling.dashboard, toMessage)
  const schoolQuery = useAsync(api.school, toMessage)
  const yearsQuery = useAsync(api.academicYears, toMessage)
  const termsQuery = useAsync(api.terms, toMessage)
  const levelsQuery = useAsync(api.levels, toMessage)
  const structureQuery = useAsync(async () => {
    const [levels, grades, years] = await Promise.all([api.levels(), api.grades(), api.academicYears()])
    const year = years.find(y => y.is_current) ?? years[0]
    const streams = year ? (await Promise.all(grades.map(g => api.streams(year.id, g.id)))).flat() : []
    return { levels: uniqueEducationLevels(levels).length, grades: grades.length, streams: streams.length }
  }, toMessage)
  const financeQuery = useAsync(finance.overview, toMessage)
  const financeActivityQuery = useAsync(async () => {
    const [paymentsResult, inboxResult] = await Promise.allSettled([finance.listPayments(), finance.listPaymentInbox()])
    const payments = paymentsResult.status === 'fulfilled' ? paymentsResult.value.map(paymentActivity) : []
    const inbox = inboxResult.status === 'fulfilled' ? inboxResult.value.map(inboxActivity) : []
    return [...payments, ...inbox].sort((a, b) => activityDate(b.at) - activityDate(a.at)).slice(0, 4)
  }, toMessage)
  const feeStructuresQuery = useAsync(finance.listFeeStructures, toMessage)
  const studentsQuery = useAsync(() => students.list({ page: 1, page_size: 1 }), toMessage)
  const hard = data?.conflicts.hard ?? 0
  const soft = data?.conflicts.soft ?? 0
  const version = data?.version ?? null
  const school = schoolQuery.data
  const currentYear = yearsQuery.data?.find(y => y.is_current) ?? yearsQuery.data?.[0]
  const currentTerm = termsQuery.data?.find(t => t.is_current) ?? termsQuery.data?.[0]
  const scheduled = data?.lessons.scheduled ?? 0
  const required = data?.lessons.required ?? 0
  const completion = required > 0 ? Math.min(100, Math.round((scheduled / required) * 100)) : 0
  const collectionRate = financeQuery.data && financeQuery.data.total_invoiced > 0 ? Math.round((financeQuery.data.total_collected / financeQuery.data.total_invoiced) * 100) : 0
  const qualityScore = data?.quality?.overall
  const cards = [
    { label: 'Students', value: studentsQuery.data?.total ?? 0, detail: 'Total enrolled learners', loading: studentsQuery.loading, tone: 'blue', to: '/students' },
    { label: 'Education levels', value: structureQuery.data?.levels ?? 0, detail: 'Configured levels', loading: structureQuery.loading, tone: 'violet', to: '/setup/levels' },
    { label: 'Grades', value: structureQuery.data?.grades ?? 0, detail: 'Configured across levels', loading: structureQuery.loading, tone: 'emerald', to: '/setup/grades' },
    { label: 'Streams (optional)', value: structureQuery.data?.streams ?? 0, detail: structureQuery.data?.streams ? 'Configured for the current academic year' : 'Grades can exist without streams', loading: structureQuery.loading, tone: 'orange', to: '/setup/streams' },
    { label: 'Teachers', value: data?.counts.teachers ?? 0, detail: 'Staff available for scheduling', loading, tone: 'pink', to: '/setup/teachers' },
    { label: 'Fee collection', value: money(financeQuery.data?.total_collected ?? 0), detail: String(collectionRate) + '% of invoiced amount collected', loading: financeQuery.loading, tone: 'teal', to: '/finance' },
  ]
  return <div className="dashboard-page dashboard-page--premium dashboard-v2">
    <header className="dashboard-v2-heading">
      <div><p className="dashboard-v2-eyebrow">Phikila School Management System</p><h1>Good day, {displayName(user)}</h1><p>{school?.name || 'School operations'} · {currentYear?.name || 'Academic year not set'} · {currentTerm?.name || 'Term not set'}</p></div>
      <div className="dashboard-v2-actions"><Link className="button button--secondary button--sm" to="/timetable/whole-school">Open timetable</Link><Link className="button button--primary button--sm" to="/scheduling/generate">Generate timetable</Link></div>
    </header>
    {error && <Alert tone="error" title="Scheduling summary could not load">{error} <button type="button" className="link" onClick={reload}>Try again</button></Alert>}
    <section className="dashboard-v2-welcome" aria-label="School welcome">
      <p className="dashboard-v2-welcome__eyebrow">Welcome</p>
      <h2>Welcome, {school?.email || 'your school'} to Phikila School Management System</h2>
      {school?.motto && <p className="dashboard-v2-welcome__motto">“{school.motto}”</p>}
    </section>
    {data && !data.solver_available && <Alert tone="error" title="Scheduling engine unavailable">Timetables cannot be generated until the optimisation engine is installed on the server.</Alert>}
    <section className="dashboard-v2-cards" aria-label="Key school metrics">
      {cards.map(card => <Link key={card.label} className={'dashboard-v2-card dashboard-v2-card--' + card.tone} to={card.to}>
        <TopHeader />
        <p className="dashboard-v2-card__label">{card.label}</p>
        <p className="dashboard-v2-card__value">{card.loading ? <Skeleton width="4rem" height="2rem" /> : card.value}</p>
        <p className="dashboard-v2-card__detail">{card.loading ? <Skeleton width="85%" /> : card.detail}</p>
        <span className="dashboard-v2-card__link">View details →</span>
      </Link>)}
    </section>
    <section className="dashboard-v2-panels">
      <article className="dashboard-v2-panel">
        <div className="dashboard-v2-panel__heading"><div><p className="dashboard-v2-panel__eyebrow">Financial health</p><h2>Fee collection overview</h2></div><Link to="/finance">Open finance →</Link></div>
        {financeQuery.loading ? <LoadingBlock label="Loading financial overview" rows={3} /> : financeQuery.error ? <Alert tone="info">Finance summary is temporarily unavailable.</Alert> : <>
          <div className="dashboard-v2-finance">
            <div><span>Invoiced</span><strong>{money(financeQuery.data?.total_invoiced ?? 0)}</strong></div>
            <div><span>Collected</span><strong>{money(financeQuery.data?.total_collected ?? 0)}</strong></div>
            <div><span>Outstanding</span><strong>{money(financeQuery.data?.total_outstanding ?? 0)}</strong></div>
          </div>
          <div className="dashboard-v2-progress" role="progressbar" aria-label="Fee collection" aria-valuenow={collectionRate} aria-valuemin={0} aria-valuemax={100}><span style={{ width: String(Math.min(100, collectionRate)) + '%' }} /></div>
          <div className="dashboard-v2-progress-meta"><strong>{collectionRate}% collected</strong><span>{financeQuery.data?.pending_count ?? 0} pending invoices</span></div>
        </>}
        <div className="dashboard-v2-subheading"><div><p className="dashboard-v2-panel__eyebrow">Live feed</p><h3>Recent activity</h3></div><Link to="/versions">View history →</Link></div>
        {financeActivityQuery.loading ? <LoadingBlock label="Loading recent payment activity" rows={3} /> : financeActivityQuery.error ? <Alert tone="info">Payment activity is temporarily unavailable.</Alert> : (financeActivityQuery.data?.length ?? 0) === 0 ? <EmptyState title="No payment activity yet" description="Recorded payments and incoming external payment updates will appear here." /> : <ul className="dashboard-v2-activity">{financeActivityQuery.data!.map(entry => <li className="dashboard-v2-activity__item" key={entry.key}><span className={'dashboard-v2-activity__dot dashboard-v2-activity__dot--' + entry.kind} /><div className="dashboard-v2-activity__body"><p className="dashboard-v2-activity__title">{entry.title}</p><p className="dashboard-v2-activity__detail">{entry.detail}</p><p className="dashboard-v2-activity__time">{entry.at ? new Date(entry.at).toLocaleString() : 'Time not available'}</p></div><span className={'dashboard-v2-activity__status dashboard-v2-activity__status--' + (/posted|success|paid|completed/i.test(entry.status) ? 'success' : /match/i.test(entry.status) ? 'matched' : 'neutral')}>{entry.status.replace(/_/g, ' ')}</span></li>)}</ul>}
      </article>
      <article className="dashboard-v2-panel">
        <div className="dashboard-v2-panel__heading"><div><p className="dashboard-v2-panel__eyebrow">Academic operations</p><h2>Timetable readiness</h2></div>{version && <Badge tone={version.status === 'published' ? 'success' : 'warning'}>v{version.number} {version.status}</Badge>}</div>
        <div className="dashboard-v2-readiness">
          <div><span>Lesson completion</span><strong>{completion}%</strong><div className="dashboard-v2-mini-progress"><span style={{ width: String(completion) + '%' }} /></div></div>
          <div><span>Hard conflicts</span><strong>{hard}</strong><div className="dashboard-v2-mini-progress"><span style={{ width: (hard ? '100%' : '0%') }} /></div></div>
          <div><span>Unassigned</span><strong>{data?.lessons.unassigned ?? 0}</strong><div className="dashboard-v2-mini-progress"><span style={{ width: (data?.lessons.unassigned ? '100%' : '0%') }} /></div></div>
          <div><span>Warnings</span><strong>{soft}</strong><div className="dashboard-v2-mini-progress"><span style={{ width: (soft ? '100%' : '0%') }} /></div></div>
        </div>
        <div className="dashboard-v2-score"><strong>{typeof qualityScore === 'number' ? Math.round(qualityScore) : '—'}</strong><span>/ 100</span></div>
        <p className="dashboard-v2-score-note">{typeof qualityScore === 'number' ? 'Current timetable quality score' : 'No score has been calculated yet.'}</p>
        {data && (hard > 0 || (data.lessons.unassigned ?? 0) > 0) && <div className="dashboard-v2-alert"><Alert tone="error" title="Action required">Review unresolved scheduling items before publishing.</Alert></div>}
        <div className="dashboard-v2-subheading"><div><p className="dashboard-v2-panel__eyebrow">School structure</p><h3>Configuration health</h3></div><Link to="/setup/school">Manage →</Link></div>
        <div className="dashboard-v2-structure">
          <Link to="/setup/school"><span>School profile</span><strong>{schoolQuery.loading ? '…' : school?.name ? 'Configured' : 'Needs setup'}</strong><small>{school?.name || 'Complete school details'}</small></Link>
          <Link to="/students"><span>Student records</span><strong>{studentsQuery.loading ? '…' : studentsQuery.data?.total ?? 0}</strong><small>{studentsQuery.error ? 'Count unavailable' : 'Learner records'}</small></Link>
          <Link to="/finance/fee-structures"><span>Fee structures</span><strong>{feeStructuresQuery.loading ? '…' : feeStructuresQuery.data?.length ?? 0}</strong><small>{feeStructuresQuery.error ? 'Status unavailable' : (feeStructuresQuery.data?.filter(item => /active|published/i.test(item.status)).length ?? 0) + ' active or published'}</small></Link>
          <Link to="/setup/academic-years"><span>Academic calendar</span><strong>{currentYear && currentTerm ? 'Configured' : 'Review'}</strong><small>{currentYear?.name || 'Year not set'} · {currentTerm?.name || 'Term not set'}</small></Link>
        </div>
      </article>
    </section>
    <section className="dashboard-v2-quick">
      <div><p className="dashboard-v2-panel__eyebrow">Shortcuts</p><h2>Quick actions</h2></div>
      <div className="dashboard-v2-quick__links">
        <Link to="/students"><UserIcon /><span><strong>Admit student</strong><small>Add a new learner</small></span></Link>
        <Link to="/finance"><GridIcon /><span><strong>Record payment</strong><small>Manage school fees</small></span></Link>
        <Link to="/scheduling/generate"><SparkIcon /><span><strong>Generate timetable</strong><small>Optimise the week</small></span></Link>
      </div>
    </section>
  </div>
}
