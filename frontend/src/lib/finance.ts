import { apiFetch } from './api'

const BASE = '/api/v1'

export interface FeeStructure {
  id: number
  school_id: number
  name: string
  description?: string
  academic_year_id?: number
  term_id?: number
  level_id?: number
  amount: number
  currency: string
  status: string
  created_at?: string
}

export interface Invoice {
  id: number
  school_id: number
  student_id: number
  fee_structure_id: number
  amount: number
  balance: number
  status: string
  due_date?: string
  created_at?: string
}

export interface Payment {
  id: number
  school_id: number
  invoice_id: number
  student_id: number
  amount: number
  payment_method?: string
  reference_number?: string
  notes?: string
  received_by?: string
  created_at?: string
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

const get = <T,>(path: string) => apiFetch<T>(path)
const send = <T,>(path: string, method: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const finance = {
  // Fee structures
  listFeeStructures: () => get<FeeStructure[]>(`${BASE}/finance/fee-structures`),
  createFeeStructure: (payload: Partial<FeeStructure>) => send<FeeStructure>(`${BASE}/finance/fee-structures`, 'POST', payload),

  // Invoices
  listInvoices: (params?: { student_id?: number; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.student_id) qs.set('student_id', String(params.student_id))
    if (params?.status) qs.set('status', params.status)
    const q = qs.toString()
    return get<Invoice[]>(`${BASE}/finance/invoices${q ? `?${q}` : ''}`)
  },
  createInvoice: (payload: Partial<Invoice>) => send<Invoice>(`${BASE}/finance/invoices`, 'POST', payload),

  // Payments
  listPayments: (studentId?: number) => {
    const q = studentId ? `?student_id=${studentId}` : ''
    return get<Payment[]>(`${BASE}/finance/payments${q}`)
  },
  recordPayment: (payload: Partial<Payment>) => send<Payment>(`${BASE}/finance/payments`, 'POST', payload),

  // Balances
  studentBalance: (studentId: number) => get<StudentBalance>(`${BASE}/finance/students/${studentId}/balance`),

  // Overview
  overview: () => get<FinanceOverview>(`${BASE}/finance/overview`),
}
