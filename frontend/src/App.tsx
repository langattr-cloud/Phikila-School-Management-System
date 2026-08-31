import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { PlatformSessionProvider, usePlatformSession } from './lib/session'
import { RouterProvider, normalisePath, useNavigate, useRouter } from './lib/router'
import { ToastProvider } from './components/Toast'
import { AppShell } from './components/AppShell'
import { FullPageLoader } from './components/States'
import { TimetableAppearanceEditor, type SelectedCell } from './components/TimetableAppearanceEditor'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { SignUpPage } from './pages/SignUpPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { NotFoundPage } from './pages/StatusPages'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const TimetablePage = lazy(() => import('./pages/EnhancedTimetablePage').then(m => ({ default: m.EnhancedTimetablePage })))
const MyTimetablePage = lazy(() => import('./pages/MyTimetablePage').then(m => ({ default: m.MyTimetablePage })))
const PeriodsPage = lazy(() => import('./pages/PeriodsPage').then(m => ({ default: m.PeriodsPage })))
const TeachersPage = lazy(() => import('./pages/Teachers').then(m => ({ default: m.default })))
const SubjectsPage = lazy(() => import('./pages/Subjects').then(m => ({ default: m.default })))
const SetupPage = lazy(() => import('./pages/SetupPage').then(m => ({ default: m.SetupPage })))
const SchoolPage = lazy(() => import('./pages/SchoolPage').then(m => ({ default: m.SchoolPage })))
const AcademicsPage = lazy(() => import('./pages/AcademicsPage').then(m => ({ default: m.AcademicsPage })))
const LevelsPage = lazy(() => import('./pages/LevelsPage').then(m => ({ default: m.LevelsPage })))
const GradesPage = lazy(() => import('./pages/GradesPage').then(m => ({ default: m.GradesPage })))
const StreamsPage = lazy(() => import('./pages/StreamsPage').then(m => ({ default: m.StreamsPage })))
const AcademicSetupWizardPage = lazy(() => import('./pages/AcademicSetupWizardPage').then(m => ({ default: m.AcademicSetupWizardPage })))
const RequirementsPage = lazy(() => import('./pages/RequirementsPage').then(m => ({ default: m.RequirementsPage })))
const ConstraintsPage = lazy(() => import('./pages/ConstraintsPage').then(m => ({ default: m.ConstraintsPage })))
const TimeOffPage = lazy(() => import('./pages/TimeOffPage').then(m => ({ default: m.TimeOffPage })))
const GeneratePage = lazy(() => import('./pages/GeneratePage').then(m => ({ default: m.GeneratePage })))
const CopilotPage = lazy(() => import('./pages/CopilotPage').then(m => ({ default: m.CopilotPage })))
const StudentsPage = lazy(() => import('./pages/Students').then(m => ({ default: m.default })))
const AttendancePage = lazy(() => import('./pages/Attendance').then(m => ({ default: m.default })))
const ExaminationsPage = lazy(() => import('./pages/Examinations').then(m => ({ default: m.default })))
const ExaminationLevelsPage = lazy(() => import('./pages/ExaminationLevelsPage').then(m => ({ default: m.ExaminationLevelsPage })))
const MarkAccessPage = lazy(() => import('./pages/MarkAccessPage').then(m => ({ default: m.default })))
const ReportCardPage = lazy(() => import('./pages/ReportCardPage').then(m => ({ default: m.default })))
const ClassResultsPage = lazy(() => import('./pages/ClassResultsPage').then(m => ({ default: m.default })))
const FinancePage = lazy(() => import('./pages/Finance').then(m => ({ default: m.default })))
const FinancePaymentInboxPage = lazy(() => import('./pages/FinancePaymentInbox').then(m => ({ default: m.default })))
const OcrScanPage = lazy(() => import('./pages/OcrScanPage').then(m => ({ default: m.OcrScanPage })))
const SchedulingAnalyticsPage = lazy(() => import('./pages/SchedulingAnalyticsPage').then(m => ({ default: m.SchedulingAnalyticsPage })))
const VersionsPage = lazy(() => import('./pages/VersionsPage').then(m => ({ default: m.VersionsPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const LlmProvidersPage = lazy(() => import('./pages/LlmProvidersPage').then(m => ({ default: m.LlmProvidersPage })))
const PlatformDashboardPage = lazy(() => import('./pages/PlatformPage').then(m => ({ default: m.PlatformDashboardPage })))
const PlatformSchoolsPage = lazy(() => import('./pages/PlatformPage').then(m => ({ default: m.PlatformSchoolsPage })))
const PlatformSchoolDetailPage = lazy(() => import('./pages/PlatformPage').then(m => ({ default: m.PlatformSchoolDetailPage })))
const PlatformRequestsPage = lazy(() => import('./pages/PlatformPage').then(m => ({ default: m.PlatformRequestsPage })))
const PlatformAdminsPage = lazy(() => import('./pages/PlatformPage').then(m => ({ default: m.PlatformAdminsPage })))
const PlatformAuditPage = lazy(() => import('./pages/PlatformAuditPage').then(m => ({ default: m.PlatformAuditPage })))
const AwaitingApprovalPage = lazy(() => import('./pages/AwaitingApprovalPage').then(m => ({ default: m.AwaitingApprovalPage })))

const PUBLIC_ROUTES = new Set(['/login', '/signup', '/forgot-password', '/reset-password'])

function RequireAuth({ children }: { children: ReactNode }) { const { session, initialising } = useAuth(); const { pathname, search, hash } = useRouter(); const navigate = useNavigate(); useEffect(() => { if (initialising || session) return; navigate(`/login?notice=session-expired&next=${encodeURIComponent(`${pathname}${search}${hash}`)}`, { replace: true }) }, [initialising, session, pathname, search, hash, navigate]); if (initialising) return <FullPageLoader label="Restoring your session…" />; if (!session) return <FullPageLoader label="Redirecting to sign in…" />; return <>{children}</> }
function RedirectIfSignedIn({ children }: { children: ReactNode }) { const { session, initialising, recoveryMode } = useAuth(); const navigate = useNavigate(); const { pathname } = useRouter(); const shouldRedirect = !initialising && Boolean(session) && !recoveryMode && normalisePath(pathname) !== '/reset-password'; useEffect(() => { if (shouldRedirect) navigate('/', { replace: true }) }, [shouldRedirect, navigate]); if (initialising) return <FullPageLoader label="Checking your session…" />; if (shouldRedirect) return <FullPageLoader label="Taking you to your dashboard…" />; return <>{children}</> }
function AccessGate({ children }: { children: ReactNode }) { const { session, loading, error } = usePlatformSession(); if (loading) return <FullPageLoader label="Checking your access…" />; if (error) return <>{children}</>; if (session && !session.has_access) return <Suspense fallback={<FullPageLoader label="Loading…" />}><AwaitingApprovalPage /></Suspense>; return <>{children}</> }

function TimetableCellToolbar() {
  const { pathname } = useRouter()
  const route = normalisePath(pathname)
  const isTimetable = route === '/timetable' || route === '/my-timetable'
  const [open, setOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!isTimetable) return
    let lastPoint = { x: window.innerWidth / 2, y: 120 }
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
    const show = (detail: SelectedCell, point = lastPoint) => {
      setSelectedCell(detail)
      setPosition({ x: clamp(point.x, 18, window.innerWidth - 18), y: clamp(point.y, 18, window.innerHeight - 72) })
      setOpen(true)
    }
    const onPointerDown = (event: PointerEvent) => {
      lastPoint = { x: event.clientX, y: event.clientY }
      const target = event.target as HTMLElement | null
      const lesson = target?.closest('.lesson-card')
      const cell = target?.closest('.timetable__cell, .timetable__whole-slot')
      if (!lesson && !cell) return
      if (event.button === 2) event.preventDefault()
      if (lesson) return
      const element = cell as HTMLElement
      const label = element.getAttribute('aria-label') || 'Selected timetable cell'
      const type: SelectedCell['type'] = element.classList.contains('timetable__whole-slot') ? 'lesson' : 'period'
      show({ type, label })
    }
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.lesson-card, .timetable__cell, .timetable__whole-slot')) return
      event.preventDefault()
      lastPoint = { x: event.clientX, y: event.clientY }
    }
    const onSelected = (event: Event) => {
      const detail = (event as CustomEvent<SelectedCell>).detail
      if (detail) show(detail)
    }
    const onOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-timetable-context-toolbar], [data-timetable-appearance-editor]')) return
      setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('phikila:timetable-cell-selected', onSelected)
    document.addEventListener('pointerdown', onOutside)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('phikila:timetable-cell-selected', onSelected)
      document.removeEventListener('pointerdown', onOutside)
    }
  }, [isTimetable])

  if (!isTimetable) return null
  const openEditor = () => { setOpen(false); setEditorOpen(true) }
  return <>
    {open && selectedCell && <div data-timetable-context-toolbar style={{ position: 'fixed', left: position.x, top: position.y, transform: 'translate(-50%, 10px)', zIndex: 1200, display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 10, background: 'var(--surface, #fff)', border: '1px solid var(--border, #d8dee8)', boxShadow: '0 10px 28px rgba(15,23,42,.18)', maxWidth: 'calc(100vw - 24px)' }}>
      <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600 }} title={selectedCell.label}>{selectedCell.label}</span>
      <button type="button" className="button button--secondary button--sm" onClick={openEditor}>Format</button>
      <button type="button" className="button button--ghost button--sm" onClick={() => setOpen(false)} aria-label="Close">×</button>
    </div>}
    <div data-timetable-appearance-editor><TimetableAppearanceEditor open={editorOpen} onClose={() => setEditorOpen(false)} selectedCell={selectedCell} /></div>
  </>
}

