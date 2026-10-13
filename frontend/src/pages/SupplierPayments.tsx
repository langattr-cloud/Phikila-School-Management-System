import { useCallback, useEffect, useState } from 'react'
import { apiFetch, friendlyApiError } from '../lib/api'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'

type Supplier = { id:number; name:string; phone?:string|null; email?:string|null; tax_pin?:string|null }
type SupplierInvoice = { id:number; supplier_id:number; invoice_number:string; invoice_date:string; due_date?:string|null; description:string; expense_category:string; amount:number; paid_amount:number; balance:number; currency:string; status:string }
type SupplierPayment = { id:number; supplier_id:number; invoice_id:number; payment_date:string; amount:number; payment_method:string; payment_reference?:string|null; bank_account?:string|null; cheque_number?:string|null; cheque_date?:string|null; cheque_payee?:string|null; status:string; notes?:string|null }

const money = (value:number, currency='KES') => `${currency} ${Number(value).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`

export function SupplierPayments() {
  const [suppliers,setSuppliers] = useState<Supplier[]>([])
  const [invoices,setInvoices] = useState<SupplierInvoice[]>([])
  const [payments,setPayments] = useState<SupplierPayment[]>([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState<string|null>(null)
  const [saving,setSaving] = useState(false)
  const [view,setView] = useState<'invoices'|'payments'>('invoices')
  const [supplierForm,setSupplierForm] = useState({name:'',contact_person:'',phone:'',email:'',tax_pin:''})
  const [invoiceForm,setInvoiceForm] = useState({supplier_id:'',invoice_number:'',invoice_date:new Date().toISOString().slice(0,10),due_date:'',description:'',expense_category:'Supplies',amount:'',currency:'KES',document_url:''})
  const [paymentForm,setPaymentForm] = useState({invoice_id:'',payment_date:new Date().toISOString().slice(0,10),amount:'',payment_method:'bank_transfer',payment_reference:'',bank_account:'',cheque_number:'',cheque_date:new Date().toISOString().slice(0,10),cheque_payee:'',notes:''})
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s,i,p] = await Promise.all([
        apiFetch<Supplier[]>('/api/v1/finance/suppliers'),
        apiFetch<SupplierInvoice[]>('/api/v1/finance/supplier-invoices'),
        apiFetch<SupplierPayment[]>('/api/v1/finance/supplier-payments'),
      ])
      setSuppliers(s); setInvoices(i); setPayments(p)
    } catch(e) { setError(friendlyApiError(e,'load supplier payments')) }
    finally { setLoading(false) }
  },[])
  useEffect(()=>{void load()},[load])
  const selectedInvoice = invoices.find(i=>String(i.id)===paymentForm.invoice_id)
  const unpaidInvoices = invoices.filter(i=>i.balance>0)
  const createSupplier = async () => {
    if(!supplierForm.name.trim()) return
    setSaving(true);setError(null)
    try {
      const created=await apiFetch<Supplier>('/api/v1/finance/suppliers',{method:'POST',body:JSON.stringify(supplierForm)})
      setSupplierForm({name:'',contact_person:'',phone:'',email:'',tax_pin:''})
      await load()
      setInvoiceForm(f=>({...f,supplier_id:String(created.id)}))
    } catch(e){setError(friendlyApiError(e,'create supplier'))} finally{setSaving(false)}
  }
  const createInvoice = async () => {
    if(!invoiceForm.supplier_id||!invoiceForm.invoice_number.trim()||Number(invoiceForm.amount)<=0) return
    setSaving(true);setError(null)
    try{
      await apiFetch('/api/v1/finance/supplier-invoices',{method:'POST',body:JSON.stringify({...invoiceForm,supplier_id:Number(invoiceForm.supplier_id),amount:Number(invoiceForm.amount),due_date:invoiceForm.due_date||null,document_url:invoiceForm.document_url||null})})
      setInvoiceForm(f=>({...f,invoice_number:'',description:'',amount:'',due_date:'',document_url:''}))
      await load()
    }catch(e){setError(friendlyApiError(e,'record supplier invoice'))}finally{setSaving(false)}
  }
  const createPayment = async () => {
    if(!selectedInvoice||Number(paymentForm.amount)<=0) return
    if(Number(paymentForm.amount)>selectedInvoice.balance){setError(`Payment exceeds outstanding balance ${money(selectedInvoice.balance,selectedInvoice.currency)}.`);return}
    setSaving(true);setError(null)
    try{
      const payload={...paymentForm,supplier_id:selectedInvoice.supplier_id,invoice_id:selectedInvoice.id,amount:Number(paymentForm.amount),payment_reference:paymentForm.payment_reference||null,bank_account:paymentForm.bank_account||null,cheque_number:paymentForm.cheque_number||null,cheque_date:paymentForm.payment_method==='cheque'?paymentForm.cheque_date:null,cheque_payee:paymentForm.cheque_payee||null,notes:paymentForm.notes||null}
      await apiFetch('/api/v1/finance/supplier-payments',{method:'POST',body:JSON.stringify(payload)})
      setPaymentForm(f=>({...f,invoice_id:'',amount:'',payment_reference:'',cheque_number:'',cheque_payee:'',notes:''}))
      await load()
    }catch(e){setError(friendlyApiError(e,'record supplier payment'))}finally{setSaving(false)}
  }
  const updateCheque = async (payment:SupplierPayment,status:'CLEARED'|'CANCELLED'|'BOUNCED') => {
    const notes=window.prompt(`Optional note for cheque #${payment.cheque_number||''}`)||''
    setError(null)
    try{await apiFetch(`/api/v1/finance/supplier-payments/${payment.id}/cheque-status`,{method:'PATCH',body:JSON.stringify({status,notes})});await load()}
    catch(e){setError(friendlyApiError(e,'update cheque status'))}
  }
  const field=(label:string,value:string,onChange:(v:string)=>void,type='text',required=false)=><div className="field" key={label}><label className="field__label">{label}</label><input className="input" type={type} value={value} required={required} onChange={e=>onChange(e.target.value)}/></div>
  if(loading) return <LoadingBlock label="Loading suppliers and payments" rows={5}/>
  return <section className="section card">
    <div className="finance-section-heading"><div><h2 className="section__title">Supplier Payments</h2><p className="muted-text">Supplier invoices, outstanding balances, bank transfers, cash and cheque tracking.</p></div><div className="finance-form__actions"><button className={view==='invoices'?'button button--primary button--sm':'button button--secondary button--sm'} onClick={()=>setView('invoices')}>Invoices</button><button className={view==='payments'?'button button--primary button--sm':'button button--secondary button--sm'} onClick={()=>setView('payments')}>Payments & Cheques</button></div></div>
    {error&&<Alert tone="error">{error}</Alert>}
    <details className="finance-form"><summary><strong>Register supplier</strong></summary><div className="finance-form__grid">{field('Supplier name',supplierForm.name,v=>setSupplierForm(f=>({...f,name:v})),'text',true)}{field('Contact person',supplierForm.contact_person,v=>setSupplierForm(f=>({...f,contact_person:v})))}{field('Phone',supplierForm.phone,v=>setSupplierForm(f=>({...f,phone:v})))}{field('Email',supplierForm.email,v=>setSupplierForm(f=>({...f,email:v})),'email')}{field('Tax PIN',supplierForm.tax_pin,v=>setSupplierForm(f=>({...f,tax_pin:v})))}<div className="finance-form__actions"><button className="button button--primary" disabled={saving||!supplierForm.name.trim()} onClick={createSupplier}>Save supplier</button></div></div></details>
    <details className="finance-form"><summary><strong>Record supplier invoice</strong></summary>{!suppliers.length?<p className="muted-text">Register a supplier first.</p>:<div className="finance-form__grid"><div className="field"><label className="field__label">Supplier</label><select className="input" value={invoiceForm.supplier_id} onChange={e=>setInvoiceForm(f=>({...f,supplier_id:e.target.value}))}><option value="">Select supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>{field('Invoice number',invoiceForm.invoice_number,v=>setInvoiceForm(f=>({...f,invoice_number:v})),'text',true)}{field('Invoice date',invoiceForm.invoice_date,v=>setInvoiceForm(f=>({...f,invoice_date:v})),'date',true)}{field('Due date',invoiceForm.due_date,v=>setInvoiceForm(f=>({...f,due_date:v})),'date')}{field('Description',invoiceForm.description,v=>setInvoiceForm(f=>({...f,description:v})),'text',true)}{field('Expense category',invoiceForm.expense_category,v=>setInvoiceForm(f=>({...f,expense_category:v})),'text',true)}{field('Amount',invoiceForm.amount,v=>setInvoiceForm(f=>({...f,amount:v})),'number',true)}{field('Currency',invoiceForm.currency,v=>setInvoiceForm(f=>({...f,currency:v.toUpperCase()})))}{field('Supporting document URL (optional)',invoiceForm.document_url,v=>setInvoiceForm(f=>({...f,document_url:v})),'url')}<div className="finance-form__actions"><button className="button button--primary" disabled={saving||!invoiceForm.supplier_id||!invoiceForm.invoice_number.trim()||!invoiceForm.description.trim()||Number(invoiceForm.amount)<=0} onClick={createInvoice}>{saving?'Saving…':'Record invoice'}</button></div></div>}</details>
    <details className="finance-form"><summary><strong>Record supplier payment</strong></summary>{!unpaidInvoices.length?<p className="muted-text">No outstanding supplier invoices. Record an invoice first.</p>:<div className="finance-form__grid"><div className="field"><label className="field__label">Supplier invoice</label><select className="input" value={paymentForm.invoice_id} onChange={e=>{const invoice=invoices.find(i=>String(i.id)===e.target.value);setPaymentForm(f=>({...f,invoice_id:e.target.value,amount:invoice?String(invoice.balance):''}))}}><option value="">Select invoice</option>{unpaidInvoices.map(i=><option key={i.id} value={i.id}>{suppliers.find(s=>s.id===i.supplier_id)?.name||'Supplier'} · {i.invoice_number} · Due {money(i.balance,i.currency)}</option>)}</select></div>{selectedInvoice&&<p className="muted-text">Outstanding balance: <strong>{money(selectedInvoice.balance,selectedInvoice.currency)}</strong></p>}{field('Payment date',paymentForm.payment_date,v=>setPaymentForm(f=>({...f,payment_date:v})),'date',true)}{field('Amount',paymentForm.amount,v=>setPaymentForm(f=>({...f,amount:v})),'number',true)}<div className="field"><label className="field__label">Payment method</label><select className="input" value={paymentForm.payment_method} onChange={e=>setPaymentForm(f=>({...f,payment_method:e.target.value}))}><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="mobile">Mobile money</option></select></div>{field('Payment reference',paymentForm.payment_reference,v=>setPaymentForm(f=>({...f,payment_reference:v})))}{paymentForm.payment_method==='cheque'&&<>{field('Cheque number',paymentForm.cheque_number,v=>setPaymentForm(f=>({...f,cheque_number:v})),'text',true)}{field('Cheque date',paymentForm.cheque_date,v=>setPaymentForm(f=>({...f,cheque_date:v})),'date',true)}{field('Issuing bank/account',paymentForm.bank_account,v=>setPaymentForm(f=>({...f,bank_account:v})),'text',true)}{field('Payee on cheque',paymentForm.cheque_payee,v=>setPaymentForm(f=>({...f,cheque_payee:v})),'text',true)}<p className="muted-text">Cheque is recorded as issued until it is cleared. Cancelled or bounced cheques restore the invoice balance.</p></>}{field('Notes',paymentForm.notes,v=>setPaymentForm(f=>({...f,notes:v})))}<div className="finance-form__actions"><button className="button button--primary" disabled={saving||!selectedInvoice||Number(paymentForm.amount)<=0||Number(paymentForm.amount)>Number(selectedInvoice.balance)||(paymentForm.payment_method==='cheque'&&(!paymentForm.cheque_number.trim()||!paymentForm.cheque_payee.trim()||!paymentForm.bank_account.trim()))} onClick={createPayment}>{saving?'Saving…':'Record payment'}</button></div></div>}</details>
    {view==='invoices'?(!invoices.length?<EmptyState title="No supplier invoices" description="Register a supplier and record an invoice to begin tracking amounts due."/>:<div className="table-scroll"><table><thead><tr><th>Supplier</th><th>Invoice</th><th>Date</th><th>Category</th><th>Amount</th><th>Paid/issued</th><th>Balance</th><th>Status</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td>{suppliers.find(s=>s.id===i.supplier_id)?.name||`Supplier #${i.supplier_id}`}</td><td>{i.invoice_number}</td><td>{i.invoice_date}</td><td>{i.expense_category}</td><td>{money(i.amount,i.currency)}</td><td>{money(i.paid_amount,i.currency)}</td><td>{money(i.balance,i.currency)}</td><td><Badge tone={i.status==='PAID'?'success':i.status==='PART_PAID'?'warning':'danger'}>{i.status}</Badge></td></tr>)}</tbody></table></div>):(!payments.length?<EmptyState title="No supplier payments" description="Payments and cheque lifecycle updates will appear here."/>:<div className="table-scroll"><table><thead><tr><th>Supplier</th><th>Invoice</th><th>Date</th><th>Method</th><th>Reference / Cheque</th><th>Bank</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td>{suppliers.find(s=>s.id===p.supplier_id)?.name||`Supplier #${p.supplier_id}`}</td><td>{invoices.find(i=>i.id===p.invoice_id)?.invoice_number||`#${p.invoice_id}`}</td><td>{p.payment_date}</td><td>{p.payment_method.replace('_',' ')}</td><td>{p.payment_method==='cheque'?`#${p.cheque_number} · ${p.cheque_date||''} · ${p.cheque_payee||''}`:p.payment_reference||'—'}</td><td>{p.bank_account||'—'}</td><td>{money(p.amount)}</td><td><Badge tone={p.status==='CLEARED'?'success':p.status==='ISSUED'?'warning':'danger'}>{p.status}</Badge></td><td>{p.payment_method==='cheque'&&p.status==='ISSUED'&&<div className="finance-form__actions"><button className="button button--secondary button--sm" onClick={()=>void updateCheque(p,'CLEARED')}>Mark cleared</button><button className="button button--secondary button--sm" onClick={()=>void updateCheque(p,'CANCELLED')}>Cancel</button><button className="button button--secondary button--sm" onClick={()=>void updateCheque(p,'BOUNCED')}>Mark bounced</button></div>}</td></tr>)}</tbody></table></div>)}
  </section>
}
