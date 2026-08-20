import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

const CHUNK_RELOAD_KEY = 'phikila:chunk-reload-attempted'

function isChunkLoadError(error: Error): boolean {
  const message = `${error.name} ${error.message}`.toLowerCase()
  return (
    message.includes('dynamically imported module') ||
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('loading chunk') ||
    message.includes('chunkloaderror')
  )
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Phikila application error', error, info)

    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      try {
        if (!window.sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
          window.location.reload()
        }
      } catch {
        // Storage may be unavailable in privacy-restricted browser contexts.
      }
    }
  }

  handleReload = () => {
    try {
      window.sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    } catch {
      // Ignore storage errors and still reload.
    }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    const errorMessage = this.state.error.message || this.state.error.name || 'Unknown rendering error'

    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: '#f8fafc' }}>
        <section style={{ maxWidth: 640, width: '100%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '2rem', boxShadow: '0 10px 30px rgba(15,23,42,.08)' }}>
          <p style={{ margin: '0 0 .5rem', fontWeight: 700, color: '#0f172a' }}>Phikila</p>
          <h1 style={{ margin: '0 0 .75rem', fontSize: '1.5rem', color: '#0f172a' }}>The application encountered an error</h1>
          <p style={{ margin: '0 0 1rem', color: '#475569', lineHeight: 1.5 }}>
            The page could not finish rendering. Reloading will request the current application bundle again.
          </p>
          <details style={{ margin: '0 0 1.25rem' }}>
            <summary style={{ cursor: 'pointer', color: '#334155', fontWeight: 600 }}>Technical details</summary>
            <pre style={{ marginTop: '.75rem', padding: '.75rem', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f1f5f9', borderRadius: 8, color: '#334155', fontSize: '.8rem' }}>{errorMessage}</pre>
          </details>
          <button type="button" className="button button--primary" onClick={this.handleReload}>Reload application</button>
        </section>
      </main>
    )
  }
}
