import { apiFetch } from './api'

const BASE = '/api/v1'
export interface VoteHead { id:number; school_id:number; name:string; code?:string|null; description?:string|null; status:'ACTIVE'|'INACTIVE'; display_order:number; created_at?:string; updated_at?:string }
export interface FeeStructureItem { id:number; school_id:number; fee_structure_id:number; vote_head_id:number; amount:number; display_order:number; created_at?:string }
export interface InvoiceItem { id:number; school_id:number; invoice_id:number; vote_head_id?:number|null; description?:string|null; amount:number; balance:number; created_at?:string }
export interface PaymentAllocation { id:number; school_id:number; payment_id:number; invoice_id?:number|null; invoice_item_id?:number|null; vote_head_id?:number|null; amount:number; allocation_type:'FEE'|'CREDIT'|'REVERSAL'; created_at?:string }
export interface FeeCredit { id:number; school_id:number; student_id:number; source_payment_id?:number|null; amount:number; balance:number; status:'AVAILABLE'|'APPLIED'|'VOID'; created_at?:string; updated_at?:string }
export interface FeeStructure { id:number; school_id:number; name:string; description?:string; academic_year_id?:number; term_id?:number; level_id?:number; grade_id?:number|null; stream_id?:number|null; amount:number; currency:string; status:string; created_at?:string; allocations?:FeeStructureItem[] }
export interface Invoice { id:number; school_id:number; student_id:number; fee_structure_id:number; amount:number; balance:number; status:string; due_date?:string; created_at?:string }
export interface Payment { id:number; school_id:number; invoice_id:number; student_id:number; amount:number; payment_method?:string; reference_number?:string; notes?:string; received_by?:string; status:string; journal_id?:number; reversed_at?:string; reversal_reason?:string; created_at?:string }
export interface Receipt { id:number; school_id:number; receipt_number:string; payment_id:number; student_id:number; amount:number; status:string; issued_by?:string; issued_at?:string; created_at?:string }
export interface PaymentInboxItem { id:number; school_id:number; source:string; source_account?:string; account_name?:string; raw_message:string; amount:number; external_reference:string; student_identifier?:string; received_at:string; payment_channel?:string; matched_student_id?:number; match_method?:string; match_confidence?:number; status:string; duplicate_of?:number; posted_payment_id?:number; posted_at?:string; reviewed_by?:string; reviewed_at?:string; notes?:string; created_at?:string }
export interface StudentBalance { student_id:number; student_name:string; total_invoiced:number; total_paid:number; balance:number; billing_status:'BILLED'|'NOT_BILLED' }
export interface StudentBalanceReportRow { student_id:number; admission_number:string; student_name:string; level_name?:string|null; grade_name?:string|null; stream_name?:string|null; total_invoiced:number; total_paid:number; balance:number; billing_status:'BILLED'|'NOT_BILLED' }
export interface BillingRunResponse { academic_year_id:number; level_id:number; grade_id:number; stream_id?:number|null; fee_structure_id:number; matched_students:number; invoices_created:number; invoices_skipped:number }

