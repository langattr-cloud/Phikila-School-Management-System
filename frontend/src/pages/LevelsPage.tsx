import { useCallback, useMemo, useState } from 'react'
import { Link } from '../lib/router'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { LayersIcon, SearchIcon } from '../components/icons'
import { api, friendlyApiError, type Grade } from '../lib/api'
import { useAsync } from '../lib/useAsync'

const PAGE_SIZE = 10

export function LevelsPage() {
  const toMessage = useCallback((error: unknown) => friendlyApiError(error, 'load grades'), [])
  const { data, loading, error, reload } = useAsync<Grade[]>(api.grades, toMessage)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const term = query.trim().toLowerCase()
  const filtered = useMemo(() => { const rows=(Array.isArray(data)?data:[]).filter((grade)=>!term||grade.name.toLowerCase().includes(term)||grade.code.toLowerCase().includes(term)); return [...rows].sort((a,b)=>a.display_order-b.display_order) }, [data, term])
  const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)); const currentPage=Math.min(page,pageCount); const visible=filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE)
  const columns: Column<Grade>[]=[{key:'name',header:'Grade',render:(row)=>row.name},{key:'code',header:'Code',render:(row)=>row.code},{key:'order',header:'Order',render:(row)=>row.display_order},{key:'status',header:'Status',render:(row)=>row.status===false?<Badge tone="warning">Inactive</Badge>:<Badge tone="success">Active</Badge>}]
  return <>
    <PageHeader title="Grades" description="Grades configured for this school." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'Grades'}]} />
    {error?<ErrorState title="Grades could not load" message={error} onRetry={reload}/>:<section className="card section">
      <div className="toolbar"><div className="search"><SearchIcon className="search__icon" width={18} height={18}/><label className="visually-hidden" htmlFor="levels-search">Search grades</label><input id="levels-search" className="input input--search" type="search" placeholder="Search by name or code" value={query} onChange={(event)=>{setQuery(event.target.value);setPage(1)}}/></div><div className="toolbar__actions"><Link to="/setup/streams" className="button button--secondary">Manage streams</Link>{query&&<button type="button" className="button button--ghost button--sm" onClick={()=>{setQuery('');setPage(1)}}>Clear search</button>}</div></div>
      <DataTable caption="Grades" columns={columns} rows={visible} rowKey={(row)=>row.id} loading={loading} loadingLabel="Loading grades" empty={<EmptyState title={query?'No matching grades':'No grades found'} description={query?'No grade matches your search. Clear the search to see everything.':'Grades appear here once they have been created for this school.'} icon={<LayersIcon width={22} height={22}/>}/>} />
      {!loading&&filtered.length>PAGE_SIZE&&<nav className="pagination" aria-label="Grades pagination"><button type="button" className="button button--secondary button--sm" onClick={()=>setPage((value)=>Math.max(1,value-1))} disabled={currentPage===1}>Previous</button><span aria-live="polite">Page {currentPage} of {pageCount}</span><button type="button" className="button button--secondary button--sm" onClick={()=>setPage((value)=>Math.min(pageCount,value+1))} disabled={currentPage===pageCount}>Next</button></nav>}
    </section>}
  </>
}
