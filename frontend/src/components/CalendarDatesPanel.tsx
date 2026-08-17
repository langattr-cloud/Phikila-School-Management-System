import { useCallback, useEffect, useState } from 'react'
import { Alert } from './Alert'
import { Badge, ErrorState, LoadingBlock } from './States'
import { CloseIcon } from './icons'
import { useToast } from './Toast'
import { apiFetch, friendlyApiError } from '../lib/api'

type CalendarDate = { id: number; date: string; label: string | null }

const BASE = '/api/v1/scheduling/calendar-dates'

export function CalendarDatesPanel() {
  const { notify } = useToast()
  const [dates, setDates] = useState<CalendarDate[]>([])
  const [date, setDate] = useState('')
  const [label, setLabel] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDates(await apiFetch<CalendarDate[]>(BASE))
    } catch (err) {
      setError(friendlyApiError(err, 'load calendar dates'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function resetForm() {
    setDate('')
    setLabel('')
    setEditingId(null)
  }

  async function save() {
    if (!date || saving) return
    setSaving(true)
    try {
      const payload = { date, label: label.trim() || null }
      if (editingId === null) {
        await apiFetch<CalendarDate>(BASE, { method: 'POST', body: JSON.stringify(payload) })
        notify('Calendar date added.', 'success')
      } else {
        await apiFetch<CalendarDate>(`${BASE}/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) })
        notify('Calendar date updated.', 'success')
      }
      resetForm()
      await load()
    } catch (err) {
      notify(friendlyApiError(err, 'save calendar date'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    try {
      await apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' })
      if (editingId === id) resetForm()
      await load()
      notify('Calendar date removed.', 'success')
    } catch (err) {
      notify(friendlyApiError(err, 'remove calendar date'), 'error')
    }
  }

  function edit(row: CalendarDate) {
    setEditingId(row.id)
    setDate(row.date)
    setLabel(row.label ?? '')
  }

  return (
    <section className="card section">
      <div className="panel__head">
        <div>
          <h2 className="section__title">Specific calendar dates</h2>
          <p className="form__note">Concrete dates are standalone. They do not create or modify recurring weekday rules.</p>
        </div>
        <Badge>{dates.length} dates</Badge>
      </div>
      {error ? <ErrorState title="Calendar dates could not load" message={error} onRetry={load} /> : loading ? <LoadingBlock label="Loading calendar dates" rows={3} /> : (
        <>
          {dates.length > 0 && <ul className="period-list">
            {dates.map((row) => <li className="period-row" key={row.id}>
              <div className="field field--inline"><label className="visually-hidden" htmlFor={`calendar-date-${row.id}`}>Date</label><input id={`calendar-date-${row.id}`} className="input period-row__time" type="date" value={row.date} readOnly /></div>
              <div className="field field--inline"><span className="form__note">{row.label || 'No label'}</span></div>
              <div className="form__row"><button type="button" className="button button--secondary button--sm" onClick={() => edit(row)}>Edit</button><button type="button" className="icon-button icon-button--subtle" onClick={() => void remove(row.id)} aria-label={`Remove ${row.date}`}><CloseIcon width={16} height={16} /></button></div>
            </li>)}
          </ul>}
          <div className="form__row">
            <div className="field field--inline"><label htmlFor="calendar-date-input">Date</label><input id="calendar-date-input" className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
            <div className="field field--inline"><label htmlFor="calendar-date-label">Label (optional)</label><input id="calendar-date-label" className="input" value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Opening day" /></div>
            <button type="button" className="button button--primary button--sm" onClick={() => void save()} disabled={saving || !date}>{saving ? 'Saving…' : editingId === null ? 'Add date' : 'Save date'}</button>
            {editingId !== null && <button type="button" className="button button--secondary button--sm" onClick={resetForm}>Cancel</button>}
          </div>
        </>
      )}
      {dates.length === 0 && !loading && !error && <Alert tone="info" title="No specific dates">Add dates only when you need concrete calendar occurrences. They remain independent from Monday–Sunday settings.</Alert>}
    </section>
  )
}
