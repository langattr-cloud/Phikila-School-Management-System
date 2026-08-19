import { apiRequest as request } from './api'

export interface FeeStructure {
  id: number
  name: string
  description?: string | null
  academic_year_id?: number | null
  term_id?: number | null
  level_id?: number | null
  amount: number
  currency: string
}

export interface Invoice {
  id: number
  student_id: number
  fee_structure_id: number
  amount: number
  balance: number
  status: string
  due_date?: string | null
  created_at?: string | null
}

export interface Payment {
  id: number
  invoice_id: number
  student_id: number
  amount: number
  payment_method?: string | null
  reference_number?: string | null
  notes?: string | null
  status: string
  journal_id?: number | null
  created_at?: string | null
}

export interface Receipt {
  id: number
  receipt_number: string
  payment_id: number
  student_id: number
  amount: number
  status: string
  issued_by?: string | null
  issued_at?: string | null
}

export interface PaymentInboxItem {
  id: number
  source: string
  source_account?: string | null
  account_name?: string | null
  raw_message: string
  amount: number
  external_reference?: string | null
  student_identifier?: string | null
  received_at?: string | null
  payment_channel?: string | null
  matched_student_id?: number | null
  match_method?: string | null
  match_confidence?: number | null
  status: string
  posted_payment_id?: number | null
  posted_at?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
}

export interface StudentBalance {
  student_id: number
  student_name: string
  total_invoiced: number
  total_paid: number
  balance: number
}

export interface FinanceOverview {
  total_invoiced: number
  total_collected: number
  total_outstanding: number
  invoices_count: number
  paid_count: number
  pending_count: number
}

export interface TrialBalanceRow {
  account_id: number
  code: string
  name: string
  account_type: string
  debit: number
  credit: number
  balance: number
}

export interface GeneralLedgerRow {
  journal_id: number
  journal_number: string
  date: string
  reference?: string | null
  account_id: number
  account_code: string
  account_name: string
  debit: number
  credit: number
  description?: string | null
}

export interface BalanceSheet {
  assets: TrialBalanceRow[]
  liabilities: TrialBalanceRow[]
  equity: TrialBalanceRow[]
  current_surplus_deficit: number
  totals: {
    assets: number
    liabilities: number
    equity: number
    net_assets: number
    liabilities_and_net_assets: number
    balance_check: number
  }
}

export interface PaymentInboxPostRequest {
  invoice_id?: number | null
  reason?: string | null
}

const BASE = '/api'

const get = <T>(path: string) => request<T>(path)

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const finance = {
  feeStructures: () => get<FeeStructure[]>(`${BASE}/finance/fee-structures`),
  createFeeStructure: (body: Omit<FeeStructure, 'id'>) => post<FeeStructure>(`${BASE}/finance/fee-structures`, body),
  invoices: (studentId?: number, status?: string) => get<Invoice[]>(`${BASE}/finance/invoices${studentId != null || status ? `?${new URLSearchParams({ ...(studentId != null ? { student_id: String(studentId) } : {}), ...(status ? { status } : {}) }).toString()}` : ''}`),
  createInvoice: (body: { student_id: number; fee_structure_id: number; amount: number; due_date?: string | null }) => post<Invoice>(`${BASE}/finance/invoices`, body),
  payments: (studentId?: number) => get<Payment[]>(`${BASE}/finance/payments${studentId != null ? `?student_id=${studentId}` : ''}`),
  recordPayment: (body: { invoice_id: number; student_id: number; amount: number; payment_method?: string | null; reference_number?: string | null; notes?: string | null }) => post<Payment>(`${BASE}/finance/payments`, body),
  reversePayment: (paymentId: number, reason: string) => post<Payment>(`${BASE}/finance/payments/${paymentId}/reverse`, { reason }),
  receipts: () => get<Receipt[]>(`${BASE}/finance/receipts`),
  receipt: (receiptId: number) => get<Receipt>(`${BASE}/finance/receipts/${receiptId}`),
  decodePayment: (message: string) => post<Record<string, unknown>>(`${BASE}/finance/payments/decode`, { message }),
  paymentInbox: (status?: string) => get<PaymentInboxItem[]>(`${BASE}/finance/payment-inbox${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  ingestPaymentInbox: (body: { source: string; raw_message: string; source_account?: string | null; account_name?: string | null; amount?: number | null; external_reference?: string | null; student_identifier?: string | null; received_at?: string | null; payment_channel?: string | null }) => post<PaymentInboxItem>(`${BASE}/finance/payment-inbox`, body),
  postPaymentInbox: (id: number, body: PaymentInboxPostRequest = {}) => post<PaymentInboxItem>(`${BASE}/finance/payment-inbox/${id}/post`, body),
  studentBalance: (studentId: number) => get<StudentBalance>(`${BASE}/finance/students/${studentId}/balance`),
  overview: () => get<FinanceOverview>(`${BASE}/finance/overview`),
  trialBalance: () => get<TrialBalanceRow[]>(`${BASE}/finance/reports/trial-balance`),
  generalLedger: (accountId?: number) => get<GeneralLedgerRow[]>(`${BASE}/finance/reports/general-ledger${accountId != null ? `?account_id=${accountId}` : ''}`),
  balanceSheet: () => get<BalanceSheet>(`${BASE}/finance/reports/balance-sheet`),
}
