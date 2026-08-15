import type { ReactNode } from 'react'
import { Logo } from './Logo'
import { CalendarIcon, CheckIcon, LockIcon } from './icons'
import { Link } from '../lib/router'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <div className="auth-shell">
      <section className="auth-shell__brand">
        <div className="auth-shell__brand-inner">
          <Link className="auth-shell__logo" to="/" aria-label="Back to Phikila home">
            <Logo size={40} tone="dark" />
          </Link>

          <div className="auth-shell__brand-content">
            <p className="auth-shell__eyebrow">One connected school operating system</p>
            <h1 className="auth-shell__wordmark">Run your school from one clear place.</h1>
            <p className="auth-shell__intro">
              Bring the people, plans, and information behind every school day together in a workspace your team can trust.
            </p>

            <ul className="auth-shell__benefits" aria-label="Phikila platform benefits">
              <li>
                <span><CheckIcon /></span>
                <div><strong>Connected school records</strong><small>Keep essential information structured and ready.</small></div>
              </li>
              <li>
                <span><CalendarIcon /></span>
                <div><strong>Clearer daily operations</strong><small>Coordinate academics, schedules, and attendance.</small></div>
              </li>
              <li>
                <span><LockIcon /></span>
                <div><strong>Responsible access</strong><small>Give each person an appropriate workspace.</small></div>
              </li>
            </ul>
          </div>

          <div className="auth-shell__brand-footer">
            <span className="auth-shell__brand-status"><i /> Secure account access</span>
            <span>Phikila School Management System</span>
          </div>
        </div>
      </section>

      <main className="auth-shell__panel" id="main-content">
        <div className="auth-shell__panel-inner">
          <Link className="auth-shell__back" to="/">← Back to home</Link>
          <div className={`auth-card ${wide ? 'auth-card--wide' : ''}`.trim()}>
            <header className="auth-card__header">
              <span className="auth-card__kicker">Welcome to Phikila</span>
              <h2 className="auth-card__title">{title}</h2>
              <p className="auth-card__subtitle">{subtitle}</p>
            </header>
            {children}
          </div>
          {footer && <div className={`auth-shell__footer ${wide ? 'auth-shell__footer--wide' : ''}`.trim()}>{footer}</div>}
        </div>
      </main>
    </div>
  )
}
