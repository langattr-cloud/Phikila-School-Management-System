import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const financeRoutes = new Hono()

financeRoutes.get('/overview', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const [fees, invoices, payments, inbox, accounts] = await Promise.all([
    client.from('fee_structures').select('*'),
    client.from('student_invoices').select('*'),
    client.from('payments').select('*'),
    client.from('payment_inbox').select('*'),
    client.from('chart_of_accounts').select('*'),
  ])
  return c.json({
    fee_structures: fees.data ?? [],
    invoices: invoices.data ?? [],
    payments: payments.data ?? [],
    payment_inbox: inbox.data ?? [],
    chart_of_accounts: accounts.data ?? [],
  })
})

// ── Fee structures ────────────────────────────────────────────────────────
financeRoutes.get('/fee-structures', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('fee_structures').select('*').order('id')
  return c.json(data ?? [])
})

financeRoutes.post('/fee-structures', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('fee_structures').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

financeRoutes.patch('/fee-structures/:id', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('fee_structures')
    .update(body)
    .eq('id', c.req.param('id'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

financeRoutes.delete('/fee-structures/:id', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('fee_structures').delete().eq('id', c.req.param('id'))
  return c.body(null, 204)
})

// ── Invoices ──────────────────────────────────────────────────────────────
financeRoutes.get('/invoices', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('student_invoices').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

financeRoutes.post('/invoices', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('student_invoices').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

financeRoutes.patch('/invoices/:id', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('student_invoices')
    .update(body)
    .eq('id', c.req.param('id'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

// ── Payments ──────────────────────────────────────────────────────────────
financeRoutes.get('/payments', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('payments').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

financeRoutes.post('/payments', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  const { data, error: insertError } = await client.from('payments').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  if (body.reference) {
    await client.from('payment_inbox').update({ status: 'matched' }).eq('reference', body.reference)
  }
  return c.json(data, 201)
})

// ── Payment inbox ─────────────────────────────────────────────────────────
financeRoutes.get('/payment-inbox', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('payment_inbox').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

financeRoutes.patch('/payment-inbox/:id', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('payment_inbox')
    .update(body)
    .eq('id', c.req.param('id'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

// ── Receipts ──────────────────────────────────────────────────────────────
financeRoutes.get('/receipts', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('finance_receipts').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

financeRoutes.post('/receipts', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('finance_receipts').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

// ── Chart of accounts / journals ──────────────────────────────────────────
financeRoutes.get('/chart-of-accounts', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('chart_of_accounts').select('*').order('code')
  return c.json(data ?? [])
})

financeRoutes.post('/chart-of-accounts', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('chart_of_accounts').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

financeRoutes.get('/journals', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('finance_journals').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

financeRoutes.post('/journals', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  const { data, error: insertError } = await client.from('finance_journals').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  if (Array.isArray(body.entries)) {
    await client
      .from('finance_journal_entries')
      .insert(body.entries.map((e: Record<string, unknown>) => ({ journal_id: data.id, ...e })))
  }
  return c.json(data, 201)
})