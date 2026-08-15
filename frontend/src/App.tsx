import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { PlatformSessionProvider, usePlatformSession } from './lib/session'
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

const TimetablePage = lazy(() => import('./pages/TimetablePage').then((m) => ({ default: m.TimetablePage })))
const GeneratePage = lazy(() => import('./pages/GeneratePage').then((m) => ({ default: m.GeneratePage })))
const SetupPage = lazy(() => import('./pages/SetupPage').then((m) => ({ default: m.SetupPage })))
const RequirementsPage = lazy(() => import('./pages/RequirementsPage').then((m) => ({ default: m.RequirementsPage })))
const ConstraintsPage = lazy(() => import('./pages/ConstraintsPage').then((m) => ({ default: m.ConstraintsPage })))
const SchedulingAnalyticsPage = lazy(() => import('./pages/SchedulingAnalyticsPage').then((m) => ({ default: m.SchedulingAnalyticsPage })))
const VersionsPage = lazy(() => import('./pages/VersionsPage').then((m) => ({ default: m.VersionsPage })))
const CopilotPage = lazy(() => import('./pages/CopilotPage').then((m) => ({ default: m.CopilotPage })))
const MyTimetablePage = lazy(() => import('./pages/MyTimetablePage').then((m) => ({ default: m.MyTimetablePage })))
const PeriodsPage = lazy(() => import('./pages/PeriodsPage').then((m) => ({ default: m.PeriodsPage })))
const SchoolPage = lazy(() => import('./pages/SchoolPage').then((m) => ({ default: m.SchoolPage })))
const AcademicsPage = lazy(() => import('./pages/AcademicsPage').then((m) => ({ default: m.AcademicsPage })))
const LevelsPage = lazy(() => import('./pages/LevelsPage').then((m) => ({ default: m.LevelsPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const LlmProvidersPage = lazy(() => import('./pages/LlmProvidersPage').then((m) => ({ default: m.LlmProvidersPage })))
const PlatformDashboardPage = lazy(() => import('./pages/PlatformPage').then((m) => ({ default: m.PlatformDashboardPage })))
const PlatformSchoolsPage = lazy(() => import('./pages/PlatformPage').then((m) => ({ default: m.PlatformSchoolsPage })))
const PlatformSchoolDetailPage = lazy(() => import('./pages/PlatformPage').then((m) => ({ default: m.PlatformSchoolDetailPage })))
const PlatformRequestsPage = lazy(() => import('./pages/PlatformPage').then((m) => ({ default: m.PlatformRequestsPage })))
const PlatformAdminsPage = lazy(() => import('./pages/PlatformPage').then((m) => ({ default: m.PlatformAdminsPage })))
const PlatformAuditPage = lazy(() => import('./pages/PlatformAuditPage').then((m) => ({ default: m.PlatformAuditPage })))
const PlatformEmailPage = lazy(() => import('./pages/PlatformEmailPage').then((m) => ({ default: m.PlatformEmailPage })))
const AwaitingApprovalPage = lazy(() => import('./pages/AwaitingApprovalPage').then((m) => ({ default: m.AwaitingApprovalPage })))

const PUBLIC_ROUTES = new Set(['/login', '/signup', '/forgot-password', '/reset-password'])

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, initialising } = useAuth()
  const { pathname, search } = useRouter()
  const navigate = useNavigate()
  useEffect(() => {
    if (initialising || session) return
    navigate(`/login?notice=session-expired&next=${encodeURIComponent(`${pathname}${search}`)}`, { replace: true })
  }, [initialising, session, pathname, search, navigate])
  if (initialising) return <FullPageLoader label="Restoring your session…" />
  if (!session) return <FullPageLoader label="Redirecting to sign in…" />
  return <>{children}</>
}

function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { session, initialising, recoveryMode } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useRouter()
  const shouldRedirect = !initialising && Boolean(session) && !recoveryMode && normalisePath(pathname) !== '/reset-password'
  useEffect(() => { if (shouldRedirect) navigate('/', { replace: true }) }, [shouldRedirect, navigate])
  if (initialising) return <FullPageLoader label="Checking your session…" />
  if (shouldRedirect) return <FullPageLoader label="Taking you to your dashboard…" />
  return <>{children}</>
}

function routeFor(pathname: string): ReactNode {
  switch (pathname) {
    case '/': return <DashboardPage />
    case '/timetable': return <TimetablePage />
    case '/my-timetable': return <MyTimetablePage />
    case '/setup/periods': return <PeriodsPage />
    case '/setup/teachers': return <SetupPage kind="teachers" />
    case '/setup/subjects': return <SetupPage kind="subjects" />
    case '/setup/classes': return <SetupPage kind="classes" />
    case '/setup/rooms': return <SetupPage kind="rooms" />
    case '/setup/school': return <SchoolPage />
    case '/setup/academic-years': return <AcademicsPage />
    case '/setup/levels': return <LevelsPage />
    case '/scheduling/requirements': return <RequirementsPage />
    case '/scheduling/constraints': return <ConstraintsPage />
    case '/scheduling/generate': return <GeneratePage />
    case '/scheduling/copilot': return <CopilotPage />
    case '/analytics': return <SchedulingAnalyticsPage />
    case '/versions': return <VersionsPage />
    case '/profile': return <ProfilePage />
    case '/settings/ai-providers': return <LlmProvidersPage />
    case '/platform': return <PlatformDashboardPage />
    case '/platform/schools': return <PlatformSchoolsPage />
    case '/platform/schools/detail': return <PlatformSchoolDetailPage />
    case '/platform/requests': return <PlatformRequestsPage />
    case '/platform/admins': return <PlatformAdminsPage />
    case '/platform/audit': return <PlatformAuditPage />
    case '/platform/email': return <PlatformEmailPage />
    default: return <NotFoundPage />
  }
}

function AccessGate({ children }: { children: ReactNode }) {
  const { session, loading, error } = usePlatformSession()
  if (loading) return <FullPageLoader label="Checking your access…" />
  if (error) return <>{children}</>
  if (session && !session.has_access) return <Suspense fallback={<FullPageLoader label="Loading…" />}><AwaitingApprovalPage /></Suspense>
  return <>{children}</>
}

function ProtectedRoutes({ pathname }: { pathname: string }) {
  return <RequireAuth><AccessGate><AppShell><Suspense fallback={<FullPageLoader label="Loading page…" />}>{routeFor(pathname)}</Suspense></AppShell></AccessGate></RequireAuth>
}

function Routes() {
  const { pathname } = useRouter()
  const path = normalisePath(pathname)
  if (PUBLIC_ROUTES.has(path)) {
    const publicPage = path === '/login' ? <LoginPage /> : path === '/signup' ? <SignUpPage /> : path === '/forgot-password' ? <ForgotPasswordPage /> : <ResetPasswordPage />
    return <RedirectIfSignedIn>{publicPage}</RedirectIfSignedIn>
  }
  return <ProtectedRoutes pathname={path} />
}

export default function App() {
  return <RouterProvider><ToastProvider><AuthProvider><PlatformSessionProvider><Routes /></PlatformSessionProvider></AuthProvider></ToastProvider></RouterProvider>
}
