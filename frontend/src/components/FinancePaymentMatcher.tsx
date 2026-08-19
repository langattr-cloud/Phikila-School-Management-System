import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from './Alert'
import { Badge, LoadingBlock } from './States'
import { apiFetch, friendlyApiError } from '../lib/api'
import { finance, type Invoice, type PaymentInboxItem } from '../lib/finance'

type Student = { id:number; admission_number:string; first_name:string; middle_name?:string; last_name:string; status:string }
type StudentList = { items:Student[]; total:number; page:number; page_size:number; pages:number }
type Decoded = { amount?:number; external_reference?:string; student_identifier?:string; received_at?:string; account_name?:string; bank?:string; payment_channel?:string; raw_message:string }
type Props = { onPosted?: () => void }

export function FinancePaymentMatcher({ onPosted }: Props) {
  const [input, setInput] = useState('')
  const [decoded, setDecoded] = useState<Decoded | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceId, setInvoiceId] = useState('')
  const [inbox, setInbox] = useState<PaymentInboxItem[]>([])
  const [busy, setBusy] = useState(false)
  const [loadingStudent, setLoadingStudent] = useState(false)
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true)
    try { setInbox(await finance.listPaymentInbox()) }
    catch (err) { setError(friendlyApiError(err, 'load payment inbox')) }
    finally { setLoadingInbox(false) }
  }, [])

  useEffect(() => { loadInbox() }, [loadInbox])

  const admission = useMemo(() => {
    const trimmed = input.trim()
    if (!trimmed) return ''
    const match = trimmed.match(/#\s*([A-Za-z0-9-]+)/)
    return match?.[1] || (trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed)
  }, [input])

  useEffect(() => {
    if (!admission) { setStudent(null); setInvoices([]); setInvoiceId(''); return }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoadingStudent(true); setError(null)
      try {
        const result = await apiFetch<StudentList>(`/api/v1/students?admission_number=${encodeURIComponent(admission)}&page=1&page_size=10`)
        if (cancelled) return
        const found = result.items?.[0] || null
        setStudent(found)
        if (!found) { setInvoices([]); setInvoiceId(''); return }
        const open = (await finance.listInvoices({ student_id: found.id, status: 'pending' })).filter((inv) => Number(inv.balance) > 0)
        const partial = (await finance.listInvoices({ student_id: found.id, status: 'partial' })).filter((inv) => Number(inv.balance) > 0)
        const all = [...open, ...partial]
        setInvoices(all)
        setInvoiceId(all.length === 1 ? String(all[0].id) : '')
      } catch (err) {
        if (!cancelled) setError(friendlyApiError(err, 'find the student and open invoices'))
      } finally { if (!cancelled) setLoadingStudent(false) }
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [admission])

  async function decode() {
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await finance.decodePayment(input) as Decoded
      setDecoded(result)
      if (result.student_identifier && result.student_identifier !== admission) setInput(`#${result.student_identifier}`)
    } catch (err) { setError(friendlyApiError(err, 'interpret the payment message')) }
    finally { setBusy(false) }
  }

  async function postPayment() {
    if (!student || !decoded?.amount || !decoded.external_reference || !invoiceId) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const inboxItem = await apiFetch<{ id:number }>(`/api/v1/finance/payment-inbox`, {
        method:'POST',
        body: JSON.stringify({ source:'M-PESA', raw_message:input, student_identifier:student.admission_number, amount:decoded.amount, external_reference:decoded.external_reference, received_at:decoded.received_at, payment_channel:decoded.payment_channel || 'M-PESA → Bank', account_name:decoded.account_name }),
      })
      await finance.postPaymentInbox(inboxItem.id, { invoice_id: Number(invoiceId), reason:'Posted from M-PESA payment matcher' })
      setMessage(`KES ${Number(decoded.amount).toLocaleString()} posted to ${student.first_name} ${student.last_name} (${student.admission_number}).`)
      setInput(''); setDecoded(null); setStudent(null); setInvoices([]); setInvoiceId(''); await loadInbox(); onPosted?.()
    } catch (err) { setError(friendlyApiError(err, 'post the payment')) }
    finally { setBusy(false) }
  }

  const statusTone = (status:string) => status === 'POSTED' || status === 'MATCHED' ? 'success' : status === 'UNMATCHED' ? 'warning' : 'danger'

  return <section className="section card">
    <div className="finance-section-heading">
      <div><h2 className="section__title">M-PESA Fee Payment</h2><p className="muted-text">Paste the bank/M-PESA message or type an admission number such as #3448.</p></div>
    </div>
    {error && <Alert tone="error">{error}</Alert>}
    {message && <Alert tone="success">{message}</Alert>}
    <div className="finance-form">
      <div className="field">
        <label className="field__label">Payment message or admission number</label>
        <textarea className="input" rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ksh 24000.00 sent to KCB account CHEPSEON COMPLEX PRIMARY SCHOOL 8112631#3448..." />
      </div>
      <div className="finance-form__actions">
        <button className="button button--secondary" disabled={!input.trim() || busy} onClick={decode}>{busy ? 'Processing…' : 'Interpret message'}</button>
      </div>
    </div>

    {loadingStudent && <LoadingBlock label="Finding student" rows={1} />}
    {student && <div className="card" style={{ marginTop: 16 }}>
      <strong>{student.first_name} {student.middle_name ? `${student.middle_name} ` : ''}{student.last_name}</strong>
      <div className="muted-text">Admission #{student.admission_number} · {student.status}</div>
      {decoded && <div style={{ marginTop: 12 }}><Badge tone="success">KES {Number(decoded.amount || 0).toLocaleString()}</Badge> <span className="muted-text">Ref {decoded.external_reference || '—'}</span></div>}
      <div className="finance-form__grid" style={{ marginTop: 12 }}>
        <div className="field"><label className="field__label">Invoice</label><select className="input" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} disabled={!invoices.length}>
          <option value="">Select invoice</option>{invoices.map((inv) => <option key={inv.id} value={inv.id}>Invoice #{inv.id} — balance KES {Number(inv.balance).toLocaleString()}</option>)}
        </select></div>
      </div>
      <div className="finance-form__actions" style={{ marginTop: 12 }}><button className="button button--primary" disabled={!decoded?.amount || !decoded.external_reference || !student || !invoiceId || busy} onClick={postPayment}>{busy ? 'Posting…' : 'Post fee payment'}</button></div>
      {!invoices.length && <p className="muted-text">No open invoice was found for this student. Create the fee invoice first.</p>}
    </div>}

    <div className="section" style={{ marginTop: 24 }}>
      <div className="finance-section-heading"><div><h3 className="section__title">Payment Inbox</h3><p className="muted-text">Recent external payments and their posting state. Nothing is removed when posting fails.</p></div><button className="button button--secondary button--sm" onClick={loadInbox} disabled={loadingInbox}>{loadingInbox ? 'Refreshing…' : 'Refresh'}</button></div>
      {loadingInbox ? <LoadingBlock label="Loading payment inbox" rows={4} /> : !inbox.length ? <p className="muted-text">No payment inbox records yet.</p> : <div className="table-scroll"><table><thead><tr><th>Received</th><th>Reference</th><th>Student</th><th>Amount</th><th>Match</th><th>Status</th><th>Posted</th></tr></thead><tbody>{inbox.map((item) => <tr key={item.id}><td>{item.received_at ? new Date(item.received_at).toLocaleString() : '—'}</td><td><strong>{item.external_reference}</strong><div className="muted-text">{item.source}</div></td><td>{item.student_identifier || 'Unmatched'}</td><td className="number-cell">KES {Number(item.amount).toLocaleString()}</td><td>{item.match_method ? `${item.match_method} (${Number(item.match_confidence || 0).toLocaleString()}%)` : 'Manual review'}</td><td><Badge tone={statusTone(item.status)}>{item.status}</Badge></td><td>{item.posted_payment_id ? `Payment #${item.posted_payment_id}` : '—'}</td></tr>)}</tbody></table></div>}
    </div>
  </section>
}