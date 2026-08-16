import { useEffect, useState } from 'react'
import { Alert } from '../Alert'
import { Badge, EmptyState, LoadingBlock } from '../States'
import { friendlyApiError } from '../../lib/api'
import { finance, type PaymentInboxItem } from '../../lib/finance'

export function PaymentInboxPanel({ onPosted }: { onPosted?: () => void }) {
  const [items, setItems] = useState<PaymentInboxItem[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [posting, setPosting] = useState<number | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try { setItems(await finance.listPaymentInbox(status || undefined)) }
    catch (err) { setError(friendlyApiError(err, 'load payment inbox')) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [status])

  const post = async (item: PaymentInboxItem) => {
    setPosting(item.id); setError(null)
    try { await finance.postPaymentInbox(item.id); await load(); onPosted?.() }
    catch (err) { setError(friendlyApiError(err, 'post payment')) }
    finally { setPosting(null) }
  }

  return <section className="section card">
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'var(--space-3)', gap:'var(--space-3)', flexWrap:'wrap' }}>
      <div><h2 className="section__title" style={{ marginBottom: 0 }}>Payment Inbox</h2><p style={{ color:'var(--color-ink-muted)', marginTop:'var(--space-1)' }}>Review decoded M-Pesa and bank payments before posting them to the student ledger.</p></div>
      <select className="input" value={status} onChange={e => setStatus(e.target.value)} aria-label="Payment status">
        <option value="">All statuses</option><option value="MATCHED">Matched</option><option value="UNMATCHED">Unmatched</option><option value="AMBIGUOUS">Ambiguous</option><option value="POSTED">Posted</option><option value="DUPLICATE">Duplicate</option><option value="REJECTED">Rejected</option>
      </select>
    </div>
    {error && <Alert tone="error">{error}</Alert>}
    {loading ? <LoadingBlock label="Loading payment inbox" rows={5} /> : !items.length ? <EmptyState title="No payment inbox items" description="External payments will appear here for review." /> : <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', fontSize:'0.85rem', borderCollapse:'collapse' }}>
        <thead><tr style={{ borderBottom:'2px solid var(--color-line)' }}>{['Date','Source','Reference','Amount','Student ID','Match','Status','Action'].map(h => <th key={h} style={{ padding:'var(--space-2)', textAlign:'left' }}>{h}</th>)}</tr></thead>
        <tbody>{items.map(item => <tr key={item.id} style={{ borderBottom:'1px solid var(--color-line)' }}>
          <td style={{ padding:'var(--space-2)' }}>{new Date(item.received_at).toLocaleString()}</td>
          <td style={{ padding:'var(--space-2)' }}>{item.payment_channel || item.source}</td>
          <td style={{ padding:'var(--space-2)', fontFamily:'var(--font-mono, monospace)' }}>{item.external_reference}</td>
          <td style={{ padding:'var(--space-2)', fontWeight:700 }}>KES {Number(item.amount).toLocaleString()}</td>
          <td style={{ padding:'var(--space-2)' }}>{item.student_identifier || '—'}</td>
          <td style={{ padding:'var(--space-2)' }}>{item.match_method ? `${item.match_method} (${Number(item.match_confidence || 0)}%)` : '—'}</td>
          <td style={{ padding:'var(--space-2)' }}><Badge tone={item.status === 'POSTED' ? 'success' : item.status === 'MATCHED' ? 'warning' : item.status === 'DUPLICATE' ? 'danger' : undefined}>{item.status}</Badge></td>
          <td style={{ padding:'var(--space-2)' }}>{item.status === 'MATCHED' && <button className="button button--primary button--sm" disabled={posting === item.id} onClick={() => post(item)}>{posting === item.id ? 'Posting…' : 'Post'}</button>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>
}
