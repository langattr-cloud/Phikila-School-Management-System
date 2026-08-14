import type { ReactNode } from 'react'
import { LogoMark } from './Logo'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="auth-shell">
      <section className="auth-shell__brand">
        <div className="auth-shell__brand-inner">
          <LogoMark size={56} tone="dark" />
          <p className="eyebrow">School administration, made clear</p>
          <h1 className="auth-shell__wordmark">
            Phikila
            <span>School System</span>
          </h1>
          <p className="auth-shell__intro">
            One place for your school profile, academic years, terms, levels, and streams.
          </p>
        </div>
      </section>

      <main className="auth-shell__panel" id="main-content">
        <div className="card auth-card">
          <header className="auth-card__header">
            <h2 className="auth-card__title">{title}</h2>
            <p className="auth-card__subtitle">{subtitle}</p>
          </header>
          {children}
        </div>
        {footer && <div className="auth-shell__footer">{footer}</div>}
      </main>
    </div>
  )
}
