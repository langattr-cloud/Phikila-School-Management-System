import type { Quality } from '../lib/scheduling'

const LABELS: Record<string, string> = {
  hard_constraints: 'Hard constraints',
  teacher_workload: 'Teacher workload',
  subject_distribution: 'Subject distribution',
  room_utilisation: 'Room utilisation',
  teacher_gaps: 'Teacher gaps',
  class_distribution: 'Class distribution',
  morning_preference: 'Morning preference',
}

function tone(value: number): 'good' | 'ok' | 'poor' {
  if (value >= 90) return 'good'
  if (value >= 70) return 'ok'
  return 'poor'
}

/**
 * Score breakdown. Every row states its number in text, so the bars are a
 * visual aid rather than the only way to read the value.
 */
export function QualityBars({ quality }: { quality: Partial<Quality> }) {
  const breakdown = quality.breakdown ?? {}
  const entries = Object.entries(breakdown)

  return (
    <div className="quality">
      {quality.overall !== undefined && (
        <p className="quality__overall">
          <span className="quality__score">{quality.overall}</span>
          <span className="quality__outof">/ 100</span>
        </p>
      )}
      {entries.length === 0 ? (
        <p className="form__note">No score has been calculated yet.</p>
      ) : (
        <dl className="quality__list">
          {entries.map(([key, value]) => (
            <div className="quality__row" key={key}>
              <dt>{LABELS[key] ?? key.replace(/_/g, ' ')}</dt>
              <dd>
                <span className={`quality__bar quality__bar--${tone(value)}`} aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
                </span>
                <span className="quality__value">{value}%</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
