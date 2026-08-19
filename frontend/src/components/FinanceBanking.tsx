import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from './Alert'
import { Badge, EmptyState, LoadingBlock } from './States'
import { friendlyApiError } from '../lib/api'
import { finance, type BankAccount, type BankReconciliation, type BankTransaction } from '../lib/finance'

export function FinanceBanking() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10))
  const [statementBalance, setStatementBalance] = useState('')
  const [bookBalance, setBookBalance] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [bankAccounts, reconciliationRows] = await Promise.all([
        finance.listBankAccounts(),
        finance.listReconciliations(),
      ])
      setAccounts(bankAccounts)
      setReconciliations(reconciliationRows)
      if (!selectedAccountId && bankAccounts[0]) setSelectedAccountId(String(bankAccounts[0].id))
    } catch (err) {
      setError(friendlyApiError(err, 'load banking'))
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  const loadTransactions = useCallback(async () => {
    if (!selectedAccountId) {
      setTransactions([])
      return
    }
    try {
      setTransactions(await finance.listBankTransactions(Number(selectedAccountId)))
    } catch (err) {
      setError(friendlyApiError(err, 'load bank transactions'))
    }
  }, [selectedAccountId])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTransactions() }, [loadTransactions])

  const importStatement = async () => {
    if (!selectedAccountId || !file) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await finance.importBankStatement(Number(selectedAccountId), file)
      setMessage(`Imported ${result.imported} transaction(s); ${result.duplicates} duplicate(s) skipped.`)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadTransactions()
    } catch (err) {
      setError(friendlyApiError(err, 'import bank statement'))
    } finally {
      setBusy(false)
    }
  }

  const reconcile = async () => {
    if (!selectedAccountId || !statementDate || statementBalance === '' || bookBalance === '') return
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await finance.createReconciliation({
        bank_account_id: Number(selectedAccountId),
        statement_date: statementDate,
        statement_balance: Number(statementBalance),
        book_balance: Number(bookBalance),
        notes: notes || undefined,
      })
      setReconciliations((rows) => [result, ...rows])
      setMessage(result.status === 'RECONCILED' ? 'Bank account reconciled.' : `Reconciliation saved with a ${currency} ${Number(result.difference).toLocaleString()} difference.`)
      setNotes('')
    } catch (err) {
      setError(friendlyApiError(err, 'save bank reconciliation'))
    } finally {
      setBusy(false)
    }
  }

  const selectedAccount = accounts.find((account) => account.id === Number(selectedAccountId))
  const currency = selectedAccount?.currency || 'KES'
  const accountReconciliations = reconciliations.filter((row) => row.bank_account_id === Number(selectedAccountId))

  return <section className="section card">
    <div className="finance-section-heading">
      <div><h2 className="section__title">Banking & Reconciliation</h2><p className="muted-text">Review imported bank transactions and reconcile statement balances against the school book balance.</p></div>
      {selectedAccount && <Badge tone="success">{selectedAccount.bank_name} · {selectedAccount.account_identifier}</Badge>}
    </div>
    {error && <Alert tone="error">{error}</Alert>}
    {message && <Alert tone="success">{message}</Alert>}
    {loading ? <LoadingBlock label="Loading banking" rows={5} /> : !accounts.length ? <EmptyState title="No bank accounts" description="Create a bank account before importing statements or reconciling balances." /> : <>
      <div className="finance-form"><div className="finance-form__grid">
        <div className="field"><label className="field__label">Bank Account</label><select className="input" value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.bank_name} — {account.account_name} ({account.account_identifier})</option>)}</select></div>
        <div className="field"><label className="field__label">CSV Statement</label><input ref={fileInputRef} className="input" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
        <div className="finance-form__actions"><button className="button button--primary" onClick={importStatement} disabled={!file || busy}>{busy ? 'Working…' : 'Import Statement'}</button></div>
      </div></div>

      <div className="finance-form"><div className="finance-form__grid">
        <div className="field"><label className="field__label">Statement Date</label><input className="input" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} /></div>
        <div className="field"><label className="field__label">Statement Balance ({currency})</label><input className="input" type="number" step="0.01" value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} /></div>
        <div className="field"><label className="field__label">Book Balance ({currency})</label><input className="input" type="number" step="0.01" value={bookBalance} onChange={(e) => setBookBalance(e.target.value)} /></div>
        <div className="field"><label className="field__label">Notes</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional reconciliation note" /></div>
        <div className="finance-form__actions"><button className="button button--primary" onClick={reconcile} disabled={!statementDate || statementBalance === '' || bookBalance === '' || busy}>{busy ? 'Saving…' : 'Reconcile'}</button></div>
      </div></div>

      <div className="finance-section-heading"><h3 className="section__title">Recent Bank Transactions</h3><span className="muted-text">{transactions.length} shown</span></div>
      {!transactions.length ? <EmptyState title="No bank transactions" description="Import a CSV statement to populate this account." /> : <div className="table-scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{new Date(transaction.transaction_date).toLocaleDateString()}</td><td>{transaction.transaction_type}</td><td>{transaction.external_reference || '—'}</td><td>{transaction.description || '—'}</td><td className="number-cell">{currency} {Number(transaction.amount).toLocaleString()}</td><td><Badge tone={transaction.status === 'MATCHED' ? 'success' : 'warning'}>{transaction.status}</Badge></td></tr>)}</tbody></table></div>}

      <div className="finance-section-heading"><h3 className="section__title">Reconciliation History</h3><span className="muted-text">{accountReconciliations.length} recorded</span></div>
      {!accountReconciliations.length ? <p className="muted-text">No reconciliations recorded for this account.</p> : <div className="table-scroll"><table><thead><tr><th>Date</th><th>Statement</th><th>Book</th><th>Difference</th><th>Status</th></tr></thead><tbody>{accountReconciliations.slice(0, 20).map((row) => <tr key={row.id}><td>{row.statement_date}</td><td className="number-cell">{currency} {Number(row.statement_balance).toLocaleString()}</td><td className="number-cell">{currency} {Number(row.book_balance).toLocaleString()}</td><td className="number-cell">{currency} {Number(row.difference).toLocaleString()}</td><td><Badge tone={row.status === 'RECONCILED' ? 'success' : 'warning'}>{row.status}</Badge></td></tr>)}</tbody></table></div>}
    </>}
  </section>
}
