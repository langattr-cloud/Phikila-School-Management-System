import { useCallback, useEffect, useState } from 'react'
import { Alert } from './Alert'
import { LoadingBlock } from './States'
import { useToast } from './Toast'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Subject } from '../lib/scheduling'
import './subject-colour-manager.css'

const FALLBACK_COLOURS = ['#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#CA8A04', '#16A34A', '#0891B2', '#0F766E', '#4F46E5']

function normalise(value: string | null | undefined, index: number) { return /^#[0-9A-Fa-f]{6}$/.test(value ?? '') ? value! : FALLBACK_COLOURS[index % FALLBACK_COLOURS.length] }

export function SubjectColourManager() {
  const { notify } = useToast(); const [subjects, setSubjects] = useState<Subject[]>([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState<number | null>(null); const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); setError(null); try { setSubjects(await scheduling.subjects()) } catch (err) { setError(friendlyApiError(err, 'load subject colours')) } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  async function save(subject: Subject, colour: string) { setSaving(subject.id); try { const updated = await scheduling.updateSubject(subject.id, { name: subject.name, code: subject.code, colour, prefers_morning: subject.prefers_morning, prefers_double: subject.prefers_double, spread_across_week: subject.spread_across_week, required_room_type: subject.required_room_type }); setSubjects(current => current.map(item => item.id === subject.id ? updated : item)); notify(`${subject.name} colour saved.`, 'success') } catch (err) { notify(friendlyApiError(err, `save ${subject.name} colour`), 'error') } finally { setSaving(null) } }
  async function autoAssign() { const updates = subjects.map((subject, index) => ({ subject, colour: normalise(subject.colour, index) })); for (const item of updates) await save(item.subject, item.colour); notify('Subject palette assigned.', 'success') }
  if (loading) return <section className="card section"><LoadingBlock label="Loading subject colours" rows={5} /></section>
  if (error) return <section className="card section"><Alert tone="error" title="Subject colours could not load">{error}</Alert><button className="button button--secondary button--sm" type="button" onClick={() => void load()}>Retry</button></section>
  return <section className="card section subject-colour-manager"><div className="subject-colour-manager__head"><div><h2 className="section__title">Subject Colour Manager</h2><p className="form__note">Choose the colour used by the aSc-style timetable cards. The colour is stored on the subject.</p></div><button type="button" className="button button--secondary button--sm" onClick={() => void autoAssign()} disabled={saving !== null || subjects.length === 0}>Assign palette</button></div><div className="subject-colour-manager__grid">{subjects.map((subject, index) => { const colour = normalise(subject.colour, index); return <div className="subject-colour-row" key={subject.id}><span className="subject-colour-row__swatch" style={{ background: colour }} aria-hidden="true" /><div className="subject-colour-row__name"><strong>{subject.name}</strong><span>{subject.code}</span></div><input className="subject-colour-row__picker" type="color" value={colour} aria-label={`Colour for ${subject.name}`} disabled={saving === subject.id} onChange={event => { const next = event.target.value; setSubjects(current => current.map(item => item.id === subject.id ? { ...item, colour: next } : item)); void save(subject, next) }} /><code>{colour.toUpperCase()}</code></div> })}</div></section>
}
