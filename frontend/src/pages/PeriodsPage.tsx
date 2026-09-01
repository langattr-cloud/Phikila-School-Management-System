import { useCallback, useMemo, useState, useEffect } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, ErrorState, LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type DayInput, type PeriodInput } from '../lib/scheduling'

function makeDay(index: number): DayInput {
  return { index, name: `Day ${index + 1}`, short_form: `D${index + 1}`, date_value: null, is_active: true }
}

function makePeriod(index: number): PeriodInput {
  return { index, name: `Period ${index + 1}`, short_form: `P${index + 1}`, start_time: '', end_time: '', is_teaching: true }
}

export function PeriodsPage() {
  const { notify } = useToast()
  const [days, setDays] = useState<DayInput[]>([])
  const [periods, setPeriods] = useState<PeriodInput[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const c = await scheduling.calendar()
      setDays(c.days.map(({ index, name, short_form, is_active }) => ({ index, name, short_form: short_form ?? '', date_value: null, is_active })))
      setPeriods(c.periods.map(({ index, name, short_form, start_time, end_time, is_teaching }) => ({
        index, name, short_form: short_form ?? '', start_time, end_time, is_teaching,
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
    setDays(current => Array.from({ length: count }, (_, index) => current[index] ?? makeDay(index)))

  const changePeriodCount = (count: number) =>
    setPeriods(current => Array.from({ length: count }, (_, index) => current[index] ?? makePeriod(index)))

  const addPeriod = () => setPeriods(current => [...current, makePeriod(current.length)])

  const removePeriod = (index: number) => {
    setPeriods(current => current.filter(period => period.index !== index).map((period, newIndex) => ({ ...period, index: newIndex })))
  }

  const addDay = () => setDays(current => [...current, makeDay(current.length)])

  const removeDay = (index: number) => {
    setDays(current => current.filter(day => day.index !== index).map((day, newIndex) => ({ ...day, index: newIndex })))
  }

  const teachingCount = periods.filter(p => p.is_teaching).length
  const activeDays = days.filter(d => d.is_active).length
  const invalidPeriods = periods.filter(p => !/^\d{2}:\d{2}$/.test(p.start_time) || !/^\d{2}:\d{2}$/.test(p.end_time) || p.end_time <= p.start_time)
  const dayCount = days.length
  const periodCount = periods.length
  const periodLimit = 31
  const dayLimit = 31
  const canSave = !saving && days.length > 0 && activeDays > 0 && periods.length > 0 && invalidPeriods.length === 0

  const periodValidation = useMemo(() => {
    if (!periods.length) return 'Add at least one period.'
    if (invalidPeriods.length) return 'Every period must have a valid start and end time, with the end after the start.'
    return 'Times are stored exactly as configured by the school. There is no fixed P1–P8 schedule.'
  }, [invalidPeriods.length, periods.length])

  async function save() {
    if (!canSave) return
    setLocked(false)
    setSaving(true)
    try {
      await scheduling.saveCalendar({
        days: days.map(day => ({ ...day, date_value: null })),
        periods,
        display_mode: 'day',
      })
      notify('Working days and teaching periods saved.', 'success')
      await load()
    } catch (e) {
      const message = friendlyApiError(e, 'save the school calendar')
      if (String((e as { message?: string }).message ?? '').includes('Existing timetable lessons')) setLocked(true)
      else notify(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader title="Working days and periods" description="Configure named working days and define as many lesson periods as the school requires." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Setup' }, { label: 'Periods' }]} />
    {error
      ? <ErrorState title="School calendar could not load" message={error} onRetry={load} />
      : loading
        ? <div className="card section"><LoadingBlock label="Loading the school calendar" rows={5} /></div>
        : <>
          {locked && <Alert tone="error" title="Timetable structure is locked">Existing timetable lessons keep their day and period indexes. You can still rename labels and change non-structural display details.</Alert>}

          <section className="card section">
            <div className="panel__head"><div><h2 className="section__title">Working days</h2><p className="form__note">Names are completely configurable. The generated timetable uses these labels; there are no fixed Monday–Sunday names.</p></div><Badge>{activeDays} active</Badge></div>
            <div className="field"><label>Number of configured days</label><select className="input" value={dayCount} onChange={e => changeDayCount(Number(e.target.value))}>{Array.from({ length: dayLimit }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></div>
            <ul className="period-list">{days.map(day => <li className="period-row" key={day.index}>
              <strong className="period-row__index">{day.index + 1}</strong>
              <input className="input period-row__name" aria-label={`Day ${day.index + 1} name`} value={day.name} onChange={e => updateDay(day.index, { name: e.target.value })} placeholder={`Day ${day.index + 1}`} />
              <input className="input" aria-label={`Day ${day.index + 1} short form`} placeholder="Short form" value={day.short_form} onChange={e => updateDay(day.index, { short_form: e.target.value })} />
              <label className="checkbox"><input type="checkbox" checked={day.is_active} onChange={() => updateDay(day.index, { is_active: !day.is_active })} />Active</label>
              <button type="button" className="button button--secondary" onClick={() => removeDay(day.index)} disabled={days.length <= 1} aria-label={`Remove ${day.name}`}>Remove</button>
            </li>)}</ul>
            <button type="button" className="button button--secondary" onClick={addDay} disabled={days.length >= dayLimit}>+ Add working day</button>
          </section>

          <section className="card section">
            <div className="panel__head"><div><h2 className="section__title">Teaching periods</h2><p className="form__note">Period count and times are school-configured. Nothing in this screen assumes eight periods or a particular school day.</p></div><Badge>{teachingCount} teaching</Badge></div>
            <div className="field"><label>Number of period slots</label><select className="input" value={periodCount} onChange={e => changePeriodCount(Number(e.target.value))}>{Array.from({ length: periodLimit + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></div>
            <p className="form__note">{periodValidation}</p>
            <ul className="period-list">
              {periods.map(period => <li className={`period-row ${period.is_teaching ? '' : 'period-row--break'}`} key={period.index}>
                <strong className="period-row__index">Slot {period.index + 1}</strong>
                <input className="input period-row__name" aria-label={`Period ${period.index + 1} name`} value={period.name} onChange={e => updatePeriod(period.index, { name: e.target.value })} />
                <input className="input" aria-label={`Period ${period.index + 1} short form`} placeholder="Short form" value={period.short_form} onChange={e => updatePeriod(period.index, { short_form: e.target.value })} />
                <input aria-label={`Period ${period.index + 1} start time`} className="input period-row__time" type="time" value={period.start_time} onChange={e => updatePeriod(period.index, { start_time: e.target.value })} />
                <input aria-label={`Period ${period.index + 1} end time`} className="input period-row__time" type="time" value={period.end_time} onChange={e => updatePeriod(period.index, { end_time: e.target.value })} />
                <label className="checkbox"><input type="checkbox" checked={period.is_teaching} onChange={e => updatePeriod(period.index, { is_teaching: e.target.checked })} />Teaching</label>
                <button type="button" className="button button--secondary" onClick={() => removePeriod(period.index)} aria-label={`Remove ${period.name}`}>Remove</button>
              </li>)}
            </ul>
            <button type="button" className="button button--secondary" onClick={addPeriod} disabled={periods.length >= periodLimit}>+ Add period</button>
          </section>

          <div className="form__row"><button type="button" className="button button--primary" onClick={() => void save()} disabled={!canSave}>{saving ? 'Saving…' : 'Save calendar and periods'}</button></div>
        </>}
  </>
}
