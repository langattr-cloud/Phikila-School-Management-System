import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, ErrorState, LoadingBlock, Spinner } from '../components/States'
import { PasswordField } from '../components/Field'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AlertIcon, CheckIcon, SearchIcon, SparkIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import {
  llm,
  PROVIDER_STATUS_LABEL,
  type LlmModel,
  type ModelTestResult,
  type Provider,
} from '../lib/platform'

function relative(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return 'never'
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

function money(value: number | null): string {
  if (value === null) return '—'
  if (value === 0) return 'Free'
  return `$${value.toFixed(2)}/M`
}

/**
 * Settings → AI / LLM providers.
 *
 * The API key is submitted once to our own backend and then dropped from React
 * state. It is never stored in localStorage, never echoed back by the API, and
 * the browser never calls a provider directly.
 */
export function LlmProvidersPage() {
  const { notify } = useToast()
  const [providers, setProviders] = useState<Provider[]>([])
  const [encryptionReady, setEncryptionReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [defaults, setDefaults] = useState<{ provider: string | null; model_id: string | null }>({
    provider: null,
    model_id: null,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [data, def] = await Promise.all([llm.providers(), llm.getDefault()])
      setProviders(data.providers)
      setEncryptionReady(data.encryption_configured)
      setDefaults(def)
    } catch (err) {
      setError(friendlyApiError(err, 'load AI provider settings'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <PageHeader
        title="AI providers"
        description="Connect a language-model provider. Keys are encrypted on the server and never sent to the browser."
        breadcrumbs={[{ label: 'Settings' }, { label: 'AI providers' }]}
      />

      {!encryptionReady && (
        <Alert tone="error" title="Encryption is not configured">
          Set the <code>LLM_ENCRYPTION_KEY</code> environment variable on the server before
          connecting a provider. Credentials cannot be stored securely without it.
        </Alert>
      )}

      {defaults.model_id && (
        <Alert tone="info" title="Default model">
          {defaults.provider} · <strong>{defaults.model_id}</strong>
        </Alert>
      )}

      {error ? (
        <ErrorState title="Provider settings could not load" message={error} onRetry={load} />
      ) : loading ? (
        <div className="card section">
          <LoadingBlock label="Loading AI providers" rows={4} />
        </div>
      ) : (
        <div className="provider-grid">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.provider}
              provider={provider}
              expanded={expanded === provider.provider}
              defaultModelId={
                defaults.provider === provider.provider ? defaults.model_id : null
              }
              onToggle={() =>
                setExpanded((current) =>
                  current === provider.provider ? null : provider.provider,
                )
              }
              onChanged={load}
              notify={notify}
            />
          ))}
        </div>
      )}
    </>
  )
}

function statusTone(status: Provider['status']): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'connected') return 'success'
  if (status === 'invalid_credential') return 'danger'
  if (status === 'not_configured') return 'neutral'
  return 'warning'
}

