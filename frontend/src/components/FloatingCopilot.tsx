import { useEffect, useRef, useState } from 'react'
import { SparkIcon, CloseIcon } from './icons'
import { scheduling, type CopilotCommand } from '../lib/scheduling'
import { friendlyApiError } from '../lib/api'
import './FloatingCopilot.css'

const SUGGESTIONS = ['Find timetable conflicts', 'What needs my attention?', 'Find rooms available at 11:20']

export function FloatingCopilot() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [answer, setAnswer] = useState<CopilotCommand | null>(null)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  async function ask(value = text) {
    const prompt = value.trim()
    if (!prompt || thinking) return
    setText(prompt); setThinking(true); setError(null); setAnswer(null)
    try { const result = await scheduling.interpret(prompt); setAnswer(result.command) }
    catch (err) { setError(friendlyApiError(err, 'answer that question')) }
    finally { setThinking(false) }
  }

  return <>
    {open && <button className="copilot-backdrop" aria-label="Close Copilot" onClick={() => setOpen(false)} />}
    {open && <section ref={panelRef} className="floating-copilot" role="dialog" aria-modal="true" aria-labelledby="floating-copilot-title">
      <header className="floating-copilot__header"><div className="floating-copilot__identity"><span className="floating-copilot__orb"><SparkIcon /></span><div><strong id="floating-copilot-title">Phikila Copilot</strong><span>School operations assistant</span></div></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close Copilot"><CloseIcon /></button></header>
      <div className="floating-copilot__body">
        {!answer && !error && <div className="floating-copilot__welcome"><span className="floating-copilot__spark">✦</span><h3>What can I help with?</h3><p>Ask about schedules, rooms, constraints, or what needs attention.</p></div>}
        {thinking && <div className="floating-copilot__thinking"><span className="copilot-dots" /> Thinking…</div>}
        {error && <div className="floating-copilot__error">{error}</div>}
        {answer && <div className="floating-copilot__answer"><div className="floating-copilot__answer-label">{answer.action === 'unknown' ? 'I need a little more detail' : 'Copilot result'}</div><p>{answer.explanation}</p>{answer.target && <div className="floating-copilot__meta">{answer.target_kind}: {answer.target}</div>}</div>}
        {!answer && !thinking && <div className="floating-copilot__suggestions">{SUGGESTIONS.map((item) => <button key={item} onClick={() => void ask(item)}>{item}<span>→</span></button>)}</div>}
      </div>
      <form className="floating-copilot__input" onSubmit={(event) => { event.preventDefault(); void ask() }}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask anything…" maxLength={400} aria-label="Ask Copilot" /><button type="submit" disabled={!text.trim() || thinking} aria-label="Send">↑</button></form>
    </section>}
    <button className={`copilot-fab ${open ? 'copilot-fab--open' : ''}`} onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close Copilot' : 'Open Copilot'} aria-expanded={open}>{open ? <CloseIcon /> : <SparkIcon />}</button>
  </>
}
