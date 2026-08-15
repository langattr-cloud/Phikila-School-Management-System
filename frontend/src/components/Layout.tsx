import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface NavItem {
  to: string
  label: string
  end?: boolean
  icon: string
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', end: true, icon: '📊' }],
  },
  {
    title: 'Configuration',
    items: [
      { to: '/school', label: 'School Profile', icon: '🏫' },
      { to: '/academics', label: 'Academic Setup', icon: '📅' },
    ],
  },
  {
    title: 'Academics',
    items: [
      { to: '/departments', label: 'Departments', icon: '🏢' },
      { to: '/subjects', label: 'Subjects', icon: '📚' },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/teachers', label: 'Teachers', icon: '👩‍🏫' },
      { to: '/students', label: 'Students', icon: '🎓' },
      { to: '/classes', label: 'Class Registers', icon: '📋' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/timetable', label: 'Timetable', icon: '🗓️' },
      { to: '/examinations', label: 'Examinations', icon: '📝' },
    ],
  },
  {
    title: 'Finance & Reports',
    items: [
      { to: '/finance', label: 'Finance', icon: '💰' },
      { to: '/reports', label: 'Reports', icon: '🖨️' },
    ],
  },
]

function getInitials(email: string): string {
  const name = email.split('@')[0]
  const parts = name.split(/[._-]/)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export default function Layout() {
  const { signOut, session } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const email = session?.user.email ?? ''
  const initials = getInitials(email)

  return (
    <div className="app-layout">
      {/* Mobile header */}
      <header className="mobile-header">
        <button
          className="hamburger"
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger-line${sidebarOpen ? ' open' : ''}`} />
        </button>
        <p className="mobile-brand">Phikila</p>
        <div className="mobile-avatar" title={email}>{initials}</div>
      </header>

      {/* Overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-brand">
          <p className="sidebar-brand-name">Phikila</p>
          <p className="sidebar-brand-sub">School Register</p>
        </div>
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="sidebar-section">
              <p className="sidebar-section-title">{section.title}</p>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `sidebar-link${isActive ? ' active' : ''}`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="sidebar-link-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user-row">
            <div className="sidebar-avatar" title={email}>{initials}</div>
            <div className="sidebar-user-info">
              <p className="sidebar-user-name">{email.split('@')[0]}</p>
              <p className="sidebar-user-email">{email}</p>
            </div>
          </div>
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
