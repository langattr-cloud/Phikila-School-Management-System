import { Link } from '../lib/router'
import { CalendarIcon, CheckIcon, LayersIcon, SparkIcon } from './icons'

const suggestions = [
  { label: 'Find timetable conflicts', icon: <CalendarIcon width={15} height={15} /> },
  { label: 'Summarise today\'s activity', icon: <LayersIcon width={15} height={15} /> },
  { label: 'What needs my attention?', icon: <SparkIcon width={15} height={15} /> },
]

export function CopilotAssistantRail() {
  return (
    <section className="copilot-rail glass-card" aria-labelledby="copilot-rail-title">
      <div className="copilot-rail__glow" aria-hidden="true" />
      <div className="copilot-rail__header">
        <span className="copilot-rail__icon" aria-hidden="true"><SparkIcon width={17} height={17} /></span>
        <div>
          <p className="copilot-rail__eyebrow">Phikila Copilot</p>
          <h2 id="copilot-rail-title">Your school assistant</h2>
        </div>
        <span className="copilot-rail__status" title="Copilot available" aria-label="Copilot available" />
      </div>

      <p className="copilot-rail__intro">Ask about schedules, students, attendance or the next action your school should take.</p>

      <div className="copilot-rail__insight">
        <span className="copilot-rail__insight-icon"><CheckIcon width={15} height={15} /></span>
        <div>
          <strong>Quick insight</strong>
          <p>4 timetable conflicts are ready to review.</p>
        </div>
      </div>

      <div className="copilot-rail__suggestions" aria-label="Suggested Copilot questions">
        {suggestions.map((suggestion) => (
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
