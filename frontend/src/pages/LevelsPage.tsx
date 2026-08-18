import { useCallback, useMemo, useState } from 'react'
import { Link } from '../lib/router'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { DataTable, type Column } from '../components/DataTable'
import { LayersIcon, SearchIcon } from '../components/icons'
import { api, friendlyApiError, type Level } from '../lib/api'
import { useAsync } from '../lib/useAsync'

const PAGE_SIZE=10
export function LevelsPage(){
 const toMessage=useCallback((error:unknown)=>friendlyApiError(error,'load levels'),[])
 const {data,loading,error,reload}=useAsync<Level[]>(api.levels,toMessage); const [query,setQuery]=useState(''); const [page,setPage]=useState(1); const term=query.trim().toLowerCase()
 const filtered=useMemo(()=>[...(Array.isArray(data)?data:[])].filter(x=>!term||x.name.toLowerCase().includes(term)||x.code.toLowerCase().includes(term)).sort((a,b)=>a.display_order-b.display_order),[data,term]); const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)); const currentPage=Math.min(page,pageCount); const visible=filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE)
 const columns:Column<Level>[]=[{key:'name',header:'Level',render:r=>r.name},{key:'code',header:'Code',render:r=>r.code},{key:'order',header:'Order',render:r=>r.display_order},{key:'status',header:'Status',render:r=>r.status===false?<Badge tone="warning">Inactive</Badge>:<Badge tone="success">Active</Badge>}]
 return <><PageHeader title="Education Levels" description="Configure the broad education sections used by the school." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'Education Levels'}]}/>{error?<ErrorState title="Levels could not load" message={error} onRetry={reload}/>:<section className="card section"><div className="toolbar"><div className="search"><SearchIcon className="search__icon" width={18} height={18}/><label className="visually-hidden" htmlFor="levels-search">Search levels</label><input id="levels-search" className="input input--search" type="search" placeholder="Search by name or code" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div><div className="toolbar__actions"><Link to="/setup/grades" className="button button--secondary">Manage grades</Link>{query&&<button type="button" className="button button--ghost button--sm" onClick={()=>{setQuery('');setPage(1)}}>Clear search</button>}</div></div><DataTable caption="Education levels" columns={columns} rows={visible} rowKey={r=>r.id} loading={loading} loadingLabel="Loading levels" empty={<EmptyState title={query?'No matching levels':'No levels found'} description="Create education levels such as Pre-School, Primary, Junior School, and Senior School." icon={<LayersIcon width={22} height={22}/>}/>} />{!loading&&filtered.length>PAGE_SIZE&&<nav className="pagination" aria-label="Levels pagination"><button type="button" className="button button--secondary button--sm" onClick={()=>setPage(v=>Math.max(1,v-1))} disabled={currentPage===1}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" className="button button--secondary button--sm" onClick={()=>setPage(v=>Math.min(pageCount,v+1))} disabled={currentPage===pageCount}>Next</button></nav>}</section>}</>
}
