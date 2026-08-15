import { useEffect, useState } from 'react'
import { Link, useRouter } from '../lib/router'
import { apiFetch } from '../lib/api'
import { CalendarIcon, CheckIcon, LayersIcon, SparkIcon } from './icons'
import './CopilotAssistantRail.css'

const suggestions = [
  { label: 'Find timetable conflicts', icon: <CalendarIcon width={15} height={15} /> },
  { label: 'Summarise today\'s activity', icon: <LayersIcon width={15} height={15} /> },
  { label: 'What needs my attention?', icon: <SparkIcon width={15} height={15} /> },
]

type Insight = { headline: string; summary: string; actions: string[]; source: string; model?: string }

export function CopilotAssistantRail() {
  const { pathname } = useRouter()
  const [insight, setInsight] = useState<Insight | null>(null)
  useEffect(() => {
    let active = true
    apiFetch<Insight>('/api/v1/copilot/insight').then((data) => { if (active) setInsight(data) }).catch(() => undefined)
    return () => { active = false }
  }, [pathname])
  const insightText = insight?.actions?.[0] ?? insight?.summary ?? 'Copilot is ready to analyse your school workspace.'

  return <section className="copilot-rail glass-card" aria-labelledby="copilot-rail-title">
    <div className="copilot-rail__glow" aria-hidden="true" />
    <div className="copilot-rail__header"><span className="copilot-rail__icon" aria-hidden="true"><SparkIcon width={17} height={17} /></span><div><p className="copilot-rail__eyebrow">Phikila Copilot</p><h2 id="copilot-rail-title">Your school assistant</h2></div><span className="copilot-rail__status" title="Copilot available" aria-label="Copilot available" /></div>
    <p className="copilot-rail__intro">{insight?.summary ?? 'Ask about schedules, students, attendance or the next action your school should take.'}</p>
    <div className="copilot-rail__insight"><span className="copilot-rail__insight-icon"><CheckIcon width={15} height={15} /></span><div><strong>{insight?.headline ?? 'Copilot insight'}</strong><p>{insightText}</p></div></div>
    <div className="copilot-rail__suggestions" aria-label="Suggested Copilot questions">{suggestions.map((suggestion) => <Link className="copilot-rail__suggestion" key={suggestion.label} to={`/scheduling/copilot?q=${encodeURIComponent(suggestion.label)}`}><span>{suggestion.icon}</span><span>{suggestion.label}</span><span aria-hidden="true">→</span></Link>)}</div>
    <Link className="button button--primary copilot-rail__cta" to="/scheduling/copilot">Open Copilot<span aria-hidden="true">→</span></Link>
  </section>
}
