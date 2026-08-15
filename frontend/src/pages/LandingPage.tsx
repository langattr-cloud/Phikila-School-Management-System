import { useEffect, useState, type ReactNode } from 'react'
import { LogoMark } from '../components/Logo'
import {
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  DashboardIcon,
  GridIcon,
  LayersIcon,
  LockIcon,
  SchoolIcon,
  SparkIcon,
  UserIcon,
} from '../components/icons'
import { Link } from '../lib/router'
import { api } from '../lib/api'

type Feature = {
  icon: ReactNode
  eyebrow: string
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: <CalendarIcon />,
    eyebrow: 'Scheduling',
    title: 'Build timetables with confidence',
    description: 'Bring periods, rooms, teachers, and constraints together before publishing a schedule.',
  },
  {
    icon: <UserIcon />,
    eyebrow: 'People',
    title: 'Keep every learner record organised',
    description: 'Manage student enrolment, class assignments, and staff information from one reliable workspace.',
  },
  {
    icon: <LayersIcon />,
    eyebrow: 'Academics',
    title: 'Structure the academic year clearly',
    description: 'Set up years, terms, levels, streams, subjects, and teaching requirements without scattered files.',
  },
  {
    icon: <CheckIcon />,
    eyebrow: 'Daily operations',
    title: 'Make attendance easier to act on',
    description: 'Capture class attendance consistently and give school teams a clearer view of daily participation.',
  },
  {
    icon: <GridIcon />,
    eyebrow: 'Performance',
    title: 'Turn results into useful insight',
    description: 'Record examinations, review performance, and prepare reports that support better decisions.',
  },
  {
    icon: <SparkIcon />,
    eyebrow: 'Productivity',
    title: 'Move repetitive work forward faster',
    description: 'Use document scanning, scheduling assistance, and connected workflows to reduce administrative effort.',
  },
]

const OPERATIONS = [
  { label: 'School setup', icon: <SchoolIcon /> },
  { label: 'Academic structure', icon: <LayersIcon /> },
  { label: 'Timetables', icon: <CalendarIcon /> },
  { label: 'Students & staff', icon: <UserIcon /> },
  { label: 'Attendance', icon: <CheckIcon /> },
  { label: 'Reports & insight', icon: <GridIcon /> },
]

