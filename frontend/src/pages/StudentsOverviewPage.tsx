import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { EmptyState, LoadingBlock } from '../components/States'
import { api, friendlyApiError, type Grade, type Level, type SchoolClassSetup } from '../lib/api'
import { students } from '../lib/students'
import { Link } from '../lib/router'

type GradeRow = Grade & { levelName: string; learnerCount: number; classes: { id:number; name:string; code:string }[] }

export default function StudentsOverviewPage() {
  const [levels, setLevels] = useState<Level[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [classes, setClasses] = useState<SchoolClassSetup[]>([])
  const [learnerCounts, setLearnerCounts] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError(null)
      try {
        const [loadedLevels, loadedGrades, loadedClasses, loadedStudents] = await Promise.all([
          api.levels(), api.grades(), api.schoolClasses(), students.list({ page: 1, page_size: 1000, status: 'active' }),
        ])
        if (!active) return
        setLevels(loadedLevels); setGrades(loadedGrades); setClasses(loadedClasses)
        const counts: Record<number, number> = {}
        loadedStudents.items.forEach(s => {
          const levelId = loadedClasses.find(c => c.id === (s as typeof s & { current_class_id?: number }).current_class_id)?.level_id
          if (levelId != null) counts[levelId] = (counts[levelId] || 0) + 1
        })
        setLearnerCounts(counts)
      } catch (err) { if (active) setError(friendlyApiError(err, 'load student overview')) }
      finally { if (active) setLoading(false) }
    }
    void load(); return () => { active = false }
  }, [])

  const rows = useMemo<GradeRow[]>(() => grades.filter(g => g.status !== false).map(g => {
    const level = levels.find(l => l.id === g.level_id)
    return { ...g, levelName: level?.name || 'Level', learnerCount: learnerCounts[g.level_id] || 0, classes: classes.filter(c => c.level_id === g.level_id && c.status !== 'inactive').map(c => ({ id:c.id, name:c.name, code:c.code })) }
  }).sort((a,b) => a.levelName.localeCompare(b.levelName) || a.name.localeCompare(b.name)), [grades, levels, classes, learnerCounts])

  const totalLearners = Object.values(learnerCounts).reduce((sum, count) => sum + count, 0)
  return <div>
    <PageHeader title="Students" description="Browse learners by grade and class." actions={<Link className="button button--primary button--sm" to="/students/list">View all learners</Link>} />
    {error && <Alert tone="error">{error}</Alert>}
    {loading ? <LoadingBlock label="Loading student overview" rows={6} /> : rows.length === 0 ? <EmptyState title="No grades found" description="Set up grades and classes before viewing the student overview." /> : <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(12rem,1fr))', gap:'var(--space-3)', marginBottom:'var(--space-5)' }}>
        <div className="card section"><p style={{margin:0,color:'var(--color-ink-muted)',fontSize:'0.85rem'}}>Active learners</p><strong style={{fontSize:'1.7rem'}}>{totalLearners}</strong></div>
        <div className="card section"><p style={{margin:0,color:'var(--color-ink-muted)',fontSize:'0.85rem'}}>Grades</p><strong style={{fontSize:'1.7rem'}}>{rows.length}</strong></div>
        <div className="card section"><p style={{margin:0,color:'var(--color-ink-muted)',fontSize:'0.85rem'}}>Classes</p><strong style={{fontSize:'1.7rem'}}>{classes.length}</strong></div>
      </div>
      <div className="card section" style={{padding:0,overflow:'hidden'}}><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.9rem'}}>
        <thead><tr style={{borderBottom:'2px solid var(--color-line)'}}><th style={{padding:'var(--space-3)',textAlign:'left'}}>Grade</th><th style={{padding:'var(--space-3)',textAlign:'left'}}>Level</th><th style={{padding:'var(--space-3)',textAlign:'right'}}>Learners</th><th style={{padding:'var(--space-3)',textAlign:'right'}}>View</th></tr></thead>
        <tbody>{rows.map(row => <>
          <tr key={row.id} style={{borderBottom:'1px solid var(--color-line)'}}><td style={{padding:'var(--space-3)',fontWeight:700}}>{row.name}</td><td style={{padding:'var(--space-3)'}}>{row.levelName}</td><td style={{padding:'var(--space-3)',textAlign:'right',fontWeight:700}}>{row.learnerCount}</td><td style={{padding:'var(--space-3)',textAlign:'right'}}><button className="button button--ghost button--sm" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{expanded === row.id ? 'Hide' : 'View'}</button></td></tr>
          {expanded === row.id && <tr key={`${row.id}-detail`}><td colSpan={4} style={{padding:'var(--space-3) var(--space-5)',background:'var(--color-surface-muted, #f7f7f7)'}}><div style={{display:'flex',gap:'var(--space-2)',flexWrap:'wrap'}}><Link className="button button--secondary button--sm" to={`/students/list?grade_id=${row.id}`}>View grade learners</Link>{row.classes.map(c => <span key={c.id} style={{padding:'0.45rem 0.65rem',border:'1px solid var(--color-line)',borderRadius:'var(--radius-md)'}}>{c.name}{c.code ? ` (${c.code})` : ''}</span>)}</div></td></tr>}
        </>)}</tbody>
      </table></div></div>
    </>}
  </div>
}
