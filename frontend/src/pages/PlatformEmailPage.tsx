import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState, LoadingBlock, Spinner } from '../components/States'
import { Field } from '../components/Field'
import { CheckIcon, InboxIcon, SparkIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { emailApi, type EmailStatus, type EmailTemplate, type TemplatePreview } from '../lib/email'

export function PlatformEmailPage() {
  const { notify } = useToast()
  const [status, setStatus] = useState<EmailStatus | null>(null)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [preview, setPreview] = useState<TemplatePreview | null>(null)
  const [previewTab, setPreviewTab] = useState<'html' | 'text' | 'json'>('html')
  const [contextJson, setContextJson] = useState<string>('{}')
  const [loading, setLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Test email modal state
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [sendingTest, setSendingTest] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statusRes, templatesRes] = await Promise.all([
        emailApi.getStatus(),
        emailApi.getTemplates(),
      ])
      setStatus(statusRes)
      setTemplates(templatesRes)
      if (templatesRes.length > 0 && !selectedTemplate) {
        setSelectedTemplate(templatesRes[0])
        setContextJson(JSON.stringify(templatesRes[0].sample_context, null, 2))
      }
    } catch (err) {
      setError(friendlyApiError(err, 'load email service status and templates'))
    } finally {
      setLoading(false)
    }
  }, [selectedTemplate])

  useEffect(() => {
    void load()
  }, [load])

  // Update preview whenever selected template or context changes
  const updatePreview = useCallback(async (templateId: string, ctxObj: Record<string, unknown>) => {
    setPreviewLoading(true)
    try {
      const result = await emailApi.previewTemplate(templateId, ctxObj)
      setPreview(result)
    } catch (err) {
      notify(friendlyApiError(err, 'generate preview'), 'error')
    } finally {
      setPreviewLoading(false)
    }
  }, [notify])

  useEffect(() => {
    if (!selectedTemplate) return
    try {
      const parsed = JSON.parse(contextJson) as Record<string, unknown>
      void updatePreview(selectedTemplate.id, parsed)
    } catch {
      // JSON is being edited and might be incomplete
    }
  }, [selectedTemplate, contextJson, updatePreview])

  function handleSelectTemplate(tmpl: EmailTemplate) {
    setSelectedTemplate(tmpl)
    setContextJson(JSON.stringify(tmpl.sample_context, null, 2))
  }

  async function handleSendTest(event: FormEvent) {
    event.preventDefault()
    if (sendingTest || !testRecipient.trim()) return

    setSendingTest(true)
    try {
      const result = await emailApi.sendTestEmail(
        testRecipient.trim(),
        selectedTemplate ? selectedTemplate.id : undefined,
      )
      if (result.success) {
        notify(`Test email sent successfully to ${testRecipient.trim()}`, 'success')
        setTestModalOpen(false)
        setTestRecipient('')
      } else {
        notify(result.error || 'Failed to send test email.', 'error')
      }
    } catch (err) {
      notify(friendlyApiError(err, 'send test email via Resend'), 'error')
    } finally {
      setSendingTest(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Email & Templates"
        description="Transactional email delivery powered by Resend and responsive templates."
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Email & templates' }]}
        actions={
          <button
            type="button"
            className="button button--primary button--sm"
            onClick={() => setTestModalOpen(true)}
          >
            <SparkIcon width={16} height={16} />
            Send test email
          </button>
        }
      />

      {error ? (
        <ErrorState title="Email service could not load" message={error} onRetry={load} />
      ) : loading ? (
        <div className="card section">
          <LoadingBlock label="Loading email configuration" rows={4} />
        </div>
      ) : (
        <>
          {/* Status Bar */}
          <section className="section">
            <ul className="summary-grid">
              <li className="summary-card">
                <span className="summary-card__icon" aria-hidden="true">
                  <CheckIcon />
                </span>
                <span className="summary-card__label">Email Provider</span>
                <span className="summary-card__value">Resend</span>
                <span className="summary-card__detail">
                  <Badge tone={status?.configured ? 'success' : 'danger'}>
                    {status?.configured ? 'Active' : 'Unconfigured'}
                  </Badge>
                </span>
              </li>

              <li className="summary-card">
                <span className="summary-card__icon" aria-hidden="true">
                  <SparkIcon />
                </span>
                <span className="summary-card__label">API Key</span>
                <span className="summary-card__value" style={{ fontSize: '1rem', fontFamily: 'monospace' }}>
                  {status?.api_key_masked}
                </span>
                <span className="summary-card__detail">Server-side authenticated</span>
              </li>

              <li className="summary-card">
                <span className="summary-card__icon" aria-hidden="true">
                  <InboxIcon />
                </span>
                <span className="summary-card__label">Default Sender</span>
                <span className="summary-card__value" style={{ fontSize: '0.9rem' }}>
                  {status?.default_from.split('<')[0]?.trim() || 'Phikila'}
                </span>
                <span className="summary-card__detail">{status?.default_from}</span>
              </li>

              <li className="summary-card">
                <span className="summary-card__icon" aria-hidden="true">
                  <InboxIcon />
                </span>
                <span className="summary-card__label">Templates</span>
                <span className="summary-card__value">{templates.length}</span>
                <span className="summary-card__detail">Responsive HTML + text</span>
              </li>
            </ul>
          </section>

          {/* Templates & Live Preview Layout */}
          <div className="dashboard-columns">
            {/* Template Selector List */}
            <section className="card section" style={{ flex: '1 1 320px', maxWidth: '420px' }}>
              <h2 className="section__title">Email Templates ({templates.length})</h2>
              <p className="muted" style={{ marginBottom: '16px', fontSize: '0.85rem' }}>
                Select a template to inspect details, tweak sample parameters, and preview output.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {templates.map((tmpl) => {
                  const isSelected = selectedTemplate?.id === tmpl.id
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tmpl)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                        backgroundColor: isSelected ? '#f5f3ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.95rem', color: isSelected ? '#4338ca' : '#0f172a' }}>
                          {tmpl.name}
                        </strong>
                        <Badge tone={isSelected ? 'neutral' : undefined}>{tmpl.category}</Badge>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>
                        {tmpl.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Live Interactive Preview Panel */}
            <section className="card section" style={{ flex: '2 1 500px' }}>
              {selectedTemplate ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <h2 className="section__title" style={{ marginBottom: '4px' }}>
                        {selectedTemplate.name}
                      </h2>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                        ID: <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{selectedTemplate.id}</code> · Subject: <em>{preview?.subject || selectedTemplate.default_subject}</em>
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className={`button button--sm ${previewTab === 'html' ? 'button--primary' : 'button--secondary'}`}
                        onClick={() => setPreviewTab('html')}
                      >
                        HTML Preview
                      </button>
                      <button
                        type="button"
                        className={`button button--sm ${previewTab === 'text' ? 'button--primary' : 'button--secondary'}`}
                        onClick={() => setPreviewTab('text')}
                      >
                        Plain Text
                      </button>
                      <button
                        type="button"
                        className={`button button--sm ${previewTab === 'json' ? 'button--primary' : 'button--secondary'}`}
                        onClick={() => setPreviewTab('json')}
                      >
                        Variables (JSON)
                      </button>
                    </div>
                  </div>

                  {previewLoading && (
                    <div style={{ padding: '12px', textAlign: 'center' }}>
                      <Spinner label="Rendering template preview" />
                    </div>
                  )}

                  {/* Render Tab Contents */}
                  {previewTab === 'html' && preview && (
                    <div
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: '#f8fafc',
                        minHeight: '480px',
                      }}
                    >
                      <iframe
                        title="Email HTML Preview"
                        srcDoc={preview.html}
                        style={{
                          width: '100%',
                          height: '520px',
                          border: 'none',
                          backgroundColor: '#f8fafc',
                        }}
                      />
                    </div>
                  )}

                  {previewTab === 'text' && preview && (
                    <pre
                      style={{
                        padding: '16px',
                        backgroundColor: '#0f172a',
                        color: '#f8fafc',
                        borderRadius: '8px',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        whiteSpace: 'pre-wrap',
                        overflowX: 'auto',
                        maxHeight: '520px',
                      }}
                    >
                      {preview.text}
                    </pre>
                  )}

                  {previewTab === 'json' && (
                    <div>
                      <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '8px' }}>
                        Modify context variables in real time to test rendering:
                      </p>
                      <textarea
                        className="input"
                        rows={16}
                        value={contextJson}
                        onChange={(e) => setContextJson(e.target.value)}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          width: '100%',
                        }}
                      />
                      <button
                        type="button"
                        className="button button--secondary button--sm"
                        style={{ marginTop: '8px' }}
                        onClick={() => setContextJson(JSON.stringify(selectedTemplate.sample_context, null, 2))}
                      >
                        Reset to sample data
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  title="No template selected"
                  description="Choose a template from the left to view its preview."
                  icon={<InboxIcon width={24} height={24} />}
                />
              )}
            </section>
          </div>
        </>
      )}

      {/* Test Email Send Modal */}
      {testModalOpen && (
        <div className="drawer-overlay" onClick={() => !sendingTest && setTestModalOpen(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div
            className="card"
            style={{ width: '100%', maxWidth: '480px', margin: '20px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="section__title" style={{ marginBottom: '8px' }}>Send Test Email</h2>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
              Test your Resend API configuration by sending a live email to your inbox.
            </p>

            <form onSubmit={handleSendTest}>
              <Field
                label="Recipient Email Address"
                type="email"
                required
                placeholder="you@domain.com"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                hint={selectedTemplate ? `Will send using template: "${selectedTemplate.name}"` : 'Will send standard test notification'}
              />

              <div className="form__row" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setTestModalOpen(false)}
                  disabled={sendingTest}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={sendingTest || !testRecipient.trim()}
                >
                  {sendingTest && <Spinner label="Sending email" />}
                  {sendingTest ? 'Sending via Resend…' : 'Send Test Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
