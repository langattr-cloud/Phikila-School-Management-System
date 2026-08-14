import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/school', label: 'School Profile' },
  { to: '/academics', label: 'Academic Setup' },
  { to: '/departments', label: 'Departments' },
  { to: '/subjects', label: 'Subjects' },
  { to: '/teachers', label: 'Teachers' },
  { to: '/students', label: 'Students' },
  { to: '/classes', label: 'Class Registers' },
  { to: '/timetable', label: 'Timetable' },
  { to: '/examinations', label: 'Examinations' },
  { to: '/finance', label: 'Finance' },
  { to: '/reports', label: 'Reports' },
]

export default function Layout() {
  const { signOut, session } = useAuth()

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="sidebar-brand-name">Phikila</p>
          <p className="sidebar-brand-sub">School Register</p>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `sidebar-link${isActive ? ' active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p className="sidebar-user">{session?.user.email}</p>
          <button className="sidebar-signout" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <div className="main-inner">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
