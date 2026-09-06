import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, LoadingBlock } from '../components/States'
import { Link } from '../lib/router'
import { examinations, type ExamSeries, type Examination } from '../lib/examinations'
import { friendlyApiError } from '../lib/api'

function statusTone(status: Examination['status']) {
  if (status === 'published') return 'success' as const
  if (status === 'locked') return 'info' as const
  return 'warning' as const
}

function levelLabel(name: string) {
  const value = name.toLowerCase()
  if (value.includes('pre')) return 'Pre-School'
  if (value.includes('junior')) return 'Junior Secondary'
  if (value.includes('senior')) return 'Senior Secondary'
  if (value.includes('primary')) return 'Primary'
  return null
}

export default function ExaminationDashboardPage() {
  const [series, setSeries] = useState<ExamSeries[]>([])
  const [exams, setExams] = useState<Examination[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([examinations.listSeries(), examinations.list()])
      .then(([nextSeries, nextExams]) => {
        if (cancelled) return
        setSeries(nextSeries)
        setExams(nextExams)
      })
      .catch(err => { if (!cancelled) setError(friendlyApiError(err, 'load examination dashboard')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const metrics = useMemo(() => ({
    total: exams.length,
    active: exams.filter(item => item.status === 'active').length,
    published: exams.filter(item => item.status === 'published').length,
    locked: exams.filter(item => item.status === 'locked').length,
    draft: exams.filter(item => item.status === 'draft').length,
  }), [exams])

  const levels = useMemo(() => {
    const found = new Set<string>()
    ;[...series.map(item => item.name), ...exams.map(item => item.name)].forEach(name => {
      const label = levelLabel(name)
      if (label) found.add(label)
    })
    return found
  }, [series, exams])

  return (
    <div>
      <PageHeader
        title="Examination"
        description="One workspace for examination setup, marks, results, report cards, and performance monitoring. Existing Teachers, Classes, Subjects, and Students remain the source of truth."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? <LoadingBlock label="Loading examination dashboard" rows={4} /> : (
        <>
          <section className="section">
            <div className="dashboard-grid">
              <Metric title="Examinations" value={metrics.total} detail={`${metrics.draft} draft`} />
              <Metric title="Active" value={metrics.active} detail="Open for marks" />
              <Metric title="Published" value={metrics.published} detail="Results released" />
              <Metric title="Locked" value={metrics.locked} detail="Finalised" />
            </div>
          </section>

          <section className="section">
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div>
                <h2 className="section__title" style={{ marginBottom: '.25rem' }}>Examination workspace</h2>
                <p style={{ color: 'var(--color-ink-muted)', margin: 0 }}>Choose an examination function below. These options are kept inside the Examination module rather than in the main sidebar.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <WorkspaceLink title="Examination Setup" description="Create and manage examinations." to="/examinations/setup" />
                <WorkspaceLink title="Levels" description="Configure examination levels." to="/examinations/levels" />
                <WorkspaceLink title="Teacher Assignments" description="Manage marks access and teacher assignments." to="/examinations/marks-access" />
                <WorkspaceLink title="Results & Report Cards" description="Review results and generate report cards." to="/examinations/report-card" />
                <WorkspaceLink title="Class Results" description="View results by class." to="/examinations/class-results" />
              </div>
            </div>
          </section>

          <section className="section">
            <h2 className="section__title">Examination levels</h2>
            <div className="dashboard-grid">
              {['Pre-School', 'Primary', 'Junior Secondary', 'Senior Secondary'].map(label => (
                <div className="card" key={label} style={{ padding: 'var(--space-4)' }}>
                  <strong>{label}</strong>
                  <p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem', minHeight: '2.5rem' }}>
                    {levels.has(label) ? 'Available in current examination data.' : 'Ready for examination configuration.'}
                  </p>
                  <Link className="button button--secondary button--sm" to="/examinations/levels">Open level configuration</Link>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h2 className="section__title">Connected school modules</h2>
              <p style={{ color: 'var(--color-ink-muted)' }}>These are existing modules. Examination reads from them; it does not duplicate their management screens.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))', gap: 'var(--space-2)' }}>
                <ExistingModule label="Students" to="/students" />
                <ExistingModule label="Classes" to="/setup/academic-setup" />
                <ExistingModule label="Teachers" to="/setup/teachers" />
                <ExistingModule label="Subjects" to="/setup/subjects" />
              </div>
            </div>
          </section>

          <section className="section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <h2 className="section__title">Recent examinations</h2>
              <Link className="button button--ghost button--sm" to="/examinations/setup">View all</Link>
            </div>
            {!exams.length ? <div className="card" style={{ padding: 'var(--space-4)', color: 'var(--color-ink-muted)' }}>No examinations have been created yet.</div> : (
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {exams.slice(0, 5).map(exam => (
                  <div className="card" key={exam.id} style={{ padding: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <div>
                      <strong>{exam.name}</strong>
                      <div style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>{exam.exam_date || 'No date'} · {exam.total_marks} marks · Pass {exam.passing_marks}</div>
                    </div>
                    <Badge tone={statusTone(exam.status)}>{exam.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Metric({ title, value, detail }: { title: string; value: number; detail: string }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem' }}>{title}</div>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '.2rem' }}>{value}</div>
      <div style={{ color: 'var(--color-ink-muted)', fontSize: '.8rem' }}>{detail}</div>
    </div>
  )
}

function WorkspaceLink({ title, description, to }: { title: string; description: string; to: string }) {
  return (
    <Link className="card" to={to} style={{ padding: 'var(--space-4)', textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <strong>{title}</strong>
      <p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem', margin: '.4rem 0 0' }}>{description}</p>
      <span className="button button--secondary button--sm" style={{ marginTop: 'var(--space-3)' }}>Open →</span>
    </Link>
  )
}

function ExistingModule({ label, to }: { label: string; to: string }) {
  return <Link className="button button--secondary" to={to}>{label} →</Link>
}
