import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { RouterProvider, normalisePath, useNavigate, useRouter } from './lib/router'
import { ToastProvider } from './components/Toast'
import { AppShell } from './components/AppShell'
import { FullPageLoader } from './components/States'
import { LoginPage } from './pages/LoginPage'
import { SignUpPage } from './pages/SignUpPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/StatusPages'

// Secondary screens are code-split: the login screen (the first paint for a
// signed-out visitor) does not need their JavaScript.
const SchoolPage = lazy(() => import('./pages/SchoolPage').then((m) => ({ default: m.SchoolPage })))
const AcademicsPage = lazy(() =>
  import('./pages/AcademicsPage').then((m) => ({ default: m.AcademicsPage })),
)
const LevelsPage = lazy(() => import('./pages/LevelsPage').then((m) => ({ default: m.LevelsPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))

const PUBLIC_ROUTES = new Set(['/login', '/signup', '/forgot-password', '/reset-password'])

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, initialising } = useAuth()
  const { pathname, search } = useRouter()
  const navigate = useNavigate()

  useEffect(() => {
    if (initialising || session) return
    const next = encodeURIComponent(`${pathname}${search}`)
    navigate(`/login?notice=session-expired&next=${next}`, { replace: true })
  }, [initialising, session, pathname, search, navigate])

  // Never render protected content before the session is known.
  if (initialising) return <FullPageLoader label="Restoring your session…" />
  if (!session) return <FullPageLoader label="Redirecting to sign in…" />
  return <>{children}</>
}

function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { session, initialising, recoveryMode } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useRouter()

  const shouldRedirect =
    !initialising && Boolean(session) && !recoveryMode && normalisePath(pathname) !== '/reset-password'

  useEffect(() => {
    if (shouldRedirect) navigate('/', { replace: true })
  }, [shouldRedirect, navigate])

  if (initialising) return <FullPageLoader label="Checking your session…" />
  if (shouldRedirect) return <FullPageLoader label="Taking you to your dashboard…" />
  return <>{children}</>
}

function ProtectedRoutes({ pathname }: { pathname: string }) {
  let page: ReactNode
  switch (pathname) {
    case '/':
      page = <DashboardPage />
      break
    case '/school':
      page = <SchoolPage />
      break
    case '/academics':
      page = <AcademicsPage />
      break
    case '/levels':
      page = <LevelsPage />
      break
    case '/profile':
      page = <ProfilePage />
      break
    default:
      page = <NotFoundPage />
  }

  return (
    <RequireAuth>
      <AppShell>
        <Suspense fallback={<FullPageLoader label="Loading page…" />}>{page}</Suspense>
      </AppShell>
    </RequireAuth>
  )
}

function Routes() {
  const { pathname } = useRouter()
  const path = normalisePath(pathname)

  if (PUBLIC_ROUTES.has(path)) {
    const publicPage =
      path === '/login' ? (
        <LoginPage />
      ) : path === '/signup' ? (
        <SignUpPage />
      ) : path === '/forgot-password' ? (
        <ForgotPasswordPage />
      ) : (
        <ResetPasswordPage />
      )
    return <RedirectIfSignedIn>{publicPage}</RedirectIfSignedIn>
  }

  return <ProtectedRoutes pathname={path} />
}

export default function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <AuthProvider>
          <Routes />
        </AuthProvider>
      </ToastProvider>
    </RouterProvider>
  )
}
