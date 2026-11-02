import { useCallback, useEffect, useState } from 'react'
import { Alert } from '../components/Alert'
import { LoadingBlock } from '../components/States'
import { apiFetch, friendlyApiError } from '../lib/api'
import { PageHeader } from '../components/PageHeader'

type SchoolLibrary = {
  school_id: number
  school_name: string
  total_titles: number
  total_copies: number
  available_copies: number
  with_teachers: number
  with_students: number
  lost_copies: number
}
type Overview = { schools: SchoolLibrary[]; school_count: number }

export default function PlatformLibraryPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await apiFetch<Overview>('/api/v1/library/platform-overview'))
    } catch (err) {
      setError(friendlyApiError(err, 'load the platform Library overview'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const totals = (key: keyof Omit<SchoolLibrary, 'school_id' | 'school_name'>) =>
    data?.schools.reduce((sum, school) => sum + Number(school[key] || 0), 0) ?? 0

  return <div className="dashboard-page">
    <PageHeader title="Platform Library" description="Cross-school Library overview. Only schools individually granted Library access are included. Detailed school inventory remains within each school's authorized account." breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Library' }]} />
    {error && <Alert tone="error" title="Library overview unavailable">{error}</Alert>}
    {loading ? <LoadingBlock label="Loading platform Library overview" rows={5} /> : data && <>
      <div className="dashboard-grid" style={{ marginBottom: 20 }}>
        {[
          ['Enabled schools', data.school_count],
          ['Registered titles', totals('total_titles')],
          ['Physical copies', totals('total_copies')],
          ['Available copies', totals('available_copies')],
          ['With teachers', totals('with_teachers')],
          ['With students', totals('with_students')],
          ['Lost copies', totals('lost_copies')],
        ].map(([label, value]) => <section className="card section" key={String(label)}>
          <p className="text-muted">{label}</p><h2 className="section__title">{Number(value).toLocaleString()}</h2>
        </section>)}
      </div>
      <section className="card section">
        <div className="dashboard-section__head"><div><p>Entitled schools</p><h2 className="section__title">Library access by school</h2></div><button className="button button--secondary" type="button" onClick={() => void load()}>Refresh</button></div>
        {data.schools.length === 0 ? <p className="text-muted">No schools have been granted Library access yet. Enable Library individually under Platform → School module access.</p> :
          <div className="table-wrap"><table className="data-table"><thead><tr><th>School</th><th>Titles</th><th>Copies</th><th>Available</th><th>With teachers</th><th>With students</th><th>Lost</th></tr></thead>
            <tbody>{data.schools.map(school => <tr key={school.school_id}><th scope="row">{school.school_name}</th><td>{school.total_titles}</td><td>{school.total_copies}</td><td>{school.available_copies}</td><td>{school.with_teachers}</td><td>{school.with_students}</td><td>{school.lost_copies}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </div>
}
