import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, friendlyApiError } from '../lib/api'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'

type Template = { id:number; name:string; school_type:string; programme:string; source_circular:string; source_url?:string|null; effective_from:string; effective_to?:string|null; version:number; status:string }
type VoteHead = { id:number; template_id:number; code:string; name:string; description?:string|null; permitted_amount?:number|null; per_learner_rate?:number|null; status:string }
type Receipt = { id:number; template_id:number; funding_period:string; agency:string; received_date:string; amount:number; reference_number:string; bank_account_name?:string|null; status:string }
type Summary = { receipt_id:number; reference_number:string; funding_period:string; received_date:string; amount:number; allocated:number; spent:number; balance:number }
type Expenditure = { id:number; receipt_id:number; vote_head_id:number; expenditure_date:string; payee:string; description:string; amount:number; expenditure_reference:string; status:string }
type BankAccount = { id:number; account_name:string; bank_name:string; account_identifier:string }

const money = (n:number) => `KES ${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
const today = new Date().toISOString().slice(0,10)

export function CapitationManagement() {
  const [templates,setTemplates] = useState<Template[]>([])
  const [receipts,setReceipts] = useState<Receipt[]>([])
  const [summary,setSummary] = useState<Summary[]>([])
  const [expenditure,setExpenditure] = useState<Expenditure[]>([])
  const [bankAccounts,setBankAccounts] = useState<BankAccount[]>([])
  const [heads,setHeads] = useState<VoteHead[]>([])
  const [templateId,setTemplateId] = useState('')
  const [error,setError] = useState<string|null>(null)
  const [saving,setSaving] = useState(false)
  const [view,setView] = useState<'overview'|'setup'|'receipts'|'expenditure'>('overview')
  const [templateForm,setTemplateForm] = useState({name:'',school_type:'public_primary',programme:'Learner capitation grant',source_circular:'',source_url:'https://www.education.go.ke/',effective_from:today,effective_to:'',notes:'',vote_heads:''})
  const [receiptForm,setReceiptForm] = useState({template_id:'',funding_period:'',received_date:today,amount:'',reference_number:'',agency:'Ministry of Education',bank_account_name:'',bank_account_id:'',allocation_notice:'',supporting_document_url:'',notes:'',allocation_lines:''})
  const [spendForm,setSpendForm] = useState({receipt_id:'',vote_head_id:'',expenditure_date:today,payee:'',description:'',amount:'',expenditure_reference:'',supplier_invoice_reference:'',supporting_document_url:''})
  const load = useCallback(async () => {
    setError(null)
    try {
      const [t,r,s,e,b] = await Promise.all([
        apiFetch<Template[]>('/api/v1/finance/capitation/templates'),
        apiFetch<Receipt[]>('/api/v1/finance/capitation/receipts'),
        apiFetch<Summary[]>('/api/v1/finance/capitation/summary'),
        apiFetch<Expenditure[]>('/api/v1/finance/capitation/expenditure'),
        apiFetch<BankAccount[]>('/api/v1/finance/bank-accounts'),
      ])
      setTemplates(t); setReceipts(r); setSummary(s); setExpenditure(e); setBankAccounts(b)
      setTemplateId(current => current || String(t.find(x=>x.status==='ACTIVE')?.id ?? t[0]?.id ?? ''))
      setReceiptForm(current => ({...current,template_id:current.template_id || String(t.find(x=>x.status==='ACTIVE')?.id ?? t[0]?.id ?? '')}))
      setSpendForm(current => ({...current,receipt_id:current.receipt_id || String(r[0]?.id ?? '')}))
    } catch(e) { setError(friendlyApiError(e,'load capitation records')) }
  },[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    if(!templateId){setHeads([]);return}
    apiFetch<VoteHead[]>(`/api/v1/finance/capitation/templates/${templateId}/vote-heads`).then(setHeads).catch(e=>setError(friendlyApiError(e,'load capitation vote heads')))
  },[templateId])
  const totals = useMemo(()=>summary.reduce((a,r)=>({received:a.received+Number(r.amount),spent:a.spent+Number(r.spent),balance:a.balance+Number(r.balance)}),{received:0,spent:0,balance:0}),[summary])
  const importReference = async () => {
    setSaving(true); setError(null)
    try {
      const result = await apiFetch<{created:Array<{id:number;name:string}>;already_present_ids:number[];source_circular:string;reference_note:string}>('/api/v1/finance/capitation/import-reference',{method:'POST'})
      await load(); setView('setup')
      if(result.created.length) setTemplateId(String(result.created[0].id))
      else setError('Reference templates are already present. Review the saved versions before use.')
    } catch(e) { setError(friendlyApiError(e,'import government reference vote heads')) }
    finally { setSaving(false) }
  }
  const saveTemplate = async () => {
    if(!templateForm.name.trim()||!templateForm.source_circular.trim()||!templateForm.effective_from) return
    setSaving(true);setError(null)
    try {
      const vote_heads=templateForm.vote_heads.split('\n').map(line=>line.trim()).filter(Boolean).map((line,index)=>{const [code,...rest]=line.split('|');return {code:code.trim(),name:(rest[0]||'').trim(),description:rest.slice(1).join('|').trim()||undefined,display_order:index}})
      if(vote_heads.some(x=>!x.code||!x.name)) throw new Error('Enter each vote head as CODE | Name | Optional description.')
      const created=await apiFetch<Template>('/api/v1/finance/capitation/templates',{method:'POST',body:JSON.stringify({...templateForm,effective_to:templateForm.effective_to||null,vote_heads})})
      setTemplateId(String(created.id));setReceiptForm(f=>({...f,template_id:String(created.id)}));setView('setup')
      setTemplateForm(f=>({...f,name:'',source_circular:'',source_url:'https://www.education.go.ke/',effective_to:'',notes:'',vote_heads:''}))
      await load()
    }catch(e){setError(friendlyApiError(e,'create capitation template'))}finally{setSaving(false)}
  }
  const activate = async (id:number) => {
    setSaving(true);setError(null)
    try { await apiFetch(`/api/v1/finance/capitation/templates/${id}/activate`,{method:'PATCH'});await load() }
    catch(e){setError(friendlyApiError(e,'activate allocation template'))}finally{setSaving(false)}
  }
  const saveReceipt = async () => {
    if(!receiptForm.template_id||!receiptForm.funding_period.trim()||!receiptForm.reference_number.trim()||Number(receiptForm.amount)<=0)return
    setSaving(true);setError(null)
    try {
      const allocations = receiptForm.allocation_lines.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const [code,rawAmount]=line.split('|');const head=heads.find(h=>h.code===code.trim());if(!head||!rawAmount||Number(rawAmount)<=0)throw new Error(`Invalid allocation line "${line}". Use VOTE-CODE | amount.`);return {vote_head_id:head.id,allocated_amount:Number(rawAmount)}})
      if(allocations.length && Math.round(allocations.reduce((sum,row)=>sum+row.allocated_amount,0)*100)!==Math.round(Number(receiptForm.amount)*100)) throw new Error('Vote-head allocation amounts must add up to the full receipt amount.')
      await apiFetch('/api/v1/finance/capitation/receipts',{method:'POST',body:JSON.stringify({...receiptForm,template_id:Number(receiptForm.template_id),amount:Number(receiptForm.amount),allocations,bank_account_id:receiptForm.bank_account_id?Number(receiptForm.bank_account_id):null,bank_account_name:receiptForm.bank_account_name||null,allocation_notice:receiptForm.allocation_notice||null,supporting_document_url:receiptForm.supporting_document_url||null,notes:receiptForm.notes||null})})
      setReceiptForm(f=>({...f,amount:'',reference_number:'',allocation_notice:'',supporting_document_url:'',notes:'',allocation_lines:''}));await load()
    }catch(e){setError(friendlyApiError(e,'record capitation receipt'))}finally{setSaving(false)}
  }
  const saveExpenditure = async () => {
    if(!spendForm.receipt_id||!spendForm.vote_head_id||!spendForm.payee.trim()||!spendForm.description.trim()||Number(spendForm.amount)<=0||!spendForm.expenditure_reference.trim())return
    setSaving(true);setError(null)
    try {
      await apiFetch('/api/v1/finance/capitation/expenditure',{method:'POST',body:JSON.stringify({...spendForm,receipt_id:Number(spendForm.receipt_id),vote_head_id:Number(spendForm.vote_head_id),amount:Number(spendForm.amount),supplier_invoice_reference:spendForm.supplier_invoice_reference||null,supporting_document_url:spendForm.supporting_document_url||null})})
      setSpendForm(f=>({...f,amount:'',payee:'',description:'',expenditure_reference:'',supplier_invoice_reference:'',supporting_document_url:''}));await load()
    }catch(e){setError(friendlyApiError(e,'record capitation expenditure'))}finally{setSaving(false)}
  }
  const input=(label:string,value:string,onChange:(v:string)=>void,type='text',required=false)=><div className="field" key={label}><label className="field__label">{label}</label><input className="input" type={type} value={value} required={required} onChange={e=>onChange(e.target.value)}/></div>
  return <section className="section card">
    <div className="finance-section-heading"><div><h2 className="section__title">Government Capitation</h2><p className="muted-text">Track government receipts, circular versions, vote-head allocations, expenditure and balances.</p></div></div>
    {error&&<Alert tone="error">{error}</Alert>}
    <div className="finance-tabs" role="tablist" aria-label="Capitation sections">{(['overview','setup','receipts','expenditure'] as const).map(v=><button key={v} role="tab" aria-selected={view===v} className={`button button--sm ${view===v?'button--primary':'button--secondary'}`} onClick={()=>setView(v)}>{v==='setup'?'Circulars & Vote Heads':v.charAt(0).toUpperCase()+v.slice(1)}</button>)}</div>
    {view==='overview'&&<><div className="summary-grid finance-summary">{[{label:'Received',value:money(totals.received)},{label:'Spent',value:money(totals.spent)},{label:'Remaining',value:money(totals.balance)}].map(x=><div className="card finance-summary__card" key={x.label}><p className="finance-summary__label">{x.label}</p><p className="finance-summary__value">{x.value}</p></div>)}</div><h3 className="section__title">Funding releases</h3>{!summary.length?<EmptyState title="No capitation receipts yet" description="Activate a circular template, then record the actual bank receipt."/>:<div className="table-scroll"><table><thead><tr><th>Period</th><th>Reference</th><th>Date</th><th>Received</th><th>Spent</th><th>Balance</th></tr></thead><tbody>{summary.map(r=><tr key={r.receipt_id}><td>{r.funding_period}</td><td>{r.reference_number}</td><td>{r.received_date}</td><td className="number-cell">{money(r.amount)}</td><td className="number-cell">{money(r.spent)}</td><td className="number-cell"><strong>{money(r.balance)}</strong></td></tr>)}</tbody></table></div>}</>}
    {view==='setup'&&<><div className="finance-form"><h3 className="section__title">Create allocation template</h3><p className="muted-text">Or import the available public-primary Term 3 2026 reference catalogue into editable draft templates.</p><div className="finance-form__actions"><button className="button button--secondary" disabled={saving} onClick={importReference}>{saving?'Importing…':'Import Government Reference Vote Heads'}</button></div><p className="muted-text">Use the applicable Ministry circular or grant letter. Vote heads are database records and can be revised for later circular versions; do not assume categories or amounts are universal.</p><div className="finance-form__grid">{input('Template name',templateForm.name,v=>setTemplateForm(f=>({...f,name:v})),'text',true)}<div className="field"><label className="field__label">School type</label><select className="input" value={templateForm.school_type} onChange={e=>setTemplateForm(f=>({...f,school_type:e.target.value}))}><option value="public_primary">Public primary</option><option value="public_junior_secondary">Public junior secondary</option><option value="public_secondary">Public secondary</option><option value="special_needs">Special needs</option><option value="other">Other</option></select></div>{input('Grant programme',templateForm.programme,v=>setTemplateForm(f=>({...f,programme:v})),'text',true)}{input('Circular / allocation notice reference',templateForm.source_circular,v=>setTemplateForm(f=>({...f,source_circular:v})),'text',true)}{input('Official source URL',templateForm.source_url,v=>setTemplateForm(f=>({...f,source_url:v})),'url')}{input('Effective from',templateForm.effective_from,v=>setTemplateForm(f=>({...f,effective_from:v})),'date',true)}{input('Effective to (optional)',templateForm.effective_to,v=>setTemplateForm(f=>({...f,effective_to:v})),'date')}<div className="field"><label className="field__label">Vote heads (one per line: code | official name | optional description)</label><textarea className="input" rows={5} value={templateForm.vote_heads} onChange={e=>setTemplateForm(f=>({...f,vote_heads:e.target.value}))} placeholder={'Paste vote heads from the authorised circular here.'}/></div><div className="field"><label className="field__label">Notes</label><textarea className="input" rows={2} value={templateForm.notes} onChange={e=>setTemplateForm(f=>({...f,notes:e.target.value}))}/></div></div><div className="finance-form__actions"><button className="button button--primary" disabled={saving||!templateForm.name.trim()||!templateForm.source_circular.trim()} onClick={saveTemplate}>{saving?'Saving…':'Save template'}</button></div></div><h3 className="section__title">Saved templates</h3>{!templates.length?<EmptyState title="No allocation templates" description="Create a template using the circular that applies to this school and funding period."/>:<div className="finance-list">{templates.map(t=><div className="finance-list__row" key={t.id}><div className="finance-list__main"><strong>{t.name} · v{t.version}</strong><span className="muted-text">{t.school_type} · {t.programme} · Source: {t.source_circular} · Effective {t.effective_from}</span></div><div className="finance-list__value"><Badge tone={t.status==='ACTIVE'?'success':'warning'}>{t.status}</Badge>{t.status!=='ACTIVE'&&<button className="button button--secondary button--sm" disabled={saving} onClick={()=>activate(t.id)}>Activate</button>}<button className="button button--secondary button--sm" onClick={()=>setTemplateId(String(t.id))}>View vote heads</button></div></div>)}</div>}{templateId&&<><h3 className="section__title">Vote heads in selected template</h3><div className="table-scroll"><table><thead><tr><th>Code</th><th>Vote head</th><th>Description</th><th>Rate per learner</th><th>Permitted amount</th></tr></thead><tbody>{heads.map(h=><tr key={h.id}><td>{h.code}</td><td>{h.name}</td><td>{h.description||'—'}</td><td>{h.per_learner_rate==null?'—':money(h.per_learner_rate)}</td><td>{h.permitted_amount==null?'Set by allocation':money(h.permitted_amount)}</td></tr>)}</tbody></table></div></>}</>}
    {view==='receipts'&&<><div className="finance-form"><h3 className="section__title">Record government payment received</h3><div className="finance-form__grid"><div className="field"><label className="field__label">Approved circular template</label><select className="input" value={receiptForm.template_id} onChange={e=>{setReceiptForm(f=>({...f,template_id:e.target.value}));setTemplateId(e.target.value)}}><option value="">Select active template</option>{templates.filter(t=>t.status==='ACTIVE').map(t=><option key={t.id} value={t.id}>{t.name} · v{t.version}</option>)}</select></div>{input('Term / funding period',receiptForm.funding_period,v=>setReceiptForm(f=>({...f,funding_period:v})),'text',true)}{input('Date received',receiptForm.received_date,v=>setReceiptForm(f=>({...f,received_date:v})),'date',true)}{input('Amount (KES)',receiptForm.amount,v=>setReceiptForm(f=>({...f,amount:v})),'number',true)}{input('Bank transaction reference',receiptForm.reference_number,v=>setReceiptForm(f=>({...f,reference_number:v})),'text',true)}<div className="field"><label className="field__label">Bank account</label><select className="input" value={receiptForm.bank_account_id} onChange={e=>{const a=bankAccounts.find(x=>String(x.id)===e.target.value);setReceiptForm(f=>({...f,bank_account_id:e.target.value,bank_account_name:a?.account_name||''}))}}><option value="">Select bank account (optional)</option>{bankAccounts.map(a=><option key={a.id} value={a.id}>{a.account_name} · {a.bank_name} · {a.account_identifier}</option>)}</select></div>{input('Allocation notice reference',receiptForm.allocation_notice,v=>setReceiptForm(f=>({...f,allocation_notice:v})))}{input('Supporting document URL',receiptForm.supporting_document_url,v=>setReceiptForm(f=>({...f,supporting_document_url:v})),'url')}{input('Funding agency',receiptForm.agency,v=>setReceiptForm(f=>({...f,agency:v})))}<div className="field"><label className="field__label">Vote-head allocation split (optional; one per line: CODE | amount)</label><textarea className="input" rows={4} value={receiptForm.allocation_lines} onChange={e=>setReceiptForm(f=>({...f,allocation_lines:e.target.value}))} placeholder={heads.map(h=>`${h.code} | 0.00`).join('\n')}/><p className="muted-text">If supplied, allocation amounts must total the receipt and use vote heads from the selected circular.</p></div><div className="field"><label className="field__label">Notes</label><textarea className="input" rows={2} value={receiptForm.notes} onChange={e=>setReceiptForm(f=>({...f,notes:e.target.value}))}/></div></div><div className="finance-form__actions"><button className="button button--primary" disabled={saving||!templates.some(t=>String(t.id)===receiptForm.template_id&&t.status==='ACTIVE')||Number(receiptForm.amount)<=0||!receiptForm.reference_number.trim()} onClick={saveReceipt}>{saving?'Saving…':'Record receipt'}</button></div></div><div className="table-scroll"><table><thead><tr><th>Period</th><th>Date</th><th>Reference</th><th>Amount</th><th>Template</th></tr></thead><tbody>{receipts.map(r=><tr key={r.id}><td>{r.funding_period}</td><td>{r.received_date}</td><td>{r.reference_number}</td><td className="number-cell">{money(r.amount)}</td><td>{templates.find(t=>t.id===r.template_id)?.name||`Template #${r.template_id}`}</td></tr>)}</tbody></table></div></>}
    {view==='expenditure'&&<><div className="finance-form"><h3 className="section__title">Record capitation expenditure</h3><div className="finance-form__grid"><div className="field"><label className="field__label">Funding receipt</label><select className="input" value={spendForm.receipt_id} onChange={e=>{const r=receipts.find(x=>String(x.id)===e.target.value);setSpendForm(f=>({...f,receipt_id:e.target.value,vote_head_id:''}));if(r)setTemplateId(String(r.template_id))}}><option value="">Select receipt</option>{receipts.map(r=><option key={r.id} value={r.id}>{r.funding_period} · {r.reference_number} · {money(r.amount)}</option>)}</select></div><div className="field"><label className="field__label">Vote head</label><select className="input" value={spendForm.vote_head_id} onChange={e=>setSpendForm(f=>({...f,vote_head_id:e.target.value}))}><option value="">Select vote head</option>{heads.filter(h=>h.status==='ACTIVE').map(h=><option key={h.id} value={h.id}>{h.code} · {h.name}</option>)}</select></div>{input('Expenditure date',spendForm.expenditure_date,v=>setSpendForm(f=>({...f,expenditure_date:v})),'date',true)}{input('Payee / supplier',spendForm.payee,v=>setSpendForm(f=>({...f,payee:v})),'text',true)}{input('Description / purpose',spendForm.description,v=>setSpendForm(f=>({...f,description:v})),'text',true)}{input('Amount (KES)',spendForm.amount,v=>setSpendForm(f=>({...f,amount:v})),'number',true)}{input('Voucher / transaction reference',spendForm.expenditure_reference,v=>setSpendForm(f=>({...f,expenditure_reference:v})),'text',true)}{input('Supplier invoice reference',spendForm.supplier_invoice_reference,v=>setSpendForm(f=>({...f,supplier_invoice_reference:v})))}{input('Supporting document URL',spendForm.supporting_document_url,v=>setSpendForm(f=>({...f,supporting_document_url:v})),'url')}</div><div className="finance-form__actions"><button className="button button--primary" disabled={saving||!spendForm.receipt_id||!spendForm.vote_head_id||Number(spendForm.amount)<=0||!spendForm.expenditure_reference.trim()} onClick={saveExpenditure}>{saving?'Saving…':'Record expenditure'}</button></div></div>{!expenditure.length?<EmptyState title="No expenditure recorded" description="Record a transaction against a receipt and its authorised vote head."/>:<div className="table-scroll"><table><thead><tr><th>Date</th><th>Payee</th><th>Purpose</th><th>Amount</th><th>Reference</th></tr></thead><tbody>{expenditure.map(e=><tr key={e.id}><td>{e.expenditure_date}</td><td>{e.payee}</td><td>{e.description}</td><td className="number-cell">{money(e.amount)}</td><td>{e.expenditure_reference}</td></tr>)}</tbody></table></div>}</>}
  </section>
}
