import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState, ErrorState } from '../components/States'
import { useToast } from '../components/Toast'
import { useNavigate } from '../lib/router'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Version } from '../lib/scheduling'

function when(value:string|null|undefined){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString()}
export function VersionsPage(){
 const {notify}=useToast();const navigate=useNavigate();const [version,setVersion]=useState<Version|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const [busy,setBusy]=useState(false)
 const load=useCallback(async()=>{setLoading(true);setError(null);try{setVersion(await scheduling.currentVersion())}catch(e){setError(friendlyApiError(e,'load the current timetable'))}finally{setLoading(false)}},[]);useEffect(()=>{void load()},[load])
 async function publishDraft(){if(!version||busy)return;setBusy(true);try{await scheduling.publish(version.id);notify('Timetable is now in force.','success');await load()}catch(e){notify(friendlyApiError(e,'publish the timetable'),'error')}finally{setBusy(false)}}
 return <><PageHeader title="Current timetable" description="There is one timetable in force at a time. Saving a new timetable replaces the previous one." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'Timetable'}]} actions={<button type="button" className="button button--primary" onClick={()=>navigate('/scheduling/generate')}>Build new timetable</button>}/>{error?<ErrorState title="Current timetable could not load" message={error} onRetry={load}/>:<section className="card section">{loading?<div className="form__note">Loading current timetable…</div>:!version?<EmptyState title="No current timetable" description="Build and publish a timetable to put the first schedule in force."/>:<><div className="panel__head"><div><div className="eyebrow">CURRENT</div><h2 className="section__title">{version.label||version.name||`Timetable ${version.number??''}`}</h2><p className="form__note">Published {when(version.published_at)}. This is the only timetable exposed to users.</p></div><Badge tone="success">In force</Badge></div><div className="builder-footer"><button type="button" className="button button--secondary" onClick={()=>navigate('/timetable')}>Open timetable</button>{version.status!=='published'&&<button type="button" className="button button--primary" onClick={()=>void publishDraft()} disabled={busy}>{busy?'Saving…':'Put in force'}</button>}</div></>}</section>}</>}
