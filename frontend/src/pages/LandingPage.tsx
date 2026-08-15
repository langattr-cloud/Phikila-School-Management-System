import { useEffect } from 'react'
import { Link } from '../lib/router'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../components/ThemeToggle'
import { CalendarIcon, CheckIcon, LayersIcon, SchoolIcon, SparkIcon, UserIcon } from '../components/icons'

const features = [
  { icon: <SchoolIcon />, title: 'Student management', text: 'Keep learner records, classes and school activity in one connected workspace.' },
  { icon: <CalendarIcon />, title: 'Smart timetables', text: 'Build conflict-aware schedules with constraints, requirements and solver-assisted generation.' },
  { icon: <LayersIcon />, title: 'Academic operations', text: 'Organise teachers, subjects, rooms, classes and the academic calendar without fragmented tools.' },
  { icon: <SparkIcon />, title: 'AI Copilot', text: 'Give administrators a practical AI assistant for school operations and insights.' },
]

const proof = ['Multi-school ready', 'Role-based access', 'Secure cloud architecture', 'Scheduling automation']

export function LandingPage() {
  useEffect(() => {
    document.title = 'Phikila · School Management System'
  }, [])

  return (
    <div className="landing-shell">
      <div className="aurora-field" aria-hidden="true">
        <span className="aurora-orb aurora-orb--one" />
        <span className="aurora-orb aurora-orb--two" />
        <span className="aurora-orb aurora-orb--three" />
      </div>

      <header className="landing-nav">
        <Link className="landing-brand" to="/" aria-label="Phikila home">
          <Logo size={44} showTagline={false} />
          <span><strong>Phikila</strong><small>School Management System</small></span>
        </Link>
        <nav className="landing-links" aria-label="Landing page">
          <a href="#features">Features</a>
          <a href="#solutions">Solutions</a>
          <a href="#about">About</a>
        </nav>
        <div className="landing-nav__actions">
          <ThemeToggle />
          <Link className="button button--primary landing-cta" to="/login">Get started</Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <p className="eyebrow">Education · Technology · A brighter future</p>
            <h1>Smarter schools.<br /><span>Brighter futures.</span></h1>
            <p className="landing-hero__lead">
              Phikila brings school administration, academics, timetables and intelligent workflows together in one modern platform.
            </p>
            <div className="landing-hero__actions">
              <Link className="button button--primary button--lg" to="/login">Enter Phikila <span aria-hidden="true">→</span></Link>
              <a className="button button--secondary button--lg" href="#features">Explore features</a>
            </div>
            <div className="landing-proof" aria-label="Platform capabilities">
              {proof.map((item) => <span key={item}><CheckIcon width={16} height={16} />{item}</span>)}
            </div>
          </div>

          <div className="landing-hero__visual glass-panel" aria-label="Phikila platform preview">
            <div className="landing-preview__top">
              <Logo size={38} showTagline={false} />
              <span className="status-pill"><span /> Live workspace</span>
            </div>
            <div className="landing-preview__headline">
              <div><span className="muted-label">Today at your school</span><h2>Everything in one view.</h2></div>
              <span className="preview-avatar">P</span>
            </div>
            <div className="landing-metrics">
              <Metric label="Students" value="1,248" icon={<UserIcon />} />
              <Metric label="Teachers" value="86" icon={<SchoolIcon />} />
              <Metric label="Classes" value="42" icon={<LayersIcon />} />
              <Metric label="Attendance" value="94.2%" icon={<CheckIcon />} />
            </div>
            <div className="landing-preview__grid">
              <div className="preview-card preview-card--schedule">
                <div className="preview-card__head"><strong>Today's timetable</strong><span>View all →</span></div>
                {['08:00  Mathematics · Form 3A', '09:00  Biology · Form 2B', '10:00  English · Form 4A', '11:00  Chemistry · Form 3B'].map((row) => <div className="preview-row" key={row}><span>{row.slice(0, 5)}</span><strong>{row.slice(7)}</strong></div>)}
              </div>
              <div className="preview-card">
                <div className="preview-card__head"><strong>Attention</strong><span>4 items</span></div>
                <div className="attention-row"><b>12</b><span>Access requests pending</span></div>
                <div className="attention-row"><b>4</b><span>Timetable conflicts</span></div>
                <div className="attention-row"><b>8</b><span>Attendance issues</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-trust glass-panel" id="about">
          <span>Built for the full school operation</span>
          <div>{['Academics', 'People', 'Attendance', 'Examinations', 'Timetable', 'Finance', 'Reports', 'Copilot'].map((item) => <b key={item}>{item}</b>)}</div>
        </section>

        <section className="landing-section" id="features">
          <div className="section-intro"><p className="eyebrow">One platform</p><h2>Everything your school needs to run clearly.</h2><p>Phikila connects the daily work of administrators, teachers and school leaders without forcing them across disconnected systems.</p></div>
          <div className="feature-grid">{features.map((feature) => <article className="glass-card feature-card" key={feature.title}><span className="feature-card__icon">{feature.icon}</span><h3>{feature.title}</h3><p>{feature.text}</p><span className="feature-card__arrow">Explore →</span></article>)}</div>
        </section>

        <section className="landing-solution" id="solutions">
          <div className="glass-panel landing-solution__card">
            <div><p className="eyebrow">Built around your school</p><h2>From setup to scheduling, the system stays connected.</h2><p>Manage your school structure, configure scheduling rules, generate timetables and keep the operational picture visible from one dashboard.</p></div>
            <div className="solution-points"><span><CheckIcon /> School-wide data</span><span><CheckIcon /> Constraint-aware scheduling</span><span><CheckIcon /> Multi-school administration</span><span><CheckIcon /> AI-assisted workflows</span></div>
          </div>
        </section>

        <section className="landing-final"><p className="eyebrow">Ready when your school is</p><h2>Make school operations simpler.</h2><p>Start with a clear workspace for the people, academics and schedules that keep your school moving.</p><Link className="button button--primary button--lg" to="/login">Get started with Phikila →</Link></section>
      </main>

      <footer className="landing-footer"><Logo size={34} showTagline={false} /><span>© {new Date().getFullYear()} Phikila School Management System</span><span>Smarter schools. Brighter futures.</span></footer>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="preview-metric"><span>{icon}</span><small>{label}</small><strong>{value}</strong><em>↗</em></div>
}
