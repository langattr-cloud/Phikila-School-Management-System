import { useCallback, useEffect, useMemo, useState } from 'react'
import './school-structure.css'
import { PageHeader } from '../components/PageHeader'
import { Badge, ErrorState } from '../components/States'
import { LayersIcon } from '../components/icons'
import { api, friendlyApiError, type AcademicYear, type Grade, type Level, type Stream } from '../lib/api'

type LoadedGrade = Grade & { streams: Stream[] }

export function SchoolStructurePage() {
  const [years, setYears] = useState<AcademicYear[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [grades, setGrades] = useState<LoadedGrade[]>([])
  const [yearId, setYearId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const activeYears = useMemo(() => [...years].sort((a, b) => Number(b.name) - Number(a.name)), [years])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [ys, ls, gs] = await Promise.all([api.academicYears(), api.levels(), api.grades()])
      setYears(ys); setLevels(ls)
      const selectedYear = yearId ?? ys.find(x => x.is_current)?.id ?? ys[0]?.id ?? null
      if (selectedYear !== yearId) setYearId(selectedYear)
      setGrades(await Promise.all(gs.map(async g => ({ ...g, streams: selectedYear == null ? [] : await api.streams(selectedYear, g.id) }))))
    } catch (e) { setError(friendlyApiError(e, 'load the school structure')) }
    finally { setLoading(false) }
  }, [yearId])

  useEffect(() => { void load() }, [load])

  const gradesByLevel = useMemo(() => {
    const map = new Map<number, LoadedGrade[]>()
    for (const grade of grades) map.set(grade.level_id, [...(map.get(grade.level_id) ?? []), grade])
    for (const rows of map.values()) rows.sort((a, b) => a.id - b.id)
    return map
  }, [grades])

  return <>
    <PageHeader title="School Structure" description="Level → Grade → Stream from the school's configured academic records." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'School Structure' }]} />
    {error && <ErrorState title="School structure could not be loaded" message={error} onRetry={load} />}
    <section className="card section school-structure__hero">
      <div><p className="eyebrow">Configured academic structure</p><h2 className="section__title">Level → Grade → Stream</h2><p className="section__description">This screen is read from the database. No grade, level, or stream is hard-coded into the admission workflow.</p></div>
      <div className="school-structure__actions"><label className="label" htmlFor="structure-year">Academic year</label><select id="structure-year" className="input" value={yearId ?? ''} onChange={e => setYearId(Number(e.target.value) || null)}><option value="">Select academic year</option>{activeYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>)}</select></div>
    </section>
    <section className="card section">
      {loading ? <p>Loading registered school structure…</p> : !levels.length ? <p>No levels have been configured yet.</p> : <div className="school-structure__tree">{levels.filter(l => l.status !== 'INACTIVE' && l.status !== 'ARCHIVED' && l.status !== false).sort((a,b) => (a.display_order-b.display_order)||a.id-b.id).map(level => {
        const levelGrades = gradesByLevel.get(level.id) ?? []
        return <article className="school-structure__level" key={level.id}>
          <div className="school-structure__level-head"><div><span className="school-structure__code">{level.code}</span><h3>{level.name}</h3></div><Badge tone="success">Configured</Badge></div>
          <div className="school-structure__grades">{!levelGrades.length ? <p>No grades configured.</p> : levelGrades.map(grade => <div className="school-structure__grade" key={grade.id}><div className="school-structure__grade-head"><strong>{grade.name}</strong><span>{grade.code}</span></div>{grade.streams.length ? <div className="school-structure__streams">{grade.streams.map(stream => <span className="school-structure__stream" key={stream.id}><strong>{stream.name}</strong>{stream.code ? ` — ${stream.code}` : ''}</span>)}</div> : <span className="school-structure__no-stream">No stream configured</span>}</div>)}</div>
        </article>
      })}</div>}
    </section>
    <span className="visually-hidden"><LayersIcon width={1} height={1} /></span>
  </>
}
