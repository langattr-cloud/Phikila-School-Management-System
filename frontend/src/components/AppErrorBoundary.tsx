import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Phikila application error', error, info)
  }

  handleReload = () => window.location.reload()

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: '#f8fafc' }}>
        <section style={{ maxWidth: 560, width: '100%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '2rem', boxShadow: '0 10px 30px rgba(15,23,42,.08)' }}>
          <p style={{ margin: '0 0 .5rem', fontWeight: 700, color: '#0f172a' }}>Phikila</p>
          <h1 style={{ margin: '0 0 .75rem', fontSize: '1.5rem', color: '#0f172a' }}>The application encountered an error</h1>
          <p style={{ margin: '0 0 1.25rem', color: '#475569', lineHeight: 1.5 }}>
            The page could not finish rendering. Reloading will request the current application bundle again.
          </p>
          <button type="button" className="button button--primary" onClick={this.handleReload}>Reload application</button>
        </section>
      </main>
    )
  }
}
