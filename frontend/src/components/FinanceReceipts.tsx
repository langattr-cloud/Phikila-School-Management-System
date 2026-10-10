import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from './Alert'
import { Badge, EmptyState, LoadingBlock } from './States'
import { friendlyApiError } from '../lib/api'
import { students } from '../lib/students'
import { finance, type Payment, type PaymentAllocation, type Receipt, type VoteHead } from '../lib/finance'

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] || char))

type ReceiptStudent = { id:number; admission_number:string; first_name:string; middle_name?:string|null; last_name:string }

const money = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateLabel = (value?: string) => value ? new Date(value).toLocaleString() : '—'

function printReceipts(receipts: Receipt[], payments: Payment[], students: ReceiptStudent[] = [], allocationsByPayment: Record<number, PaymentAllocation[] | null> = {}, voteHeads: VoteHead[] = []) {
  const voteHeadById = new Map(voteHeads.map((head) => [head.id, head]))
  const allocationRows = (paymentId: number) => {
    const allocations = allocationsByPayment[paymentId]
    if (allocations == null) return '<tr><td colspan="2">Allocation breakdown unavailable. Please refresh and try again.</td></tr>'
    const grouped = new Map<string, number>()
    allocations.forEach((allocation) => {
      if (allocation.allocation_type === 'REVERSAL') return
      const label = allocation.allocation_type === 'CREDIT'
        ? 'Account credit'
        : allocation.vote_head_id != null
          ? voteHeadById.get(allocation.vote_head_id)?.name || 'Vote head #' + allocation.vote_head_id
          : 'Unassigned fee allocation'
      grouped.set(label, (grouped.get(label) || 0) + Number(allocation.amount || 0))
    })
    if (!grouped.size) return '<tr><td colspan="2">No itemised vote-head allocations recorded for this payment.</td></tr>'
    return Array.from(grouped.entries()).map(([label, amount]) => '<tr><td>' + escapeHtml(label) + '</td><td class="money">' + escapeHtml(money(amount)) + '</td></tr>').join('')
  }
  const studentById = new Map(students.map((student) => [student.id, student]))
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]))
  const html = receipts.map((receipt) => {
    const payment = paymentById.get(receipt.payment_id)
    const student = studentById.get(receipt.student_id)
    const studentName = student ? `${student.first_name} ${student.middle_name ? `${student.middle_name} ` : ''}${student.last_name}` : `Student #${receipt.student_id}`
    const admissionNumber = student?.admission_number || 'Unavailable'
    return `<article class="receipt">
      <header><h1>PHIKILA SCHOOL</h1><p>OFFICIAL FEE PAYMENT RECEIPT</p></header>
      <div class="receipt-number"><span>Receipt No.</span><strong>${escapeHtml(receipt.receipt_number)}</strong></div>
      <div class="line"><span>Student name</span><strong>${escapeHtml(studentName)}</strong></div>
      <div class="line"><span>Admission number</span><strong>${escapeHtml(admissionNumber)}</strong></div>
      <div class="line"><span>Payment ID</span><strong>#${escapeHtml(receipt.payment_id)}</strong></div>
      <div class="line"><span>Payment date</span><strong>${escapeHtml(dateLabel(payment?.created_at || receipt.issued_at))}</strong></div>
      <div class="line"><span>Payment method</span><strong>${escapeHtml(payment?.payment_method || '—')}</strong></div>
      <div class="line"><span>Transaction reference</span><strong>${escapeHtml(payment?.reference_number || '—')}</strong></div>
      <table class="allocations"><thead><tr><th>Vote Head</th><th>Amount</th></tr></thead><tbody>${allocationRows(receipt.payment_id)}</tbody></table>
      <div class="amount"><span>Total received</span><strong>${escapeHtml(money(receipt.amount))}</strong></div>
      <div class="line"><span>Receipt status</span><strong>${escapeHtml(receipt.status)}</strong></div>
      <footer>Issued ${escapeHtml(dateLabel(receipt.issued_at))}<br/>Keep this receipt for your records.</footer>
    </article>`
  }).join('')
  const popup = window.open('', '_blank', 'width=900,height=700')
  if (!popup) {
    window.alert('Your browser blocked the receipt window. Allow pop-ups for this site and try again.')
    return
  }
  popup.document.open()
  popup.document.write(`<!doctype html><html><head><title>Fee payment receipts</title><style>
    *{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#111;margin:0;padding:20px}
    .receipt{max-width:720px;margin:0 auto 24px;padding:28px;border:1px solid #bbb;page-break-after:always}
    .receipt:last-child{page-break-after:auto}header{text-align:center;border-bottom:2px solid #222;padding-bottom:14px;margin-bottom:18px}
    h1{font-size:22px;margin:0 0 6px}header p{margin:0;font-size:12px;letter-spacing:1px}
    .receipt-number{display:flex;justify-content:space-between;padding:12px;background:#f2f2f2;margin-bottom:12px}
    .line{display:flex;justify-content:space-between;gap:20px;padding:9px 0;border-bottom:1px solid #ddd}
    .line span,.receipt-number span,.amount span{color:#444}.line strong{text-align:right;overflow-wrap:anywhere}
    .amount{display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding:16px 12px;border:2px solid #222}
    .allocations{width:100%;border-collapse:collapse;margin-top:20px}.allocations th,.allocations td{text-align:left;padding:9px 8px;border-bottom:1px solid #ddd}.allocations th:last-child,.allocations td:last-child{text-align:right}.allocations th{background:#f2f2f2}.allocations .money{white-space:nowrap}
    .amount strong{font-size:22px}footer{margin-top:24px;padding-top:12px;border-top:1px solid #ddd;color:#555;font-size:11px;line-height:1.6}
    @page{size:A4 portrait;margin:8mm}
    @media print{
      html,body{width:100%;margin:0;padding:0;font-size:10pt}
      .receipt{width:100%;max-width:none;margin:0;padding:12px;border:1px solid #999;page-break-after:always;break-after:page;break-inside:avoid;overflow:visible}
      .receipt:last-child{page-break-after:auto;break-after:auto}
      header{padding-bottom:7px;margin-bottom:8px}
      h1{font-size:18px;margin-bottom:3px}header p{font-size:9px}
      .receipt-number{padding:7px;margin-bottom:6px}
      .line{padding:4px 0;gap:12px;font-size:10pt}
      .allocations{margin-top:9px;font-size:9pt}
      .allocations th,.allocations td{padding:4px 6px}
      .amount{margin-top:9px;padding:8px}
      .amount strong{font-size:16px}
      footer{margin-top:10px;padding-top:6px;font-size:9px}
    }
  </style></head><body>${html}<script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
}

export function FinanceReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [allocationsByPayment, setAllocationsByPayment] = useState<Record<number, PaymentAllocation[] | null>>({})
  const [voteHeads, setVoteHeads] = useState<VoteHead[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [studentMatches, setStudentMatches] = useState<ReceiptStudent[]>([])
  const [receiptStudents, setReceiptStudents] = useState<ReceiptStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [receiptRows, paymentRows] = await Promise.all([finance.listReceipts(), finance.listPayments()])
      setReceipts(receiptRows)
      setPayments(paymentRows)
      const studentIds = Array.from(new Set(receiptRows.map((receipt) => receipt.student_id)))
      const studentResults = await Promise.all(studentIds.map(async (studentId) => {
        try {
          const student = await students.get(studentId)
          return { id: student.id, admission_number: student.admission_number, first_name: student.first_name, middle_name: student.middle_name, last_name: student.last_name }
        } catch {
          return null
        }
      }))
      setReceiptStudents(studentResults.filter((student) => student !== null))
      const voteHeadRows = await finance.listVoteHeads().catch(() => [])
      setVoteHeads(voteHeadRows)
      const paymentIds = Array.from(new Set(receiptRows.map((receipt) => receipt.payment_id)))
      const allocationResults = await Promise.all(paymentIds.map(async (paymentId) => {
        try {
          return [paymentId, await finance.listPaymentAllocations(paymentId)] as const
        } catch {
          return [paymentId, null] as const
        }
      }))
      setAllocationsByPayment(Object.fromEntries(allocationResults))
      setSelected((current) => current.filter((id) => receiptRows.some((receipt) => receipt.id === id)))
    } catch (err) {
      setError(friendlyApiError(err, 'load receipts'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const query = search.trim()
    if (!query) { setStudentMatches([]); return }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const result = await students.list({ search: query, page: 1, page_size: 100 })
        if (!cancelled) setStudentMatches(result.items.map((student) => ({ id: student.id, admission_number: student.admission_number, first_name: student.first_name, middle_name: student.middle_name, last_name: student.last_name })))
      } catch {
        if (!cancelled) setStudentMatches([])
      }
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [search])

  const paymentById = useMemo(() => new Map(payments.map((payment) => [payment.id, payment])), [payments])
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return receipts
    return receipts.filter((receipt) => {
      const payment = paymentById.get(receipt.payment_id)
      const student = studentMatches.find((item) => item.id === receipt.student_id)
      const matchesAdmission = studentMatches.some((item) => item.id === receipt.student_id && item.admission_number.toLowerCase().includes(query))
      return matchesAdmission || [receipt.receipt_number, receipt.student_id, receipt.payment_id, receipt.status, payment?.reference_number, payment?.payment_method, student?.admission_number, student?.first_name, student?.middle_name, student?.last_name]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [receipts, paymentById, search, studentMatches])
  const selectedReceipts = receipts.filter((receipt) => selected.includes(receipt.id))
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

  return <section className="section card">
    <div className="finance-section-heading">
      <div><h2 className="section__title">Fee Receipts</h2><p className="muted-text">Receipts are created from successfully posted payments. Printing or downloading a receipt does not record another payment.</p></div>
      <button className="button button--secondary button--sm" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {error && <Alert tone="error">{error}</Alert>}
    <div className="finance-form__grid">
      <div className="field"><label className="field__label" htmlFor="receipt-search">Search receipts</label><input id="receipt-search" className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Admission number, student name, receipt number, M-Pesa reference…" /></div>
      <div className="finance-form__actions">
        <button className="button button--primary" disabled={!selectedReceipts.length} onClick={() => printReceipts(selectedReceipts, payments, [...receiptStudents, ...studentMatches], allocationsByPayment, voteHeads)}>Print selected / Save as PDF ({selectedReceipts.length})</button>
        <button className="button button--secondary" disabled={!visible.length} onClick={() => setSelected((current) => Array.from(new Set([...current, ...visible.map((receipt) => receipt.id)])))}>Select visible</button>
        <button className="button button--secondary" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</button>
      </div>
    </div>
    {loading ? <LoadingBlock label="Loading receipts" rows={5} /> : !visible.length ? <EmptyState title="No receipts found" description={receipts.length ? 'Try a different search.' : 'Receipts appear here after payments are successfully posted.'} /> : <div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select all visible receipts" checked={visible.length > 0 && visible.every((receipt) => selected.includes(receipt.id))} onChange={(event) => setSelected((current) => event.target.checked ? Array.from(new Set([...current, ...visible.map((receipt) => receipt.id)])) : current.filter((id) => !visible.some((receipt) => receipt.id === id)))} /></th><th>Receipt No.</th><th>Student</th><th>Payment Date</th><th>Method</th><th>Reference</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map((receipt) => {
      const payment = paymentById.get(receipt.payment_id)
      return <tr key={receipt.id}><td><input type="checkbox" aria-label={`Select receipt ${receipt.receipt_number}`} checked={selected.includes(receipt.id)} onChange={() => toggle(receipt.id)} /></td><td><strong>{receipt.receipt_number}</strong></td><td>{(() => { const student = [...receiptStudents, ...studentMatches].find((item) => item.id === receipt.student_id); return student ? <>{student.first_name} {student.middle_name ? `${student.middle_name} ` : ''}{student.last_name}<div className="muted-text">Admission #{student.admission_number}</div></> : `Student #${receipt.student_id}` })()}</td><td>{dateLabel(payment?.created_at || receipt.issued_at)}</td><td>{payment?.payment_method || '—'}</td><td>{payment?.reference_number || '—'}</td><td className="number-cell">{money(receipt.amount)}</td><td><Badge tone={receipt.status === 'ISSUED' ? 'success' : receipt.status === 'REVERSED' ? 'danger' : 'warning'}>{receipt.status}</Badge></td><td><button className="button button--secondary button--sm" onClick={() => printReceipts([receipt], payments, [...receiptStudents, ...studentMatches], allocationsByPayment, voteHeads)}>Print / PDF</button></td></tr>
    })}</tbody></table></div>}
    <p className="muted-text">Use the print dialog's “Save as PDF” option to download receipts. For privacy, only print receipts for students you are authorised to access.</p>
  </section>
}
