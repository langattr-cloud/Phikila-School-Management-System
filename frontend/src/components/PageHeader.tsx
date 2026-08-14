import { useEffect, type ReactNode } from 'react'
import { Link } from '../lib/router'
import { ChevronRightIcon } from './icons'

export type Crumb = { label: string; to?: string }

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string
  description?: string
  breadcrumbs?: Crumb[]
  actions?: ReactNode
}) {
  useEffect(() => {
    document.title = `${title} · Phikila School System`
  }, [title])

  return (
    <header className="page-header">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="breadcrumbs">
          <ol>
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`}>
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
                {index < breadcrumbs.length - 1 && (
                  <ChevronRightIcon width={14} height={14} className="breadcrumbs__sep" />
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="page-header__row">
        <div>
          <h1 className="page-header__title">{title}</h1>
          {description && <p className="page-header__description">{description}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </header>
  )
}
