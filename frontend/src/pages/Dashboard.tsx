import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { School, Student, Teacher, Department } from '../lib/types'

export default function Dashboard() {
  const { session } = useAuth()
  const [school, setSchool] = useState<School | null>(null)
  const [studentCount, setStudentCount] = useState<number | null>(null)
  const [teacherCount, setTeacherCount] = useState<number | null>(null)
  const [departmentCount, setDepartmentCount] = useState<number | null>(null)

  useEffect(() => {
    // Load data in parallel, silently failing on each
    Promise.allSettled([
      api.getSchool().then(setSchool),
      api.getStudents().then((s) => setStudentCount(s.length)),
      api.getTeachers().then((t) => setTeacherCount(t.length)),
      api.getDepartments().then((d) => setDepartmentCount(d.length)),
    ])
  }, [])

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Overview</p>
        <h1 className="page-title">Dashboard</h1>
        <p className="muted">
          Welcome back, {session?.user.email}
          {school && <>, managing <strong>{school.name}</strong></>}
        </p>
      </header>

      <div className="stats-grid">
        <StatCard label="Students" value={studentCount} icon="🎓" />
        <StatCard label="Teachers" value={teacherCount} icon="👩‍🏫" />
        <StatCard label="Departments" value={departmentCount} icon="🏢" />
        <StatCard label="Active Year" value={school?.settings?.current_academic_year_id ? `${school.settings.current_academic_year_id}` : null} icon="📅" fallback="Not set" />
      </div>

      <h2 className="section-title">Quick Actions</h2>
      <div className="quick-links">
        <QuickLink to="/students" title="Admit a student" desc="Register a new student and their guardians." icon="➕" />
        <QuickLink to="/teachers" title="Add a teacher" desc="Create a new teacher profile." icon="👩‍🏫" />
        <QuickLink to="/classes" title="Manage class registers" desc="Set up classes and assign class teachers." icon="🏫" />
        <QuickLink to="/subjects" title="Add subjects" desc="Define subjects for your curriculum." icon="📚" />
        <QuickLink to="/timetable" title="Build the timetable" desc="Schedule lessons and resolve clashes." icon="🗓️" />
        <QuickLink to="/examinations" title="Record exam results" desc="Log scores against assessment components." icon="📝" />
      </div>

      {school && (
        <>
          <h2 className="section-title">School Info</h2>
          <div className="card-grid">
            <InfoCard label="School" value={school.name} />
            <InfoCard label="Code" value={school.code} />
            <InfoCard label="County" value={school.county} />
            <InfoCard label="Motto" value={school.motto} />
            <InfoCard label="Principal" value={school.principal_name} />
            <InfoCard label="Contact" value={school.phone} />
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, fallback = '—' }: { label: string; value: number | string | null; icon: string; fallback?: string }) {
  return (
    <div className="card stat-card">
      <div className="stat-card-icon">{icon}</div>
      <div>
        <p className="card-label">{label}</p>
        <p className="card-value">{value !== null ? value : fallback}</p>
      </div>
    </div>
  )
}

function QuickLink({ to, title, desc, icon }: { to: string; title: string; desc: string; icon: string }) {
  return (
    <Link to={to} className="card quick-link">
      <span className="quick-link-icon">{icon}</span>
      <div>
        <p className="quick-link-title">{title}</p>
        <p className="quick-link-desc">{desc}</p>
      </div>
    </Link>
  )
}

function InfoCard({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="info-card">
      <p className="info-card-label">{label}</p>
      <p className="info-card-value">{value || '—'}</p>
    </div>
  )
}
