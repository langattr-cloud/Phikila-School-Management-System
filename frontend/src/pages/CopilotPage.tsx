import { useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge } from '../components/States'
import { Spinner } from '../components/States'
import { useToast } from '../components/Toast'
import { Link } from '../lib/router'
import { friendlyApiError } from '../lib/api'
import { scheduling, type CopilotCommand } from '../lib/scheduling'

const EXAMPLES = [
  'Give Form 4A Friday afternoon free',
  'Keep Mr Otieno free on Monday morning',
  'Balance teacher workloads',
  'Prioritise morning lessons',
]

/**
 * The assistant translates a sentence into a structured constraint. It never
 * writes a timetable: the deterministic CP-SAT solver does that, so results
 * stay reproducible and every rule remains inspectable.
 */
export function CopilotPage() {
  const { notify } = useToast()
  const [text, setText] = useState('')
  const [command, setCommand] = useState<CopilotCommand | null>(null)
  const [thinking, setThinking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function interpret(event: FormEvent) {
    event.preventDefault()
    if (thinking || !text.trim()) return
    setThinking(true)
    setError(null)
    setApplied(false)
    setCommand(null)
    try {
      const result = await scheduling.interpret(text)
      setCommand(result.command)
    } catch (err) {
      setError(friendlyApiError(err, 'interpret that instruction'))
    } finally {
      setThinking(false)
    }
  }

  async function apply() {
    if (!command || applying) return
    setApplying(true)
    try {
      await scheduling.applyCommand(command)
      setApplied(true)
      notify('Rule saved. Regenerate to apply it.', 'success')
    } catch (err) {
      notify(friendlyApiError(err, 'apply that rule'), 'error')
    } finally {
      setApplying(false)
    }
  }

  const understood = command && command.action !== 'unknown'

  return (
    <>
      <PageHeader
        title="Schedule copilot"
        description="Describe a scheduling rule in plain English and review it before it is applied."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Copilot' }]}
      />

      <Alert tone="info" title="How this works">
        The assistant only translates your words into a structured rule. The timetable itself is
        always produced by the deterministic scheduling engine, so results are repeatable and every
        rule stays visible under Constraints.
      </Alert>

      <section className="card section">
        <form className="form" onSubmit={interpret}>
          <div className="field">
            <label className="field__label" htmlFor="copilot-input">
              What would you like to change?
            </label>
            <input
              id="copilot-input"
              className="input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Give Form 4A Friday afternoon free"
              maxLength={400}
              autoComplete="off"
            />
          </div>
          <button className="button button--primary" type="submit" disabled={thinking || !text.trim()}>
            {thinking && <Spinner label="Interpreting" />}
            {thinking ? 'Interpreting…' : 'Interpret'}
          </button>
        </form>

        <h3 className="panel__subtitle">Try one of these</h3>
        <ul className="chip-list">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => setText(example)}
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <Alert tone="error" title="Could not interpret that">
          {error}
        </Alert>
      )}

      {command && (
        <section className="card section">
          <div className="panel__head">
            <h2 className="section__title">Proposed change</h2>
            <Badge tone={understood ? 'success' : 'warning'}>
              {understood ? `${Math.round(command.confidence * 100)}% confident` : 'Not understood'}
            </Badge>
          </div>

          {!understood ? (
            <Alert tone="info">{command.explanation}</Alert>
          ) : (
            <>
              <p className="copilot__explanation">{command.explanation}</p>

              <dl className="detail-list detail-list--two">
                <div>
                  <dt>Action</dt>
                  <dd>{command.action.replace(/_/g, ' ')}</dd>
                </div>
                {command.target && (
                  <div>
                    <dt>Applies to</dt>
                    <dd>
                      {command.target} ({command.target_kind})
                    </dd>
                  </div>
                )}
                {command.day_name && (
                  <div>
                    <dt>Day</dt>
                    <dd>{command.day_name}</dd>
                  </div>
                )}
                {command.period_names.length > 0 && (
                  <div>
                    <dt>Periods</dt>
                    <dd>{command.period_names.join(', ')}</dd>
                  </div>
                )}
                <div>
                  <dt>Priority</dt>
                  <dd>
                    <Badge tone={command.priority === 'hard' ? 'danger' : 'neutral'}>
                      {command.priority === 'hard' ? 'Must be respected' : 'Preference'}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt>Interpreted by</dt>
                  <dd>{command.source === 'llm' ? 'Language model' : 'Built-in parser'}</dd>
                </div>
              </dl>

              {applied ? (
                <Alert tone="success" title="Rule saved">
                  Regenerate the timetable for it to take effect.{' '}
                  <Link to="/scheduling/generate">Generate now</Link>.
                </Alert>
              ) : (
                <div className="form__row">
                  <button className="button button--primary" onClick={apply} disabled={applying}>
                    {applying ? 'Applying…' : 'Apply this rule'}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => setCommand(null)}
                  >
                    Discard
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>
  )
}
