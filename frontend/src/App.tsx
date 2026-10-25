import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { PlatformSessionProvider, usePlatformSession } from './lib/session'
import { RouterProvider, normalisePath, useNavigate, useRouter } from './lib/router'
import { ToastProvider } from './components/Toast'
import { AppShell } from './components/AppShell'
import { FullPageLoader } from './components/States'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { SignUpPage } from './pages/SignUpPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { NotFoundPage } from './pages/StatusPages'
import TimetableModule from './stitch/TimetableModule'
const TeacherClassManagementPage = lazy(() => import('./pages/TeacherClassManagement').then(m => ({ default: m.default })))
const SchoolPage = lazy(() => import('./pages/SchoolPage').then(m => ({ default: m.SchoolPage })))
const AcademicsPage = lazy(() => import('./pages/AcademicsPage').then(m => ({ default: m.AcademicsPage })))
const LevelsPage = lazy(() => import('./pages/LevelsPage').then(m => ({ default: m.LevelsPage })))
const GradesPage = lazy(() => import('./pages/GradesPage').then(m => ({ default: m.GradesPage })))
const StreamsPage = lazy(() => import('./pages/StreamsPage').then(m => ({ default: m.StreamsPage })))
const AcademicYearTransitionPage = lazy(() => import('./pages/AcademicYearTransitionPage').then(m => ({ default: m.default })))
const AcademicSetupWizardPage = lazy(() => import('./pages/AcademicSetupWizardPage').then(m => ({ default: m.AcademicSetupWizardPage })))
const SchoolStructurePage = lazy(() => import('./pages/SchoolStructurePage').then(m => ({ default: m.SchoolStructurePage })))
const StudentsOverviewPage = lazy(() => import('./pages/StudentsOverviewPage').then(m => ({ default: m.default })))
const StudentsPage = lazy(() => import('./pages/Students').then(m => ({ default: m.default })))
const StudentImportPage = lazy(() => import('./pages/StudentImportPage').then(m => ({ default: m.default })))
const ExaminationDashboardPage = lazy(() => import('./pages/ExaminationDashboardPage').then(m => ({ default: m.default })))
const ExaminationsPage = lazy(() => import('./pages/Examinations').then(m => ({ default: m.default })))
const ExaminationSetupPage = lazy(() => import('./pages/ExaminationSetupPage').then(m => ({ default: m.default })))
const MarkAccessPage = lazy(() => import('./pages/MarkAccessPage').then(m => ({ default: m.default })))
const ReportCardPage = lazy(() => import('./pages/ReportCardPage').then(m => ({ default: m.default })))
const ClassResultsPage = lazy(() => import('./pages/ClassResultsPage').then(m => ({ default: m.default })))
const FinancePage = lazy(() => import('./pages/Finance').then(m => ({ default: m.default })))
const FinancePaymentInboxPage = lazy(() => import('./pages/FinancePaymentInbox').then(m => ({ default: m.default })))
const OcrScanPage = lazy(() => import('./pages/OcrScanPage').then(m => ({ default: m.OcrScanPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const LlmProvidersPage = lazy(() => import('./pages/LlmProvidersPage').then(m => ({ default: m.LlmProvidersPage })))
const PlatformDashboardPage = lazy(() => import('./pages/PlatformPage').then(m => ({ default: m.PlatformDashboardPage })))
const PlatformSchoolsPage = lazy(() => import('./pages/PlatformPage').then(m => ({ default: m.PlatformSchoolsPage })))
const PlatformSchoolDetailPage = lazy(() => import('./pages/PlatformPage').then(m => ({ default: m.PlatformSchoolDetailPage })))
const PlatformRequestsPage = lazy(() => import('./pages/PlatformPage').then(m => ({ default: m.PlatformRequestsPage })))
const PlatformAdminsPage = lazy(() => import('./pages/PlatformPage').then(m => ({ default: m.PlatformAdminsPage })))
const PlatformAuditPage = lazy(() => import('./pages/PlatformAuditPage').then(m => ({ default: m.PlatformAuditPage })))
const PlatformModulesPage = lazy(() => import('./pages/PlatformModulesPage').then(m => ({ default: m.PlatformModulesPage })))
const AwaitingApprovalPage = lazy(() => import('./pages/AwaitingApprovalPage').then(m => ({ default: m.AwaitingApprovalPage })))
const PUBLIC_ROUTES = new Set(['/login', '/signup', '/forgot-password', '/reset-password'])

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, user, initialising } = useAuth()
  const { pathname, search, hash } = useRouter()
  const navigate = useNavigate()
  useEffect(() => {
    if (initialising) return
    if (!session) {
      navigate(`/login?notice=session-expired&next=${encodeURIComponent(`${pathname}${search}${hash}`)}`, { replace: true })
      return
    }
    if (user?.user_metadata?.must_change_password === true && pathname !== '/reset-password') {
      navigate('/reset-password?notice=first-login-password', { replace: true })
    }
  }, [initialising, session, user, pathname, search, hash, navigate])
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

function AccessGate({ children }: { children: ReactNode }) {
  const { session, loading, error } = usePlatformSession()
  if (loading) return <FullPageLoader label="Checking your access…" />
  if (error) return <>{children}</>
  if (session && !session.has_access) return <Suspense fallback={<FullPageLoader label="Loading…" />}><AwaitingApprovalPage /></Suspense>
  return <>{children}</>
}

function routeFor(pathname: string): ReactNode {
  switch (pathname) {
    case '/': return <StudentsOverviewPage />
    case '/setup/school': return <SchoolPage />
    case '/setup/academic-years': return <AcademicsPage />
    case '/setup/academic-year-transition': return <AcademicYearTransitionPage />
    case '/setup/levels': return <LevelsPage />
    case '/setup/grades': return <GradesPage />
    case '/setup/streams': return <StreamsPage />
    case '/setup/academic-setup': return <AcademicSetupWizardPage />
    case '/setup/school-structure': return <SchoolStructurePage />
    case '/setup/teachers': return <TeacherClassManagementPage />
    case '/students': return <StudentsOverviewPage />
    case '/timetable': case '/timetable-manager': return <TimetableModule />
    case '/students/list': return <StudentsPage />
    case '/students/import': return <StudentImportPage />
    case '/examinations': return <ExaminationDashboardPage />
    case '/examinations/setup': return <ExaminationSetupPage />
    case '/examinations/legacy-setup': return <ExaminationsPage />
    case '/examinations/marks-access': return <MarkAccessPage />
    case '/examinations/report-card': return <ReportCardPage />
    case '/examinations/class-results': return <ClassResultsPage />
    case '/finance': return <FinancePage />
    case '/finance/payment-inbox': return <FinancePaymentInboxPage />
    case '/ocr': return <OcrScanPage />
    case '/profile': return <ProfilePage />
    case '/settings/ai-providers': return <LlmProvidersPage />
    case '/platform': return <PlatformDashboardPage />
    case '/platform/schools': return <PlatformSchoolsPage />
    case '/platform/schools/detail': return <PlatformSchoolDetailPage />
    case '/platform/requests': return <PlatformRequestsPage />
    case '/platform/admins': return <PlatformAdminsPage />
    case '/platform/audit': return <PlatformAuditPage />
    case '/platform/modules': return <PlatformModulesPage />
    default: return <NotFoundPage />
  }
}

function NormalLayout({ pathname }: { pathname: string }) {
  return <AppShell>
    <Suspense fallback={<FullPageLoader label="Loading page…" />}>
      {routeFor(pathname)}
    </Suspense>
  </AppShell>
}

function ProtectedRoutes({ pathname }: { pathname: string }) {
  const { session: platformSession } = usePlatformSession()
  const path = normalisePath(pathname)
  const requiredModule = path.startsWith('/students') || ['/setup/academic-years', '/setup/levels', '/setup/grades', '/setup/streams', '/setup/academic-setup', '/setup/school-structure', '/setup/subjects'].includes(path) ? 'students'
    : path.startsWith('/setup/teachers') ? 'staff'
    : path.startsWith('/examinations') ? 'examinations'
    : path.startsWith('/finance') ? 'finance'
    : path.startsWith('/ocr') ? 'ai_tools' : null
  const moduleDenied = Boolean(requiredModule && platformSession && !platformSession.enabled_modules.includes(requiredModule))
  return <RequireAuth><AccessGate>
    {moduleDenied ? <section className="card section"><h1>Module not enabled</h1><p>This module is not enabled for your school. Contact your platform administrator to request access.</p></section> : <NormalLayout pathname={pathname} />}
  </AccessGate></RequireAuth>
}

function LandingRedirect() {
  const { session, initialising } = useAuth()
  if (initialising) return <FullPageLoader label="Checking your session…" />
  if (!session) return <LandingPage />
  return <ProtectedRoutes pathname="/" />
}

function Routes() {
  const { pathname } = useRouter()
  const path = normalisePath(pathname)
  if (PUBLIC_ROUTES.has(path)) {
    const publicPage = path === '/login' ? <LoginPage /> : path === '/signup' ? <SignUpPage /> : path === '/forgot-password' ? <ForgotPasswordPage /> : path === '/reset-password' ? <ResetPasswordPage /> : <NotFoundPage />
    return <RedirectIfSignedIn>{publicPage}</RedirectIfSignedIn>
  }
  if (path === '/') return <LandingRedirect />
  return <ProtectedRoutes pathname={path} />
}

export default function App() {
  return <RouterProvider><ToastProvider><AuthProvider><PlatformSessionProvider><Routes /></PlatformSessionProvider></AuthProvider></ToastProvider></RouterProvider>
}
