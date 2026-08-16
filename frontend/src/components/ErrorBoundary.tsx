import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | undefined
}

/**
 * Class component error boundary — catches render-time errors and displays
 * a graceful fallback instead of crashing the entire SPA.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: undefined }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Phikila error boundary caught:', error, errorInfo)
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <main className="page-shell">
          <section className="auth-panel">
            <div className="auth-card">
              <h2>Something went wrong</h2>
              <p className="muted">{this.state.error?.message || 'An unexpected error occurred.'}</p>
              <button className="primary" type="button" onClick={() => window.location.reload()}>
                Reload page
              </button>
            </div>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}
