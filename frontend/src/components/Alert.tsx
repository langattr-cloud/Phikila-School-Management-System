import type { ReactNode } from 'react'
import { AlertIcon, CheckIcon, InboxIcon } from './icons'

export function Alert({
  tone,
  title,
  children,
}: {
  tone: 'success' | 'error' | 'info' | 'warning'
  title?: string
  children: ReactNode
}) {
  const Icon = tone === 'success' ? CheckIcon : tone === 'info' ? InboxIcon : AlertIcon
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="alert__icon" aria-hidden="true">
        <Icon width={18} height={18} />
      </span>
      <div>
        {title && <strong className="alert__title">{title}</strong>}
        <div className="alert__body">{children}</div>
      </div>
    </div>
  )
}