export function LandingPage() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    document.title = 'Phikila — School operations, in one place'
    api.health()
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'))
  }, [])

  return (
    <div className="landing">
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <header className="landing__hero">
        <nav className="landing__nav" aria-label="Main navigation">
          <a className="landing__brand" href="#top" aria-label="Phikila home">
            <LogoMark size={38} tone="dark" />
            <span className="landing__brand-copy">
              <span className="landing__brand-name">PHIKILA</span>
              <span className="landing__brand-tagline">School Management System</span>
            </span>
          </a>

          <div className="landing__nav-links">
            <a href="#platform">Platform</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#workflow">How it works</a>
          </div>

          <div className="landing__nav-actions">
            <Link className="landing__sign-in" to="/login">Sign in</Link>
            <Link className="landing__nav-cta" to="/signup">
              Get started <ChevronRightIcon width={16} height={16} />
            </Link>
          </div>
        </nav>

        <main id="main-content">
          <div className="landing__hero-grid" id="top">
            <div className="landing__hero-copy">
              <div className="landing__announcement">
                <span className="landing__announcement-dot" />
                One connected school operating system
              </div>
              <h1 className="landing__title">
                School operations,<br />
                <span>finally in sync.</span>
              </h1>
              <p className="landing__subtitle">
                Bring records, academics, scheduling, attendance, finance, and reporting into one clear system—so your team can spend less time chasing information and more time moving the school forward.
              </p>
              <div className="landing__cta">
                <Link className="landing__button landing__button--primary" to="/signup">
                  Create your workspace <ChevronRightIcon width={18} height={18} />
                </Link>
                <a className="landing__button landing__button--secondary" href="#platform">
                  Explore the platform
                </a>
              </div>
              <div className="landing__hero-points" aria-label="Platform highlights">
                <span><CheckIcon width={15} height={15} /> Guided setup</span>
                <span><CheckIcon width={15} height={15} /> Role-aware access</span>
                <span><CheckIcon width={15} height={15} /> One source of truth</span>
              </div>
            </div>

            <div className="landing__product-stage" aria-label="Illustrative preview of the Phikila dashboard">
              <div className="landing__stage-glow" />
              <div className="product-preview">
                <div className="product-preview__topbar">
                  <div className="product-preview__mini-brand">
                    <LogoMark size={22} tone="light" />
                    <span>Phikila</span>
                  </div>
                  <div className="product-preview__top-actions">
                    <span className="product-preview__search">Search</span>
                    <span className="product-preview__avatar">AM</span>
                  </div>
                </div>
                <div className="product-preview__body">
                  <aside className="product-preview__sidebar" aria-hidden="true">
                    <span className="product-preview__nav-item product-preview__nav-item--active"><DashboardIcon /> Overview</span>
                    <span className="product-preview__nav-item"><CalendarIcon /> Timetable</span>
                    <span className="product-preview__nav-item"><UserIcon /> Students</span>
                    <span className="product-preview__nav-item"><CheckIcon /> Attendance</span>
                    <span className="product-preview__nav-item"><GridIcon /> Reports</span>
                  </aside>
                  <div className="product-preview__workspace">
                    <div className="product-preview__heading">
                      <div>
                        <span className="product-preview__kicker">Monday overview</span>
                        <strong>Good morning, Admin</strong>
                      </div>
                      <span className="product-preview__term">Term 2 · Week 6</span>
                    </div>
                    <div className="product-preview__metrics">
                      <div className="preview-metric">
                        <span>Students</span><strong>1,248</strong><small>Active enrolment</small>
                      </div>
                      <div className="preview-metric">
                        <span>Attendance</span><strong>94.8%</strong><small className="preview-metric__positive">↑ 1.6% this week</small>
                      </div>
                      <div className="preview-metric">
                        <span>Staff</span><strong>86</strong><small>4 departments</small>
                      </div>
                    </div>
                    <div className="product-preview__panels">
                      <div className="preview-panel preview-panel--schedule">
                        <div className="preview-panel__header"><strong>Today&apos;s schedule</strong><span>View all</span></div>
                        <div className="preview-lesson"><time>08:00</time><i className="preview-lesson__line preview-lesson__line--green" /><div><strong>Mathematics</strong><span>Grade 9 · Room 12</span></div></div>
                        <div className="preview-lesson"><time>09:20</time><i className="preview-lesson__line preview-lesson__line--gold" /><div><strong>English Language</strong><span>Grade 8 · Room 04</span></div></div>
                        <div className="preview-lesson"><time>11:00</time><i className="preview-lesson__line preview-lesson__line--blue" /><div><strong>Integrated Science</strong><span>Grade 10 · Lab 02</span></div></div>
                      </div>
                      <div className="preview-panel preview-panel--attendance">
                        <div className="preview-panel__header"><strong>Attendance</strong><span>Today</span></div>
                        <div className="preview-ring"><span><strong>94.8%</strong><small>Present</small></span></div>
                        <div className="preview-bars" aria-hidden="true">
                          <i style={{ height: '48%' }} /><i style={{ height: '64%' }} /><i style={{ height: '57%' }} /><i style={{ height: '78%' }} /><i style={{ height: '88%' }} /><i style={{ height: '73%' }} /><i style={{ height: '94%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="landing__floating-card landing__floating-card--top">
                <span className="landing__floating-icon"><CheckIcon width={16} height={16} /></span>
                <span><strong>Schedule ready</strong><small>No conflicts detected</small></span>
              </div>
              <div className="landing__floating-card landing__floating-card--bottom">
                <span className="landing__floating-icon landing__floating-icon--gold"><SparkIcon width={16} height={16} /></span>
                <span><strong>Daily overview</strong><small>Everything in one view</small></span>
              </div>
            </div>
          </div>
        </main>
      </header>

      <section className="landing__continuity" aria-label="Connected school operations">
        <p>One source of truth across your school</p>
        <div className="landing__continuity-items">
          {OPERATIONS.map((item) => (
            <span key={item.label}>{item.icon}{item.label}</span>
          ))}
        </div>
      </section>

      <section className="landing__platform" id="platform">
        <div className="landing__section-heading">
          <p className="landing__eyebrow">Built for operational clarity</p>
          <h2>Run the whole school without losing the details.</h2>
          <p>Phikila gives every workflow a proper home, while keeping the information your team depends on connected and easy to understand.</p>
        </div>

        <div className="landing__bento">
          <article className="landing__bento-card landing__bento-card--wide landing__bento-card--dark">
            <div className="landing__bento-copy">
              <span className="landing__bento-icon"><CalendarIcon /></span>
              <p className="landing__bento-label">Smarter scheduling</p>
              <h3>Build a timetable around real school constraints.</h3>
              <p>Coordinate teaching requirements, rooms, periods, and availability in one structured workflow.</p>
            </div>
            <div className="mini-timetable" aria-hidden="true">
              <div className="mini-timetable__days"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span></div>
              <div className="mini-timetable__grid">
                <span className="mini-slot mini-slot--emerald">Math <small>08:00</small></span>
                <span className="mini-slot mini-slot--blue">English <small>08:00</small></span>
                <span />
                <span className="mini-slot mini-slot--gold">Science <small>09:20</small></span>
                <span />
                <span className="mini-slot mini-slot--gold">Science <small>09:20</small></span>
                <span className="mini-slot mini-slot--emerald">Math <small>10:40</small></span>
                <span />
              </div>
            </div>
          </article>

          <article className="landing__bento-card landing__bento-card--records">
            <span className="landing__bento-icon landing__bento-icon--light"><UserIcon /></span>
            <p className="landing__bento-label">Connected records</p>
            <h3>A complete view of your school community.</h3>
            <p>Keep student and staff information structured, current, and ready for the next task.</p>
            <div className="record-stack" aria-hidden="true">
              <div><span className="record-stack__avatar">AN</span><p><strong>Amara N.</strong><small>Grade 9 · East</small></p><em>Active</em></div>
              <div><span className="record-stack__avatar record-stack__avatar--gold">KM</span><p><strong>Kelvin M.</strong><small>Grade 10 · North</small></p><em>Active</em></div>
              <div><span className="record-stack__avatar record-stack__avatar--blue">LW</span><p><strong>Linet W.</strong><small>Grade 8 · West</small></p><em>Active</em></div>
            </div>
          </article>

          <article className="landing__bento-card landing__bento-card--insight">
            <span className="landing__bento-icon landing__bento-icon--light"><GridIcon /></span>
            <p className="landing__bento-label">Decision-ready insight</p>
            <h3>See what needs attention sooner.</h3>
            <p>Bring attendance, academic performance, and school operations into a clearer daily picture.</p>
            <div className="insight-chart" aria-hidden="true">
              <div className="insight-chart__legend"><span>Term progress</span><strong>On track</strong></div>
              <div className="insight-chart__bars"><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
          </article>
        </div>
      </section>

      <section className="landing__capabilities" id="capabilities">
        <div className="landing__section-heading landing__section-heading--left">
          <p className="landing__eyebrow">A platform that grows with the work</p>
          <h2>Every essential workflow. One consistent experience.</h2>
        </div>
        <div className="landing__feature-grid">
          {FEATURES.map((feature) => (
            <article className="landing__feature-card" key={feature.title}>
              <span className="landing__feature-icon">{feature.icon}</span>
              <div>
                <p className="landing__feature-eyebrow">{feature.eyebrow}</p>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing__workflow" id="workflow">
        <div className="landing__workflow-inner">
          <div className="landing__section-heading">
            <p className="landing__eyebrow landing__eyebrow--light">A clearer path from day one</p>
            <h2>Set up carefully. Operate confidently.</h2>
            <p>Phikila turns a complex school setup into a straightforward sequence your team can follow.</p>
          </div>
          <ol className="landing__steps">
            <li>
              <span className="landing__step-number">01</span>
              <div><h3>Build your foundation</h3><p>Add the school profile, academic calendar, levels, streams, staff, and subjects.</p></div>
            </li>
            <li>
              <span className="landing__step-number">02</span>
              <div><h3>Connect your workflows</h3><p>Bring students, teaching requirements, timetables, attendance, and assessments together.</p></div>
            </li>
            <li>
              <span className="landing__step-number">03</span>
              <div><h3>Run with a shared view</h3><p>Give the right people the context they need to keep daily operations moving.</p></div>
            </li>
          </ol>
        </div>
      </section>

      <section className="landing__trust">
        <div className="landing__trust-inner">
          <div className="landing__trust-mark"><LockIcon width={28} height={28} /></div>
          <div className="landing__trust-copy">
            <p className="landing__eyebrow">Designed for responsible access</p>
            <h2>Your school&apos;s information deserves a system built with care.</h2>
            <p>Secure authentication, role-aware access, and centralised administration help your team work from a more controlled and dependable foundation.</p>
          </div>
          <div className="landing__trust-points">
            <span><CheckIcon /> Controlled access requests</span>
            <span><CheckIcon /> Role-aware workspaces</span>
            <span><CheckIcon /> Centralised school records</span>
          </div>
        </div>
      </section>

      <section className="landing__final-cta">
        <div className="landing__final-cta-glow" />
        <div className="landing__final-cta-inner">
          <p className="landing__eyebrow landing__eyebrow--light">A better operating rhythm starts here</p>
          <h2>Give your school one clear place to move forward.</h2>
          <p>Set up your workspace and bring the people, plans, and information behind every school day together.</p>
          <div className="landing__cta landing__cta--centered">
            <Link className="landing__button landing__button--primary" to="/signup">
              Get started with Phikila <ChevronRightIcon width={18} height={18} />
            </Link>
            <Link className="landing__button landing__button--dark-outline" to="/login">Sign in</Link>
          </div>
        </div>
      </section>

      <footer className="landing__footer">
        <div className="landing__footer-main">
          <div className="landing__footer-brand">
            <span className="landing__brand">
              <LogoMark size={34} tone="dark" />
              <span className="landing__brand-copy">
                <span className="landing__brand-name">PHIKILA</span>
                <span className="landing__brand-tagline">School Management System</span>
              </span>
            </span>
            <p>A clearer operating system for modern school teams.</p>
          </div>
          <div className="landing__footer-links">
            <div><strong>Platform</strong><a href="#platform">Overview</a><a href="#capabilities">Capabilities</a><a href="#workflow">How it works</a></div>
            <div><strong>Access</strong><Link to="/login">Sign in</Link><Link to="/signup">Create account</Link></div>
          </div>
        </div>
        <div className="landing__footer-bottom">
          <p>© {new Date().getFullYear()} Phikila School Management System. All rights reserved.</p>
          <span className="landing__status" aria-live="polite">
            <i className={`status-dot status-dot--${apiStatus}`} />
            {apiStatus === 'checking' ? 'Checking system status' : apiStatus === 'online' ? 'All systems operational' : 'Status unavailable'}
          </span>
        </div>
      </footer>
    </div>
  )
}
