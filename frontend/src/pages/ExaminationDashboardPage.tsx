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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-3)', alignItems: 'stretch' }}>
              <Metric title="Examinations" value={metrics.total} detail={`${metrics.draft} draft`} />
              <Metric title="Active" value={metrics.active} detail="Open for marks" />
              <Metric title="Published" value={metrics.published} detail="Results released" />
              <Metric title="Locked" value={metrics.locked} detail="Finalised" />
            </div>
          </section>

          <section className="section">
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <div>
                  <h2 className="section__title" style={{ marginBottom: '.25rem' }}>Examination workspace</h2>
                  <p style={{ color: 'var(--color-ink-muted)', margin: 0 }}>All examination tasks are grouped here. The main sidebar stays uncluttered.</p>
                </div>
                <Link className="button button--primary" to="/examinations/setup">Create / Manage Examination</Link>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(15rem,1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <WorkspaceLink number="01" title="Examination Setup" description="Create examinations, dates, marks and pass requirements." to="/examinations/setup" />
                <WorkspaceLink number="02" title="Levels" description="Configure Pre-School, Primary and Secondary examination levels." to="/examinations/levels" />
                <WorkspaceLink number="03" title="Teacher Assignments" description="Assign teachers and control marks-entry access." to="/examinations/marks-access" />
                <WorkspaceLink number="04" title="Results & Report Cards" description="Review results, analyse performance and generate report cards." to="/examinations/report-card" />
                <WorkspaceLink number="05" title="Class Results" description="View class-level results and performance." to="/examinations/class-results" />
              </div>
            </div>
          </section>

          <section className="section">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(16rem,1fr)', gap: 'var(--space-3)', alignItems: 'start' }}>
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  <h2 className="section__title" style={{ margin: 0 }}>Recent examinations</h2>
                  <Link className="button button--ghost button--sm" to="/examinations/setup">View all</Link>
                </div>
                {!exams.length ? <div style={{ color: 'var(--color-ink-muted)' }}>No examinations have been created yet.</div> : (
                  <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                    {exams.slice(0, 5).map(exam => (
                      <div key={exam.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap' }}>
                        <div>
                          <strong>{exam.name}</strong>
                          <div style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem', marginTop: '.2rem' }}>{exam.exam_date || 'No date'} · {exam.total_marks} marks · Pass {exam.passing_marks}</div>
                        </div>
                        <Badge tone={statusTone(exam.status)}>{exam.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <h2 className="section__title" style={{ marginBottom: '.25rem' }}>Connected modules</h2>
                <p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem', marginTop: 0 }}>Examination uses these existing records instead of duplicating them.</p>
                <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                  <ExistingModule label="Students" to="/students" />
                  <ExistingModule label="Classes" to="/setup/academic-setup" />
                  <ExistingModule label="Teachers" to="/setup/teachers" />
                  <ExistingModule label="Subjects" to="/setup/subjects" />
                </div>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <div>
                  <h2 className="section__title" style={{ marginBottom: '.25rem' }}>Examination levels</h2>
                  <p style={{ color: 'var(--color-ink-muted)', margin: 0 }}>Open level configuration for the school's four education stages.</p>
                </div>
                <Link className="button button--secondary button--sm" to="/examinations/levels">Manage levels</Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                {['Pre-School', 'Primary', 'Junior Secondary', 'Senior Secondary'].map(label => (
                  <div key={label} style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <strong>{label}</strong>
                    <p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem', margin: '.35rem 0 .7rem' }}>{levels.has(label) ? 'Available in current examination data.' : 'Ready for examination configuration.'}</p>
                    <Link className="button button--ghost button--sm" to="/examinations/levels">Configure →</Link>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Metric({ title, value, detail }: { title: string; value: number; detail: string }) {
  return (
    <div className="card" style={{ padding: '1rem 1.1rem', minHeight: '6.8rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ color: 'var(--color-ink-muted)', fontSize: '.78rem', fontWeight: 600, letterSpacing: '.02em' }}>{title}</div>
      <div style={{ fontSize: '2rem', lineHeight: 1.05, fontWeight: 800, marginTop: '.3rem' }}>{value}</div>
      <div style={{ color: 'var(--color-ink-muted)', fontSize: '.75rem', marginTop: '.25rem' }}>{detail}</div>
    </div>
  )
}

function WorkspaceLink({ number, title, description, to }: { number: string; title: string; description: string; to: string }) {
  return (
    <Link className="card" to={to} style={{ padding: 'var(--space-4)', textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div style={{ color: 'var(--color-ink-muted)', fontSize: '.75rem', fontWeight: 700, letterSpacing: '.05em' }}>{number}</div>
      <strong style={{ display: 'block', marginTop: '.35rem' }}>{title}</strong>
      <p style={{ color: 'var(--color-ink-muted)', fontSize: '.85rem', margin: '.4rem 0 0', minHeight: '2.4rem' }}>{description}</p>
      <span className="button button--secondary button--sm" style={{ marginTop: 'var(--space-3)' }}>Open →</span>
    </Link>
  )
}

function ExistingModule({ label, to }: { label: string; to: string }) {
  return <Link className="button button--secondary" to={to} style={{ justifyContent: 'space-between' }}>{label}<span>→</span></Link>
}
