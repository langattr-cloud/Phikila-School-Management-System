import { useEffect, useState } from 'react'
import { LogoMark } from '../components/Logo'
import { Link } from '../lib/router'
import { api } from '../lib/api'

const FEATURES = [
  {
    icon: '📋',
    title: 'School Profile',
    desc: 'Store your school details, contact information, and branding in one secure place.',
  },
  {
    icon: '📅',
    title: 'Academic Years & Terms',
    desc: 'Manage academic years, terms, and levels with start and end dates.',
  },
  {
    icon: '🏫',
    title: 'Levels & Streams',
    desc: 'Organise your school into levels (e.g. Junior, Senior) and streams.',
  },
  {
    icon: '👩‍🏫',
    title: 'Teachers & Subjects',
    desc: 'Keep a complete staff directory and curriculum mapping.',
  },
  {
    icon: '🎓',
    title: 'Students',
    desc: 'Register students, track enrolment, and manage class assignments.',
  },
  {
    icon: '📊',
    title: 'Examinations & Reports',
    desc: 'Record exam results and generate performance reports.',
  },
]

export function LandingPage() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    document.title = 'Phikila School Management System'
    api.health()
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'))
  }, [])

  return (
    <div className="landing">
      {/* ---- Hero ---- */}
      <header className="landing__hero">
        <nav className="landing__nav">
          <span className="logo logo--dark">
            <LogoMark size={36} tone="dark" />
            <span className="logo__text">
              <span className="logo__word">PHIKILA</span>
              <span className="logo__sub">School System</span>
            </span>
          </span>
          <div className="landing__nav-actions">
            <Link className="button button--ghost button--sm" to="/login">
              Sign in
            </Link>
            <Link className="button button--primary button--sm" to="/signup">
              Get started
            </Link>
          </div>
        </nav>

        <div className="landing__hero-content">
          <p className="eyebrow">School administration, made clear</p>
          <h1 className="landing__title">
            One place for everything your school needs
          </h1>
          <p className="landing__subtitle">
            Phikila brings your school profile, academic years, terms, levels,
            teachers, students, and schedules together in a single, secure system
            your whole staff can use.
          </p>
          <div className="landing__cta">
            <Link className="button button--primary" to="/signup">
              Start for free
            </Link>
            <Link className="button button--secondary" to="/login">
              Sign in to your school
            </Link>
          </div>

          <div className="landing__status">
            <span className={`status-dot status-dot--${apiStatus}`} />
            <span className="landing__status-text">
              {apiStatus === 'checking'
                ? 'Checking system…'
                : apiStatus === 'online'
                  ? 'System online'
                  : 'System offline'}
            </span>
          </div>
        </div>
      </header>

      {/* ---- Features ---- */}
      <section className="landing__features">
        <div className="landing__features-inner">
          <h2 className="landing__section-title">Everything in one system</h2>
          <p className="landing__section-subtitle">
            From school profile to exam reports, Phikila covers every part of
            running your school.
          </p>
          <div className="landing__feature-grid">
            {FEATURES.map((f) => (
              <div className="landing__feature-card" key={f.title}>
                <span className="landing__feature-icon" aria-hidden="true">
                  {f.icon}
                </span>
                <h3 className="landing__feature-title">{f.title}</h3>
                <p className="landing__feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- CTA footer ---- */}
      <section className="landing__cta-section">
        <div className="landing__cta-inner">
          <h2 className="landing__cta-title">Ready to get started?</h2>
          <p className="landing__cta-text">
            Create your school's account in minutes. Free to start, no credit card
            required.
          </p>
          <Link className="button button--primary" to="/signup">
            Create your school account
          </Link>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="landing__footer">
        <span className="logo logo--dark logo--compact">
          <LogoMark size={22} tone="dark" />
          <span className="logo__text">
            <span className="logo__word">PHIKILA</span>
          </span>
        </span>
        <p className="landing__footer-text">
          © {new Date().getFullYear()} Phikila School Management System. All
          rights reserved.
        </p>
      </footer>
    </div>
  )
}
