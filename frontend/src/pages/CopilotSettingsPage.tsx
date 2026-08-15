import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Spinner } from '../components/States'
import { useToast } from '../components/Toast'
import { apiFetch } from '../lib/api'

export function CopilotSettingsPage() {
  const { notify } = useToast()
  const [requests, setRequests] = useState(20)
  const [windowSeconds, setWindowSeconds] = useState(3600)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ requests: number; window_seconds: number }>('/api/v1/copilot/settings')
      .then((data) => { setRequests(data.requests); setWindowSeconds(data.window_seconds) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load Copilot settings.'))
      .finally(() => setLoading(false))
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true); setError(null)
    try {
      await apiFetch('/api/v1/copilot/settings', {
        method: 'PUT',
        body: JSON.stringify({ requests, window_seconds: windowSeconds }),
      })
      notify('Copilot rate limits updated.', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save Copilot settings.')
    } finally { setSaving(false) }
  }

  return <>
    <PageHeader title="Copilot settings" description="Control Copilot usage and its platform-wide AI configuration." breadcrumbs={[{ label: 'Settings' }, { label: 'Copilot' }]} />
    <Alert tone="info" title="Superadmin only">
      Provider credentials and the active model are managed under AI providers. These limits control how often each user can request a real Copilot insight for their school.
    </Alert>
    {error && <Alert tone="error" title="Could not update settings">{error}</Alert>}
    <section className="card section">
      {loading ? <Spinner label="Loading Copilot settings" /> : <form className="form" onSubmit={save}>
        <div className="form__row">
          <div className="field">
            <label className="field__label" htmlFor="copilot-rate">Requests</label>
            <input id="copilot-rate" className="input" type="number" min={1} max={10000} value={requests} onChange={(e) => setRequests(Number(e.target.value))} />
            <p className="form__note">Maximum Copilot insight requests per user in the configured window.</p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="copilot-window">Window (seconds)</label>
            <input id="copilot-window" className="input" type="number" min={10} max={86400} value={windowSeconds} onChange={(e) => setWindowSeconds(Number(e.target.value))} />
            <p className="form__note">10 seconds to 24 hours. Default: 20 requests per hour.</p>
          </div>
        </div>
        <button className="button button--primary" type="submit" disabled={saving || loading}>
          {saving && <Spinner label="Saving" />}{saving ? 'Saving…' : 'Save rate limits'}
        </button>
      </form>}
    </section>
  </>
}