export interface StudentStatement { student_id:number; admission_number:string; student_name:string; level_name?:string|null; grade_name?:string|null; stream_name?:string|null; total_invoiced:number; total_paid:number; balance:number; invoices:Array<{id:number;description:string;amount:number;balance:number;due_date?:string|null;created_at?:string|null}>; payments:Array<{id:number;amount:number;payment_method?:string|null;reference_number?:string|null;created_at?:string|null}> }
export interface FinanceOverview { total_invoiced:number; total_collected:number; total_outstanding:number; invoices_count:number; paid_count:number; pending_count:number }
export interface CashBook { id:number; school_id:number; name:string; book_type:string; bank_account_id?:number; opening_balance:number; status:string }
export interface BankAccount { id:number; school_id:number; bank_name:string; branch_name?:string; account_name:string; account_identifier:string; currency:string; opening_balance:number; status:string }
export interface BankTransaction { id:number; school_id:number; bank_account_id:number; transaction_date:string; value_date?:string; amount:number; transaction_type:string; external_reference?:string; description?:string; status:string; source?:string; raw_data?:string; matched_entity?:string; matched_id?:number; created_at?:string }
export interface BankReconciliation { id:number; school_id:number; bank_account_id:number; statement_date:string; statement_balance:number; book_balance:number; difference:number; status:string; reconciled_by?:string; reconciled_at?:string; notes?:string }
export interface TrialBalanceRow { account_id:number; code:string; name:string; account_type:string; debit:number; credit:number; balance:number }
export interface GeneralLedgerRow { journal_id:number; journal_number:string; date:string; reference?:string|null; account_id:number; account_code:string; account_name:string; debit:number; credit:number; description?:string|null }
export interface BalanceSheet { assets:TrialBalanceRow[]; liabilities:TrialBalanceRow[]; equity:TrialBalanceRow[]; current_surplus_deficit:number; totals:{assets:number; liabilities:number; equity:number; net_assets:number; liabilities_and_net_assets:number; balance_check:number} }
const get = <T,>(path:string) => apiFetch<T>(path)
const send = <T,>(path:string, method:string, body?:unknown) => apiFetch<T>(path,{method,body:body===undefined?undefined:JSON.stringify(body)})
export const finance = {
  listVoteHeads:()=>get<VoteHead[]>(`${BASE}/finance/vote-heads`),
  createVoteHead:(payload:Partial<VoteHead>)=>send<VoteHead>(`${BASE}/finance/vote-heads`,'POST',payload),
  updateVoteHead:(id:number,payload:Partial<VoteHead>)=>send<VoteHead>(`${BASE}/finance/vote-heads/${id}`,'PATCH',payload),
  listFeeStructureItems:(id:number)=>get<FeeStructureItem[]>(`${BASE}/finance/fee-structures/${id}/items`),
  createFeeStructureItem:(id:number,payload:Partial<FeeStructureItem>)=>send<FeeStructureItem>(`${BASE}/finance/fee-structures/${id}/items`,'POST',payload),
  listPaymentAllocations:(id:number)=>get<PaymentAllocation[]>(`${BASE}/finance/payments/${id}/allocations`),
  listFeeCredits:(studentId:number)=>get<FeeCredit[]>(`${BASE}/finance/students/${studentId}/fee-credits`),
  feeObligations:(studentId:number)=>get<{invoices:Invoice[];items:InvoiceItem[]}>(`${BASE}/finance/students/${studentId}/fee-obligations`),
  allocatePayment:(payload:{school_id?:number;student_id:number;amount:number;payment_method?:string;reference_number?:string|null;notes?:string|null;received_by?:string|null;invoice_id?:number|null})=>send<{payment_id:number;amount:number;allocated:number;credit_used:number;carried_forward:number}>(`${BASE}/finance/payments/allocate`,'POST',payload),
  listFeeStructures:()=>get<FeeStructure[]>(`${BASE}/finance/fee-structures`),
  createFeeStructure:(payload:Omit<Partial<FeeStructure>,'allocations'> & {allocations?:Array<{vote_head_id:number;amount:number;display_order?:number}>})=>send<FeeStructure>(`${BASE}/finance/fee-structures`,'POST',payload),
  listInvoices:(params?:{student_id?:number;status?:string})=>{const q=new URLSearchParams();if(params?.student_id)q.set('student_id',String(params.student_id));if(params?.status)q.set('status',params.status);const s=q.toString();return get<Invoice[]>(`${BASE}/finance/invoices${s?`?${s}`:''}`)},
  createInvoice:(payload:Partial<Invoice>)=>send<Invoice>(`${BASE}/finance/invoices`,'POST',payload),
  listPayments:(studentId?:number)=>get<Payment[]>(`${BASE}/finance/payments${studentId?`?student_id=${studentId}`:''}`),
  recordPayment:(payload:Partial<Payment>)=>send<Payment>(`${BASE}/finance/payments`,'POST',payload),
  reversePayment:(id:number,reason:string)=>send<Payment>(`${BASE}/finance/payments/${id}/reverse`,'POST',{reason}),
  listReceipts:()=>get<Receipt[]>(`${BASE}/finance/receipts`),
  getReceipt:(id:number)=>get<Receipt>(`${BASE}/finance/receipts/${id}`),
  listPaymentInbox:(status?:string)=>get<PaymentInboxItem[]>(`${BASE}/finance/payment-inbox${status?`?status=${encodeURIComponent(status)}`:''}`),
  postPaymentInbox:(id:number,payload?:{invoice_id?:number;reason?:string})=>send<PaymentInboxItem>(`${BASE}/finance/payment-inbox/${id}/post`,'POST',payload||{}),
  decodePayment:(message:string)=>send<unknown>(`${BASE}/finance/payments/decode`,'POST',{message}),
  studentBalance:(studentId:number)=>get<StudentBalance>(`${BASE}/finance/students/${studentId}/balance`),
  overview:()=>get<FinanceOverview>(`${BASE}/finance/overview`),
  studentBalanceReport:(params:{academic_year_id?:number;level_id?:number;grade_id?:number;stream_id?:number;outstanding_only?:boolean}={})=>{const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==undefined)q.set(k,String(v))});const qs=q.toString();return get<StudentBalanceReportRow[]>(`${BASE}/finance/reports/student-balances${qs?`?${qs}`:""}`)},
  studentStatement:(studentId:number,academicYearId?:number)=>get<StudentStatement>(`${BASE}/finance/reports/student/${studentId}/statement${academicYearId?`?academic_year_id=${academicYearId}`:""}`),
  createBillingRun:(payload:{academic_year_id:number;level_id:number;grade_id:number;stream_id?:number;fee_structure_id:number;due_date?:string})=>send<BillingRunResponse>(`${BASE}/finance/billing-runs`,"POST",payload),
  trialBalance:()=>get<TrialBalanceRow[]>(`${BASE}/finance/reports/trial-balance`),
  generalLedger:(accountId?:number)=>get<GeneralLedgerRow[]>(`${BASE}/finance/reports/general-ledger${accountId!=null?`?account_id=${accountId}`:''}`),
  balanceSheet:()=>get<BalanceSheet>(`${BASE}/finance/reports/balance-sheet`),
  listBankAccounts:()=>get<BankAccount[]>(`${BASE}/finance/bank-accounts`),
  listBankTransactions:(bankAccountId?:number)=>get<BankTransaction[]>(`${BASE}/finance/bank-transactions${bankAccountId!=null?`?bank_account_id=${bankAccountId}`:''}`),
  listCashBooks:()=>get<CashBook[]>(`${BASE}/finance/cash-books`),
  listReconciliations:()=>get<BankReconciliation[]>(`${BASE}/finance/bank-reconciliations`),
  createReconciliation:(payload:Partial<BankReconciliation>)=>send<BankReconciliation>(`${BASE}/finance/bank-reconciliations`,'POST',payload),
  importBankStatement:(bankAccountId:number,file:File)=>{const body=new FormData();body.append('file',file);return apiFetch<{bank_account_id:number;filename:string;imported:number;duplicates:number}>(`${BASE}/finance/bank-accounts/${bankAccountId}/statement-import`,{method:'POST',body})},
}
