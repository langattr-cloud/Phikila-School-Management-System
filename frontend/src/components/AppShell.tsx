```tsx
import {
  lazy,
  Suspense,
  useEffect,
  type ReactNode,
} from 'react'

import {
  AuthProvider,
  useAuth,
} from './lib/auth'

import {
  PlatformSessionProvider,
  usePlatformSession,
} from './lib/session'

import {
  RouterProvider,
  normalisePath,
  useNavigate,
  useRouter,
} from './lib/router'

import { ToastProvider } from './components/Toast'
import { AppShell } from './components/AppShell'
import { FullPageLoader } from './components/States'

import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { SignUpPage } from './pages/SignUpPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { NotFoundPage } from './pages/StatusPages'

/* -------------------------------------------------------------------------- */
/* Lazy pages                                                                 */
/* -------------------------------------------------------------------------- */

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
)

const TimetablePage = lazy(() =>
  import('./pages/TimetablePage').then((m) => ({
    default: m.TimetablePage,
  })),
)

const MyTimetablePage = lazy(() =>
  import('./pages/MyTimetablePage').then((m) => ({
    default: m.MyTimetablePage,
  })),
)

const PeriodsPage = lazy(() =>
  import('./pages/PeriodsPage').then((m) => ({
    default: m.PeriodsPage,
  })),
)

const TeachersPage = lazy(() =>
  import('./pages/Teachers').then((m) => ({
    default: m.default,
  })),
)

const SubjectsPage = lazy(() =>
  import('./pages/Subjects').then((m) => ({
    default: m.default,
  })),
)

const SetupPage = lazy(() =>
  import('./pages/SetupPage').then((m) => ({
    default: m.default,
  })),
)

const SchoolPage = lazy(() =>
  import('./pages/SchoolPage').then((m) => ({
    default: m.SchoolPage,
  })),
)

const AcademicsPage = lazy(() =>
  import('./pages/AcademicsPage').then((m) => ({
    default: m.AcademicsPage,
  })),
)

const LevelsPage = lazy(() =>
  import('./pages/LevelsPage').then((m) => ({
    default: m.LevelsPage,
  })),
)

const GradesPage = lazy(() =>
  import('./pages/GradesPage').then((m) => ({
    default: m.GradesPage,
  })),
)

const StreamsPage = lazy(() =>
  import('./pages/StreamsPage').then((m) => ({
    default: m.default,
  })),
)

const AcademicSetupWizardPage = lazy(() =>
  import('./pages/AcademicSetupWizardPage').then((m) => ({
    default: m.AcademicSetupWizardPage,
  })),
)

const RequirementsPage = lazy(() =>
  import('./pages/RequirementsPage').then((m) => ({
    default: m.RequirementsPage,
  })),
)

const ConstraintsPage = lazy(() =>
  import('./pages/ConstraintsPage').then((m) => ({
    default: m.ConstraintsPage,
  })),
)

const TimeOffPage = lazy(() =>
  import('./pages/TimeOffPage').then((m) => ({
    default: m.TimeOffPage,
  })),
)

const GeneratePage = lazy(() =>
  import('./pages/GeneratePage').then((m) => ({
    default: m.GeneratePage,
  })),
)

const CopilotPage = lazy(() =>
  import('./pages/CopilotPage').then((m) => ({
    default: m.CopilotPage,
  })),
)

const SchedulingAnalyticsPage = lazy(() =>
  import('./pages/SchedulingAnalyticsPage').then((m) => ({
    default: m.SchedulingAnalyticsPage,
  })),
)

const VersionsPage = lazy(() =>
  import('./pages/VersionsPage').then((m) => ({
    default: m.VersionsPage,
  })),
)

const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({
    default: m.ProfilePage,
  })),
)

const LlmProvidersPage = lazy(() =>
  import('./pages/LlmProvidersPage').then((m) => ({
    default: m.LlmProvidersPage,
  })),
)

const OcrScanPage = lazy(() =>
  import('./pages/OcrScanPage').then((m) => ({
    default: m.default,
  })),
)

const StudentsPage = lazy(() =>
  import('./pages/Students').then((m) => ({
    default: m.default,
  })),
)

const AttendancePage = lazy(() =>
  import('./pages/Attendance').then((m) => ({
    default: m.default,
  })),
)

const ExaminationsPage = lazy(() =>
  import('./pages/Examinations').then((m) => ({
    default: m.default,
  })),
)

const MarkAccessPage = lazy(() =>
  import('./pages/MarkAccessPage').then((m) => ({
    default: m.default,
  })),
)

const ReportCardPage = lazy(() =>
  import('./pages/ReportCardPage').then((m) => ({
    default: m.default,
  })),
)

const ClassResultsPage = lazy(() =>
  import('./pages/ClassResultsPage').then((m) => ({
    default: m.default,
  })),
)

const FinancePage = lazy(() =>
  import('./pages/Finance').then((m) => ({
    default: m.default,
  })),
)

const FinancePaymentInboxPage = lazy(() =>
  import('./pages/FinancePaymentInbox').then((m) => ({
    default: m.default,
  })),
)

const PlatformDashboardPage = lazy(() =>
  import('./pages/PlatformPage').then((m) => ({
    default: m.PlatformDashboardPage,
  })),
)

const PlatformSchoolsPage = lazy(() =>
  import('./pages/PlatformPage').then((m) => ({
    default: m.PlatformSchoolsPage,
  })),
)

const PlatformSchoolDetailPage = lazy(() =>
  import('./pages/PlatformPage').then((m) => ({
    default: m.PlatformSchoolDetailPage,
  })),
)

const PlatformRequestsPage = lazy(() =>
  import('./pages/PlatformPage').then((m) => ({
    default: m.PlatformRequestsPage,
  })),
)

const PlatformAdminsPage = lazy(() =>
  import('./pages/PlatformPage').then((m) => ({
    default: m.PlatformAdminsPage,
  })),
)

const PlatformAuditPage = lazy(() =>
  import('./pages/PlatformAuditPage').then((m) => ({
    default: m.PlatformAuditPage,
  })),
)

const PlatformEmailPage = lazy(() =>
  import('./pages/PlatformEmailPage').then((m) => ({
    default: m.PlatformEmailPage,
  })),
)

const AwaitingApprovalPage = lazy(() =>
  import('./pages/AwaitingApprovalPage').then((m) => ({
    default: m.AwaitingApprovalPage,
  })),
)

/* -------------------------------------------------------------------------- */
/* Route configuration                                                        */
/* -------------------------------------------------------------------------- */

const PUBLIC_ROUTES = new Set([
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
])

const PLATFORM_ROUTES = new Set([
  '/platform',
  '/platform/schools',
  '/platform/schools/detail',
  '/platform/requests',
  '/platform/admins',
  '/platform/audit',
  '/platform/email',
  '/settings/ai-providers',
])

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

function PageLoader({
  label = 'Loading page…',
}: {
  label?: string
}) {
  return <FullPageLoader label={label} />
}

/* -------------------------------------------------------------------------- */
/* Authentication guard                                                       */
/* -------------------------------------------------------------------------- */

function RequireAuth({
  children,
}: {
  children: ReactNode
}) {
  const {
    session,
    initialising,
  } = useAuth()

  const {
    pathname,
    search,
  } = useRouter()

  const navigate = useNavigate()

  useEffect(() => {
    if (initialising || session) return

    const next = `${pathname}${search}`

    navigate(
      `/login?notice=session-expired&next=${encodeURIComponent(next)}`,
      {
        replace: true,
      },
    )
  }, [
    initialising,
    session,
    pathname,
    search,
    navigate,
  ])

  if (initialising) {
    return (
      <PageLoader label="Restoring your session…" />
    )
  }

  if (!session) {
    return (
      <PageLoader label="Redirecting to sign in…" />
    )
  }

  return <>{children}</>
}

/* -------------------------------------------------------------------------- */
/* Public-route guard                                                         */
/* -------------------------------------------------------------------------- */

function RedirectIfSignedIn({
  children,
}: {
  children: ReactNode
}) {
  const {
    session,
    initialising,
    recoveryMode,
  } = useAuth()

  const navigate = useNavigate()
  const { pathname } = useRouter()

  const path = normalisePath(pathname)

  const shouldRedirect =
    !initialising &&
    Boolean(session) &&
    !recoveryMode &&
    path !== '/reset-password'

  useEffect(() => {
    if (!shouldRedirect) return

    navigate('/', {
      replace: true,
    })
  }, [
    shouldRedirect,
    navigate,
  ])

  if (initialising) {
    return (
      <PageLoader label="Checking your session…" />
    )
  }

  if (shouldRedirect) {
    return (
      <PageLoader label="Taking you to your dashboard…" />
    )
  }

  return <>{children}</>
}

/* -------------------------------------------------------------------------- */
/* Platform access guard                                                      */
/* -------------------------------------------------------------------------- */

function PlatformGuard({
  children,
}: {
  children: ReactNode
}) {
  const {
    session,
    loading,
    error,
  } = usePlatformSession()

  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return

    /*
     * A platform-session error must not silently grant
     * access to platform administration.
     */
    if (error || !session?.is_super_admin) {
      navigate('/', {
        replace: true,
      })
    }
  }, [
    loading,
    error,
    session,
    navigate,
  ])

  if (loading) {
    return (
      <PageLoader label="Checking platform access…" />
    )
  }

  if (error) {
    return (
      <PageLoader label="Unable to verify platform access…" />
    )
  }

  if (!session?.is_super_admin) {
    return (
      <PageLoader label="Redirecting…" />
    )
  }

  return <>{children}</>
}

/* -------------------------------------------------------------------------- */
/* School access guard                                                        */
/* -------------------------------------------------------------------------- */

function AccessGate({
  children,
}: {
  children: ReactNode
}) {
  const {
    session,
    loading,
    error,
  } = usePlatformSession()

  if (loading) {
    return (
      <PageLoader label="Checking your access…" />
    )
  }

  /*
   * Authentication remains valid even if the optional
   * platform lookup fails.
   */
  if (error) {
    return <>{children}</>
  }

  if (
    session &&
    session.has_access === false
  ) {
    return (
      <Suspense
        fallback={
          <PageLoader label="Loading approval status…" />
        }
      >
        <AwaitingApprovalPage />
      </Suspense>
    )
  }

  return <>{children}</>
}

/* -------------------------------------------------------------------------- */
/* Page resolver                                                              */
/* -------------------------------------------------------------------------- */

function routeFor(
  pathname: string,
): ReactNode {
  switch (pathname) {
    case '/':
      return <DashboardPage />

    case '/timetable':
      return <TimetablePage />

    case '/my-timetable':
      return <MyTimetablePage />

    case '/setup/periods':
      return <PeriodsPage />

    case '/setup/teachers':
      return <TeachersPage />

    case '/setup/subjects':
      return <SubjectsPage />

    case '/setup/rooms':
      return <SetupPage kind="rooms" />

    case '/setup/school':
      return <SchoolPage />

    case '/setup/academic-years':
      return <AcademicsPage />

    case '/setup/levels':
      return <LevelsPage />

    case '/setup/grades':
      return <GradesPage />

    case '/setup/streams':
      return <StreamsPage />

    case '/setup/academic-setup':
      return <AcademicSetupWizardPage />

    case '/scheduling/requirements':
      return <RequirementsPage />

    case '/scheduling/constraints':
      return <ConstraintsPage />

    case '/scheduling/time-off':
      return <TimeOffPage />

    case '/scheduling/generate':
      return <GeneratePage />

    case '/scheduling/copilot':
      return <CopilotPage />

    case '/students':
      return <StudentsPage />

    case '/attendance':
      return <AttendancePage />

    case '/examinations':
      return <ExaminationsPage />

    case '/examinations/marks-access':
      return <MarkAccessPage />

    case '/examinations/report-card':
      return <ReportCardPage />

    case '/examinations/class-results':
      return <ClassResultsPage />

    case '/finance':
      return <FinancePage />

    case '/finance/payment-inbox':
      return <FinancePaymentInboxPage />

    case '/ocr':
      return <OcrScanPage />

    case '/analytics':
      return <SchedulingAnalyticsPage />

    case '/versions':
      return <VersionsPage />

    case '/profile':
      return <ProfilePage />

    case '/settings/ai-providers':
      return <LlmProvidersPage />

    case '/platform':
      return <PlatformDashboardPage />

    case '/platform/schools':
      return <PlatformSchoolsPage />

    case '/platform/schools/detail':
      return <PlatformSchoolDetailPage />

    case '/platform/requests':
      return <PlatformRequestsPage />

    case '/platform/admins':
      return <PlatformAdminsPage />

    case '/platform/audit':
      return <PlatformAuditPage />

    case '/platform/email':
      return <PlatformEmailPage />

    default:
      return <NotFoundPage />
  }
}

/* -------------------------------------------------------------------------- */
/* Authenticated application                                                  */
/* -------------------------------------------------------------------------- */

function ProtectedRoute({
  pathname,
}: {
  pathname: string
}) {
  const isPlatformRoute =
    PLATFORM_ROUTES.has(pathname)

  const page = (
    <AppShell>
      <Suspense
        fallback={
          <PageLoader label="Loading page…" />
        }
      >
        {routeFor(pathname)}
      </Suspense>
    </AppShell>
  )

  return (
    <RequireAuth>
      {isPlatformRoute ? (
        <PlatformGuard>
          {page}
        </PlatformGuard>
      ) : (
        <AccessGate>
          {page}
        </AccessGate>
      )}
    </RequireAuth>
  )
}

/* -------------------------------------------------------------------------- */
/* Application routes                                                         */
/* -------------------------------------------------------------------------- */

function Routes() {
  const {
    pathname,
  } = useRouter()

  const path = normalisePath(pathname)

  /* Public routes */
  if (PUBLIC_ROUTES.has(path)) {
    switch (path) {
      case '/login':
        return (
          <RedirectIfSignedIn>
            <LoginPage />
          </RedirectIfSignedIn>
        )

      case '/signup':
        return (
          <RedirectIfSignedIn>
            <SignUpPage />
          </RedirectIfSignedIn>
        )

      case '/forgot-password':
        return (
          <RedirectIfSignedIn>
            <ForgotPasswordPage />
          </RedirectIfSignedIn>
        )

      case '/reset-password':
        /*
         * Reset password must remain available while
         * recovery mode is active.
         */
        return (
          <RedirectIfSignedIn>
            <ResetPasswordPage />
          </RedirectIfSignedIn>
        )

      default:
        return <NotFoundPage />
    }
  }

  /* Everything else is authenticated. */
  return (
    <ProtectedRoute pathname={path} />
  )
}

/* -------------------------------------------------------------------------- */
/* Root application                                                           */
/* -------------------------------------------------------------------------- */

export default function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <AuthProvider>
          <PlatformSessionProvider>
            <Routes />
          </PlatformSessionProvider>
        </AuthProvider>
      </ToastProvider>
    </RouterProvider>
  )
}
```