function routeFor(pathname: string): ReactNode { switch (pathname) {
case '/': return <DashboardPage />; case '/timetable': return <TimetablePage />; case '/my-timetable': return <MyTimetablePage />; case '/setup/periods': return <PeriodsPage />; case '/setup/teachers': return <TeachersPage />; case '/setup/subjects': return <SubjectsPage />; case '/setup/rooms': return <SetupPage kind="rooms" />; case '/setup/school': return <SchoolPage />; case '/setup/academic-years': return <AcademicsPage />; case '/setup/levels': return <LevelsPage />; case '/setup/grades': return <GradesPage />; case '/setup/streams': return <StreamsPage />; case '/setup/academic-setup': return <AcademicSetupWizardPage />; case '/scheduling/requirements': return <RequirementsPage />; case '/scheduling/constraints': return <ConstraintsPage />; case '/scheduling/time-off': return <TimeOffPage />; case '/scheduling/generate': return <GeneratePage />; case '/scheduling/copilot': return <CopilotPage />; case '/students': return <StudentsPage />; case '/attendance': return <AttendancePage />; case '/examinations': return <ExaminationsPage />; case '/examinations/setup': return <ExaminationsPage />; case '/examinations/levels': return <ExaminationLevelsPage />; case '/examinations/marks-access': return <MarkAccessPage />; case '/examinations/report-card': return <ReportCardPage />; case '/examinations/class-results': return <ClassResultsPage />; case '/finance': return <FinancePage />; case '/finance/payment-inbox': return <FinancePaymentInboxPage />; case '/ocr': return <OcrScanPage />; case '/analytics': return <SchedulingAnalyticsPage />; case '/versions': return <VersionsPage />; case '/profile': return <ProfilePage />; case '/settings/ai-providers': return <LlmProvidersPage />; case '/platform': return <PlatformDashboardPage />; case '/platform/schools': return <PlatformSchoolsPage />; case '/platform/schools/detail': return <PlatformSchoolDetailPage />; case '/platform/requests': return <PlatformRequestsPage />; case '/platform/admins': return <PlatformAdminsPage />; case '/platform/audit': return <PlatformAuditPage />; default: return <NotFoundPage /> } }
function ProtectedRoutes({ pathname }: { pathname: string }) { return <RequireAuth><AccessGate><AppShell><Suspense fallback={<FullPageLoader label="Loading page…" />}>{routeFor(pathname)}</Suspense><TimetableCellToolbar /></AppShell></AccessGate></RequireAuth> }
function LandingRedirect() { const { session, initialising } = useAuth(); if (initialising) return <FullPageLoader label="Checking your session…" />; if (!session) return <LandingPage />; return <ProtectedRoutes pathname="/" /> }
function Routes() { const { pathname } = useRouter(); const path = normalisePath(pathname); if (PUBLIC_ROUTES.has(path)) { const publicPage = path === '/login' ? <LoginPage /> : path === '/signup' ? <SignUpPage /> : path === '/forgot-password' ? <ForgotPasswordPage /> : path === '/reset-password' ? <ResetPasswordPage /> : <NotFoundPage />; return <RedirectIfSignedIn>{publicPage}</RedirectIfSignedIn> } if (path === '/') return <LandingRedirect />; return <ProtectedRoutes pathname={path} /> }
export default function App() { return <RouterProvider><ToastProvider><AuthProvider><PlatformSessionProvider><Routes /></PlatformSessionProvider></AuthProvider></ToastProvider></RouterProvider> }
