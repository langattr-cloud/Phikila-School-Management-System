import { Link, useRouter } from '../lib/router'
import { CalendarIcon, CheckIcon, LayersIcon, SparkIcon } from './icons'
import './CopilotAssistantRail.css'

type CopilotContext = {
  label: string
  title: string
  intro: string
  insight: string
  action: string
  query: string
}

const defaultSuggestions = [
  { label: 'Find timetable conflicts', icon: <CalendarIcon width={15} height={15} /> },
  { label: 'Summarise today\'s activity', icon: <LayersIcon width={15} height={15} /> },
  { label: 'What needs my attention?', icon: <SparkIcon width={15} height={15} /> },
]

const contexts: Array<{ match: (pathname: string) => boolean; value: CopilotContext }> = [
  {
    match: (pathname) => pathname === '/timetable' || pathname.startsWith('/timetable/'),
    value: {
      label: 'Timetable intelligence',
      title: 'Your schedule assistant',
      intro: 'Copilot is watching the timetable workspace for conflicts, gaps and scheduling decisions.',
      insight: '4 timetable conflicts are ready to review.',
      action: 'Resolve timetable conflicts',
      query: 'Review the current timetable conflicts and suggest the best fixes.',
    },
  },
  {
    match: (pathname) => pathname === '/dashboard' || pathname === '/',
    value: {
      label: 'Daily intelligence',
      title: 'Your school assistant',
      intro: 'Copilot can turn the dashboard into a short list of priorities, risks and next actions.',
      insight: '3 operational items need attention today.',
      action: 'Analyse today\'s priorities',
      query: 'Summarise the most important school operations for today and recommend next actions.',
    },
  },
  {
    match: (pathname) => pathname.startsWith('/analytics'),
    value: {
      label: 'Insight intelligence',
      title: 'Your analytics assistant',
      intro: 'Copilot can explain trends and turn school metrics into practical questions and actions.',
      insight: 'Attendance and workload trends are ready to analyse.',
      action: 'Analyse school trends',
      query: 'Analyse the most important trends in the current analytics view and explain what they mean.',
    },
  },
  {
    match: (pathname) => pathname.startsWith('/setup/') || pathname.startsWith('/platform/'),
    value: {
      label: 'Operations intelligence',
      title: 'Your setup assistant',
      intro: 'Copilot can help identify missing configuration, duplicate setup and the next operational step.',
      insight: 'Configuration checks are ready to review.',
      action: 'Check this workspace',
      query: 'Check the current workspace for missing setup, inconsistencies or recommended next actions.',
    },
  },
  {
    match: (pathname) => pathname.startsWith('/scheduling/'),
    value: {
      label: 'Scheduling intelligence',
      title: 'Your scheduling assistant',
      intro: 'Copilot can explain constraints, find alternatives and help prepare schedules for publishing.',
      insight: 'Scheduling constraints are ready to inspect.',
      action: 'Explain scheduling risks',
      query: 'Explain the most important scheduling risks in the current workspace and suggest alternatives.',
    },
  },
]

function getContext(pathname: string): CopilotContext {
  return contexts.find((context) => context.match(pathname))?.value ?? {
    label: 'School intelligence',
    title: 'Your school assistant',
    intro: 'Ask about schedules, students, attendance or the next action your school should take.',
    insight: 'Your school workspace is ready for Copilot analysis.',
    action: 'Review this workspace',
    query: 'Review the current school workspace and tell me what needs attention.',
  }
}

export function CopilotAssistantRail() {
  const { pathname } = useRouter()
  const context = getContext(pathname)

  return (
    <section className="copilot-rail glass-card" aria-labelledby="copilot-rail-title">
      <div className="copilot-rail__glow" aria-hidden="true" />
      <div className="copilot-rail__header">
        <span className="copilot-rail__icon" aria-hidden="true"><SparkIcon width={17} height={17} /></span>
        <div>
          <p className="copilot-rail__eyebrow">{context.label}</p>
          <h2 id="copilot-rail-title">{context.title}</h2>
        </div>
        <span className="copilot-rail__status" title="Copilot available" aria-label="Copilot available" />
      </div>

      <p className="copilot-rail__intro">{context.intro}</p>

      <div className="copilot-rail__insight">
        <span className="copilot-rail__insight-icon"><CheckIcon width={15} height={15} /></span>
        <div>
          <strong>Copilot noticed</strong>
          <p>{context.insight}</p>
        </div>
      </div>

      <Link
        className="copilot-rail__focus"
        to={`/scheduling/copilot?q=${encodeURIComponent(context.query)}`}
      >
        <span>{context.action}</span>
        <span aria-hidden="true">→</span>
      </Link>

      <div className="copilot-rail__suggestions" aria-label="Suggested Copilot questions">
        {defaultSuggestions.map((suggestion) => (
          <Link className="copilot-rail__suggestion" key={suggestion.label} to={`/scheduling/copilot?q=${encodeURIComponent(suggestion.label)}`}>
            <span>{suggestion.icon}</span>
            <span>{suggestion.label}</span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>

      <Link className="button button--primary copilot-rail__cta" to="/scheduling/copilot">
        Open Copilot
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  )
}
