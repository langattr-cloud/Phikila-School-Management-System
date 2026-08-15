import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from '../lib/router'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../components/ThemeToggle'
import { CalendarIcon, CheckIcon, LayersIcon, SchoolIcon, SparkIcon, UserIcon } from '../components/icons'
import './LandingPage.css'

type Feature = { icon: ReactNode; title: string; text: string; signal: string; details: string[] }
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }> }

const features: Feature[] = [
  { icon: <SchoolIcon />, title: 'Student management', text: 'Keep learner records, classes and school activity in one connected workspace.', signal: 'Connected learner records', details: ['Keep profiles, classes and activity connected instead of scattered across separate tools.', 'Make it easier for authorised staff to follow a learner from enrolment through progression.'] },
  { icon: <CalendarIcon />, title: 'Smart timetables', text: 'Build conflict-aware schedules with constraints, requirements and solver-assisted generation.', signal: 'Conflict-aware scheduling', details: ['Balance rooms, teachers, classes, periods and school requirements when building a timetable.', 'Surface conflicts early so administrators can make changes before publishing the schedule.'] },
  { icon: <LayersIcon />, title: 'Academic operations', text: 'Organise teachers, subjects, rooms, classes and the academic calendar without fragmented tools.', signal: 'One operational picture', details: ['Keep the school structure visible from people and subjects through rooms and academic periods.', 'Reduce duplicate setup work by keeping shared records in one connected workspace.'] },
  { icon: <SparkIcon />, title: 'AI Copilot', text: 'Give administrators a practical AI assistant for school operations and insights.', signal: 'Assisted decisions', details: ['Use AI support for operational questions, summaries and workflow guidance without leaving the platform.', 'Turn day-to-day school data into clearer next actions for administrators and leaders.'] },
]
const proof = ['Multi-school ready', 'Role-based access', 'Secure cloud architecture', 'Scheduling automation']
const insights = ['3 schedule conflicts are ready to review', 'Attendance is trending above the school target', '12 access requests need an administrator decision']

