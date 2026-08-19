import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { FinancePaymentMatcher } from '../components/FinancePaymentMatcher'
import { FinanceBanking } from '../components/FinanceBanking'
import { friendlyApiError } from '../lib/api'
import { finance, type BalanceSheet, type FeeStructure, type GeneralLedgerRow, type Invoice, type Payment, type FinanceOverview, type TrialBalanceRow } from '../lib/finance'
import './Finance.css'

export default function FinancePage() {
  const [overview, setOverview] = useState<FinanceOverview | null>(null)
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'fees' | 'invoices' | 'matcher' | 'trial-balance' | 'general-ledger' | 'balance-sheet' | 'banking'>('overview')
  const [showNewFee, setShowNewFee] = useState(false)
  const [showNewInvoice, setShowNewInvoice] = useState(false)
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

  return <div className="finance-page">
    <PageHeader title="Finance" description="Fee structures, invoices, payments, accounting reports, banking, and M-PESA fee matching." />
    {error && <Alert tone="error">{error}</Alert>}
    <div className="finance-tabs" role="tablist" aria-label="Finance sections">
      {(['overview', 'matcher', 'fees', 'invoices', 'payments', 'banking', 'trial-balance', 'general-ledger', 'balance-sheet'] as const).map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={`button ${activeTab === tab ? 'button--primary' : 'button--secondary'} button--sm`} onClick={() => setActiveTab(tab)}>{tab === 'matcher' ? 'M-PESA Matcher' : tab === 'trial-balance' ? 'Trial Balance' : tab === 'general-ledger' ? 'General Ledger' : tab === 'balance-sheet' ? 'Balance Sheet' : tab === 'banking' ? 'Banking & Reconciliation' : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}
    </div>

    {loading ? <LoadingBlock label="Loading finance" rows={4} /> : <>
      {activeTab === 'matcher' && <FinancePaymentMatcher onPosted={load} />}
      {activeTab === 'banking' && <FinanceBanking />}
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
        {showNewFee && <NewFeeForm onCreated={() => { setShowNewFee(false); load() }} onCancel={() => setShowNewFee(false)} />}
        {!feeStructures.length ? <EmptyState title="No fee structures" description="Create a fee structure to start invoicing." /> : <div className="finance-list">{feeStructures.map((f) => <div key={f.id} className="finance-list__row"><div className="finance-list__main"><strong>{f.name}</strong> <span className="muted-text">{f.description}</span></div><div className="finance-list__value"><strong>KES {Number(f.amount).toLocaleString()}</strong> <Badge tone="success">{f.status}</Badge></div></div>)}</div>}
      </section>}

      {activeTab === 'invoices' && <section className="section card"><div className="finance-section-heading"><h2 className="section__title">Invoices</h2><button className="button button--primary button--sm" onClick={() => setShowNewInvoice(!showNewInvoice)}>+ Invoice</button></div>
        {showNewInvoice && <NewInvoiceForm feeStructures={feeStructures} onCreated={() => { setShowNewInvoice(false); load() }} onCancel={() => setShowNewInvoice(false)} />}
        {!invoices.length ? <EmptyState title="No invoices" description="Create invoices for students." /> : <div className="table-scroll"><table><thead><tr><th>Student</th><th>Fee</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead><tbody>{invoices.map((inv) => <tr key={inv.id}><td>Student #{inv.student_id}</td><td>Fee #{inv.fee_structure_id}</td><td className="number-cell">KES {Number(inv.amount).toLocaleString()}</td><td className="number-cell">KES {Number(inv.balance).toLocaleString()}</td><td><Badge tone={inv.status === 'paid' ? 'success' : inv.status === 'pending' ? 'warning' : 'danger'}>{inv.status}</Badge></td></tr>)}</tbody></table></div>}
      </section>}

      {activeTab === 'payments' && <section className="section card"><div className="finance-section-heading"><h2 className="section__title">Payments</h2><button className="button button--primary button--sm" onClick={() => setShowNewPayment(!showNewPayment)}>+ Record Payment</button></div>
        {showNewPayment && <NewPaymentForm onCreated={() => { setShowNewPayment(false); load() }} onCancel={() => setShowNewPayment(false)} />}
        {!payments.length ? <EmptyState title="No payments" description="Record payments against invoices." /> : <div className="table-scroll"><table><thead><tr><th>Date</th><th>Student</th><th>Method</th><th>Amount</th><th>Reference</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id}><td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td><td>Student #{p.student_id}</td><td>{p.payment_method || '—'}</td><td className="number-cell"><strong>KES {Number(p.amount).toLocaleString()}</strong></td><td>{p.reference_number || '—'}</td></tr>)}</tbody></table></div>}
      </section>}
    </>}
  </div>
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

function NewFeeForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', amount: '', description: '' }); const [submitting, setSubmitting] = useState(false)
  return <div className="finance-form"><div className="finance-form__grid"><div className="field"><label className="field__label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tuition Fee" /></div><div className="field"><label className="field__label">Amount (KES)</label><input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div><div className="field"><label className="field__label">Description</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div><div className="finance-form__actions"><button className="button button--primary" disabled={!form.name || !form.amount || submitting} onClick={async () => { setSubmitting(true); await finance.createFeeStructure({ name: form.name, amount: Number(form.amount), description: form.description }); setSubmitting(false); onCreated() }}>Create</button><button className="button button--secondary" onClick={onCancel}>Cancel</button></div></div></div>
}

function NewInvoiceForm({ feeStructures, onCreated, onCancel }: { feeStructures: FeeStructure[]; onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ student_id: '', fee_structure_id: feeStructures[0]?.id || 0 }); const [submitting, setSubmitting] = useState(false); const selectedFee = feeStructures.find((f) => f.id === form.fee_structure_id)
  return <div className="finance-form"><div className="finance-form__grid"><div className="field"><label className="field__label">Student ID</label><input className="input" type="number" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} /></div><div className="field"><label className="field__label">Fee Structure</label><select className="input" value={form.fee_structure_id} onChange={(e) => setForm({ ...form, fee_structure_id: Number(e.target.value) })}>{feeStructures.map((f) => <option key={f.id} value={f.id}>{f.name} — KES {Number(f.amount).toLocaleString()}</option>)}</select></div><div className="finance-form__actions"><button className="button button--primary" disabled={!form.student_id || submitting} onClick={async () => { setSubmitting(true); await finance.createInvoice({ student_id: Number(form.student_id), fee_structure_id: form.fee_structure_id, amount: selectedFee?.amount || 0 }); setSubmitting(false); onCreated() }}>Create</button><button className="button button--secondary" onClick={onCancel}>Cancel</button></div></div></div>
}

function NewPaymentForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ invoice_id: '', student_id: '', amount: '', payment_method: 'cash' }); const [submitting, setSubmitting] = useState(false)
  return <div className="finance-form"><div className="finance-form__grid"><div className="field"><label className="field__label">Invoice ID</label><input className="input" type="number" value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value })} /></div><div className="field"><label className="field__label">Student ID</label><input className="input" type="number" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} /></div><div className="field"><label className="field__label">Amount (KES)</label><input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div><div className="field"><label className="field__label">Method</label><select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile">Mobile</option><option value="cheque">Cheque</option></select></div><div className="finance-form__actions"><button className="button button--primary" disabled={!form.invoice_id || !form.amount || submitting} onClick={async () => { setSubmitting(true); await finance.recordPayment({ invoice_id: Number(form.invoice_id), student_id: Number(form.student_id), amount: Number(form.amount), payment_method: form.payment_method }); setSubmitting(false); onCreated() }}>Record</button><button className="button button--secondary" onClick={onCancel}>Cancel</button></div></div></div>
}
