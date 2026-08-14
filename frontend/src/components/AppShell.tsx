import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, normalisePath, useNavigate, useRouter } from '../lib/router'
import { displayName, useAuth } from '../lib/auth'
import { useToast } from './Toast'
import {
  CalendarIcon,
  CloseIcon,
  DashboardIcon,
  LayersIcon,
  LogOutIcon,
  MenuIcon,
  SchoolIcon,
  UserIcon,
} from './icons'

type NavItem = { to: string; label: string; icon: ReactNode }

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <DashboardIcon /> },
  { to: '/school', label: 'School profile', icon: <SchoolIcon /> },
  { to: '/academics', label: 'Academic calendar', icon: <CalendarIcon /> },
  { to: '/levels', label: 'Levels', icon: <LayersIcon /> },
  { to: '/profile', label: 'My profile', icon: <UserIcon /> },
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

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const drawerRef = useRef<HTMLElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)

  // Close the drawer whenever the route changes so navigation never leaves it open.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

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
      <ul className="sidebar__list">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.to)
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={`sidebar__link ${active ? 'sidebar__link--active' : ''}`.trim()}
                aria-current={active ? 'page' : undefined}
              >
                <span className="sidebar__icon" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
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

      {/* Desktop sidebar */}
      <aside className="sidebar sidebar--desktop">
        <div className="sidebar__brand">
          <span className="brand-mark brand-mark--sm" aria-hidden="true">
            P
          </span>
          <span className="sidebar__brand-text">
            Phikila
            <small>School System</small>
          </span>
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
          <span className="topbar__title">Phikila School System</span>
          <span className="topbar__user" title={user?.email ?? ''}>
            {user?.email}
          </span>
        </header>

        {drawerOpen && (
          <div
            className="drawer-overlay"
            onClick={() => setDrawerOpen(false)}
            role="presentation"
          />
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
            <span className="sidebar__brand-text">
              Phikila
              <small>School System</small>
            </span>
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
      </div>
    </div>
  )
}
