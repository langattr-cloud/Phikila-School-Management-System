import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, ErrorState, LoadingBlock } from '../components/States'
import { CloseIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Day, type Period } from '../lib/scheduling'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Defines the shape of the school week: which days run, and the period grid
 * within a day. Everything downstream (availability, the timetable grid, the
 * solver) is indexed against these rows.
 */
export function PeriodsPage() {
  const { notify } = useToast()
  const [days, setDays] = useState<Omit<Day, 'id'>[]>([])
  const [periods, setPeriods] = useState<Omit<Period, 'id'>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const calendar = await scheduling.calendar()
      setDays(
        calendar.days.length
          ? calendar.days.map(({ index, name, is_active }) => ({ index, name, is_active }))
          : WEEKDAYS.slice(0, 5).map((name, index) => ({ index, name, is_active: true })),
      )
      setPeriods(
        calendar.periods.map(({ index, name, start_time, end_time, is_teaching }) => ({
          index,
          name,
          start_time,
          end_time,
          is_teaching,
        })),
      )
    } catch (err) {
      setError(friendlyApiError(err, 'load the school week'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function toggleDay(index: number) {
    setDays((current) =>
      current.map((day) => (day.index === index ? { ...day, is_active: !day.is_active } : day)),
    )
  }

  function addPeriod(teaching: boolean) {
    setPeriods((current) => {
      const last = current[current.length - 1]
      const start = last ? last.end_time : '08:00'
      const length = teaching ? 40 : 20
      const teachingCount = current.filter((p) => p.is_teaching).length
      return [
        ...current,
        {
          index: current.length,
          name: teaching ? `P${teachingCount + 1}` : 'Break',
          start_time: start,
          end_time: addMinutes(start, length),
          is_teaching: teaching,
        },
      ]
    })
  }

  function updatePeriod(index: number, patch: Partial<Period>) {
    setPeriods((current) =>
      current.map((period) => (period.index === index ? { ...period, ...patch } : period)),
    )
  }

  function removePeriod(index: number) {
    setPeriods((current) =>
      current.filter((p) => p.index !== index).map((p, i) => ({ ...p, index: i })),
    )
  }

  function applyPreset() {
    const rows: Omit<Period, 'id'>[] = []
    let clock = '08:00'
    let teaching = 0
    for (let i = 0; i < 9; i += 1) {
      const isBreak = i === 4
      const length = isBreak ? 20 : 40
      if (!isBreak) teaching += 1
      rows.push({
        index: i,
        name: isBreak ? 'Break' : `P${teaching}`,
        start_time: clock,
        end_time: addMinutes(clock, length),
        is_teaching: !isBreak,
      })
      clock = addMinutes(clock, length)
    }
    setPeriods(rows)
    notify('Applied a standard 8-period day. Adjust and save.', 'info')
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setLocked(false)
    try {
      await scheduling.saveCalendar({ days, periods })
      notify('School week saved.', 'success')
      await load()
    } catch (err) {
      const message = friendlyApiError(err, 'save the school week')
      if (String((err as { message?: string }).message ?? '').includes('Delete existing')) {
        setLocked(true)
      } else {
        notify(message, 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const teachingCount = periods.filter((p) => p.is_teaching).length
  const activeDays = days.filter((d) => d.is_active).length

  return (
    <>
      <PageHeader
        title="Working days and periods"
        description="The shape of your school week. Everything else is scheduled against this grid."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Setup' }, { label: 'Periods' }]}
      />

      {error ? (
        <ErrorState title="School week could not load" message={error} onRetry={load} />
      ) : loading ? (
        <div className="card section">
          <LoadingBlock label="Loading the school week" rows={5} />
        </div>
      ) : (
        <>
          {locked && (
            <Alert tone="error" title="Timetables already exist">
              Changing the week would invalidate existing lessons. Delete your timetable versions
              first, then update the grid.
            </Alert>
          )}

          <section className="card section">
            <h2 className="section__title">Working days</h2>
            <p className="form__note">{activeDays} teaching days selected.</p>
            <div className="chip-toggles">
              {days.map((day) => (
                <label
                  key={day.index}
                  className={`chip-toggle ${day.is_active ? 'chip-toggle--on' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={day.is_active}
                    onChange={() => toggleDay(day.index)}
                  />
                  {day.name}
                </label>
              ))}
            </div>
          </section>

          <section className="card section">
            <div className="panel__head">
              <h2 className="section__title">Daily periods</h2>
              <Badge>{teachingCount} teaching periods</Badge>
            </div>

            {periods.length === 0 ? (
              <>
                <p className="form__note">No periods defined yet.</p>
                <button type="button" className="button button--primary button--sm" onClick={applyPreset}>
                  Use a standard 8-period day
                </button>
              </>
            ) : (
              <ul className="period-list">
                {periods.map((period) => (
                  <li
                    className={`period-row ${period.is_teaching ? '' : 'period-row--break'}`}
                    key={period.index}
                  >
                    <div className="field field--inline">
                      <label className="visually-hidden" htmlFor={`name-${period.index}`}>
                        Period {period.index + 1} name
                      </label>
                      <input
                        id={`name-${period.index}`}
                        className="input period-row__name"
                        value={period.name}
                        onChange={(event) => updatePeriod(period.index, { name: event.target.value })}
                      />
                    </div>
                    <div className="field field--inline">
                      <label className="visually-hidden" htmlFor={`start-${period.index}`}>
                        Start time
                      </label>
                      <input
                        id={`start-${period.index}`}
                        className="input period-row__time"
                        type="time"
                        value={period.start_time}
                        onChange={(event) =>
                          updatePeriod(period.index, { start_time: event.target.value })
                        }
                      />
                    </div>
                    <div className="field field--inline">
                      <label className="visually-hidden" htmlFor={`end-${period.index}`}>
                        End time
                      </label>
                      <input
                        id={`end-${period.index}`}
                        className="input period-row__time"
                        type="time"
                        value={period.end_time}
                        onChange={(event) =>
                          updatePeriod(period.index, { end_time: event.target.value })
                        }
                      />
                    </div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={period.is_teaching}
                        onChange={(event) =>
                          updatePeriod(period.index, { is_teaching: event.target.checked })
                        }
                      />
                      Teaching
                    </label>
                    <button
                      type="button"
                      className="icon-button icon-button--subtle"
                      onClick={() => removePeriod(period.index)}
                      aria-label={`Remove ${period.name}`}
                    >
                      <CloseIcon width={16} height={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="form__row">
              <button
                type="button"
                className="button button--secondary button--sm"
                onClick={() => addPeriod(true)}
              >
                Add teaching period
              </button>
              <button
                type="button"
                className="button button--secondary button--sm"
                onClick={() => addPeriod(false)}
              >
                Add break
              </button>
            </div>
          </section>

          <div className="form__row">
            <button
              type="button"
              className="button button--primary"
              onClick={save}
              disabled={saving || periods.length === 0 || activeDays === 0}
            >
              {saving ? 'Saving…' : 'Save school week'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
