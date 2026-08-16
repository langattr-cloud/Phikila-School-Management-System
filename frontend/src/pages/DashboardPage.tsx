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
