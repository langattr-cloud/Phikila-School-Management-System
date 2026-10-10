import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { FinancePaymentMatcher } from '../components/FinancePaymentMatcher'
import { FinanceReceipts } from '../components/FinanceReceipts'
import { FinanceBanking } from '../components/FinanceBanking'
import { api, friendlyApiError } from '../lib/api'
import { finance, type BalanceSheet, type FeeStructure, type GeneralLedgerRow, type Invoice, type Payment, type FinanceOverview, type TrialBalanceRow, type VoteHead } from '../lib/finance'
import { students, type Student } from '../lib/students'
import './Finance.css'

const levelLabel = (name: string) => /pre\s*primary|pre\s*school/i.test(name) ? 'Pre school' : /primary/i.test(name) && !/junior/i.test(name) ? 'Primary' : /junior/i.test(name) ? 'Junior' : /senior/i.test(name) ? 'Senior' : name
const gradeLabel = (name: string) => name.replace(/^Grade\s+/i, '')


export default function FinancePage() {
  const [overview, setOverview] = useState<FinanceOverview | null>(null)
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'fees' | 'invoices' | 'matcher' | 'receipts' | 'vote-heads' | 'trial-balance' | 'general-ledger' | 'balance-sheet' | 'banking' | 'balances'>('overview')
  const [showNewFee, setShowNewFee] = useState(false)
  const [reviewingFeeId, setReviewingFeeId] = useState<number | null>(null)
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [showBulkInvoice, setShowBulkInvoice] = useState(false)
  const [showNewPayment, setShowNewPayment] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ov, fs, inv, pay] = await Promise.all([
        finance.overview(), finance.listFeeStructures(), finance.listInvoices(), finance.listPayments(),
      ])
      setOverview(ov); setFeeStructures(fs); setInvoices(inv); setPayments(pay)
    } catch (err) { setError(friendlyApiError(err, 'load finance')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const deleteFeeStructure = async (fee: FeeStructure) => {
    if (!window.confirm(`Delete fee structure "${fee.name}" (KES ${Number(fee.amount).toLocaleString()})? This cannot be undone.`)) return
    setError(null)
    try {
      await finance.deleteFeeStructure(fee.id)
      if (reviewingFeeId === fee.id) setReviewingFeeId(null)
      await load()
    } catch (err) {
      setError(friendlyApiError(err, 'delete fee structure'))
    }
  }

  return <div className="finance-page">
    <PageHeader title="Finance" description="Fee structures, invoices, payments, accounting reports, banking, and M-PESA fee matching." />
    {error && <Alert tone="error">{error}</Alert>}
    <div className="finance-tabs" role="tablist" aria-label="Finance sections">
      {(['overview', 'matcher', 'receipts', 'fees', 'vote-heads', 'invoices', 'payments', 'balances', 'banking', 'trial-balance', 'general-ledger', 'balance-sheet'] as const).map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={`button ${activeTab === tab ? 'button--primary' : 'button--secondary'} button--sm`} onClick={() => setActiveTab(tab)}>{tab === 'matcher' ? 'M-PESA Matcher' : tab === 'trial-balance' ? 'Trial Balance' : tab === 'general-ledger' ? 'General Ledger' : tab === 'balance-sheet' ? 'Balance Sheet' : tab === 'banking' ? 'Banking & Reconciliation' : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}
    </div>

    {loading ? <LoadingBlock label="Loading finance" rows={4} /> : <>
      {activeTab === 'matcher' && <FinancePaymentMatcher onPosted={load} />}
      {activeTab === 'receipts' && <FinanceReceipts />}
      {activeTab === 'vote-heads' && <VoteHeadsView />}
      {activeTab === 'banking' && <FinanceBanking />}
      {activeTab === 'balances' && <StudentBalancesReport onCreateFee={() => { setShowNewFee(true); setActiveTab('fees') }} />}
      {activeTab === 'trial-balance' && <TrialBalanceView />}
      {activeTab === 'general-ledger' && <GeneralLedgerView />}
      {activeTab === 'balance-sheet' && <BalanceSheetView />}
      {activeTab === 'overview' && overview && <div className="summary-grid finance-summary">{[
        { label: 'Total Invoiced', value: `KES ${Number(overview.total_invoiced).toLocaleString()}` },
        { label: 'Total Collected', value: `KES ${Number(overview.total_collected).toLocaleString()}` },
        { label: 'Outstanding', value: `KES ${Number(overview.total_outstanding).toLocaleString()}`, tone: Number(overview.total_outstanding) > 0 ? 'warning' : undefined },
        { label: 'Invoices', value: overview.invoices_count }, { label: 'Paid', value: overview.paid_count }, { label: 'Pending', value: overview.pending_count },
      ].map((c) => <div key={c.label} className="card finance-summary__card"><p className="finance-summary__label">{c.label}</p><p className={`finance-summary__value ${c.tone === 'warning' ? 'finance-summary__value--warning' : ''}`}>{c.value}</p></div>)}</div>}

      {activeTab === 'fees' && <section className="section card"><div className="finance-section-heading"><h2 className="section__title">Fee Structures</h2><button className="button button--primary button--sm" onClick={() => setShowNewFee(!showNewFee)}>+ Fee Structure</button></div>
        {showNewFee && <NewFeeForm existingFeeStructures={feeStructures} onCreated={() => { setShowNewFee(false); load() }} onCancel={() => setShowNewFee(false)} />}
        {!feeStructures.length ? <EmptyState title="No fee structures saved" description="Create a fee structure to start billing students. Use the + Fee Structure button above." /> : <div className="finance-list">{feeStructures.map((f) => <div key={f.id} className="finance-list__row"><div className="finance-list__main"><strong>{f.name}</strong><span className="muted-text">{f.description || 'No description'} · Year #{f.academic_year_id ?? 'Any'} · {f.level_id == null ? 'All levels' : `Level #${f.level_id}`} · {f.grade_id == null ? 'All grades' : `Grade #${f.grade_id}`} · {f.stream_id == null ? 'All streams' : `Stream #${f.stream_id}`}</span></div><div className="finance-list__value"><strong>KES {Number(f.amount).toLocaleString()}</strong> <Badge tone={f.status === 'ACTIVE' || f.status === 'active' ? 'success' : 'warning'}>{f.status}</Badge><button className="button button--secondary button--sm" onClick={() => setReviewingFeeId(reviewingFeeId === f.id ? null : f.id)}>{reviewingFeeId === f.id ? 'Close review' : 'Review'}</button><button className="button button--secondary button--sm" onClick={() => deleteFeeStructure(f)}>Delete</button></div></div>)}</div>}
        {reviewingFeeId !== null && feeStructures.some((fee) => fee.id === reviewingFeeId) && <FeeStructureReview fee={feeStructures.find((fee) => fee.id === reviewingFeeId)!} onClose={() => setReviewingFeeId(null)} />}
      </section>}

      {activeTab === 'invoices' && <section className="section card"><div className="finance-section-heading"><h2 className="section__title">Invoices</h2><div className="finance-form__actions"><button className={showNewInvoice ? "button button--primary button--sm" : "button button--secondary button--sm"} onClick={() => { setShowNewInvoice(!showNewInvoice); setShowBulkInvoice(false) }}>+ Single Invoice</button><button className={showBulkInvoice ? "button button--primary button--sm" : "button button--secondary button--sm"} onClick={() => { setShowBulkInvoice(!showBulkInvoice); setShowNewInvoice(false) }}>Bulk Billing</button></div></div>
        {showNewInvoice && <NewInvoiceForm feeStructures={feeStructures} onCreated={() => { setShowNewInvoice(false); load() }} onCancel={() => setShowNewInvoice(false)} />}
        {showBulkInvoice && <InvoiceBulkBillingForm feeStructures={feeStructures} onCreated={() => { setShowBulkInvoice(false); load() }} />}
        {!invoices.length ? <EmptyState title="No invoices" description="Create a single invoice or use bulk billing to invoice eligible students by academic year, level and grade." /> : <div className="table-scroll"><table><thead><tr><th>Student</th><th>Fee</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead><tbody>{invoices.map((inv) => <tr key={inv.id}><td>Student #{inv.student_id}</td><td>Fee #{inv.fee_structure_id}</td><td className="number-cell">KES {Number(inv.amount).toLocaleString()}</td><td className="number-cell">KES {Number(inv.balance).toLocaleString()}</td><td><Badge tone={inv.status === 'paid' ? 'success' : inv.status === 'pending' ? 'warning' : 'danger'}>{inv.status}</Badge></td></tr>)}</tbody></table></div>}
      </section>}

      {activeTab === 'payments' && <section className="section card"><div className="finance-section-heading"><h2 className="section__title">Payments</h2><button className="button button--primary button--sm" onClick={() => setShowNewPayment(!showNewPayment)}>+ Record Payment</button></div>
        {showNewPayment && <NewPaymentForm onCreated={() => { setShowNewPayment(false); load() }} onCancel={() => setShowNewPayment(false)} />}
        <PaymentHistory payments={payments} onChanged={load} />
      </section>}
    </>}
  </div>
}

function VoteHeadsView() {
  const [heads, setHeads] = useState<import('../lib/finance').VoteHead[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try { setError(null); setHeads(await finance.listVoteHeads()) }
    catch (e) { setError(friendlyApiError(e, 'load vote heads')) }
  }, [])

  useEffect(() => { void load() }, [load])

  const reset = () => {
    setEditingId(null); setName(''); setCode(''); setDescription(''); setStatus('ACTIVE')
  }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true); setError(null)
    try {
      const payload = { name: name.trim(), code: code.trim() || undefined, description: description.trim() || undefined, status, display_order: editingId ? (heads.find(h => h.id === editingId)?.display_order ?? heads.length) : heads.length }
      if (editingId) await finance.updateVoteHead(editingId, payload)
      else await finance.createVoteHead(payload)
      reset(); await load()
    } catch (e) { setError(friendlyApiError(e, editingId ? 'update vote head' : 'create vote head')) }
    finally { setSaving(false) }
  }

  const edit = (head: import('../lib/finance').VoteHead) => {
    setEditingId(head.id); setName(head.name); setCode(head.code || ''); setDescription(head.description || ''); setStatus(head.status)
  }

  return <section className="section card">
    <div className="finance-section-heading">
      <div><h2 className="section__title">Vote Heads</h2><p className="muted-text">Configure the fee categories used by this school. Nothing is hard-coded.</p></div>
    </div>
    {error && <Alert tone="error">{error}</Alert>}
    <div className="finance-form">
      <div className="finance-form__grid">
        <div className="field"><label className="field__label">Name</label><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tuition" /></div>
        <div className="field"><label className="field__label">Code</label><input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. BES" /></div>
        <div className="field"><label className="field__label">Description</label><input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" /></div>
        <div className="field"><label className="field__label">Status</label><select className="input" value={status} onChange={e => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
        <div className="finance-form__actions"><button className="button button--primary" onClick={save} disabled={!name.trim() || saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Vote Head'}</button>{editingId && <button className="button button--secondary" onClick={reset} disabled={saving}>Cancel</button>}</div>
      </div>
    </div>
    {!heads.length ? <EmptyState title="No vote heads configured" description="Add the categories your school uses for fees." /> : <div className="finance-list">{heads.map(h => <div className="finance-list__row" key={h.id}>
      <div className="finance-list__main"><strong>{h.name}</strong><span className="muted-text">{h.code || 'No code'}{h.description ? ` — ${h.description}` : ''}</span></div>
      <div className="finance-list__value"><Badge tone={h.status === 'ACTIVE' ? 'success' : 'warning'}>{h.status}</Badge><button className="button button--secondary button--sm" onClick={() => edit(h)}>Edit</button></div>
    </div>)}</div>}
  </section>
}
function PaymentHistory({ payments, onChanged }: { payments: Payment[]; onChanged: () => Promise<void> }) {
  const [reversingId, setReversingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reverse = async (payment: Payment) => {
    const confirmed = window.confirm(`Reverse payment #${payment.id} for KES ${Number(payment.amount).toLocaleString()}? This will create a reversal journal and restore the invoice balance.`)
    if (!confirmed) return
    const reason = window.prompt('Reason for reversal (required):', payment.reversal_reason || '')?.trim() || ''
    if (!reason) return
    setReversingId(payment.id)
    setError(null)
    try {
      await finance.reversePayment(payment.id, reason)
      await onChanged()
    } catch (err) {
      setError(friendlyApiError(err, 'reverse the payment'))
    } finally {
      setReversingId(null)
    }
  }

  if (!payments.length) return <EmptyState title="No payments" description="Record payments against invoices." />

  return <>
    {error && <Alert tone="error">{error}</Alert>}
    <div className="table-scroll"><table><thead><tr><th>Date</th><th>Student</th><th>Method</th><th>Amount</th><th>Reference</th><th>Status</th><th>Reversal</th><th>Action</th></tr></thead><tbody>{payments.map((p) => {
      const reversed = p.status === 'REVERSED' || Boolean(p.reversed_at)
      return <tr key={p.id}><td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td><td>Student #{p.student_id}</td><td>{p.payment_method || '—'}</td><td className="number-cell"><strong>KES {Number(p.amount).toLocaleString()}</strong></td><td>{p.reference_number || '—'}</td><td><Badge tone={reversed ? 'danger' : p.status === 'POSTED' ? 'success' : 'warning'}>{p.status}</Badge></td><td>{p.reversed_at ? <span title={p.reversal_reason || undefined}>{new Date(p.reversed_at).toLocaleDateString()}{p.reversal_reason ? ` — ${p.reversal_reason}` : ''}</span> : '—'}</td><td>{reversed ? <span className="muted-text">Reversed</span> : <button className="button button--secondary button--sm" onClick={() => reverse(p)} disabled={reversingId !== null}>{reversingId === p.id ? 'Reversing…' : 'Reverse'}</button>}</td></tr>
    })}</tbody></table></div>
  </>
}

function TrialBalanceView() {
  const [rows, setRows] = useState<TrialBalanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    finance.trialBalance().then((data) => { if (active) setRows(data) }).catch((err) => { if (active) setError(friendlyApiError(err, 'load trial balance')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const debitTotal = rows.reduce((sum, row) => sum + Number(row.debit), 0)
  const creditTotal = rows.reduce((sum, row) => sum + Number(row.credit), 0)
  const difference = debitTotal - creditTotal

  return <section className="section card"><div className="finance-section-heading"><div><h2 className="section__title">Trial Balance</h2><p className="muted-text">Posted journal entries by chart-of-account balance.</p></div><Badge tone={Math.abs(difference) < 0.005 ? 'success' : 'danger'}>{Math.abs(difference) < 0.005 ? 'Balanced' : 'Out of balance'}</Badge></div>{error && <Alert tone="error">{error}</Alert>}{loading ? <LoadingBlock label="Loading trial balance" rows={6} /> : !rows.length ? <EmptyState title="No accounting balances" description="Post journal entries to populate the trial balance." /> : <div className="table-scroll"><table><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{rows.map((row) => <tr key={row.account_id}><td>{row.code}</td><td>{row.name}</td><td>{row.account_type}</td><td className="number-cell">KES {Number(row.debit).toLocaleString()}</td><td className="number-cell">KES {Number(row.credit).toLocaleString()}</td><td className="number-cell"><strong>KES {Number(row.balance).toLocaleString()}</strong></td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Totals</th><th className="number-cell">KES {debitTotal.toLocaleString()}</th><th className="number-cell">KES {creditTotal.toLocaleString()}</th><th className="number-cell">KES {difference.toLocaleString()}</th></tr></tfoot></table></div>}</section>
}

function GeneralLedgerView() {
  const [rows, setRows] = useState<GeneralLedgerRow[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [accountId, setAccountId] = useState('')
  const load = useCallback(async (selectedAccountId?: number) => { setLoading(true); setError(null); try { setRows(await finance.generalLedger(selectedAccountId)) } catch (err) { setError(friendlyApiError(err, 'load general ledger')) } finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])
  const debitTotal = rows.reduce((sum, row) => sum + Number(row.debit), 0); const creditTotal = rows.reduce((sum, row) => sum + Number(row.credit), 0); const net = debitTotal - creditTotal
  return <section className="section card"><div className="finance-section-heading"><div><h2 className="section__title">General Ledger</h2><p className="muted-text">Posted journal lines in transaction order. Use an account ID to narrow the ledger.</p></div><Badge tone="success">Posted entries</Badge></div><div className="finance-form"><div className="finance-form__grid"><div className="field"><label className="field__label">Account ID (optional)</label><input className="input" type="number" min="1" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="e.g. 101" /></div><div className="finance-form__actions"><button className="button button--primary" onClick={() => load(accountId.trim() ? Number(accountId) : undefined)} disabled={loading}>{loading ? 'Loading…' : 'Apply Filter'}</button><button className="button button--secondary" onClick={() => { setAccountId(''); load() }} disabled={loading}>All Accounts</button></div></div></div>{error && <Alert tone="error">{error}</Alert>}{loading ? <LoadingBlock label="Loading general ledger" rows={8} /> : !rows.length ? <EmptyState title="No posted ledger entries" description="Post journal entries to populate the general ledger." /> : <div className="table-scroll"><table><thead><tr><th>Date</th><th>Journal</th><th>Account</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.journal_id}-${row.account_id}-${row.date}-${row.debit}-${row.credit}`}><td>{row.date ? new Date(row.date).toLocaleDateString() : '—'}</td><td>{row.journal_number}</td><td><strong>{row.account_code}</strong><div className="muted-text">{row.account_name}</div></td><td>{row.reference || '—'}</td><td>{row.description || '—'}</td><td className="number-cell">KES {Number(row.debit).toLocaleString()}</td><td className="number-cell">KES {Number(row.credit).toLocaleString()}</td></tr>)}</tbody><tfoot><tr><th colSpan={5}>Totals</th><th className="number-cell">KES {debitTotal.toLocaleString()}</th><th className="number-cell">KES {creditTotal.toLocaleString()}</th></tr><tr><th colSpan={5}>Net movement</th><th colSpan={2} className="number-cell">KES {net.toLocaleString()}</th></tr></tfoot></table></div>}</section>
}

function BalanceSheetView() {
  const [report, setReport] = useState<BalanceSheet | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  useEffect(() => { let active = true; setLoading(true); setError(null); finance.balanceSheet().then((data) => { if (active) setReport(data) }).catch((err) => { if (active) setError(friendlyApiError(err, 'load balance sheet')) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])
  const section = (title: string, rows: TrialBalanceRow[]) => <div className="finance-list"><h3>{title}</h3>{!rows.length ? <p className="muted-text">No accounts.</p> : rows.map((row) => <div key={row.account_id} className="finance-list__row"><div className="finance-list__main"><strong>{row.code} — {row.name}</strong><span className="muted-text">{row.account_type}</span></div><div className="finance-list__value"><strong>KES {Number(row.balance).toLocaleString()}</strong></div></div>)}</div>
  return <section className="section card"><div className="finance-section-heading"><div><h2 className="section__title">Balance Sheet</h2><p className="muted-text">Statement of financial position from posted ledger balances.</p></div>{report && <Badge tone={Math.abs(Number(report.totals.balance_check)) < 0.005 ? 'success' : 'danger'}>{Math.abs(Number(report.totals.balance_check)) < 0.005 ? 'Balanced' : 'Out of balance'}</Badge>}</div>{error && <Alert tone="error">{error}</Alert>}{loading ? <LoadingBlock label="Loading balance sheet" rows={6} /> : !report ? <EmptyState title="Balance sheet unavailable" description="No balance sheet response was returned." /> : <>{section('Assets', report.assets)}{section('Liabilities', report.liabilities)}{section('Equity / Net Assets', report.equity)}<div className="finance-list"><div className="finance-list__row"><div className="finance-list__main"><strong>Current Surplus / (Deficit)</strong></div><div className="finance-list__value"><strong>KES {Number(report.current_surplus_deficit).toLocaleString()}</strong></div></div><div className="finance-list__row"><div className="finance-list__main"><strong>Total Assets</strong></div><div className="finance-list__value"><strong>KES {Number(report.totals.assets).toLocaleString()}</strong></div></div><div className="finance-list__row"><div className="finance-list__main"><strong>Liabilities + Net Assets</strong></div><div className="finance-list__value"><strong>KES {Number(report.totals.liabilities_and_net_assets).toLocaleString()}</strong></div></div><div className="finance-list__row"><div className="finance-list__main"><strong>Balance Check</strong></div><div className="finance-list__value"><strong>KES {Number(report.totals.balance_check).toLocaleString()}</strong></div></div></div></>}</section>
}

function FeeStructureReview({ fee, onClose }: { fee: FeeStructure; onClose: () => void }) {
  const [items, setItems] = useState<import('../lib/finance').FeeStructureItem[]>([])
  const [heads, setHeads] = useState<VoteHead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([finance.listFeeStructureItems(fee.id), finance.listVoteHeads()])
      .then(([allocations, voteHeads]) => {
        if (!active) return
        setItems(allocations)
        setHeads(voteHeads)
      })
      .catch((err) => { if (active) setError(friendlyApiError(err, 'review fee structure')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fee.id])

  return <section className="section card" aria-label={`Review fee structure ${fee.name}`}>
    <div className="finance-section-heading"><div><h3 className="section__title">Review: {fee.name}</h3><p className="muted-text">Check the scope and how the total is split across vote heads before billing.</p></div><button className="button button--secondary button--sm" onClick={onClose}>Close</button></div>
    {error && <Alert tone="error">{error}</Alert>}
    <div className="finance-list">
      <div className="finance-list__row"><div className="finance-list__main"><strong>Total fee</strong><span className="muted-text">Currency: {fee.currency || 'KES'} · Status: {fee.status}</span></div><div className="finance-list__value"><strong>{fee.currency || 'KES'} {Number(fee.amount).toLocaleString()}</strong></div></div>
      <div className="finance-list__row"><div className="finance-list__main"><strong>Academic year</strong></div><div className="finance-list__value">#{fee.academic_year_id ?? 'Any'}</div></div>
      <div className="finance-list__row"><div className="finance-list__main"><strong>Level / grade / stream scope</strong></div><div className="finance-list__value">{fee.level_id == null ? 'All levels' : `Level #${fee.level_id}`} · {fee.grade_id == null ? 'All grades' : `Grade #${fee.grade_id}`} · {fee.stream_id == null ? 'All streams' : `Stream #${fee.stream_id}`}</div></div>
      <div className="finance-list__row"><div className="finance-list__main"><strong>Description</strong></div><div className="finance-list__value">{fee.description || 'No description'}</div></div>
    </div>
    <h4>Vote-head allocations</h4>
    {loading ? <LoadingBlock label="Loading allocations" rows={2} /> : !items.length ? <EmptyState title="No allocations found" description="This fee structure needs vote-head allocations before billing." /> : <div className="table-scroll"><table><thead><tr><th>Vote head</th><th>Amount</th><th>Share</th></tr></thead><tbody>{items.map((item) => { const head = heads.find((candidate) => candidate.id === item.vote_head_id); return <tr key={item.id}><td>{head?.name || `Vote head #${item.vote_head_id}`}</td><td className="number-cell">{fee.currency || 'KES'} {Number(item.amount).toLocaleString()}</td><td className="number-cell">{Number(fee.amount) > 0 ? `${(Number(item.amount) / Number(fee.amount) * 100).toFixed(1)}%` : '—'}</td></tr> })}</tbody><tfoot><tr><th>Total allocated</th><th className="number-cell">{fee.currency || 'KES'} {items.reduce((sum, item) => sum + Number(item.amount), 0).toLocaleString()}</th><th className="number-cell">{Number(fee.amount) > 0 ? `${(items.reduce((sum, item) => sum + Number(item.amount), 0) / Number(fee.amount) * 100).toFixed(1)}%` : '—'}</th></tr></tfoot></table></div>}
  </section>
}

function NewFeeForm({ existingFeeStructures, onCreated, onCancel }: { existingFeeStructures: FeeStructure[]; onCreated: () => void; onCancel: () => void }) {
  const [academicYears, setAcademicYears] = useState<Awaited<ReturnType<typeof api.academicYears>>>([])
  const [levels, setLevels] = useState<Awaited<ReturnType<typeof api.levels>>>([])
  const [grades, setGrades] = useState<Awaited<ReturnType<typeof api.grades>>>([])
  // Shared scope is the default: one structure can cover Primary and Junior until fees diverge.
  const [form, setForm] = useState({ academic_year_id: '', level_id: 'all', grade_id: 'all', name: '', amount: '', description: '' })
  const [voteHeads, setVoteHeads] = useState<VoteHead[]>([])
  const [allocations, setAllocations] = useState<Record<number, string>>({})
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const existingFee = existingFeeStructures.find((fee) =>
    fee.name.trim().toLocaleLowerCase() === form.name.trim().toLocaleLowerCase() &&
    Number(fee.academic_year_id) === Number(form.academic_year_id) &&
    (fee.level_id ?? null) === (form.level_id === 'all' ? null : Number(form.level_id)) &&
    (fee.grade_id ?? null) === (form.grade_id === 'all' ? null : Number(form.grade_id)) &&
    (fee.stream_id ?? null) === null
  )

  useEffect(() => {
    let active = true
    Promise.all([api.academicYears(), api.levels(), finance.listVoteHeads()])
      .then(([years, loadedLevels, loadedVoteHeads]) => {
        if (!active) return
        setAcademicYears(years)
        setLevels(loadedLevels)
        setVoteHeads(loadedVoteHeads.filter((head) => head.status === 'ACTIVE'))
        const currentYear = years.find((year) => year.is_current) || years[0]
        setForm((current) => ({ ...current, academic_year_id: currentYear ? String(currentYear.id) : '' }))
      })
      .catch((err) => { if (active) setError(friendlyApiError(err, 'load academic setup')) })
      .finally(() => { if (active) setLoadingOptions(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setForm((current) => ({ ...current, grade_id: current.level_id === 'all' ? 'all' : '' }))
    if (!form.level_id || form.level_id === 'all') { setGrades([]); return }
    let active = true
    api.grades(Number(form.level_id))
      .then((items) => { if (active) setGrades(items.filter((grade) => grade.status !== false)) })
      .catch((err) => { if (active) { setGrades([]); setError(friendlyApiError(err, 'load grades')) } })
    return () => { active = false }
  }, [form.level_id])

  const submit = async () => {
    const sharedAcrossLevels = form.level_id === 'all'
    const allGrades = sharedAcrossLevels || form.grade_id === 'all'
    if (!form.academic_year_id || (!sharedAcrossLevels && !form.level_id) || (!allGrades && !form.grade_id) || !form.name.trim() || !form.amount || Number(form.amount) <= 0) {
      setError('Select an academic year and fee scope, then enter a fee name and a positive amount.')
      return
    }
    const activeAllocations = voteHeads.map((head, index) => ({ vote_head_id: head.id, amount: Number(allocations[head.id] || 0), display_order: index })).filter((item) => item.amount > 0)
    const allocationTotal = activeAllocations.reduce((sum, item) => sum + item.amount, 0)
    if (!activeAllocations.length || Math.abs(allocationTotal - Number(form.amount)) > 0.001) {
      setError('Allocate the full fee amount across one or more active vote heads.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await finance.createFeeStructure({
        academic_year_id: Number(form.academic_year_id),
        level_id: sharedAcrossLevels ? null : Number(form.level_id),
        grade_id: allGrades ? null : Number(form.grade_id),
        stream_id: null,
        name: form.name.trim(),
        amount: Number(form.amount),
        description: form.description.trim() || undefined,
        allocations: activeAllocations,
      })
      onCreated()
    } catch (err) {
      setError(friendlyApiError(err, 'create fee structure'))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="finance-form">
    {error && <Alert tone="error">{error}</Alert>}
    {existingFee && <Alert tone="warning">A fee structure named “{existingFee.name}” already exists for this academic year and grade (KES {Number(existingFee.amount).toLocaleString()}). It is listed in Finance → Fees. No duplicate will be created.</Alert>}
    <p className="muted-text">Use a shared structure for all levels and grades when fees are the same. You can narrow it to one level or grade later if fees change. All streams are included unless a stream-specific structure is added.</p>
    <div className="finance-form__grid">
      <div className="field"><label className="field__label">Academic Year</label><select className="input" value={form.academic_year_id} onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })} disabled={loadingOptions || submitting}><option value="">Select academic year…</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}{year.is_current ? ' (Current)' : ''}</option>)}</select></div>
      <div className="field"><label className="field__label">Applies to level</label><select className="input" value={form.level_id} onChange={(e) => setForm({ ...form, level_id: e.target.value, grade_id: 'all' })} disabled={loadingOptions || submitting || !form.academic_year_id}><option value="all">All levels (shared fee)</option>{levels.filter((level) => level.status === true || level.status === 'ACTIVE').map((level) => <option key={level.id} value={level.id}>{levelLabel(level.name)}</option>)}</select></div>
      <div className="field"><label className="field__label">Applies to grade</label><select className="input" value={form.grade_id} onChange={(e) => setForm({ ...form, grade_id: e.target.value })} disabled={loadingOptions || submitting || form.level_id === 'all' || !form.level_id}><option value="all">All grades</option>{grades.filter((grade) => Number(grade.level_id) === Number(form.level_id) && grade.status !== false).map((grade) => <option key={grade.id} value={grade.id}>{gradeLabel(grade.name)}</option>)}</select>{form.level_id === 'all' && <span className="muted-text">All grades across Primary and Junior are included.</span>}</div>
      <div className="field"><label className="field__label">Fee Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tuition Fee" disabled={submitting} /></div>
      <div className="field"><label className="field__label">Amount (KES)</label><input className="input" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} disabled={submitting} /></div>
      <div className="field"><label className="field__label">Description (optional)</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={submitting} /></div>
      <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field__label">Vote Head Allocations</label><p className="muted-text">The allocation total must equal the fee amount. Payments will follow this order.</p><div className="finance-list">{voteHeads.map((head, index) => <div className="finance-list__row" key={head.id}><div className="finance-list__main"><strong>{head.name}</strong><span className="muted-text">{head.code || 'No code'} · Priority {index + 1}</span></div><div className="finance-list__value"><input className="input" style={{ width: 160 }} type="number" min="0" step="0.01" value={allocations[head.id] || ''} onChange={(e) => setAllocations({ ...allocations, [head.id]: e.target.value })} disabled={submitting} placeholder="KES 0.00" /></div></div>)}</div><p className={Math.abs(voteHeads.reduce((sum, head) => sum + Number(allocations[head.id] || 0), 0) - Number(form.amount || 0)) < 0.001 ? 'muted-text' : 'finance-summary__value--warning'}>Allocated: KES {voteHeads.reduce((sum, head) => sum + Number(allocations[head.id] || 0), 0).toLocaleString()} / KES {Number(form.amount || 0).toLocaleString()}</p></div>
      <div className="finance-form__actions"><button className="button button--primary" disabled={loadingOptions || !form.academic_year_id || (form.level_id !== 'all' && !form.level_id) || (form.level_id !== 'all' && form.grade_id !== 'all' && !form.grade_id) || !form.name.trim() || !form.amount || Number(form.amount) <= 0 || submitting || Boolean(existingFee)} onClick={submit}>{submitting ? 'Creating…' : existingFee ? 'Fee Structure Already Exists' : 'Create Fee Structure'}</button><button className="button button--secondary" onClick={onCancel} disabled={submitting}>Cancel</button></div>
    </div>
  </div>
}

function BulkBillingForm({ feeStructures, academicYearId, levelId, gradeId, streamId, onCreated, onCreateFee }: { feeStructures: FeeStructure[]; academicYearId: string; levelId: string; gradeId: string; streamId: string; onCreated: () => void; onCreateFee: () => void }) {
  const [feeId,setFeeId]=useState(0); const [busy,setBusy]=useState(false); const [message,setMessage]=useState<string|null>(null); const [error,setError]=useState<string|null>(null)
  const matchingFeeStructures = feeStructures.filter(f =>
    (!f.academic_year_id || String(f.academic_year_id) === academicYearId) &&
    (!f.level_id || String(f.level_id) === levelId) &&
    (f.grade_id == null || String(f.grade_id) === gradeId) &&
    (f.stream_id == null ? !streamId || true : String(f.stream_id) === streamId)
  )
  useEffect(()=>{setFeeId(matchingFeeStructures[0]?.id || 0)},[academicYearId,levelId,gradeId,streamId,feeStructures])
  const ready = Boolean(academicYearId && levelId && gradeId)
  const run=async()=>{if(!ready||!feeId)return;setBusy(true);setMessage(null);setError(null);try{const r=await finance.createBillingRun({academic_year_id:Number(academicYearId),level_id:Number(levelId),grade_id:Number(gradeId),stream_id:streamId?Number(streamId):undefined,fee_structure_id:feeId});setMessage(`Billing complete: ${r.invoices_created} created, ${r.invoices_skipped} already billed, ${r.matched_students} students matched.`);onCreated()}catch(e){setError(friendlyApiError(e,'run billing'))}finally{setBusy(false)}}
  const selectedFee = matchingFeeStructures.find(f=>f.id===feeId)
  return <section className="section card" aria-label="Student billing">
    <div className="finance-section-heading"><div><h3 className="section__title">Bill Students</h3><p className="muted-text">Choose the saved fee structure for the selected academic year, level and grade.</p></div></div>
    {error&&<Alert tone="error">{error}</Alert>}{message&&<Alert tone="success">{message}</Alert>}
    {!feeStructures.length ? <div className="empty-state"><strong>No fee structures have been saved.</strong><p>Create a fee structure first. It will then appear here for billing.</p><button className="button button--primary" onClick={onCreateFee}>Go to Finance → Fees</button></div> : <>
      <div className="finance-form"><div className="finance-form__grid">
        <div className="field"><label className="field__label">Fee Structure *</label><select className="input" value={feeId || ''} onChange={e=>setFeeId(Number(e.target.value))} disabled={!ready || !matchingFeeStructures.length || busy}><option value="">{!ready?'Select academic year, level and grade first':!matchingFeeStructures.length?'No matching fee structure found':'Select fee structure'}</option>{matchingFeeStructures.map(f=><option key={f.id} value={f.id}>{f.name} — KES {Number(f.amount).toLocaleString()} (Year #{f.academic_year_id ?? 'Any'}, Grade #{f.grade_id ?? 'Any'})</option>)}</select></div>
        <div className="finance-form__actions"><button className="button button--primary" onClick={run} disabled={busy||!ready||!feeId||!selectedFee}>{busy?'Billing…':'Bill Matching Students'}</button></div>
      </div></div>
      {ready && !matchingFeeStructures.length && <Alert tone="warning">No saved fee structure matches the selected year, level and grade. Review the saved structures below or create the correct one.</Alert>}
    </>}
    <div className="finance-section-heading" style={{marginTop:16}}><h4>Saved Fee Structures ({feeStructures.length})</h4><button className="button button--secondary button--sm" onClick={onCreateFee}>+ Create Fee Structure</button></div>
    {!feeStructures.length ? <p className="muted-text">Nothing is saved yet.</p> : <div className="finance-list">{feeStructures.map(f=><div className="finance-list__row" key={f.id}><div className="finance-list__main"><strong>{f.name}</strong><span className="muted-text">Year #{f.academic_year_id ?? 'Any'} · Level #{f.level_id ?? 'Any'} · Grade #{f.grade_id ?? 'Any'} · {f.stream_id == null ? 'All streams' : `Stream #${f.stream_id}`}</span></div><div className="finance-list__value"><strong>KES {Number(f.amount).toLocaleString()}</strong><Badge tone={f.status==='ACTIVE'||f.status==='active'?'success':'warning'}>{f.status}</Badge></div></div>)}</div>}
  </section>
}

function InvoiceBulkBillingForm({ feeStructures, onCreated }: { feeStructures: FeeStructure[]; onCreated: () => void }) {
  const [academicYears, setAcademicYears] = useState<Awaited<ReturnType<typeof api.academicYears>>>([])
  const [levels, setLevels] = useState<Awaited<ReturnType<typeof api.levels>>>([])
  const [grades, setGrades] = useState<Awaited<ReturnType<typeof api.grades>>>([])
  const [streams, setStreams] = useState<Awaited<ReturnType<typeof api.streams>>>([])
  const [yearId, setYearId] = useState('')
  const [levelId, setLevelId] = useState('')
  const [gradeId, setGradeId] = useState('')
  const [streamId, setStreamId] = useState('')
  const [feeId, setFeeId] = useState(0)
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [loadingStreams, setLoadingStreams] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.academicYears(), api.levels()])
      .then(([years, loadedLevels]) => {
        if (!active) return
        setAcademicYears(years)
        setLevels(loadedLevels)
        const current = years.find(year => year.is_current) || years[0]
        setYearId(current ? String(current.id) : '')
      })
      .catch(err => { if (active) setError(friendlyApiError(err, 'load academic setup')) })
      .finally(() => { if (active) setLoadingOptions(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setGradeId('')
    setStreamId('')
    setGrades([])
    setStreams([])
    if (!levelId) return
    let active = true
    setLoadingGrades(true)
    api.grades(Number(levelId))
      .then(items => { if (active) setGrades(items.filter(grade => grade.status !== false)) })
      .catch(err => { if (active) setError(friendlyApiError(err, 'load grades')) })
      .finally(() => { if (active) setLoadingGrades(false) })
    return () => { active = false }
  }, [levelId])

  useEffect(() => {
    setStreamId('')
    setStreams([])
    if (!yearId || !gradeId) return
    let active = true
    setLoadingStreams(true)
    api.streams(Number(yearId), Number(gradeId))
      .then(items => { if (active) setStreams(items.filter(stream => stream.status === 'ACTIVE')) })
      .catch(err => { if (active) setError(friendlyApiError(err, 'load streams')) })
      .finally(() => { if (active) setLoadingStreams(false) })
    return () => { active = false }
  }, [yearId, gradeId])

  const matchingFeeStructures = feeStructures.filter(fee =>
    (!fee.academic_year_id || String(fee.academic_year_id) === yearId) &&
    (!fee.level_id || String(fee.level_id) === levelId) &&
    (fee.grade_id == null || String(fee.grade_id) === gradeId) &&
    (fee.stream_id == null || String(fee.stream_id) === streamId) &&
    (fee.status === 'ACTIVE' || fee.status === 'active')
  )
  useEffect(() => { setFeeId(matchingFeeStructures[0]?.id || 0) }, [yearId, levelId, gradeId, streamId, feeStructures])
  const ready = Boolean(yearId && levelId && gradeId)
  const selectedFee = matchingFeeStructures.find(fee => fee.id === feeId)

  const run = async () => {
    if (!ready || !feeId || !selectedFee) return
    setSubmitting(true)
    setMessage(null)
    setError(null)
    try {
      const result = await finance.createBillingRun({
        academic_year_id: Number(yearId),
        level_id: Number(levelId),
        grade_id: Number(gradeId),
        stream_id: streamId ? Number(streamId) : undefined,
        fee_structure_id: feeId,
      })
      setMessage(`Billing complete: ${result.invoices_created} invoices created, ${result.invoices_skipped} already billed, ${result.matched_students} students matched.`)
      onCreated()
    } catch (err) {
      setError(friendlyApiError(err, 'run bulk billing'))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="finance-form">
    <p className="muted-text">Generate invoices for eligible students in a selected academic year, level and grade. Students already billed for the selected fee structure are skipped.</p>
    {error && <Alert tone="error">{error}</Alert>}
    {message && <Alert tone="success">{message}</Alert>}
    <div className="finance-form__grid">
      <div className="field"><label className="field__label">Academic Year *</label><select className="input" value={yearId} onChange={event => { setYearId(event.target.value); setLevelId(''); setGradeId(''); setStreamId('') }} disabled={loadingOptions || submitting}><option value="">Select academic year…</option>{academicYears.map(year => <option key={year.id} value={year.id}>{year.name}{year.is_current ? ' (Current)' : ''}</option>)}</select></div>
      <div className="field"><label className="field__label">Level *</label><select className="input" value={levelId} onChange={event => { setLevelId(event.target.value); setGradeId(''); setStreamId('') }} disabled={loadingOptions || !yearId || submitting}><option value="">Select level…</option>{levels.filter(level => level.status === true || level.status === 'ACTIVE').map(level => <option key={level.id} value={level.id}>{levelLabel(level.name)}</option>)}</select></div>
      <div className="field"><label className="field__label">Grade *</label><select className="input" value={gradeId} onChange={event => { setGradeId(event.target.value); setStreamId('') }} disabled={!levelId || loadingGrades || submitting}><option value="">Select grade…</option>{grades.filter(grade => Number(grade.level_id) === Number(levelId) && grade.status !== false).map(grade => <option key={grade.id} value={grade.id}>{gradeLabel(grade.name)}</option>)}</select></div>
      <div className="field"><label className="field__label">Stream (optional)</label><select className="input" value={streamId} onChange={event => setStreamId(event.target.value)} disabled={!gradeId || loadingStreams || submitting}><option value="">{loadingStreams ? 'Loading streams…' : 'All streams'}</option>{streams.map(stream => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select></div>
      <div className="field"><label className="field__label">Fee Structure *</label><select className="input" value={feeId || ''} onChange={event => setFeeId(Number(event.target.value))} disabled={!ready || submitting || !matchingFeeStructures.length}><option value="">{!ready ? 'Select year, level and grade first' : !matchingFeeStructures.length ? 'No matching active fee structure' : 'Select fee structure'}</option>{matchingFeeStructures.map(fee => <option key={fee.id} value={fee.id}>{fee.name} — KES {Number(fee.amount).toLocaleString()}</option>)}</select></div>
      <div className="finance-form__actions"><button className="button button--primary" onClick={run} disabled={!ready || !feeId || !selectedFee || submitting}>{submitting ? 'Billing…' : 'Bill Matching Students'}</button></div>
    </div>
    {ready && !matchingFeeStructures.length && <Alert tone="warning">No active fee structure matches this academic year, level, grade and stream. Check Finance → Fees before billing.</Alert>}
  </div>
}

function NewInvoiceForm({ feeStructures, onCreated, onCancel }: { feeStructures: FeeStructure[]; onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ student_id: '', fee_structure_id: feeStructures[0]?.id || 0 }); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null); const selectedFee = feeStructures.find((f) => f.id === form.fee_structure_id)
  const submit = async () => {
    setSubmitting(true); setError(null)
    try { await finance.createInvoice({ student_id: Number(form.student_id), fee_structure_id: form.fee_structure_id, amount: selectedFee?.amount || 0 }); onCreated() }
    catch (err) { setError(friendlyApiError(err, 'create invoice')) }
    finally { setSubmitting(false) }
  }
  return <div className="finance-form">{error && <Alert tone="error">{error}</Alert>}<div className="finance-form__grid"><div className="field"><label className="field__label">Student ID</label><input className="input" type="number" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} /></div><div className="field"><label className="field__label">Fee Structure</label><select className="input" value={form.fee_structure_id} onChange={(e) => setForm({ ...form, fee_structure_id: Number(e.target.value) })}>{feeStructures.map((f) => <option key={f.id} value={f.id}>{f.name} — KES {Number(f.amount).toLocaleString()}</option>)}</select></div><div className="finance-form__actions"><button className="button button--primary" disabled={!form.student_id || submitting} onClick={submit}>{submitting ? 'Creating…' : 'Create'}</button><button className="button button--secondary" onClick={onCancel} disabled={submitting}>Cancel</button></div></div></div>
}

function NewPaymentForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ invoice_id: '', student_id: '', amount: '', payment_method: 'cash' })
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [studentById, setStudentById] = useState<Map<number, Student>>(() => new Map())
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadOptions = async () => {
      setLoadingOptions(true)
      setOptionsError(null)
      try {
        const [invoiceRows, firstPage] = await Promise.all([
          finance.listInvoices(),
          students.list({ page: 1, page_size: 100 }),
        ])
        const studentRows = [...firstPage.items]
        for (let page = 2; page <= firstPage.pages; page += 1) {
          const nextPage = await students.list({ page, page_size: 100 })
          studentRows.push(...nextPage.items)
        }
        if (!cancelled) {
          setInvoices(invoiceRows.filter((invoice) => Number(invoice.balance) > 0 && !['paid', 'void', 'cancelled'].includes(String(invoice.status).toLowerCase())))
          setStudentById(new Map(studentRows.map((student) => [student.id, student])))
        }
      } catch (err) {
        if (!cancelled) setOptionsError(friendlyApiError(err, 'load outstanding invoices'))
      } finally {
        if (!cancelled) setLoadingOptions(false)
      }
    }
    void loadOptions()
    return () => { cancelled = true }
  }, [])

  const selectedInvoice = invoices.find((invoice) => String(invoice.id) === form.invoice_id)
  const formatStudent = (studentId: number) => {
    const student = studentById.get(studentId)
    if (!student) return `Student #${studentId}`
    return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ').trim() || `Student #${studentId}`
  }
  const invoiceOption = (invoice: Invoice) => {
    const student = studentById.get(invoice.student_id)
    const admission = student?.admission_number ? ` · ${student.admission_number}` : ''
    return `Invoice #${invoice.id} — ${formatStudent(invoice.student_id)}${admission} — Balance KES ${Number(invoice.balance).toLocaleString()}`
  }
  const submit = async () => {
    if (!selectedInvoice) {
      setError('Select an outstanding invoice before recording a payment.')
      return
    }
    if (Number(form.amount) <= 0 || Number(form.amount) > Number(selectedInvoice.balance)) {
      setError(`Enter an amount greater than zero and no more than the outstanding balance of KES ${Number(selectedInvoice.balance).toLocaleString()}.`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await finance.recordPayment({ invoice_id: selectedInvoice.id, student_id: selectedInvoice.student_id, amount: Number(form.amount), payment_method: form.payment_method })
      onCreated()
    } catch (err) {
      setError(friendlyApiError(err, 'record payment'))
    } finally {
      setSubmitting(false)
    }
  }
  return <div className="finance-form">
    {error && <Alert tone="error">{error}</Alert>}
    {optionsError && <Alert tone="error">{optionsError}</Alert>}
    <div className="finance-form__grid">
      <div className="field">
        <label className="field__label">Invoice / Student</label>
        <select className="input" value={form.invoice_id} disabled={loadingOptions || invoices.length === 0} onChange={(e) => {
          const invoice = invoices.find((row) => String(row.id) === e.target.value)
          setForm({ ...form, invoice_id: e.target.value, student_id: invoice ? String(invoice.student_id) : '', amount: invoice ? String(invoice.balance) : '' })
          setError(null)
        }}>
          <option value="">{loadingOptions ? 'Loading outstanding invoices…' : invoices.length ? 'Select student and invoice' : 'No outstanding invoices available'}</option>
          {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoiceOption(invoice)}</option>)}
        </select>
        <small className="field__hint">Choose the student’s invoice. The invoice ID and student ID are filled automatically.</small>
      </div>
      {selectedInvoice && <div className="field">
        <label className="field__label">Student</label>
        <input className="input" value={`${formatStudent(selectedInvoice.student_id)} · Student ID ${selectedInvoice.student_id}`} readOnly />
      </div>}
      {selectedInvoice && <div className="field">
        <label className="field__label">Invoice ID</label>
        <input className="input" value={selectedInvoice.id} readOnly />
      </div>}
      <div className="field">
        <label className="field__label">Amount (KES)</label>
        <input className="input" type="number" min="0.01" max={selectedInvoice?.balance} step="0.01" value={form.amount} disabled={!selectedInvoice} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        {selectedInvoice && <small className="field__hint">Outstanding balance: KES {Number(selectedInvoice.balance).toLocaleString()}</small>}
      </div>
      <div className="field">
        <label className="field__label">Method</label>
        <select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile">Mobile</option><option value="cheque">Cheque</option></select>
      </div>
      <div className="finance-form__actions">
        <button className="button button--primary" disabled={!selectedInvoice || !form.amount || loadingOptions || submitting} onClick={submit}>{submitting ? 'Recording…' : 'Record'}</button>
        <button className="button button--secondary" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
    </div>
  </div>
}

function StudentBalancesReport({ onCreateFee }: { onCreateFee: () => void }) {
  const [rows,setRows]=useState<import('../lib/finance').StudentBalanceReportRow[]>([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [academicYears,setAcademicYears]=useState<Awaited<ReturnType<typeof api.academicYears>>>([])
  const [feeStructures,setFeeStructures]=useState<FeeStructure[]>([])
  const [levels,setLevels]=useState<Awaited<ReturnType<typeof api.levels>>>([])
  const [grades,setGrades]=useState<Awaited<ReturnType<typeof api.grades>>>([])
  const [streams,setStreams]=useState<Awaited<ReturnType<typeof api.streams>>>([])
  const [yearId,setYearId]=useState('')
  const [levelId,setLevelId]=useState('')
  const [gradeId,setGradeId]=useState('')
  const [streamId,setStreamId]=useState('')
  const [loadingOptions,setLoadingOptions]=useState(true)
  const [outstandingOnly,setOutstandingOnly]=useState(false)
  const [loadingStreams,setLoadingStreams]=useState(false)
  useEffect(()=>{let active=true;Promise.all([api.academicYears(),api.levels()]).then(([years,loadedLevels])=>{if(!active)return;setAcademicYears(years);setLevels(loadedLevels);const current=years.find(y=>y.is_current)||years[0];setYearId(current?String(current.id):'')}).catch(err=>{if(active)setError(friendlyApiError(err,'load academic setup'))}).finally(()=>{if(active)setLoadingOptions(false)});return()=>{active=false}},[])
  useEffect(()=>{setGradeId('');setStreamId('');setStreams([]);if(!levelId){setGrades([]);return};let active=true;api.grades(Number(levelId)).then(items=>{if(active)setGrades(items.filter(g=>g.status!==false))}).catch(err=>{if(active){setGrades([]);setError(friendlyApiError(err,'load grades'))}});return()=>{active=false}},[levelId])
  useEffect(()=>{let active=true;finance.listFeeStructures().then(items=>{if(active)setFeeStructures(items)}).catch(err=>{if(active)setError(friendlyApiError(err,'load fee structures'))});return()=>{active=false}},[])
  useEffect(()=>{setStreamId('');setStreams([]);if(!yearId||!gradeId)return;const grade=grades.find(g=>String(g.id)===gradeId);if(!grade||String(grade.level_id)!==levelId)return;let active=true;setLoadingStreams(true);api.streams(Number(yearId),Number(gradeId)).then(items=>{if(active)setStreams(items.filter(s=>s.status==='ACTIVE'))}).catch(err=>{if(active)setError(friendlyApiError(err,'load streams'))}).finally(()=>{if(active)setLoadingStreams(false)});return()=>{active=false}},[yearId,gradeId,levelId,grades])
  const load=async()=>{setLoading(true);setError(null);try{setRows(await finance.studentBalanceReport({academic_year_id:yearId?Number(yearId):undefined,level_id:levelId?Number(levelId):undefined,grade_id:gradeId?Number(gradeId):undefined,stream_id:streamId?Number(streamId):undefined,outstanding_only:outstandingOnly}))}catch(e){setError(friendlyApiError(e,'load student balances'))}finally{setLoading(false)}}
  useEffect(()=>{if(!loadingOptions)void load()},[loadingOptions, outstandingOnly])
  const total=rows.reduce((n,r)=>n+Number(r.balance),0)
  return <section className="section card fee-balance-report"><div className="finance-section-heading"><div><h2 className="section__title">Students With Fee Balances</h2><p className="muted-text">Enrollment-driven finance roster. Students remain visible before billing.</p></div><div className="finance-form__actions"><button className="button button--secondary button--sm" onClick={()=>window.print()}>Print Report</button></div></div><div className="finance-form"><div className="finance-form__grid">
  <div className="field"><label className="field__label">Academic Year</label><select className="input" value={yearId} onChange={e=>{setYearId(e.target.value);setLevelId('');setGradeId('');setStreamId('')}} disabled={loadingOptions}><option value="">Select academic year…</option>{academicYears.map(y=><option key={y.id} value={y.id}>{y.name}{y.is_current?' (Current)':''}</option>)}</select></div>
  <div className="field"><label className="field__label">Level</label><select className="input" value={levelId} onChange={e=>setLevelId(e.target.value)} disabled={loadingOptions||!yearId}><option value="">Select level…</option>{levels.filter(l=>l.status===true||l.status==='ACTIVE').map(l=><option key={l.id} value={l.id}>{levelLabel(l.name)}</option>)}</select></div>
  <div className="field"><label className="field__label">Grade</label><select className="input" value={gradeId} onChange={e=>setGradeId(e.target.value)} disabled={!yearId||!levelId||loadingOptions}><option value="">Select grade…</option>{grades.filter(g=>Number(g.level_id)===Number(levelId) && g.status!==false).map(g=><option key={g.id} value={g.id}>{gradeLabel(g.name)}</option>)}</select></div>
  <div className="field"><label className="field__label">Stream</label><select className="input" value={streamId} onChange={e=>setStreamId(e.target.value)} disabled={!gradeId||loadingStreams}><option value="">{loadingStreams?'Loading streams…':streams.length?'Select stream (optional)':'No streams configured (optional)'}</option>{streams.filter(s=>s.status==='ACTIVE').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
  <div className="finance-form__actions"><label className="field-checkbox"><input type="checkbox" checked={outstandingOnly} onChange={e=>setOutstandingOnly(e.target.checked)} /> Outstanding balances only</label><button className="button button--primary" onClick={load} disabled={loading||loadingOptions}>{loading?'Loading…':'Apply Filters'}</button></div><div className="finance-form__actions"><BulkBillingForm feeStructures={feeStructures} academicYearId={yearId} levelId={levelId} gradeId={gradeId} streamId={streamId} onCreated={load} onCreateFee={onCreateFee} /></div></div></div>{error&&<Alert tone="error">{error}</Alert>}{loading?<LoadingBlock label="Loading balances" rows={8}/>:!rows.length?<EmptyState title="No outstanding balances" description="No students match the selected academic filters."/>:<div className="table-scroll"><table><thead><tr><th>#</th><th>Admission No.</th><th>Student</th><th>Level</th><th>Grade</th><th>Stream</th><th>Billing</th><th>Invoiced</th><th>Paid</th><th>Balance</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.student_id}><td>{i+1}</td><td>{r.admission_number}</td><td><strong>{r.student_name}</strong></td><td>{r.level_name||'—'}</td><td>{r.grade_name||'—'}</td><td>{r.stream_name||'No stream'}</td><td><Badge tone={r.billing_status==='BILLED'?'success':'warning'}>{r.billing_status==='BILLED'?'Billed':'Not billed'}</Badge></td><td>KES {Number(r.total_invoiced).toLocaleString()}</td><td>KES {Number(r.total_paid).toLocaleString()}</td><td><strong>KES {Number(r.balance).toLocaleString()}</strong></td></tr>)}</tbody><tfoot><tr><th colSpan={9}>Total Outstanding</th><th>KES {total.toLocaleString()}</th></tr></tfoot></table></div>}</section>
}
