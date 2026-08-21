import type { ReactNode } from 'react'
import { AlertIcon, InboxIcon, RefreshIcon } from './icons'

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <span className="spinner__ring" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  )
}

export function Skeleton({ width, height = '1rem' }: { width?: string; height?: string }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />
}

export function LoadingBlock({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} height="1.1rem" width={index % 3 === 2 ? '55%' : '100%'} />
      ))}
    </div>
  )
}

export function FullPageLoader({ label }: { label: string }) {
  return (
    // The visible text is the accessible name; the spinner stays decorative so
    // screen readers do not announce the same message twice.
    <div className="full-page-loader" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true">
        <span className="spinner__ring" />
      </span>
      <p>{label}</p>
    </div>
  )
}

/** Consistent error presentation used by every page instead of ad-hoc styling. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div className="state state--error" role="alert">
      <span className="state__icon" aria-hidden="true">
        <AlertIcon width={22} height={22} />
      </span>
      <div className="state__body">
        <h3 className="state__title">{title}</h3>
        <p className="state__message">{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="button button--secondary button--sm" onClick={onRetry}>
          <RefreshIcon width={16} height={16} />
          {retryLabel}
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string
  description: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="state state--empty">
      <span className="state__icon" aria-hidden="true">
        {icon ?? <InboxIcon width={22} height={22} />}
      </span>
      <div className="state__body">
        <h3 className="state__title">{title}</h3>
        <p className="state__message">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  children: ReactNode
}) {
  return (
    <span className={`badge badge--${tone}`}>
      <span className="badge__dot" aria-hidden="true" />
      {children}
    </span>
  )
}