function ProviderCard({
  provider,
  expanded,
  defaultModelId,
  onToggle,
  onChanged,
  notify,
}: {
  provider: Provider
  expanded: boolean
  defaultModelId: string | null
  onToggle: () => void
  onChanged: () => void
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function connect(event: FormEvent) {
    event.preventDefault()
    if (connecting) return
    setConnecting(true)
    setFormError(null)
    try {
      await llm.connect(provider.provider, apiKey)
      // Drop the key from component state the moment it is accepted.
      setApiKey('')
      setShowForm(false)
      notify(`${provider.label} connected.`, 'success')
      onChanged()
    } catch (err) {
      setFormError(friendlyApiError(err, `connect ${provider.label}`))
    } finally {
      setConnecting(false)
    }
  }

  async function test() {
    setTesting(true)
    try {
      const result = await llm.test(provider.provider)
      notify(result.message, result.ok ? 'success' : 'error')
      onChanged()
    } catch (err) {
      notify(friendlyApiError(err, `test ${provider.label}`), 'error')
    } finally {
      setTesting(false)
    }
  }

  async function disconnect() {
    try {
      await llm.disconnect(provider.provider)
      setConfirmRemove(false)
      notify(`${provider.label} disconnected.`, 'success')
      onChanged()
    } catch (err) {
      notify(friendlyApiError(err, `remove the ${provider.label} key`), 'error')
    }
  }

  return (
    <section className="card section provider-card" aria-labelledby={`prov-${provider.provider}`}>
      <div className="provider-card__head">
        <div>
          <h2 className="section__title" id={`prov-${provider.provider}`}>
            {provider.label}
          </h2>
          <p className="provider-card__status">
            {/* Icon + text, never colour alone. */}
            <Badge tone={statusTone(provider.status)}>
              {PROVIDER_STATUS_LABEL[provider.status]}
            </Badge>
            {provider.connected && (
              <span className="provider-card__meta">
                {provider.models_available} models · {provider.models_enabled} enabled · tested{' '}
                {relative(provider.last_tested_at)}
              </span>
            )}
          </p>
        </div>
      </div>

      {provider.last_error && provider.status !== 'connected' && (
        <Alert tone="error">{provider.last_error}</Alert>
      )}

      {provider.api_key_configured ? (
        <>
          <dl className="detail-list">
            <div>
              <dt>API key</dt>
              <dd>
                <span className="api-key-mask">{provider.api_key_hint}</span>{' '}
                <Badge tone="success">Configured</Badge>
              </dd>
            </div>
          </dl>
          <div className="form__row">
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={test}
              disabled={testing}
            >
              {testing && <Spinner label="Testing" />}
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={() => setShowForm((v) => !v)}
            >
              Replace key
            </button>
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={() => setConfirmRemove(true)}
            >
              Remove
            </button>
            <button type="button" className="button button--primary button--sm" onClick={onToggle}>
              {expanded ? 'Hide models' : 'Manage models'}
            </button>
          </div>
        </>
      ) : (
        !showForm && (
          <div className="form__row">
            <button
              type="button"
              className="button button--primary button--sm"
              onClick={() => setShowForm(true)}
            >
              Connect
            </button>
            <a
              className="link"
              href={provider.docs_url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Provider documentation
            </a>
          </div>
        )
      )}

      {showForm && (
        <form className="form" onSubmit={connect} noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <PasswordField
            label="API key"
            required
            autoComplete="off"
            hint={provider.key_hint}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <p className="form__note">
            The key is sent once to this application's own server, encrypted, and never returned
            to the browser.
          </p>
          <div className="form__row">
            <button className="button button--primary" type="submit" disabled={connecting || !apiKey}>
              {connecting && <Spinner label="Testing connection" />}
              {connecting ? 'Testing connection…' : 'Test and save'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setShowForm(false)
                setApiKey('')
                setFormError(null)
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {expanded && provider.connected && (
        <ModelManager
          provider={provider}
          defaultModelId={defaultModelId}
          onChanged={onChanged}
          notify={notify}
        />
      )}

      <ConfirmDialog
        open={confirmRemove}
        title={`Remove the ${provider.label} key?`}
        description="The stored credential is deleted and all its models are disabled. You can reconnect at any time with a new key."
        confirmLabel="Remove key"
        destructive
        onCancel={() => setConfirmRemove(false)}
        onConfirm={disconnect}
      />
    </section>
  )
}

function ModelManager({
  provider,
  defaultModelId,
  onChanged,
  notify,
}: {
  provider: Provider
  defaultModelId: string | null
  onChanged: () => void
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const [models, setModels] = useState<LlmModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [result, setResult] = useState<ModelTestResult | null>(null)
  const [onlyEnabled, setOnlyEnabled] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setModels(await llm.models(provider.provider))
    } catch (err) {
      setError(friendlyApiError(err, 'load models'))
    } finally {
      setLoading(false)
    }
  }, [provider.provider])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return models.filter((model) => {
      if (onlyEnabled && !model.enabled) return false
      if (!term) return true
      return (
        model.model_id.toLowerCase().includes(term) ||
        (model.display_name ?? '').toLowerCase().includes(term)
      )
    })
  }, [models, search, onlyEnabled])

  const enabled = models.filter((m) => m.enabled)

  async function refresh() {
    setRefreshing(true)
    try {
      const out = await llm.refresh(provider.provider)
      notify(`${out.models_available} models available (${out.added} new).`, 'success')
      await load()
      onChanged()
    } catch (err) {
      notify(friendlyApiError(err, 'refresh models'), 'error')
    } finally {
      setRefreshing(false)
    }
  }

  async function toggle(model: LlmModel) {
    setBusy(model.id)
    try {
      await llm.setEnabled(model.id, !model.enabled)
      await load()
      onChanged()
    } catch (err) {
      notify(friendlyApiError(err, 'change that model'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function test(model: LlmModel) {
    setBusy(model.id)
    setResult(null)
    try {
      const out = await llm.testModel(model.id)
      setResult(out)
      notify(out.message, out.ok ? 'success' : 'error')
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'test that model'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function makeDefault(model: LlmModel) {
    try {
      await llm.setDefault(provider.provider, model.model_id)
      notify(`${model.model_id} is now the default model.`, 'success')
      onChanged()
    } catch (err) {
      notify(friendlyApiError(err, 'set the default model'), 'error')
    }
  }

  return (
    <div className="model-manager">
      <div className="toolbar">
        <div className="search">
          <SearchIcon className="search__icon" width={18} height={18} />
          <label className="visually-hidden" htmlFor={`search-${provider.provider}`}>
            Search {provider.label} models
          </label>
          <input
            id={`search-${provider.provider}`}
            className="input input--search"
            type="search"
            placeholder="Search models"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={onlyEnabled}
            onChange={(event) => setOnlyEnabled(event.target.checked)}
          />
          Enabled only
        </label>
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={refresh}
          disabled={refreshing}
        >
          {refreshing && <Spinner label="Refreshing" />}
          {refreshing ? 'Refreshing…' : 'Refresh models'}
        </button>
      </div>

      {result && (
        <Alert tone={result.ok ? 'success' : 'error'} title={result.ok ? 'Model responded' : 'Model test failed'}>
          <span className="model-result">
            {result.ok ? <CheckIcon width={16} height={16} /> : <AlertIcon width={16} height={16} />}
            {result.message}
            {result.latency_ms !== null && ` · ${result.latency_ms} ms`}
            {` · ${result.provider}/${result.model_id}`}
          </span>
        </Alert>
      )}

      {error ? (
        <ErrorState title="Models could not load" message={error} onRetry={load} />
      ) : loading ? (
        <LoadingBlock label={`Fetching ${provider.label} models`} rows={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={search ? 'No matching models' : 'No models yet'}
          description={
            search
              ? 'Nothing matches your search. Clear it to see the full catalogue.'
              : 'Refresh the catalogue to fetch the models this provider offers.'
          }
          icon={<SparkIcon width={22} height={22} />}
          action={
            !search ? (
              <button type="button" className="button button--primary button--sm" onClick={refresh}>
                Refresh models
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="form__note">
            Showing {visible.length} of {models.length} models · {enabled.length} enabled
          </p>
          <ul className="model-list">
            {visible.slice(0, 60).map((model) => (
              <li className="model-row" key={model.id}>
                <div className="model-row__main">
                  <p className="model-row__id">
                    {model.display_name || model.model_id}
                    {defaultModelId === model.model_id && <Badge tone="success">Default</Badge>}
                    {model.enabled ? (
                      <Badge tone="success">Enabled</Badge>
                    ) : (
                      <Badge>Disabled</Badge>
                    )}
                  </p>
                  <p className="model-row__meta">{model.model_id}</p>
                  <p className="model-row__meta">
                    {model.context_window
                      ? `${model.context_window.toLocaleString()} ctx`
                      : 'Context unknown'}{' '}
                    · in {money(model.input_price)} · out {money(model.output_price)}
                    {model.supports_tools ? ' · tools' : ''}
                    {model.supports_vision ? ' · vision' : ''}
                  </p>
                  {model.last_tested_at && (
                    <p className="model-row__meta">
                      Last test:{' '}
                      {model.last_test_ok
                        ? `passed in ${model.last_test_ms} ms`
                        : model.last_test_error || 'failed'}
                    </p>
                  )}
                </div>
                <div className="model-row__actions">
                  <button
                    type="button"
                    className="button button--ghost button--sm"
                    onClick={() => toggle(model)}
                    disabled={busy === model.id}
                  >
                    {model.enabled ? 'Disable' : 'Enable'}
                  </button>
                  {model.enabled && (
                    <>
                      <button
                        type="button"
                        className="button button--ghost button--sm"
                        onClick={() => test(model)}
                        disabled={busy === model.id}
                      >
                        {busy === model.id ? 'Testing…' : 'Test'}
                      </button>
                      {defaultModelId !== model.model_id && (
                        <button
                          type="button"
                          className="button button--ghost button--sm"
                          onClick={() => makeDefault(model)}
                        >
                          Set default
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {visible.length > 60 && (
            <p className="form__note">
              Showing the first 60 matches. Use search to narrow the list.
            </p>
          )}
        </>
      )}
    </div>
  )
}
