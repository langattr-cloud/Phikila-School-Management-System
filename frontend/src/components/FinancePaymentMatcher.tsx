import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from './Alert'
import { Badge, LoadingBlock } from './States'
import { apiFetch, friendlyApiError } from '../lib/api'
import { finance, type PaymentInboxItem, type Receipt } from '../lib/finance'

type Student = { id:number; admission_number:string; first_name:string; middle_name?:string; last_name:string; status:string }
type StudentList = { items:Student[]; total:number; page:number; page_size:number; pages:number }
type Decoded = { amount?:number; external_reference?:string; student_identifier?:string; received_at?:string; account_name?:string; bank?:string; payment_channel?:string; raw_message:string }
type StatementTransaction = { reference:string; amount:number; transaction_date?:string|null }
type StatementPreview = { filename:string; file_type:string; parsed_rows:number; transactions:StatementTransaction[]; warnings:string[] }
type Props = { onPosted?: () => void }

export function FinancePaymentMatcher({ onPosted }: Props) {
  const [input, setInput] = useState('')
  const [decoded, setDecoded] = useState<Decoded | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [inbox, setInbox] = useState<PaymentInboxItem[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [busy, setBusy] = useState(false)
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statementFile, setStatementFile] = useState<File | null>(null)
  const [statementPreview, setStatementPreview] = useState<StatementPreview | null>(null)
  const [statementReference, setStatementReference] = useState('')
  const [statementBusy, setStatementBusy] = useState(false)
  const [reconciliation, setReconciliation] = useState<Record<string, unknown> | null>(null)

  const loadAudit = useCallback(async () => {
    setLoadingInbox(true)
    try {
      const [inboxItems, receiptItems] = await Promise.all([finance.listPaymentInbox(), finance.listReceipts()])
      setInbox(inboxItems)
      setReceipts(receiptItems)
    } catch (err) { setError(friendlyApiError(err, 'load payment audit history')) }
    finally { setLoadingInbox(false) }
  }, [])

  useEffect(() => { loadAudit() }, [loadAudit])

  const admission = useMemo(() => {
    const trimmed = input.trim()
    if (!trimmed) return ''
    const match = trimmed.match(/#\s*([A-Za-z0-9-]+)/)
    return match?.[1] || (trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed)
  }, [input])

  useEffect(() => {
    if (!admission) { setStudent(null); return }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setError(null)
      try {
        const result = await apiFetch<StudentList>(`/api/v1/students?admission_number=${encodeURIComponent(admission)}&page=1&page_size=10`)
        if (cancelled) return
        const found = result.items?.[0] || null
        setStudent(found)
        if (!found) return
      } catch (err) {
        if (!cancelled) setError(friendlyApiError(err, 'find the student and open invoices'))
      }
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [admission])

  async function postPayment() {
    if (!input.trim()) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const decoded = await finance.decodePayment(input) as Decoded
      if (!decoded.amount || !decoded.external_reference || !decoded.student_identifier) {
        throw new Error('Could not read the amount, M-Pesa reference, or admission number from this message.')
      }
      const item = await apiFetch<PaymentInboxItem>(`/api/v1/finance/payment-inbox`, {
        method:'POST',
        body: JSON.stringify({
          source:'M-PESA',
          raw_message:input,
          student_identifier:decoded.student_identifier,
          amount:decoded.amount,
          external_reference:decoded.external_reference,
          received_at:decoded.received_at,
          payment_channel:decoded.payment_channel || 'M-PESA → Bank',
          account_name:decoded.account_name,
        }),
      })
      if (item.status === 'POSTED') {
        setMessage(`KSh ${Number(item.amount).toLocaleString()} automatically posted for admission #${item.student_identifier}. Reference ${item.external_reference}.`)
      } else if (item.status === 'MATCHED') {
        setMessage(`Message interpreted and student #${item.student_identifier} matched. Automatic posting needs attention: ${item.notes || 'no single open invoice can accept the full amount'}.`)
      } else {
        setMessage(`Message saved as ${item.status}. The admission number could not be matched to a student, so no payment was posted.`)
      }
      setInput('')
      await loadAudit()
      onPosted?.()
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      setError(/duplicate payment reference/i.test(text)
        ? 'This M-Pesa transaction reference has already been received. No second payment was posted.'
        : friendlyApiError(err, 'interpret and post the payment'))
    } finally { setBusy(false) }
  }

  async function verifyAndPost(item: PaymentInboxItem) {
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await apiFetch<PaymentInboxItem>(`/api/v1/finance/payment-inbox/${item.id}/verify-and-post`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setMessage(result.status === 'POSTED'
        ? `SMS payment ${item.external_reference} posted from the matched message. Bank statement reconciliation is optional and can be done later.`
        : `SMS payment ${item.external_reference} status: ${result.status}. Review the payment inbox notes.`)
      await loadAudit()
      onPosted?.()
    } catch (err) { setError(friendlyApiError(err, 'post the matched SMS payment')) }
    finally { setBusy(false) }
  }

  async function previewStatement() {
    if (!statementFile) return
    setStatementBusy(true); setError(null); setMessage(null); setReconciliation(null); setStatementPreview(null)
    try {
      const body = new FormData()
      body.append('file', statementFile)
      const result = await apiFetch<StatementPreview>('/api/v1/finance/payment-inbox/reconcile-upload/preview', { method:'POST', body })
      setStatementPreview(result)
      setStatementReference((value) => value || result.filename.replace(/\\.[^.]+$/, ''))
      setMessage(`Read ${result.parsed_rows} transaction(s) from ${result.filename}. Review the preview before reconciling.`)
    } catch (err) { setError(friendlyApiError(err, 'read the bank statement')) }
    finally { setStatementBusy(false) }
  }

  async function reconcileStatement() {
    if (!statementPreview || !statementReference.trim()) return
    setStatementBusy(true); setError(null); setMessage(null)
    try {
      const result = await apiFetch<Record<string, unknown>>('/api/v1/finance/payment-inbox/reconcile', {
        method:'POST',
        body: JSON.stringify({
          statement_reference: statementReference.trim(),
          transactions: statementPreview.transactions.map((tx) => ({
            reference: tx.reference,
            amount: tx.amount,
            transaction_date: tx.transaction_date || undefined,
          })),
        }),
      })
      setReconciliation(result)
      setMessage('Statement reconciliation completed. Review matched transactions and exceptions below.')
      await loadAudit()
    } catch (err) { setError(friendlyApiError(err, 'reconcile the KCB statement')) }
    finally { setStatementBusy(false) }
  }

  const receiptByPaymentId = useMemo(() => new Map(receipts.map((receipt) => [receipt.payment_id, receipt])), [receipts])
  const statusTone = (status:string) => status === 'POSTED' ? 'success' : ['MATCHED', 'UNVERIFIED', 'VERIFIED', 'VERIFIED_UNALLOCATED', 'UNMATCHED', 'POSTING_FAILED'].includes(status) ? 'warning' : 'danger'

  return <section className="section card">
    <div className="finance-section-heading">
      <div><h2 className="section__title">M-PESA Fee Payment</h2><p className="muted-text">Paste the complete M-Pesa message. The system extracts the amount, transaction reference and admission number, then matches and posts automatically.</p></div>
    </div>
    {error && <Alert tone="error">{error}</Alert>}
    {message && <Alert tone="success">{message}</Alert>}
    <div className="finance-form">
      <div className="field">
        <label className="field__label">Paste M-Pesa message</label>
        <textarea className="input" rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ksh 4000.00 sent to KCB account CHEPSEON COMPLEX PRIMARY SCHOOL 8112631#3454 has been received on 07/10/2026 at 01:49 PM. M-PESA Ref UJ7AS90AE4." />
      </div>
      <div className="finance-form__actions">
        <button className="button button--primary" disabled={!input.trim() || busy} onClick={postPayment}>{busy ? 'Interpreting & posting…' : 'Match & post payment'}</button>
      </div>
    </div>

    {student && <p className="muted-text" style={{ marginTop: 12 }}>Detected admission #{student.admission_number}: {student.first_name} {student.middle_name ? `${student.middle_name} ` : ''}{student.last_name}. Matching and posting are handled automatically when you submit the message.</p>}

    <div className="section" style={{ marginTop: 24 }}>
      <div className="finance-section-heading"><div><h3 className="section__title">Payment Inbox</h3><p className="muted-text">Recent external payments and their posting state. Nothing is removed when posting fails.</p></div><button className="button button--secondary button--sm" onClick={loadAudit} disabled={loadingInbox}>{loadingInbox ? 'Refreshing…' : 'Refresh'}</button></div>
      {loadingInbox ? <LoadingBlock label="Loading payment audit history" rows={4} /> : !inbox.length ? <p className="muted-text">No payment inbox records yet.</p> : <div className="table-scroll"><table><thead><tr><th>Received</th><th>Reference</th><th>Student</th><th>Amount</th><th>Match</th><th>Status</th><th>Posted / Receipt</th><th>Action</th></tr></thead><tbody>{inbox.map((item) => { const receipt = item.posted_payment_id ? receiptByPaymentId.get(item.posted_payment_id) : undefined; return <tr key={item.id}><td>{item.received_at ? new Date(item.received_at).toLocaleString() : '—'}</td><td><strong>{item.external_reference}</strong><div className="muted-text">{item.source}</div></td><td>{item.student_identifier || 'Unmatched'}</td><td className="number-cell">KES {Number(item.amount).toLocaleString()}</td><td>{item.match_method ? `${item.match_method} (${Number(item.match_confidence || 0).toLocaleString()}%)` : 'Manual review'}</td><td><Badge tone={statusTone(item.status)}>{item.status}</Badge></td><td>{item.posted_payment_id ? <><div>Payment #{item.posted_payment_id}</div>{receipt ? <div className="muted-text">Receipt {receipt.receipt_number} · {receipt.status}</div> : <div className="muted-text">Receipt pending/not returned</div>}</> : '—'}</td><td>{['KCB_SMS', 'M-PESA'].includes(item.source) && ['UNVERIFIED', 'VERIFIED_UNALLOCATED', 'MATCHED', 'POSTING_FAILED'].includes(item.status) && item.matched_student_id ? <button className="button button--secondary button--sm" disabled={busy} onClick={() => verifyAndPost(item)}>{item.status === 'POSTING_FAILED' ? 'Retry posting' : 'Post matched SMS'}</button> : '—'}</td></tr> })}</tbody></table></div>}
    </div>

    <div className="section" style={{ marginTop: 24 }}>
      <div className="finance-section-heading"><div><h3 className="section__title">KCB Bank Statement Reconciliation</h3><p className="muted-text">This step is optional. The matched SMS is the source record for posting; upload a bank statement later only if you want to compare transactions. Reconciliation flags differences without silently changing posted payments.</p></div></div>
      <div className="finance-form">
        <div className="field">
          <label className="field__label">KCB statement file (CSV, Excel, or text-based PDF)</label>
          <input className="input" type="file" accept=".csv,.xlsx,.xlsm,.pdf" onChange={(e) => { setStatementFile(e.target.files?.[0] || null); setStatementPreview(null); setReconciliation(null) }} />
          {statementFile && <div className="muted-text">{statementFile.name} · {(statementFile.size / 1024).toFixed(0)} KB</div>}
        </div>
        <div className="field">
          <label className="field__label">Statement identifier / period</label>
          <input className="input" value={statementReference} onChange={(e) => setStatementReference(e.target.value)} placeholder="e.g. KCB statement 1–9 Oct 2026" />
        </div>
        <div className="finance-form__actions">
          <button className="button button--secondary" disabled={!statementFile || statementBusy} onClick={previewStatement}>{statementBusy ? 'Reading…' : 'Preview statement'}</button>
          <button className="button button--primary" disabled={!statementPreview || !statementReference.trim() || statementBusy} onClick={reconcileStatement}>{statementBusy ? 'Working…' : 'Reconcile statement'}</button>
        </div>
      </div>
      {statementPreview && <div style={{ marginTop: 16 }}>
        <p><strong>Preview:</strong> {statementPreview.parsed_rows} transactions detected in {statementPreview.filename} ({statementPreview.file_type}). Review the parsed references and amounts before reconciling.</p>
        {statementPreview.warnings.length > 0 && <Alert tone="warning"><ul>{statementPreview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></Alert>}
        <div className="table-scroll"><table><thead><tr><th>Transaction reference</th><th>Date</th><th>Credit amount</th></tr></thead><tbody>{statementPreview.transactions.slice(0, 100).map((tx, index) => <tr key={tx.reference + '-' + index}><td>{tx.reference}</td><td>{tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString() : '—'}</td><td className="number-cell">KES {Number(tx.amount).toLocaleString()}</td></tr>)}</tbody></table></div>
        {statementPreview.transactions.length > 100 && <p className="muted-text">Showing first 100 rows of {statementPreview.transactions.length} parsed transactions.</p>}
      </div>}
      {reconciliation && <div style={{ marginTop: 16 }}>
        <h4>Reconciliation results</h4>
        <div className="finance-form__grid">
          <div><strong>{String(reconciliation.amount_matched ?? 0)}</strong><div className="muted-text">Amount matched</div></div>
          <div><strong>{String(reconciliation.amount_mismatches ?? 0)}</strong><div className="muted-text">Amount mismatches</div></div>
          <div><strong>{String(reconciliation.bank_transactions_without_sms ?? 0)}</strong><div className="muted-text">Bank transactions without SMS</div></div>
          <div><strong>{String(reconciliation.sms_transactions_without_bank_record ?? 0)}</strong><div className="muted-text">SMS transactions missing from statement</div></div>
        </div>
        {Array.isArray(reconciliation.results) && reconciliation.results.length > 0 && <div className="table-scroll" style={{ marginTop: 12 }}><table><thead><tr><th>Reference</th><th>SMS amount</th><th>Statement amount</th><th>Result / exception</th></tr></thead><tbody>{(reconciliation.results as Array<Record<string, unknown>>).map((row, index) => <tr key={String(row.reference ?? index)}><td>{String(row.reference ?? '—')}</td><td>{row.sms_amount == null ? '—' : 'KES ' + Number(row.sms_amount).toLocaleString()}</td><td>{row.statement_amount == null ? '—' : 'KES ' + Number(row.statement_amount).toLocaleString()}</td><td><Badge tone={String(row.status) === 'AMOUNT_MATCH' ? 'success' : 'danger'}>{String(row.status ?? 'REVIEW')}</Badge></td></tr>)}</tbody></table></div>}
      </div>}
    </div>
  </section>
}
