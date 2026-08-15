import { useEffect, useState } from 'react'
import {
  CalendarDays,
  CalendarClock,
  GraduationCap,
  School,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { LogoMark } from '../components/Logo'
import { Link } from '../lib/router'
import { api } from '../lib/api'
import './LandingPage.css'

const FEATURES = [
  { icon: School, title: 'School Profile', desc: 'Keep your school identity, details, contacts, and configuration in one secure place.' },
  { icon: CalendarDays, title: 'Academic Calendar', desc: 'Manage academic years, terms, levels, and the structure behind your school day.' },
  { icon: UsersRound, title: 'Teachers & Subjects', desc: 'Connect your teaching team, subjects, classes, and curriculum structure.' },
  { icon: GraduationCap, title: 'Students', desc: 'Manage enrolment, class assignments, attendance, academics, and student records.' },
  { icon: CalendarClock, title: 'Timetable', desc: 'Build and manage schedules with rooms, teachers, constraints, and conflict visibility.' },
  { icon: Sparkles, title: 'Intelligence', desc: 'Use Phikila Copilot to understand scheduling operations and surface what needs attention.' },
]

export function LandingPage() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  useEffect(() => { document.title = 'Phikila — School Operations, Reimagined'; api.health().then(() => setApiStatus('online')).catch(() => setApiStatus('offline')) }, [])

  return <div className="landing">
    <header className="landing__hero">
      <nav className="landing__nav">
        <span className="logo logo--dark"><LogoMark size={36} tone="dark" /><span className="logo__text"><span className="logo__word">PHIKILA</span><span className="logo__sub">School System</span></span></span>
        <div className="landing__nav-actions"><Link className="button button--ghost button--sm" to="/login">Sign in</Link><Link className="button button--primary button--sm" to="/signup">Get started</Link></div>
      </nav>
      <div className="landing__hero-content">
        <h1 className="landing__title">School operations, reimagined.</h1>
        <p className="landing__subtitle">One intelligent platform for managing people, academics, schedules, and the daily operations that keep your school moving.</p>
        <div className="landing__cta"><Link className="button button--primary" to="/signup">Enter the future of school management →</Link><Link className="button button--secondary" to="/login">Sign in</Link></div>
        <div className="landing__status"><span className={`status-dot status-dot--${apiStatus}`} /><span>{apiStatus === 'checking' ? 'Checking system…' : apiStatus === 'online' ? 'Phikila systems online' : 'System unavailable'}</span></div>
      </div>
    </header>
    <section className="landing__features"><div className="landing__features-inner"><h2 className="landing__section-title">One system. Every operation.</h2><p className="landing__section-subtitle">A connected workspace designed for the people who run schools.</p><div className="landing__feature-grid">{FEATURES.map((feature) => { const Icon = feature.icon; return <article className="landing__feature-card" key={feature.title}><span className="landing__feature-icon" aria-hidden="true"><Icon size={24} strokeWidth={1.8} /></span><h3 className="landing__feature-title">{feature.title}</h3><p className="landing__feature-desc">{feature.desc}</p></article> })}</div></div></section>
    <section className="landing__cta-section"><div className="landing__cta-inner"><p className="eyebrow">PHIKILA INTELLIGENCE</p><h2 className="landing__cta-title">See what needs attention.</h2><p className="landing__cta-text">From timetable conflicts to daily operations, Phikila turns school data into clear actions.</p><Link className="button button--primary" to="/signup">Create your school account →</Link></div></section>
    <footer className="landing__footer"><span className="logo logo--dark logo--compact"><LogoMark size={22} tone="dark" /><span className="logo__text"><span className="logo__word">PHIKILA</span></span></span><p className="landing__footer-text">© {new Date().getFullYear()} Phikila School Management System.</p></footer>
  </div>
}
