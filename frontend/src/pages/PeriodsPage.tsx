import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, ErrorState, LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type DayInput, type PeriodInput } from '../lib/scheduling'

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function makeDays(count: number): DayInput[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    name: `Day ${index + 1}`,
    short_form: `D${index + 1}`,
    date_value: null,
    is_active: true,
  }))
}

export function PeriodsPage() {
  const { notify } = useToast()
  const [days, setDays] = useState<DayInput[]>([])
  const [periods, setPeriods] = useState<PeriodInput[]>([])
  const [mode, setMode] = useState<'day' | 'date'>('day')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const c = await scheduling.calendar()
      setMode(c.display_mode === 'date' ? 'date' : 'day')
      setDays(c.days.length
        ? c.days.map(({ index, name, short_form, date_value, is_active }) => ({
            index,
            name,
            short_form: short_form ?? '',
            date_value: date_value ?? null,
            is_active,
          }))
        : makeDays(5))
      // Do not manufacture P1–P8 (or any other periods). An empty calendar stays empty
      // until an administrator explicitly adds/configures period slots.
      setPeriods(c.periods.map(({ index, name, short_form, start_time, end_time, is_teaching }) => ({
        index,
        name,
        short_form: short_form ?? '',
        start_time,
        end_time,
        is_teaching,
      })))
    } catch (e) {
      setError(friendlyApiError(e, 'load the school calendar'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const updateDay = (index: number, patch: Partial<DayInput>) =>
    setDays(current => current.map(day => day.index === index ? { ...day, ...patch } : day))

  const updatePeriod = (index: number, patch: Partial<PeriodInput>) =>
    setPeriods(current => current.map(period => period.index === index ? { ...period, ...patch } : period))

  const changeDayCount = (count: number) =>
    setDays(current => Array.from({ length: count }, (_, i) => current[i] ?? makeDays(count)[i]))

  const changePeriodCount = (count: number) =>
    setPeriods(current => Array.from({ length: count }, (_, i) => current[i] ?? {
      index: i,
      name: `Period ${i + 1}`,
      short_form: `P${i + 1}`,
      start_time: i === 0 ? '08:20' : addMinutes(current[i - 1]?.end_time ?? '08:20', 0),
      end_time: i === 0 ? '09:00' : addMinutes(current[i - 1]?.end_time ?? '08:20', 40),
      is_teaching: true,
    }))

  const addPeriod = () => {
    setPeriods(current => {
      const index = current.length
      const previous = current[index - 1]
      const start = previous?.end_time || '08:20'
      return [...current, {
        index,
        name: `Period ${index + 1}`,
        short_form: `P${index + 1}`,
        start_time: start,
        end_time: addMinutes(start, 40),
        is_teaching: true,
      }]
    })
  }

  const removePeriod = (index: number) => {
    setPeriods(current => current
      .filter(period => period.index !== index)
      .map((period, newIndex) => ({ ...period, index: newIndex })))
  }

  const teachingCount = periods.filter(p => p.is_teaching).length
  const activeDays = days.filter(d => d.is_active).length
  const dayCount = days.length
  const periodCount = periods.length
  const dateModeNote = useMemo(
    () => mode === 'date'
      ? 'Enter dates in the style you prefer, for example 31/8, 31-8, 31.8, 31/8/2026 or 31-8-2026.'
      : 'Use named days only. Dates are not shown in Days mode.',
    [mode],
  )

  async function save() {
    if (saving) return
    setSaving(true)
    setLocked(false)
    try {
      await scheduling.saveCalendar({
        days: mode === 'date' ? days : days.map(d => ({ ...d, date_value: null })),
        periods,
        display_mode: mode,
      })
      notify('Calendar and periods saved.', 'success')
      await load()
    } catch (e) {
      const message = friendlyApiError(e, 'save the school calendar')
      if (String((e as { message?: string }).message ?? '').includes('Existing timetable lessons')) {
        setLocked(true)
      } else {
        notify(message, 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader title="Working days and periods" description="Configure named days and define as many lesson periods as the school requires." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Setup' }, { label: 'Periods' }]} />
    {error
      ? <ErrorState title="School calendar could not load" message={error} onRetry={load} />
      : loading
        ? <div className="card section"><LoadingBlock label="Loading the school calendar" rows={5} /></div>
        : <>
          {locked && <Alert tone="error" title="Timetable structure is locked">Existing timetable lessons keep their day and period indexes. Rename labels without changing configured slots.</Alert>}

          <section className="card section">
            <div className="panel__head"><h2 className="section__title">Calendar</h2><Badge>{mode === 'date' ? 'Dates' : 'Days'}</Badge></div>
            <div className="form__row">
              <div className="field"><label>Calendar type</label><select className="input" value={mode} onChange={e => setMode(e.target.value as 'day' | 'date')}><option value="day">Days</option><option value="date">Dates</option></select></div>
              <div className="field"><label>{mode === 'date' ? 'Number of dates' : 'Number of days'}</label><select className="input" value={dayCount} onChange={e => changeDayCount(Number(e.target.value))}>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></div>
            </div>
            <p className="form__note">{dateModeNote}</p>
            <ul className="period-list">{days.map(day => <li className="period-row" key={day.index}>
              <strong className="period-row__index">{day.index + 1}</strong>
              {mode === 'day'
                ? <><input className="input period-row__name" aria-label={`Day ${day.index + 1} name`} value={day.name} onChange={e => updateDay(day.index, { name: e.target.value })} /><input className="input" aria-label={`Day ${day.index + 1} short form`} placeholder="Short form" value={day.short_form} onChange={e => updateDay(day.index, { short_form: e.target.value })} /></>
                : <><input className="input period-row__name" aria-label={`Date ${day.index + 1}`} placeholder="31/8 or 31-8-2026" value={day.date_value ?? day.name} onChange={e => updateDay(day.index, { date_value: e.target.value, name: e.target.value })} /><input className="input" aria-label={`Date ${day.index + 1} short form`} placeholder="Short form" value={day.short_form} onChange={e => updateDay(day.index, { short_form: e.target.value })} /></>}
              <label className="checkbox"><input type="checkbox" checked={day.is_active} onChange={() => updateDay(day.index, { is_active: !day.is_active })} />Active</label>
            </li>)}</ul>
          </section>

          <section className="card section">
            <div className="panel__head"><h2 className="section__title">Periods</h2><Badge>{teachingCount} teaching periods</Badge></div>
            <div className="field"><label>Periods per day</label><select className="input" value={periodCount} onChange={e => changePeriodCount(Number(e.target.value))}>{Array.from({ length: 51 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></div>
            <p className="form__note">No fixed P1–P8 limit. Add, remove, rename, reorder, and change the times of as many period slots as the school needs. Mark non-lesson slots such as breaks as non-teaching.</p>
            <ul className="period-list">
              {periods.map(period => <li className={`period-row ${period.is_teaching ? '' : 'period-row--break'}`} key={period.index}>
                <strong className="period-row__index">Period {period.index + 1}</strong>
                <input className="input period-row__name" aria-label={`Period ${period.index + 1} name`} value={period.name} onChange={e => updatePeriod(period.index, { name: e.target.value })} />
                <input className="input" aria-label={`Period ${period.index + 1} short form`} placeholder="Short form" value={period.short_form} onChange={e => updatePeriod(period.index, { short_form: e.target.value })} />
                <input aria-label={`Period ${period.index + 1} start time`} className="input period-row__time" type="time" value={period.start_time} onChange={e => updatePeriod(period.index, { start_time: e.target.value })} />
                <input aria-label={`Period ${period.index + 1} end time`} className="input period-row__time" type="time" value={period.end_time} onChange={e => updatePeriod(period.index, { end_time: e.target.value })} />
                <label className="checkbox"><input type="checkbox" checked={period.is_teaching} onChange={e => updatePeriod(period.index, { is_teaching: e.target.checked })} />Teaching</label>
                <button type="button" className="button button--secondary" onClick={() => removePeriod(period.index)} aria-label={`Remove ${period.name}`}>Remove</button>
              </li>)}
            </ul>
            <div className="form__row" style={{ marginTop: 12 }}>
              <button type="button" className="button button--secondary" onClick={addPeriod}>+ Add teaching period</button>
            </div>
          </section>

          <div className="form__row"><button type="button" className="button button--primary" onClick={save} disabled={saving || periods.length === 0 || activeDays === 0}>{saving ? 'Saving…' : 'Save calendar and periods'}</button></div>
        </>}
  </>
}
