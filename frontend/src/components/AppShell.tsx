import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, normalisePath, useNavigate, useRouter } from '../lib/router'
import { displayName, useAuth } from '../lib/auth'
import { usePlatformSession } from '../lib/session'
import { useToast } from './Toast'
import { Logo, LogoMark } from './Logo'
import {
  CalendarIcon,
  CloseIcon,
  DashboardIcon,
  LayersIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  SchoolIcon,
  SparkIcon,
  SunIcon,
  UserIcon,
} from './icons'

type NavItem = { to: string; label: string; icon?: ReactNode }
type NavGroup = { label: string; items: NavItem[] }

const PLATFORM_NAV: NavGroup = {
  label: 'Platform',
  items: [
    { to: '/platform', label: 'Platform dashboard', icon: <SchoolIcon /> },
    { to: '/platform/schools', label: 'Schools' },
    { to: '/platform/requests', label: 'Access requests' },
    { to: '/platform/admins', label: 'Administrators' },
    { to: '/platform/audit', label: 'Audit trail' },
    { to: '/settings/ai-providers', label: 'AI providers' },
  ],
}

const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: <DashboardIcon /> },
      { to: '/timetable', label: 'Timetable', icon: <CalendarIcon /> },
      { to: '/my-timetable', label: 'My timetable', icon: <UserIcon /> },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/students', label: 'Students', icon: <UserIcon /> },
      { to: '/setup/teachers', label: 'Teachers' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { to: '/attendance', label: 'Attendance' },
      { to: '/examinations', label: 'Examinations' },
      { to: '/finance', label: 'Finance' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { to: '/setup/school', label: 'School' },
      { to: '/setup/periods', label: 'Days & periods' },
      { to: '/setup/subjects', label: 'Subjects' },
      { to: '/setup/classes', label: 'Classes' },
      { to: '/setup/rooms', label: 'Rooms' },
      { to: '/setup/academic-years', label: 'Academic calendar' },
      { to: '/setup/levels', label: 'Levels' },
    ],
  },
  {
    label: 'Scheduling',
    items: [
      { to: '/scheduling/requirements', label: 'Lesson requirements' },
      { to: '/scheduling/constraints', label: 'Constraints' },
      { to: '/scheduling/generate', label: 'Generate' },
      { to: '/scheduling/copilot', label: 'Copilot' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/ocr', label: 'Document Scanner', icon: <LayersIcon /> },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', label: 'Analytics', icon: <LayersIcon /> },
      { to: '/versions', label: 'Versions', icon: <SchoolIcon /> },
    ],
  },
]

// The five destinations that matter on a phone.
const BOTTOM_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: <DashboardIcon /> },
  { to: '/timetable', label: 'Timetable', icon: <CalendarIcon /> },
  { to: '/scheduling/generate', label: 'Generate', icon: <SparkIcon /> },
  { to: '/analytics', label: 'Analytics', icon: <LayersIcon /> },
  { to: '/my-timetable', label: 'Mine', icon: <UserIcon /> },
]

function isActive(pathname: string, to: string) {
  const current = normalisePath(pathname)
  if (to === '/') return current === '/'
  return current === to || current.startsWith(`${to}/`)
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useRouter()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { notify } = useToast()
  // Navigation visibility only. Backend authorization is what actually
  // protects these routes.
  const isSuperAdmin = usePlatformSession().session?.is_super_admin ?? false
  const groups = isSuperAdmin ? [PLATFORM_NAV, ...NAV] : NAV

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine === false : false,
  )
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' && window.localStorage.getItem('phikila.theme') === 'dark'
      ? 'dark'
      : 'light',
  )
  const drawerRef = useRef<HTMLElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('phikila.theme', theme)
  }, [theme])

  // Close the drawer whenever the route changes so navigation never leaves it open.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    const goOnline = () => setOffline(false)
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    if (!drawerOpen) return

    document.body.classList.add('body--locked')
    const firstLink = drawerRef.current?.querySelector<HTMLElement>('a, button')
    firstLink?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        menuButtonRef.current?.focus()
        return
      }
      if (event.key !== 'Tab' || !drawerRef.current) return

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('body--locked')
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [drawerOpen])

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    const result = await signOut()
    setSigningOut(false)
    if (!result.ok) {
      notify(result.message, 'error')
      return
    }
    notify('You have been signed out.', 'success')
    navigate('/login?notice=signed-out', { replace: true })
  }

  const navigation = (
    <nav className="sidebar__nav" aria-label="Main">
      {groups.map((group) => (
        <div className="sidebar__group" key={group.label}>
          <p className="sidebar__group-label">{group.label}</p>
          <ul className="sidebar__list">
            {group.items.map((item) => {
              const active = isActive(pathname, item.to)
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={`sidebar__link ${active ? 'sidebar__link--active' : ''}`.trim()}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.icon && (
                      <span className="sidebar__icon" aria-hidden="true">
                        {item.icon}
                      </span>
                    )}
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )

  const accountBlock = (
    <div className="sidebar__account">
      <p className="sidebar__account-name" title={displayName(user)}>
        {displayName(user)}
      </p>
      <p className="sidebar__account-email">{user?.email}</p>
      <button
        type="button"
        className="button button--ghost button--block"
        onClick={handleSignOut}
        disabled={signingOut}
      >
        <LogOutIcon width={18} height={18} />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className="sidebar sidebar--desktop">
        <div className="sidebar__brand">
          <Logo size={34} tone="dark" />
        </div>
        {navigation}
        {accountBlock}
      </aside>

      <div className="app-shell__main">
        <header className="topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="icon-button topbar__menu"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            aria-controls="mobile-navigation"
          >
            <MenuIcon />
          </button>
          <span className="topbar__title">
            <LogoMark size={26} />
            <span>Phikila</span>
          </span>
          {offline && (
            <span className="topbar__offline" role="status">
              Offline
            </span>
          )}
          <button
            type="button"
            className="icon-button topbar__theme"
            onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <MoonIcon width={18} height={18} /> : <SunIcon width={18} height={18} />}
          </button>
          <span className="topbar__user" title={user?.email ?? ''}>
            {user?.email}
          </span>
        </header>

        {drawerOpen && (
          <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} role="presentation" />
        )}

        <aside
          id="mobile-navigation"
          ref={drawerRef}
          className={`sidebar sidebar--drawer ${drawerOpen ? 'sidebar--open' : ''}`.trim()}
          role="dialog"
          aria-modal={drawerOpen || undefined}
          aria-label="Navigation menu"
          aria-hidden={!drawerOpen}
          {...(!drawerOpen ? { inert: '' as unknown as boolean } : {})}
        >
          <div className="sidebar__brand">
            <Logo size={32} tone="dark" />
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setDrawerOpen(false)
                menuButtonRef.current?.focus()
              }}
              aria-label="Close navigation menu"
            >
              <CloseIcon />
            </button>
          </div>
          {navigation}
          {accountBlock}
        </aside>

        <main className="app-shell__content" id="main-content">
          {children}
        </main>

        {/* Thumb-reachable navigation on phones. */}
        <nav className="bottom-nav" aria-label="Quick navigation">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(pathname, item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`bottom-nav__item ${active ? 'bottom-nav__item--active' : ''}`.trim()}
                aria-current={active ? 'page' : undefined}
              >
                <span className="bottom-nav__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="bottom-nav__label">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
