import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { friendlyApiError } from '../lib/api'
import { finance, type FeeStructure, type Invoice, type Payment, type FinanceOverview } from '../lib/finance'

export default function FinancePage() {
  const [overview, setOverview] = useState<FinanceOverview | null>(null)
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'fees' | 'invoices' | 'payments'>('overview')
  const [showNewFee, setShowNewFee] = useState(false)
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [showNewPayment, setShowNewPayment] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ov, fs, inv, pay] = await Promise.all([
        finance.overview(),
        finance.listFeeStructures(),
        finance.listInvoices(),
        finance.listPayments(),
      ])
      setOverview(ov)
      setFeeStructures(fs)
      setInvoices(inv)
      setPayments(pay)
    } catch (err) {
      setError(friendlyApiError(err, 'load finance'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Fee structures, invoices, and payment tracking."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {(['overview', 'fees', 'invoices', 'payments'] as const).map((tab) => (
          <button key={tab} className={`button ${activeTab === tab ? 'button--primary' : 'button--secondary'} button--sm`}
            onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <LoadingBlock label="Loading finance" rows={4} /> : (
        <>
          {activeTab === 'overview' && overview && (
            <div className="summary-grid" style={{ marginBottom: 'var(--space-4)' }}>
              {[
                { label: 'Total Invoiced', value: `KES ${Number(overview.total_invoiced).toLocaleString()}` },
                { label: 'Total Collected', value: `KES ${Number(overview.total_collected).toLocaleString()}` },
                { label: 'Outstanding', value: `KES ${Number(overview.total_outstanding).toLocaleString()}`, tone: (Number(overview.total_outstanding) > 0 ? 'warning' : undefined) },
                { label: 'Invoices', value: overview.invoices_count },
                { label: 'Paid', value: overview.paid_count },
                { label: 'Pending', value: overview.pending_count },
              ].map((c) => (
                <div key={c.label} className="card" style={{ padding: 'var(--space-4)' }}>
                  <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase' }}>{c.label}</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color: c.tone === 'warning' ? 'var(--color-warning)' : undefined }}>{c.value}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'fees' && (
            <section className="section card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h2 className="section__title" style={{ marginBottom: 0 }}>Fee Structures</h2>
                <button className="button button--primary button--sm" onClick={() => setShowNewFee(!showNewFee)}>+ Fee Structure</button>
              </div>
              {showNewFee && <NewFeeForm onCreated={() => { setShowNewFee(false); load() }} onCancel={() => setShowNewFee(false)} />}
              {!feeStructures.length ? <EmptyState title="No fee structures" description="Create a fee structure to start invoicing." /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {feeStructures.map((f) => (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)' }}>
                      <div><strong>{f.name}</strong> <span style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>{f.description}</span></div>
                      <div><strong>KES {Number(f.amount).toLocaleString()}</strong> <Badge tone="success">{f.status}</Badge></div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'invoices' && (
            <section className="section card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h2 className="section__title" style={{ marginBottom: 0 }}>Invoices</h2>
                <button className="button button--primary button--sm" onClick={() => setShowNewInvoice(!showNewInvoice)}>+ Invoice</button>
              </div>
              {showNewInvoice && <NewInvoiceForm feeStructures={feeStructures} onCreated={() => { setShowNewInvoice(false); load() }} onCancel={() => setShowNewInvoice(false)} />}
              {!invoices.length ? <EmptyState title="No invoices" description="Create invoices for students." /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-line)' }}>
                        <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Student</th>
                        <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Fee</th>
                        <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Balance</th>
                        <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-line)' }}>
                          <td style={{ padding: 'var(--space-2)' }}>Student #{inv.student_id}</td>
                          <td style={{ padding: 'var(--space-2)' }}>Fee #{inv.fee_structure_id}</td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>KES {Number(inv.amount).toLocaleString()}</td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>KES {Number(inv.balance).toLocaleString()}</td>
                          <td style={{ padding: 'var(--space-2)' }}>
                            <Badge tone={inv.status === 'paid' ? 'success' : inv.status === 'pending' ? 'warning' : 'danger'}>{inv.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === 'payments' && (
            <section className="section card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h2 className="section__title" style={{ marginBottom: 0 }}>Payments</h2>
                <button className="button button--primary button--sm" onClick={() => setShowNewPayment(!showNewPayment)}>+ Record Payment</button>
              </div>
              {showNewPayment && <NewPaymentForm onCreated={() => { setShowNewPayment(false); load() }} onCancel={() => setShowNewPayment(false)} />}
              {!payments.length ? <EmptyState title="No payments" description="Record payments against invoices." /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-line)' }}>
                        <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Student</th>
                        <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Method</th>
                        <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--color-line)' }}>
                          <td style={{ padding: 'var(--space-2)' }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                          <td style={{ padding: 'var(--space-2)' }}>Student #{p.student_id}</td>
                          <td style={{ padding: 'var(--space-2)' }}>{p.payment_method || '—'}</td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 700 }}>KES {Number(p.amount).toLocaleString()}</td>
                          <td style={{ padding: 'var(--space-2)' }}>{p.reference_number || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function NewFeeForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', amount: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  return (
    <div style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-3)', border: '1px dashed var(--color-line-strong)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}><label className="field__label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tuition Fee" /></div>
        <div className="field"><label className="field__label">Amount (KES)</label><input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <button className="button button--primary" disabled={!form.name || !form.amount || submitting}
          onClick={async () => { setSubmitting(true); await finance.createFeeStructure({ name: form.name, amount: Number(form.amount), description: form.description }); setSubmitting(false); onCreated() }}>Create</button>
        <button className="button button--secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function NewInvoiceForm({ feeStructures, onCreated, onCancel }: { feeStructures: FeeStructure[]; onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ student_id: '', fee_structure_id: feeStructures[0]?.id || 0 })
  const [submitting, setSubmitting] = useState(false)
  const selectedFee = feeStructures.find((f) => f.id === form.fee_structure_id)
  return (
    <div style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-3)', border: '1px dashed var(--color-line-strong)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field"><label className="field__label">Student ID</label><input className="input" type="number" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} /></div>
        <div className="field"><label className="field__label">Fee Structure</label>
          <select className="input" value={form.fee_structure_id} onChange={(e) => setForm({ ...form, fee_structure_id: Number(e.target.value) })}>
            {feeStructures.map((f) => <option key={f.id} value={f.id}>{f.name} — KES {Number(f.amount).toLocaleString()}</option>)}
          </select>
        </div>
        <button className="button button--primary" disabled={!form.student_id || submitting}
          onClick={async () => { setSubmitting(true); await finance.createInvoice({ student_id: Number(form.student_id), fee_structure_id: form.fee_structure_id, amount: selectedFee?.amount || 0 }); setSubmitting(false); onCreated() }}>Create</button>
        <button className="button button--secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function NewPaymentForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ invoice_id: '', student_id: '', amount: '', payment_method: 'cash' })
  const [submitting, setSubmitting] = useState(false)
  return (
    <div style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-3)', border: '1px dashed var(--color-line-strong)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field"><label className="field__label">Invoice ID</label><input className="input" type="number" value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value })} /></div>
        <div className="field"><label className="field__label">Student ID</label><input className="input" type="number" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} /></div>
        <div className="field"><label className="field__label">Amount (KES)</label><input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <div className="field"><label className="field__label">Method</label>
          <select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
            <option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile">Mobile</option><option value="cheque">Cheque</option>
          </select>
        </div>
        <button className="button button--primary" disabled={!form.invoice_id || !form.amount || submitting}
          onClick={async () => { setSubmitting(true); await finance.recordPayment({ invoice_id: Number(form.invoice_id), student_id: Number(form.student_id), amount: Number(form.amount), payment_method: form.payment_method }); setSubmitting(false); onCreated() }}>Record</button>
        <button className="button button--secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