export function LandingPage() {
  const [activeFeature, setActiveFeature] = useState<Feature | null>(null)
  const [insightIndex, setInsightIndex] = useState(0)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPopup, setShowInstallPopup] = useState(false)
  const closeFeatureRef = useRef<HTMLButtonElement>(null)
  const closeInstallRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { document.title = 'Phikila · School Management System' }, [])
  useEffect(() => { const timer = window.setInterval(() => setInsightIndex((current) => (current + 1) % insights.length), 4200); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent); setShowInstallPopup(true) }
    const handleAppInstalled = () => { setInstallPrompt(null); setShowInstallPopup(false) }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    if (isStandalone) setShowInstallPopup(false)
    return () => { window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt); window.removeEventListener('appinstalled', handleAppInstalled) }
  }, [])
  useEffect(() => {
    if (!activeFeature && !showInstallPopup) { document.body.classList.remove('body--locked'); return }
    document.body.classList.add('body--locked')
    if (activeFeature) closeFeatureRef.current?.focus(); else closeInstallRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; if (activeFeature) setActiveFeature(null); else setShowInstallPopup(false) }
    window.addEventListener('keydown', handleKeyDown)
    return () => { document.body.classList.remove('body--locked'); window.removeEventListener('keydown', handleKeyDown) }
  }, [activeFeature, showInstallPopup])

  const handleInstall = async () => {
    if (!installPrompt) return
    try { await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === 'accepted') { setInstallPrompt(null); setShowInstallPopup(false) } } catch { setInstallPrompt(null); setShowInstallPopup(false) }
  }

  return <div className="landing-shell">
    <div className="aurora-field" aria-hidden="true"><span className="aurora-orb aurora-orb--one" /><span className="aurora-orb aurora-orb--two" /><span className="aurora-orb aurora-orb--three" /></div>
    <header className="landing-nav">
      <Link className="landing-brand" to="/" aria-label="Phikila home"><Logo size={44} showTagline={false} /><span><strong>Phikila</strong><small>School Management System</small></span></Link>
      <nav className="landing-links" aria-label="Landing page"><a href="#features">Features</a><a href="#solutions">Solutions</a><a href="#about">About</a></nav>
      <div className="landing-nav__actions">{installPrompt && <button className="button button--secondary landing-install-button" type="button" onClick={() => setShowInstallPopup(true)}>Install app</button>}<ThemeToggle /><Link className="button button--primary landing-cta" to="/login">Get started</Link></div>
    </header>
    <main>
      <section className="landing-hero">
        <div className="landing-hero__copy"><p className="eyebrow">Education · Technology · A brighter future</p><h1>Smarter schools.<br /><span>Brighter futures.</span></h1><p className="landing-hero__lead">Phikila brings school administration, academics, timetables and intelligent workflows together in one modern platform.</p><div className="landing-hero__actions"><Link className="button button--primary button--lg" to="/login">Enter Phikila <span aria-hidden="true">→</span></Link><a className="button button--secondary button--lg" href="#features">Explore features</a></div><div className="landing-proof" aria-label="Platform capabilities">{proof.map((item) => <span key={item}><CheckIcon width={16} height={16} />{item}</span>)}</div></div>
        <div className="landing-hero__visual glass-panel" aria-label="Phikila platform preview"><div className="landing-preview__top"><Logo size={38} showTagline={false} /><span className="status-pill"><span /> Live workspace</span></div><div className="landing-preview__headline"><div><span className="muted-label">Today at your school</span><h2>Everything in one view.</h2></div><span className="preview-avatar">P</span></div><div className="landing-intelligence-pill" aria-live="polite"><span className="landing-intelligence-pill__icon"><SparkIcon width={15} height={15} /></span><span>{insights[insightIndex]}</span><span className="landing-intelligence-pill__dot" aria-hidden="true" /></div><div className="landing-metrics"><Metric label="Students" value="1,248" icon={<UserIcon />} /><Metric label="Teachers" value="86" icon={<SchoolIcon />} /><Metric label="Classes" value="42" icon={<LayersIcon />} /><Metric label="Attendance" value="94.2%" icon={<CheckIcon />} /></div><div className="landing-preview__grid"><div className="preview-card preview-card--schedule"><div className="preview-card__head"><strong>Today's timetable</strong><span>View all →</span></div>{['08:00  Mathematics · Form 3A','09:00  Biology · Form 2B','10:00  English · Form 4A','11:00  Chemistry · Form 3B'].map((row) => <div className="preview-row" key={row}><span>{row.slice(0, 5)}</span><strong>{row.slice(7)}</strong></div>)}</div><div className="preview-card"><div className="preview-card__head"><strong>Attention</strong><span>4 items</span></div><div className="attention-row"><b>12</b><span>Access requests pending</span></div><div className="attention-row"><b>4</b><span>Timetable conflicts</span></div><div className="attention-row"><b>8</b><span>Attendance issues</span></div></div></div></div>
      </section>
      <section className="landing-trust glass-panel" id="about"><span>Built for the full school operation</span><div>{['Academics','People','Attendance','Examinations','Timetable','Finance','Reports','Copilot'].map((item) => <b key={item}>{item}</b>)}</div></section>
      <section className="landing-section" id="features"><div className="section-intro"><p className="eyebrow">One platform</p><h2>Everything your school needs to run clearly.</h2><p>Phikila connects the daily work of administrators, teachers and school leaders without forcing them across disconnected systems.</p></div><div className="feature-grid">{features.map((feature, index) => <article className="glass-card feature-card" key={feature.title} style={{ '--feature-delay': `${index * 90}ms` } as CSSProperties}><span className="feature-card__icon">{feature.icon}</span><div className="feature-card__signal"><span />{feature.signal}</div><h3>{feature.title}</h3><p>{feature.text}</p><button className="feature-card__explore" type="button" onClick={() => setActiveFeature(feature)}><span>Explore</span><span aria-hidden="true">→</span></button></article>)}</div></section>
      <section className="landing-solution" id="solutions"><div className="glass-panel landing-solution__card"><div><p className="eyebrow">Built around your school</p><h2>From setup to scheduling, the system stays connected.</h2><p>Manage your school structure, configure scheduling rules, generate timetables and keep the operational picture visible from one dashboard.</p></div><div className="solution-points"><span><CheckIcon /> School-wide data</span><span><CheckIcon /> Constraint-aware scheduling</span><span><CheckIcon /> Multi-school administration</span><span><CheckIcon /> AI-assisted workflows</span></div></div></section>
      <section className="landing-final"><p className="eyebrow">Ready when your school is</p><h2>Make school operations simpler.</h2><p>Start with a clear workspace for the people, academics and schedules that keep your school moving.</p><div className="landing-final__actions">{installPrompt && <button className="button button--secondary button--lg" type="button" onClick={() => setShowInstallPopup(true)}>Install on Android</button>}<Link className="button button--primary button--lg" to="/login">Get started with Phikila →</Link></div></section>
    </main>
    <footer className="landing-footer"><Logo size={34} showTagline={false} /><span>© {new Date().getFullYear()} Phikila School Management System</span><span>Smarter schools. Brighter futures.</span></footer>
    {activeFeature && <div className="feature-modal-overlay" role="presentation" onMouseDown={() => setActiveFeature(null)}><div className="feature-modal" role="dialog" aria-modal="true" aria-labelledby="feature-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="feature-modal__topline"><span className="feature-modal__eyebrow">Feature overview</span><button ref={closeFeatureRef} type="button" className="feature-modal__close" aria-label="Close feature description" onClick={() => setActiveFeature(null)}>×</button></div><div className="feature-modal__icon">{activeFeature.icon}</div><h2 id="feature-modal-title">{activeFeature.title}</h2><p className="feature-modal__lead">{activeFeature.text}</p><div className="feature-modal__details">{activeFeature.details.map((detail) => <div key={detail}><CheckIcon width={17} height={17} /><span>{detail}</span></div>)}</div><div className="feature-modal__actions"><button className="button button--secondary" type="button" onClick={() => setActiveFeature(null)}>Close</button><Link className="button button--primary" to="/login">See it in Phikila →</Link></div></div></div>}
    {showInstallPopup && installPrompt && <div className="install-modal-overlay" role="presentation" onMouseDown={() => setShowInstallPopup(false)}><div className="install-modal" role="dialog" aria-modal="true" aria-labelledby="install-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="install-modal__topline"><span className="install-modal__eyebrow">Android app</span><button ref={closeInstallRef} type="button" className="feature-modal__close" aria-label="Close install prompt" onClick={() => setShowInstallPopup(false)}>×</button></div><img className="install-modal__icon" src="/brand/phikila-logo-192.png" width="88" height="88" alt="Phikila" /><h2 id="install-modal-title">Install Phikila</h2><p>Install Phikila on your Android home screen for faster access, a dedicated app window and a more focused school workspace.</p><div className="install-modal__steps"><div><strong>1</strong><span>Tap <b>Install app</b>.</span></div><div><strong>2</strong><span>Confirm the Android install prompt.</span></div><div><strong>3</strong><span>Open Phikila from your home screen.</span></div></div><div className="install-modal__actions"><button className="button button--primary button--lg" type="button" onClick={handleInstall}>Install app</button><button className="button button--ghost" type="button" onClick={() => setShowInstallPopup(false)}>Not now</button></div><p className="install-modal__note">Your browser controls the final installation confirmation.</p></div></div>}
  </div>
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) { return <div className="preview-metric"><span>{icon}</span><small>{label}</small><strong>{value}</strong><em>↗</em></div> }
