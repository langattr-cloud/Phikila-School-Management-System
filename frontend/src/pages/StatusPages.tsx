import { useEffect } from 'react'
import { Link } from '../lib/router'
import { AlertIcon, LockIcon } from '../components/icons'

function StatusScreen({
  code,
  title,
  message,
  icon,
  action,
}: {
  code: string
  title: string
  message: string
  icon: React.ReactNode
  action: React.ReactNode
}) {
  useEffect(() => {
    document.title = `${title} · Phikila School System`
  }, [title])

  return (
    <div className="status-screen" id="main-content">
      <span className="status-screen__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="status-screen__code">{code}</p>
      <h1 className="status-screen__title">{title}</h1>
      <p className="status-screen__message">{message}</p>
      {action}
    </div>
  )
}

export function NotFoundPage() {
  return (
    <StatusScreen
      code="404"
      title="Page not found"
      message="The page you asked for does not exist or may have been moved."
      icon={<AlertIcon width={28} height={28} />}
      action={
        <Link className="button button--primary" to="/">
          Go to the dashboard
        </Link>
      }
    />
  )
}

export function ForbiddenPage() {
  return (
    <StatusScreen
      code="403"
      title="You do not have access"
      message="Your account does not have permission to view this page. Ask a school administrator if you need access."
      icon={<LockIcon width={28} height={28} />}
      action={
        <Link className="button button--primary" to="/">
          Back to the dashboard
        </Link>
      }
    />
  )
}
