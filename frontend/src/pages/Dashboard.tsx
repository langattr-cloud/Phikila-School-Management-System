import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { session } = useAuth()

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Overview</p>
        <h1 className="page-title">Dashboard</h1>
        <p className="muted">Welcome back, {session?.user.email}</p>
      </header>

      <div className="stats-grid">
        <StatCard label="Total students" value="—" />
        <StatCard label="Active" value="—" tone="forest" />
        <StatCard label="Classes" value="—" />
      </div>

      <div className="quick-links">
        <QuickLink to="/students" title="Admit a student" desc="Register a new student and their guardians." />
        <QuickLink to="/classes" title="Manage class registers" desc="Set up classes and assign class teachers." />
        <QuickLink to="/timetable" title="Build the timetable" desc="Schedule lessons and resolve clashes." />
        <QuickLink to="/examinations" title="Record exam results" desc="Log scores against assessment components." />
      </div>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card">
      <p className="card-label">{label}</p>
      <p className={`card-value${tone === 'forest' ? ' forest' : ''}`}>{value}</p>
    </div>
  )
}

function QuickLink({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} className="card quick-link">
      <p className="quick-link-title">{title}</p>
      <p className="quick-link-desc">{desc}</p>
    </Link>
  )
}
