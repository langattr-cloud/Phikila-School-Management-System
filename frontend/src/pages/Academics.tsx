import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { AcademicYear, Term, Level } from '../lib/types'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

type Tab = 'years' | 'terms' | 'levels'

export default function Academics() {
  const [tab, setTab] = useState<Tab>('years')
  const [years, setYears] = useState<AcademicYear[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [y, t, l] = await Promise.all([
        api.getAcademicYears().catch(() => []),
        api.getTerms().catch(() => []),
        api.getLevels().catch(() => []),
      ])
      setYears(y)
      setTerms(t)
      setLevels(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load academics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading academics…" />

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'years', label: 'Academic Years', count: years.length },
    { key: 'terms', label: 'Terms', count: terms.length },
    { key: 'levels', label: 'Levels', count: levels.length },
  ]

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Academic Setup</p>
        <h1 className="page-title">Academics</h1>
        <p className="muted">Manage academic years, terms, levels, and streams.</p>
      </header>

      {error && <div className="toast toast--error">{error}</div>}

      <div className="tab-bar">
        {tabs.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? ' tab--active' : ''}`} type="button" onClick={() => setTab(t.key)}>
            {t.label} <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'years' && (
        years.length === 0
          ? <EmptyState icon="📅" title="No academic years" description="Create an academic year to start organizing your school calendar." />
          : <div className="card-grid">
              {years.map((y) => (
                <div key={y.id} className="info-card">
                  <div className="info-card-header">
                    <p className="info-card-label">{y.name}</p>
                    {y.is_current && <span className="status-pill status-pill--active">Current</span>}
                  </div>
                  <p className="info-card-value">{y.start_date} → {y.end_date}</p>
                  <p className="info-card-meta">Status: {y.status}</p>
                </div>
              ))}
            </div>
      )}

      {tab === 'terms' && (
        terms.length === 0
          ? <EmptyState icon="📆" title="No terms" description="Add terms to divide your academic year." />
          : <div className="card-grid">
              {terms.map((t) => (
                <div key={t.id} className="info-card">
                  <div className="info-card-header">
                    <p className="info-card-label">{t.name}</p>
                    {t.is_current && <span className="status-pill status-pill--active">Current</span>}
                  </div>
                  <p className="info-card-value">{t.start_date ?? '—'} → {t.end_date ?? '—'}</p>
                </div>
              ))}
            </div>
      )}

      {tab === 'levels' && (
        levels.length === 0
          ? <EmptyState icon="📊" title="No levels" description="Define grade levels for your school." />
          : <div className="card-grid">
              {levels.map((l) => (
                <div key={l.id} className="info-card">
                  <p className="info-card-label">{l.code}</p>
                  <p className="info-card-value">{l.name}</p>
                  <p className="info-card-meta">Order: {l.display_order}</p>
                </div>
              ))}
            </div>
      )}
    </div>
  )
}
