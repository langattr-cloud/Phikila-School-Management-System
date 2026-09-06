import { useEffect, useMemo, useState } from 'react'
import { Alert } from '../components/Alert'
import { Badge, LoadingBlock } from '../components/States'
import { Link } from '../lib/router'
import { friendlyApiError } from '../lib/api'
import { examinations, type Examination } from '../lib/examinations'
import { students } from '../lib/students'
import { scheduling } from '../lib/scheduling'
import '../examination-dashboard.css'

const stageCards = [
  ['Pre-School', 'Early years'],
  ['Primary G1–G6', 'Primary'],
  ['Junior G7–G9', 'Junior Secondary'],
  ['Senior G10–G12', 'Senior Secondary'],
] as const

export default function ExaminationDashboardPage() {
  const [exams, setExams] = useState<Examination[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [studentCount, setStudentCount] = useState<number | null>(null)
  const [classCount, setClassCount] = useState<number | null>(null)
  const [teacherCount, setTeacherCount] = useState<number | null>(null)
  const [subjectCount, setSubjectCount] = useState<number | null>(null)
  const [connectedError, setConnectedError] = useState(false)

  useEffect(() => {
    let cancelled = false

    void examinations.list()
      .then(nextExams => {
        if (!cancelled) setExams(nextExams)
      })
      .catch(err => {
        if (!cancelled) setError(friendlyApiError(err, 'load examination dashboard'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    void Promise.allSettled([
      students.list({ page: 1, page_size: 1 }),
      scheduling.classes(),
      scheduling.teachers(),
      scheduling.subjects(),
    ]).then(results => {
      if (cancelled) return
      let failed = false
      const [studentResult, classResult, teacherResult, subjectResult] = results
      if (studentResult.status === 'fulfilled') setStudentCount(studentResult.value.total)
      else failed = true
      if (classResult.status === 'fulfilled') setClassCount(classResult.value.length)
      else failed = true
      if (teacherResult.status === 'fulfilled') setTeacherCount(teacherResult.value.length)
      else failed = true
      if (subjectResult.status === 'fulfilled') setSubjectCount(subjectResult.value.length)
      else failed = true
      setConnectedError(failed)
    })

    return () => { cancelled = true }
  }, [])

  const metrics = useMemo(() => ({
    total: exams.length,
    active: exams.filter(item => item.status === 'active').length,
    published: exams.filter(item => item.status === 'published').length,
    locked: exams.filter(item => item.status === 'locked').length,
  }), [exams])

  const recentExams = useMemo(() => [...exams].sort((a, b) => {
    const aTime = Date.parse(a.created_at || a.exam_date || '')
    const bTime = Date.parse(b.created_at || b.exam_date || '')
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
  }).slice(0, 3), [exams])

  return (
    <div className="examination-academia">
      <header className="examination-academia__hero">
        <div>
          <div className="examination-academia__eyebrow">PHIKILA ACADEMIA</div>
          <h1>Examination</h1>
          <p>Plan examinations, coordinate marks entry, publish results and keep every academic stage in one workspace.</p>
        </div>
        <Link className="button button--primary" to="/examinations/setup">Create examination</Link>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? <LoadingBlock label="Loading examination dashboard" rows={5} /> : <>
        <section className="examination-academia__metrics" aria-label="Examination metrics">
          <Metric title="Examinations" value={metrics.total} detail="All examination cycles" />
          <Metric title="Active" value={metrics.active} detail="Open for marks" />
          <Metric title="Published" value={metrics.published} detail="Results released" />
          <Metric title="Locked" value={metrics.locked} detail="Finalised" />
        </section>

        <section className="card examination-academia__workspace">
          <div className="examination-academia__section-head">
            <div>
              <div className="examination-academia__eyebrow">WORKSPACE</div>
              <h2>Examination workspace</h2>
              <p>Move from setup to results without leaving the examination module.</p>
            </div>
            <Link className="button button--secondary button--sm" to="/examinations/setup">Manage examinations</Link>
          </div>
          <div className="examination-academia__work-grid">
            <WorkspaceCard number="01" title="Setup" description="Create examination cycles, dates, marks and pass requirements." to="/examinations/setup" />
            <WorkspaceCard number="02" title="Levels" description="Configure Pre-School, Primary and Secondary examination stages." to="/examinations/levels" />
            <WorkspaceCard number="03" title="Teacher" description="Assign teachers and control marks-entry access." to="/examinations/marks-access" />
            <WorkspaceCard number="04" title="Results" description="Review performance and generate report cards." to="/examinations/report-card" />
            <WorkspaceCard number="05" title="Class" description="Open class-level results and performance summaries." to="/examinations/class-results" />
          </div>
        </section>

        <section className="examination-academia__two-col">
          <div className="card examination-academia__panel">
            <div className="examination-academia__section-head examination-academia__section-head--compact">
              <div>
                <h2>Recent examinations</h2>
                <p>Latest examination activity.</p>
              </div>
              <Link className="button button--ghost button--sm" to="/examinations/setup">View all</Link>
            </div>
            {recentExams.length ? <div className="examination-academia__recent">
              {recentExams.map(exam => <RecentExam key={exam.id} exam={exam} />)}
            </div> : <p className="examination-academia__muted">No examinations have been created yet.</p>}
          </div>

          <div className="card examination-academia__panel">
            <div className="examination-academia__section-head examination-academia__section-head--compact">
              <div>
                <h2>Connected school data</h2>
                <p>Live shared records used by examinations.</p>
              </div>
            </div>
            <div className="examination-academia__connected">
              <Connected label="Students" value={formatCount(studentCount)} to="/students" />
              <Connected label="Classes" value={formatCount(classCount)} to="/setup/academic-setup" />
              <Connected label="Teachers" value={formatCount(teacherCount)} to="/setup/teachers" />
              <Connected label="Subjects" value={formatCount(subjectCount)} to="/setup/subjects" />
            </div>
            {connectedError && <p className="examination-academia__data-note">Some connected totals are temporarily unavailable.</p>}
          </div>
        </section>

        <section className="card examination-academia__levels">
          <div className="examination-academia__section-head">
            <div>
              <div className="examination-academia__eyebrow">ACADEMIC STRUCTURE</div>
              <h2>Examination levels</h2>
              <p>Keep examination configuration aligned with the school's education hierarchy.</p>
            </div>
            <Link className="button button--secondary button--sm" to="/examinations/levels">Manage levels</Link>
          </div>
          <div className="examination-academia__level-grid">
            {stageCards.map(([title, subtitle]) => <Link key={title} className="examination-academia__level" to="/examinations/levels">
              <span className="examination-academia__level-dot" />
              <div><strong>{title}</strong><span>{subtitle}</span></div>
              <span aria-hidden="true">→</span>
            </Link>)}
          </div>
        </section>
      </>}
    </div>
  )
}

function formatCount(value: number | null) {
  return value == null ? '—' : value.toLocaleString('en-KE')
}

function Metric({ title, value, detail }: { title: string; value: number; detail: string }) {
  return <div className="card examination-academia__metric"><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>
}

function WorkspaceCard({ number, title, description, to }: { number: string; title: string; description: string; to: string }) {
  return <Link className="examination-academia__work-card" to={to}><span className="examination-academia__number">{number}</span><strong>{title}</strong><p>{description}</p><span className="examination-academia__open">Open →</span></Link>
}

function RecentExam({ exam }: { exam: Examination }) {
  const tone = exam.status === 'published' ? 'success' : exam.status === 'locked' ? 'info' : 'warning'
  return <div className="examination-academia__recent-item"><div><strong>{exam.name}</strong><span>{exam.exam_date || 'No date'} · {exam.total_marks} marks · Pass {exam.passing_marks}</span></div><Badge tone={tone}>{exam.status}</Badge></div>
}

function Connected({ label, value, to }: { label: string; value: string; to: string }) {
  return <Link className="examination-academia__connected-item" to={to}><div><strong>{value}</strong><span>{label}</span></div><span aria-hidden="true">→</span></Link>
}
