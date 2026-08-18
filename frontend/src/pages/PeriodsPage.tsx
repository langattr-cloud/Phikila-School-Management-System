import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, ErrorState, LoadingBlock } from '../components/States'
import { TimetableEventsEditor } from '../components/TimetableEventsEditor'
import { CloseIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Day, type Period } from '../lib/scheduling'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DEFAULT_PERIODS: Omit<Period, 'id'>[] = [
  { index: 0, name: 'P1', start_time: '08:00', end_time: '08:45', is_teaching: true },
  { index: 1, name: 'P2', start_time: '08:45', end_time: '09:30', is_teaching: true },
  { index: 2, name: 'P3', start_time: '09:30', end_time: '10:15', is_teaching: true },
  { index: 3, name: 'Break', start_time: '10:15', end_time: '10:45', is_teaching: false },
  { index: 4, name: 'P4', start_time: '10:45', end_time: '11:30', is_teaching: true },
  { index: 5, name: 'P5', start_time: '11:30', end_time: '12:15', is_teaching: true },
  { index: 6, name: 'P6', start_time: '12:15', end_time: '13:00', is_teaching: true },
  { index: 7, name: 'Lunch', start_time: '13:00', end_time: '14:00', is_teaching: false },
  { index: 8, name: 'P7', start_time: '14:00', end_time: '14:45', is_teaching: true },
  { index: 9, name: 'P8', start_time: '14:45', end_time: '15:30', is_teaching: true },
]

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

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
      const c = await scheduling.calendar()
      setDays(
        c.days.length
          ? c.days.map(({ index, name, is_active }) => ({ index, name, is_active }))
          : WEEKDAYS.map((name, index) => ({ index, name, is_active: index < 5 })),
      )
      setPeriods(
        c.periods.length
          ? c.periods.map(({ index, name, start_time, end_time, is_teaching }) => ({
              index,
              name,
              start_time,
              end_time,
              is_teaching,
            }))
          : DEFAULT_PERIODS.map((p) => ({ ...p })),
      )
    } catch (e) {
      setError(friendlyApiError(e, 'load the school week'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function toggleDay(index: number) {
    setDays((current) => current.map((day) =>
      day.index === index ? { ...day, is_active: !day.is_active } : day,
    ))
  }

  function addPeriod(teaching: boolean) {
    setPeriods((current) => {
      const last = current[current.length - 1]
      const start = last ? last.end_time : '08:00'
      const length = teaching ? 40 : 20
      const count = current.filter((period) => period.is_teaching).length
      return [...current, { index: current.length, name: teaching ? `P${count + 1}` : 'Break', start_time: start, end_time: addMinutes(start, length), is_teaching: teaching }]
    })
  }

  function updatePeriod(index: number, patch: Partial<Period>) {
    setPeriods((current) => current.map((period) =>
      period.index === index ? { ...period, ...patch } : period,
    ))
  }

  function removePeriod(index: number) {
    setPeriods((current) => current.filter((period) => period.index !== index).map((period, i) => ({ ...period, index: i })))
  }

  function applyPreset() {
    const rows: Omit<Period, 'id'>[] = []
    let clock = '08:00'
    let teaching = 0
    for (let i = 0; i < 9; i += 1) {
      const br = i === 4
      const length = br ? 20 : 40
      if (!br) teaching += 1
      rows.push({ index: i, name: br ? 'Break' : `P${teaching}`, start_time: clock, end_time: addMinutes(clock, length), is_teaching: !br })
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
    } catch (e) {
      const message = friendlyApiError(e, 'save the school week')
      if (String((e as { message?: string }).message ?? '').includes('Existing timetable lessons')) setLocked(true)
      else notify(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const teachingCount = periods.filter((period) => period.is_teaching).length
  const activeDays = days.filter((day) => day.is_active).length

  return (
    <>
      <PageHeader
        title="Working days and periods"
        description="Configure standard weekdays or custom day labels, including dates, while keeping the underlying day indexes stable."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Setup' }, { label: 'Periods' }]}
      />
      {error ? (
        <ErrorState title="School week could not load" message={error} onRetry={load} />
      ) : loading ? (
        <div className="card section"><LoadingBlock label="Loading the school week" rows={5} /></div>
      ) : (
        <>
          {locked && <Alert tone="error" title="Timetable structure is locked">Existing timetable lessons keep their day and period indexes. You can still rename day or period labels without changing the schedule.</Alert>}
          <section className="card section">
            <div className="panel__head"><h2 className="section__title">Working days</h2><Badge>{activeDays} active</Badge></div>
            <p className="form__note">Use Monday–Sunday for standard mode, or rename any day to a custom label such as Day 1, Week A, Morning Session, or 23/04/2026. The day index remains stable.</p>
            <ul className="period-list">{days.map((day) => <li className="period-row" key={day.index}><div className="field field--inline"><label className="visually-hidden" htmlFor={`day-name-${day.index}`}>Day {day.index + 1} label</label><input id={`day-name-${day.index}`} className="input period-row__name" value={day.name} onChange={(e) => setDays((current) => current.map((item) => item.index === day.index ? { ...item, name: e.target.value } : item))} /></div><label className="checkbox"><input type="checkbox" checked={day.is_active} onChange={() => toggleDay(day.index)} />Active</label></li>)}</ul>
          </section>
          <section className="card section">
            <div className="panel__head"><h2 className="section__title">Daily periods</h2><Badge>{teachingCount} teaching periods</Badge></div>
            {periods.length === 0 ? <><p className="form__note">No periods defined yet.</p><button type="button" className="button button--primary button--sm" onClick={applyPreset}>Use a standard 8-period day</button></> : <ul className="period-list">{periods.map((period) => <li className={`period-row ${period.is_teaching ? '' : 'period-row--break'}`} key={period.index}><div className="field field--inline"><label className="visually-hidden" htmlFor={`name-${period.index}`}>Period {period.index + 1} name</label><input id={`name-${period.index}`} className="input period-row__name" value={period.name} onChange={(e) => updatePeriod(period.index, { name: e.target.value })} /></div><div className="field field--inline"><input aria-label="Start time" className="input period-row__time" type="time" value={period.start_time} onChange={(e) => updatePeriod(period.index, { start_time: e.target.value })} /></div><div className="field field--inline"><input aria-label="End time" className="input period-row__time" type="time" value={period.end_time} onChange={(e) => updatePeriod(period.index, { end_time: e.target.value })} /></div><label className="checkbox"><input type="checkbox" checked={period.is_teaching} onChange={(e) => updatePeriod(period.index, { is_teaching: e.target.checked })} />Teaching</label><button type="button" className="icon-button icon-button--subtle" onClick={() => removePeriod(period.index)} aria-label={`Remove ${period.name}`}><CloseIcon width={16} height={16} /></button></li>)}</ul>}
            <div className="form__row"><button type="button" className="button button--secondary button--sm" onClick={() => addPeriod(true)}>Add teaching period</button><button type="button" className="button button--secondary button--sm" onClick={() => addPeriod(false)}>Add break</button></div>
          </section>
          <div className="form__row"><button type="button" className="button button--primary" onClick={save} disabled={saving || periods.length === 0 || activeDays === 0}>{saving ? 'Saving…' : 'Save school week'}</button></div>
          <TimetableEventsEditor />
        </>
      )}
    </>
  )
}
