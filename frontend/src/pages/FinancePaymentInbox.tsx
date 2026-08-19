import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { friendlyApiError } from '../lib/api'
import { finance, type Invoice, type PaymentInboxItem } from '../lib/finance'

export default function FinancePaymentInboxPage() {
  const [items,setItems]=useState<PaymentInboxItem[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState<string|null>(null)
  const [status,setStatus]=useState('')
  const [posting,setPosting]=useState<number|null>(null)
  const [invoices,setInvoices]=useState<Record<number, Invoice[]>>({})
  const [invoiceIds,setInvoiceIds]=useState<Record<number, string>>({})

  const load=useCallback(async()=>{
    setLoading(true); setError(null)
    try {
      const next=await finance.listPaymentInbox(status||undefined)
      setItems(next)
      const matched=next.filter(item=>item.status==='MATCHED' && item.matched_student_id)
      const invoiceEntries=await Promise.all(matched.map(async item=>{
        const studentId=item.matched_student_id as number
        const [pending,partial]=await Promise.all([
          finance.listInvoices({student_id:studentId,status:'pending'}),
          finance.listInvoices({student_id:studentId,status:'partial'}),
        ])
        const open=[...pending,...partial].filter(inv=>Number(inv.balance)>0)
        return [item.id,open] as const
      }))
      setInvoices(Object.fromEntries(invoiceEntries))
      setInvoiceIds(prev=>{
        const nextIds={...prev}
        for(const [id,open] of invoiceEntries){
          if(open.length===1) nextIds[id]=String(open[0].id)
        }
        return nextIds
      })
    }catch(e){setError(friendlyApiError(e,'load payment inbox'))}
    finally{setLoading(false)}
  },[status])

  useEffect(()=>{void load()},[load])

  async function post(item:PaymentInboxItem){
    const invoiceId=invoiceIds[item.id]
    setPosting(item.id); setError(null)
    try {
      await finance.postPaymentInbox(item.id, invoiceId ? {invoice_id:Number(invoiceId)} : undefined)
      await load()
    }catch(e){setError(friendlyApiError(e,'post payment'))}
    finally{setPosting(null)}
  }

  return <div><PageHeader title="Payment Inbox" description="Review decoded external payments before they enter the student ledger and General Ledger."/>{error&&<Alert tone="error">{error}</Alert>}
    <div style={{display:'flex',gap:'var(--space-2)',marginBottom:'var(--space-4)'}}><select className="input" value={status} onChange={e=>setStatus(e.target.value)} style={{maxWidth:220}}><option value="">All statuses</option><option>MATCHED</option><option>UNMATCHED</option><option>POSTED</option><option>DUPLICATE</option></select><button className="button button--secondary button--sm" onClick={()=>void load}>Refresh</button></div>
    {loading?<LoadingBlock label="Loading payment inbox" rows={5}/>:!items.length?<EmptyState title="No payment inbox items" description="External payment messages will appear here for review."/>:<section className="section card"><div style={{overflowX:'auto'}}><table style={{width:'100%',fontSize:'0.85rem',borderCollapse:'collapse'}}><thead><tr style={{borderBottom:'2px solid var(--color-line)'}}>{['Date','Reference','Student ID','Amount','Channel','Match','Invoice','Status','Action'].map(h=><th key={h} style={{padding:'var(--space-2)',textAlign:h==='Amount'?'right':'left'}}>{h}</th>)}</tr></thead><tbody>{items.map(item=>{
      const openInvoices=invoices[item.id]||[]
      const selectedInvoice=invoiceIds[item.id]||''
      return <tr key={item.id} style={{borderBottom:'1px solid var(--color-line)'}}><td style={{padding:'var(--space-2)'}}>{new Date(item.received_at).toLocaleString()}</td><td style={{padding:'var(--space-2)',fontWeight:600}}>{item.external_reference}</td><td style={{padding:'var(--space-2)'}}>{item.student_identifier||'—'}</td><td style={{padding:'var(--space-2)',textAlign:'right',fontWeight:700}}>KES {Number(item.amount).toLocaleString()}</td><td style={{padding:'var(--space-2)'}}>{item.payment_channel||item.source}</td><td style={{padding:'var(--space-2)'}}>{item.matched_student_id?`Student #${item.matched_student_id}`:'Unmatched'}</td><td style={{padding:'var(--space-2)',minWidth:190}}>{item.status==='MATCHED'?<select className="input" value={selectedInvoice} onChange={e=>setInvoiceIds(prev=>({...prev,[item.id]:e.target.value}))} disabled={!openInvoices.length}><option value="">{openInvoices.length?'Select invoice':'No open invoice'}</option>{openInvoices.map(inv=><option key={inv.id} value={inv.id}>#{inv.id} — KES {Number(inv.balance).toLocaleString()}</option>)}</select>:'—'}</td><td style={{padding:'var(--space-2)'}}><Badge tone={item.status==='POSTED'?'success':item.status==='MATCHED'?'warning':'danger'}>{item.status}</Badge></td><td style={{padding:'var(--space-2)'}}>{item.status==='MATCHED'?<button className="button button--primary button--sm" disabled={posting===item.id||!invoiceIds[item.id]} onClick={()=>void post(item)}>{posting===item.id?'Posting…':'Post payment'}</button>:item.status==='POSTED'?'Posted':'Review required'}</td></tr>
    })}</tbody></table></div></section>}</div>
}
