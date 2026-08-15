import { useState } from 'react'
import { useRouter } from '../lib/router'
import { CloseIcon, SparkIcon } from './icons'

export function FloatingCopilot() {
  const { pathname } = useRouter()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<
    Array<{ sender: 'ai' | 'user'; text: string; action?: { label: string; url: string } }>
  >([
    {
      sender: 'ai',
      text: 'Hello! I am Phikila Copilot. How can I assist you with scheduling, students, or school analytics today?',
    },
  ])
  const [input, setInput] = useState('')

  // Context-aware prompts based on current page
  const getContextPrompts = () => {
    if (pathname.startsWith('/timetable')) {
      return [
        'Review timetable conflicts for today',
        'Find available slots for Form 3A',
        'Check room capacity utilization',
      ]
    }
    if (pathname.startsWith('/students')) {
      return [
        'Summarise learner academic trend',
        'Which classes have unusual absenteeism?',
        'Export Form 3 attendance report',
      ]
    }
    if (pathname.startsWith('/scheduling')) {
      return [
        'Explain soft constraint violations',
        'Suggest teacher workload balance',
        'Run solver optimization pass',
      ]
    }
    return [
      'You have 4 timetable conflicts today',
      'Which classes have unusual absenteeism?',
      'Show Form 3 students with attendance < 80%',
    ]
  }

  const handleSend = (textToSend?: string) => {
    const text = textToSend || input
    if (!text.trim()) return

    const newMessages = [...messages, { sender: 'user' as const, text }]
    setMessages(newMessages)
    if (!textToSend) setInput('')

    // AI simulation response
    setTimeout(() => {
      let aiResponse = "I've analyzed your query against live school data."
      let action: { label: string; url: string } | undefined

      if (text.toLowerCase().includes('conflict') || text.toLowerCase().includes('timetable')) {
        aiResponse =
          'Found 4 timetable conflicts today involving Mr. Banda and Science Lab 2. Would you like to view recommendations or auto-resolve?'
        action = { label: 'Review conflicts in Timetable', url: '/timetable' }
      } else if (text.toLowerCase().includes('attendance') || text.toLowerCase().includes('absent')) {
        aiResponse =
          'Form 3A and Form 4B currently exhibit higher than average absenteeism this week (over 15% missing).'
        action = { label: 'Open Attendance Register', url: '/students?tab=attendance' }
      } else if (text.toLowerCase().includes('slots') || text.toLowerCase().includes('form 3a')) {
        aiResponse = 'Form 3A has 2 open periods on Wednesday (09:00 & 14:00) with Room 102 available.'
        action = { label: 'Open Timetable Builder', url: '/timetable' }
      }

      setMessages((prev) => [...prev, { sender: 'ai', text: aiResponse, action }])
    }, 600)
  }

  return (
    <>
      {/* Floating launcher widget */}
      {!open && (
        <button
          type="button"
          className="copilot-fab"
          onClick={() => setOpen(true)}
          aria-label="Open Phikila AI Copilot"
        >
          <SparkIcon width={22} height={22} />
          <span className="copilot-fab__label">Phikila Copilot</span>
        </button>
      )}

      {/* Floating Drawer / Widget */}
      {open && (
        <aside className="copilot-widget" aria-label="Phikila AI Copilot Assistant">
          <div className="copilot-widget__header">
            <div className="copilot-widget__title">
              <SparkIcon width={18} height={18} />
              <span>Phikila Copilot</span>
              <span className="badge badge--success" style={{ marginLeft: '0.4rem', fontSize: '0.68rem' }}>
                Context Aware
              </span>
            </div>
            <button
              type="button"
              className="icon-button icon-button--subtle"
              onClick={() => setOpen(false)}
              aria-label="Close Copilot"
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>

          <div className="copilot-widget__messages">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`copilot-msg copilot-msg--${m.sender}`}
              >
                <div className="copilot-msg__text">{m.text}</div>
                {m.action && (
                  <a
                    href={m.action.url}
                    className="button button--secondary button--sm copilot-msg__action"
                    onClick={() => setOpen(false)}
                  >
                    {m.action.label} →
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className="copilot-widget__prompts">
            <span className="copilot-widget__prompt-label">Suggested prompts:</span>
            <div className="copilot-widget__prompt-list">
              {getContextPrompts().map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="copilot-widget__prompt-btn"
                  onClick={() => handleSend(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <form
            className="copilot-widget__footer"
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
          >
            <input
              type="text"
              className="input copilot-widget__input"
              placeholder="Ask Copilot anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="button button--primary button--sm">
              Send
            </button>
          </form>
        </aside>
      )}
    </>
  )
}
