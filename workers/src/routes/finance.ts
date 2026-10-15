import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth, requireFinanceSchoolAccess } from '../lib/auth'
import { jsonError } from '../lib/http'

export const financeRoutes = new Hono()

// Every finance request is authorized against an active school membership.
// Each table read/write is scoped to that verified school; never trust a body school_id.
financeRoutes.use('*', async (c, next) => {
  const { error } = await requireFinanceSchoolAccess(c as never)
  if (error) return error
  await next()
})

financeRoutes.get('/overview', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const [fees, invoices, payments, inbox, accounts] = await Promise.all([
    client.from('fee_structures').select('*').eq('school_id', c.get('financeSchoolId')),
    client.from('student_invoices').select('*').eq('school_id', c.get('financeSchoolId')),
    client.from('payments').select('*').eq('school_id', c.get('financeSchoolId')),
    client.from('payment_inbox').select('*').eq('school_id', c.get('financeSchoolId')),
    client.from('chart_of_accounts').select('*').eq('school_id', c.get('financeSchoolId')),
  ])
  return c.json({
    fee_structures: fees.data ?? [],
    invoices: invoices.data ?? [],
    payments: payments.data ?? [],
    payment_inbox: inbox.data ?? [],
    chart_of_accounts: accounts.data ?? [],
  })
})

financeRoutes.get('/vote-heads', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data, error: queryError } = await db().from('finance_vote_heads').select('*').eq('school_id', c.get('financeSchoolId')).order('display_order').order('name')
  if (queryError) return jsonError(c, queryError.message, 400)
  return c.json(data ?? [])
})
financeRoutes.post('/vote-heads', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  if (body.revenue_account_id != null) {
    const { data: account } = await db().from('chart_of_accounts').select('id').eq('id', Number(body.revenue_account_id)).eq('school_id', schoolId).maybeSingle()
    if (!account) return c.json({ detail: 'Revenue account not found for this school.' }, 404)
  }
  const { data, error: insertError } = await db().from('finance_vote_heads').insert({ ...body, school_id: schoolId }).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})
financeRoutes.patch('/vote-heads/:id', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  if (body.revenue_account_id != null) {
    const { data: account } = await db().from('chart_of_accounts').select('id').eq('id', Number(body.revenue_account_id)).eq('school_id', schoolId).maybeSingle()
    if (!account) return c.json({ detail: 'Revenue account not found for this school.' }, 404)
  }
  const { data, error: updateError } = await db().from('finance_vote_heads').update({ ...body, school_id: schoolId }).eq('school_id', schoolId).eq('id', c.req.param('id')).select().maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})
financeRoutes.get('/fee-structures/:id/items', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data, error: queryError } = await db().from('fee_structure_items').select('*').eq('school_id', c.get('financeSchoolId')).eq('fee_structure_id', c.req.param('id')).order('display_order')
  if (queryError) return jsonError(c, queryError.message, 400)
  return c.json(data ?? [])
})
financeRoutes.post('/fee-structures/:id/items', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  const feeStructureId = Number(c.req.param('id'))
  const [structure, voteHead] = await Promise.all([
    db().from('fee_structures').select('id').eq('id', feeStructureId).eq('school_id', schoolId).maybeSingle(),
    db().from('finance_vote_heads').select('id').eq('id', Number(body.vote_head_id)).eq('school_id', schoolId).maybeSingle(),
  ])
  if (!structure.data) return c.json({ detail: 'Fee structure not found for this school.' }, 404)
  if (body.vote_head_id && !voteHead.data) return c.json({ detail: 'Vote head not found for this school.' }, 404)
  const { data, error: insertError } = await db().from('fee_structure_items').insert({ ...body, school_id: schoolId, fee_structure_id: feeStructureId }).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})
financeRoutes.get('/payments/:id/allocations', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data, error: queryError } = await db().from('payment_allocations').select('*').eq('school_id', c.get('financeSchoolId')).eq('payment_id', c.req.param('id')).order('id')
  if (queryError) return jsonError(c, queryError.message, 400)
  return c.json(data ?? [])
})
financeRoutes.get('/students/:studentId/fee-credits', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data, error: queryError } = await db().from('student_fee_credits').select('*').eq('school_id', c.get('financeSchoolId')).eq('student_id', c.req.param('studentId')).eq('status','AVAILABLE').order('created_at')
  if (queryError) return jsonError(c, queryError.message, 400)
  return c.json(data ?? [])
})
financeRoutes.get('/students/:studentId/fee-obligations', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data: invoices, error: invoiceError } = await db().from('student_invoices').select('*').eq('school_id', c.get('financeSchoolId')).eq('student_id', c.req.param('studentId')).gt('balance',0).order('created_at')
  if (invoiceError) return jsonError(c, invoiceError.message, 400)
  const ids = (invoices ?? []).map((i: any) => i.id)
  const { data: items } = ids.length ? await db().from('student_invoice_items').select('*').eq('school_id', c.get('financeSchoolId')).in('invoice_id', ids) : { data: [] as any[] }
  return c.json({ invoices: invoices ?? [], items: items ?? [] })
})
financeRoutes.post('/payments/allocate', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  const studentId = Number(body.student_id)
  const amount = Number(body.amount)
  if (!Number.isSafeInteger(studentId) || studentId <= 0 || !Number.isFinite(amount) || amount <= 0) {
    return c.json({ detail: 'A valid student and positive amount are required.' }, 400)
  }
  const { data: enrollment } = await db().from('student_enrollments').select('student_id').eq('school_id', schoolId).eq('student_id', studentId).eq('status', 'active').limit(1).maybeSingle()
  if (!enrollment) return c.json({ detail: 'Student is not actively enrolled in this school.' }, 404)
  const invoiceId = body.invoice_id == null || body.invoice_id === '' ? null : Number(body.invoice_id)
  if (invoiceId !== null) {
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return c.json({ detail: 'Invalid invoice ID.' }, 400)
    const { data: invoice } = await db().from('student_invoices').select('id').eq('id', invoiceId).eq('school_id', schoolId).eq('student_id', studentId).maybeSingle()
    if (!invoice) return c.json({ detail: 'Invoice does not belong to this student and school.' }, 404)
  }
  const { data, error: rpcError } = await db().rpc('post_student_fee_payment', {
    p_school_id: schoolId, p_student_id: studentId, p_amount: amount,
    p_payment_method: body.payment_method ?? body.method ?? 'cash', p_reference_number: body.reference_number ?? body.reference ?? null,
    p_notes: body.notes ?? null, p_received_by: body.received_by ?? null, p_invoice_id: invoiceId,
  })
  if (rpcError) return jsonError(c, rpcError.message, 400)
  return c.json(data, 201)
})

// ── Fee structures ────────────────────────────────────────────────────────
financeRoutes.get('/fee-structures', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('fee_structures').select('*').eq('school_id', c.get('financeSchoolId')).order('id')
  return c.json(data ?? [])
})

financeRoutes.post('/fee-structures', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('fee_structures').insert({ ...body, school_id: c.get('financeSchoolId') }).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

financeRoutes.patch('/fee-structures/:id', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('fee_structures')
    .update({ ...body, school_id: c.get('financeSchoolId') })
    .eq('school_id', c.get('financeSchoolId'))
    .eq('id', c.req.param('id'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

financeRoutes.delete('/fee-structures/:id', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('fee_structures').delete().eq('school_id', c.get('financeSchoolId')).eq('id', c.req.param('id'))
  return c.body(null, 204)
})

// ── Invoices ──────────────────────────────────────────────────────────────
financeRoutes.get('/invoices', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('student_invoices').select('*').eq('school_id', c.get('financeSchoolId')).order('created_at', { ascending: false })
  return c.json(data ?? [])
})

financeRoutes.post('/invoices', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  const { data: enrollment } = await db().from('student_enrollments').select('student_id').eq('school_id', schoolId).eq('student_id', Number(body.student_id)).eq('status', 'active').limit(1).maybeSingle()
  if (!body.student_id || !enrollment) return c.json({ detail: 'Student is not actively enrolled in this school.' }, 404)
  if (body.fee_structure_id) {
    const { data: structure } = await db().from('fee_structures').select('id').eq('id', Number(body.fee_structure_id)).eq('school_id', schoolId).maybeSingle()
    if (!structure) return c.json({ detail: 'Fee structure not found for this school.' }, 404)
  }
  const { data, error: insertError } = await db().from('student_invoices').insert({ ...body, school_id: schoolId }).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

financeRoutes.patch('/invoices/:id', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  if (body.student_id != null) {
    const { data: enrollment } = await db().from('student_enrollments').select('student_id').eq('school_id', schoolId).eq('student_id', Number(body.student_id)).eq('status', 'active').limit(1).maybeSingle()
    if (!enrollment) return c.json({ detail: 'Student is not actively enrolled in this school.' }, 404)
  }
  if (body.fee_structure_id != null) {
    const { data: structure } = await db().from('fee_structures').select('id').eq('id', Number(body.fee_structure_id)).eq('school_id', schoolId).maybeSingle()
    if (!structure) return c.json({ detail: 'Fee structure not found for this school.' }, 404)
  }
  const { data, error: updateError } = await db()
    .from('student_invoices')
    .update({ ...body, school_id: schoolId })
    .eq('school_id', c.get('financeSchoolId'))
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
  const { data } = await db().from('payments').select('*').eq('school_id', c.get('financeSchoolId')).order('created_at', { ascending: false })
  return c.json(data ?? [])
})

financeRoutes.post('/payments', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error

  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  const studentId = Number(body.student_id)
  const amount = Number(body.amount)

  if (!Number.isSafeInteger(studentId) || studentId <= 0 || !Number.isFinite(amount) || amount <= 0) {
    return c.json({ detail: 'A valid student and positive amount are required.' }, 400)
  }

  const { data: enrollment, error: enrollmentError } = await db()
    .from('student_enrollments')
    .select('student_id')
    .eq('school_id', schoolId)
    .eq('student_id', studentId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (enrollmentError) return jsonError(c, enrollmentError.message, 400)
  if (!enrollment) return c.json({ detail: 'Student is not enrolled in this school.' }, 404)

  const invoiceId = body.invoice_id == null || body.invoice_id === '' ? null : Number(body.invoice_id)
  if (invoiceId !== null) {
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) {
      return c.json({ detail: 'Invalid invoice ID.' }, 400)
    }
    const { data: invoice, error: invoiceError } = await db()
      .from('student_invoices')
      .select('id')
      .eq('id', invoiceId)
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .maybeSingle()

    if (invoiceError) return jsonError(c, invoiceError.message, 400)
    if (!invoice) return c.json({ detail: 'Invoice does not belong to this student and school.' }, 404)
  }

  // All payments go through the established posting RPC so allocations,
  // carry-forward credits, receipts, and the general ledger remain consistent.
  const { data, error: rpcError } = await db().rpc('post_student_fee_payment', {
    p_school_id: schoolId,
    p_student_id: studentId,
    p_amount: amount,
    p_payment_method: body.payment_method ?? body.method ?? 'cash',
    p_reference_number: body.reference_number ?? body.reference ?? null,
    p_notes: body.notes ?? null,
    p_received_by: body.received_by ?? null,
    p_invoice_id: invoiceId,
  })

  if (rpcError) return jsonError(c, rpcError.message, 400)
  return c.json(data, 201)
})

// ── Payment inbox ─────────────────────────────────────────────────────────
financeRoutes.get('/payment-inbox', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('payment_inbox').select('*').eq('school_id', c.get('financeSchoolId')).order('created_at', { ascending: false })
  return c.json(data ?? [])
})

financeRoutes.patch('/payment-inbox/:id', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  const suppliedStudentIds = [body.student_id, body.matched_student_id]
    .filter((value) => value != null && value !== '')
    .map(Number)
  if (suppliedStudentIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(suppliedStudentIds).size > 1) {
    return c.json({ detail: 'Provide one consistent, valid matched student ID.' }, 400)
  }
  const studentId = suppliedStudentIds[0]
  if (studentId != null) {
    const { data: enrollment, error: enrollmentError } = await db()
      .from('student_enrollments')
      .select('student_id')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (enrollmentError) return jsonError(c, enrollmentError.message, 400)
    if (!enrollment) return c.json({ detail: 'Student is not actively enrolled in this school.' }, 404)
  }
  if (body.duplicate_of != null && body.duplicate_of !== '') {
    const duplicateId = Number(body.duplicate_of)
    if (!Number.isSafeInteger(duplicateId) || duplicateId <= 0 || String(duplicateId) === c.req.param('id')) {
      return c.json({ detail: 'Invalid duplicate reference.' }, 400)
    }
    const { data: duplicate, error: duplicateError } = await db()
      .from('payment_inbox')
      .select('id')
      .eq('id', duplicateId)
      .eq('school_id', schoolId)
      .maybeSingle()
    if (duplicateError) return jsonError(c, duplicateError.message, 400)
    if (!duplicate) return c.json({ detail: 'Duplicate reference must belong to this school.' }, 404)
  }
  if (body.posted_payment_id != null) {
    const postedPaymentId = Number(body.posted_payment_id)
    if (!Number.isSafeInteger(postedPaymentId) || postedPaymentId <= 0) {
      return c.json({ detail: 'Invalid posted payment ID.' }, 400)
    }
    const { data: payment, error: paymentError } = await db()
      .from('payments')
      .select('id, student_id')
      .eq('id', postedPaymentId)
      .eq('school_id', schoolId)
      .maybeSingle()
    if (paymentError) return jsonError(c, paymentError.message, 400)
    if (!payment) return c.json({ detail: 'Payment not found for this school.' }, 404)
    if (studentId != null && Number(payment.student_id) !== studentId) {
      return c.json({ detail: 'Matched student must match the posted payment student.' }, 400)
    }
  }

  // Whitelist mutable reconciliation fields; never accept client-supplied IDs,
  // school ownership, audit timestamps, or reviewer identities.
  const updatePayload: Record<string, unknown> = {}
  for (const key of ['status', 'match_method', 'match_confidence', 'duplicate_of', 'posted_payment_id', 'notes'] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) updatePayload[key] = body[key]
  }
  if (studentId != null) {
    updatePayload.student_id = studentId
    updatePayload.matched_student_id = studentId
    updatePayload.matched_by = c.get('authUser')?.id ?? null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status') || studentId != null || body.posted_payment_id != null) {
    updatePayload.reviewed_by = c.get('authUser')?.id ?? null
    updatePayload.reviewed_at = new Date().toISOString()
  }
  if (Object.keys(updatePayload).length === 0) {
    return c.json({ detail: 'No supported payment-inbox fields were supplied.' }, 400)
  }
  const { data, error: updateError } = await db()
    .from('payment_inbox')
    .update(updatePayload)
    .eq('school_id', schoolId)
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
  const { data } = await db().from('finance_receipts').select('*').eq('school_id', c.get('financeSchoolId')).order('issued_at', { ascending: false })
  return c.json(data ?? [])
})

financeRoutes.post('/receipts', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  const paymentId = Number(body.payment_id)
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
    return c.json({ detail: 'A valid payment ID is required.' }, 400)
  }

  const { data: payment, error: paymentError } = await db()
    .from('payments')
    .select('id, student_id, amount, journal_id, reversed')
    .eq('id', paymentId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (paymentError) return jsonError(c, paymentError.message, 400)
  if (!payment) return c.json({ detail: 'Payment not found for this school.' }, 404)
  if (payment.reversed || !(Number(payment.amount) > 0)) {
    return c.json({ detail: 'A receipt can only be issued for a positive, non-reversed payment.' }, 400)
  }
  if (body.student_id != null && Number(body.student_id) !== Number(payment.student_id)) {
    return c.json({ detail: 'Receipt student must match the payment student.' }, 400)
  }
  if (body.amount != null && (!Number.isFinite(Number(body.amount)) || Math.abs(Number(body.amount) - Number(payment.amount)) > 0.005)) {
    return c.json({ detail: 'Receipt amount must match the payment amount.' }, 400)
  }
  if (!payment.journal_id) {
    return c.json({ detail: 'A posted journal is required before issuing a receipt.' }, 409)
  }

  const { data: journal, error: journalError } = await db()
    .from('finance_journals')
    .select('id, status')
    .eq('id', payment.journal_id)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (journalError) return jsonError(c, journalError.message, 400)
  if (!journal || String(journal.status ?? '').toUpperCase() !== 'POSTED') {
    return c.json({ detail: 'A posted journal is required before issuing a receipt.' }, 409)
  }
  const { data: entries, error: entriesError } = await db()
    .from('finance_journal_entries')
    .select('debit, credit')
    .eq('journal_id', payment.journal_id)
  if (entriesError) return jsonError(c, entriesError.message, 400)
  const journalBalance = (entries ?? []).reduce(
    (sum, entry) => sum + Number(entry.debit ?? 0) - Number(entry.credit ?? 0),
    0,
  )
  if (!entries?.length || !Number.isFinite(journalBalance) || Math.abs(journalBalance) > 0.005) {
    return c.json({ detail: 'A balanced journal is required before issuing a receipt.' }, 409)
  }

  const { data: existing, error: existingError } = await db()
    .from('finance_receipts')
    .select('*')
    .eq('payment_id', payment.id)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (existingError) return jsonError(c, existingError.message, 400)
  if (existing) {
    const matchesPayment =
      Number(existing.student_id) === Number(payment.student_id) &&
      Math.abs(Number(existing.amount) - Number(payment.amount)) <= 0.005
    if (!matchesPayment) {
      return c.json({ detail: 'An existing receipt conflicts with the payment record; manual reconciliation is required.' }, 409)
    }
    return c.json(existing, 200)
  }

  const { data, error: insertError } = await db()
    .from('finance_receipts')
    .insert({
      receipt_number: `RCPT-${payment.id}`,
      payment_id: payment.id,
      student_id: payment.student_id,
      amount: payment.amount,
      school_id: schoolId,
      status: 'ISSUED',
      issued_by: c.get('authUser')?.id ?? null,
    })
    .select()
    .single()
  if (insertError) {
    // Concurrent requests can race after the existence check; return the
    // winner's receipt rather than creating a second receipt or failing.
    if (insertError.code === '23505') {
      const { data: racedReceipt } = await db()
        .from('finance_receipts')
        .select('*')
        .eq('payment_id', payment.id)
        .eq('school_id', schoolId)
        .maybeSingle()
      if (racedReceipt) {
        const matchesPayment =
          Number(racedReceipt.student_id) === Number(payment.student_id) &&
          Math.abs(Number(racedReceipt.amount) - Number(payment.amount)) <= 0.005
        if (!matchesPayment) {
          return c.json({ detail: 'A concurrent receipt conflicts with the payment record; manual reconciliation is required.' }, 409)
        }
        return c.json(racedReceipt, 200)
      }
    }
    return jsonError(c, insertError.message, 400)
  }
  return c.json(data, 201)
})

// ── Chart of accounts / journals ──────────────────────────────────────────
financeRoutes.get('/chart-of-accounts', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('chart_of_accounts').select('*').eq('school_id', c.get('financeSchoolId')).order('code')
  return c.json(data ?? [])
})

financeRoutes.post('/chart-of-accounts', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  if (body.parent_id != null) {
    const { data: parent } = await db().from('chart_of_accounts').select('id').eq('id', Number(body.parent_id)).eq('school_id', schoolId).maybeSingle()
    if (!parent) return c.json({ detail: 'Parent ledger account not found for this school.' }, 404)
  }
  const { data, error: insertError } = await db().from('chart_of_accounts').insert({ ...body, school_id: schoolId }).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

financeRoutes.get('/journals', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('finance_journals').select('*').eq('school_id', c.get('financeSchoolId')).order('created_at', { ascending: false })
  return c.json(data ?? [])
})

financeRoutes.post('/journals', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const schoolId = c.get('financeSchoolId')
  const client = db()
  if (!Array.isArray(body.entries) || body.entries.length < 2) return c.json({ detail: 'A journal requires at least two entries.' }, 400)
  const entriesValid = body.entries.every((entry: Record<string, unknown>) => {
    const debit = Number(entry.debit ?? 0)
    const credit = Number(entry.credit ?? 0)
    return Number.isFinite(debit) && Number.isFinite(credit) && debit >= 0 && credit >= 0 && !((debit > 0) && (credit > 0)) && (debit > 0 || credit > 0)
  })
  const debitTotal = body.entries.reduce((sum: number, entry: Record<string, unknown>) => sum + Number(entry.debit ?? 0), 0)
  const creditTotal = body.entries.reduce((sum: number, entry: Record<string, unknown>) => sum + Number(entry.credit ?? 0), 0)
  if (!entriesValid || !Number.isFinite(debitTotal) || !Number.isFinite(creditTotal) || debitTotal <= 0 || Math.abs(debitTotal - creditTotal) > 0.005) {
    return c.json({ detail: 'Journal debits and credits must balance and be positive.' }, 400)
  }
  const accountIds: number[] = [...new Set<number>(body.entries.map((entry: Record<string, unknown>) => Number(entry.account_id)))]
  if (accountIds.some((id: number) => !Number.isSafeInteger(id) || id <= 0)) return c.json({ detail: 'Every journal entry requires a valid ledger account.' }, 400)
  const { data: accounts, error: accountsError } = await client.from('chart_of_accounts').select('id').eq('school_id', schoolId).in('id', accountIds)
  if (accountsError || (accounts ?? []).length !== accountIds.length) return c.json({ detail: 'All ledger accounts must belong to this school.' }, 400)
  // Whitelist writable fields. Do not pass request-controlled IDs, school IDs,
  // created_by, or nested entry objects into the database insert.
  const journalPayload: Record<string, unknown> = {
    description: typeof body.description === 'string' ? body.description : null,
    reference: typeof body.reference === 'string' ? body.reference : null,
    status: 'POSTED',
    school_id: schoolId,
  }
  // Omit the date when not supplied so the database default applies.
  if (typeof body.journal_date === 'string' && body.journal_date.length > 0) {
    journalPayload.journal_date = body.journal_date
  }
  const { data, error: insertError } = await client.from('finance_journals').insert(journalPayload).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  const entryPayload = body.entries.map((e: Record<string, unknown>) => ({
    journal_id: data.id,
    account_id: Number(e.account_id),
    debit: Number(e.debit ?? 0),
    credit: Number(e.credit ?? 0),
    description: typeof e.description === 'string' ? e.description : null,
  }))
  const { error: entriesError } = await client
    .from('finance_journal_entries')
    .insert(entryPayload)
  if (entriesError) {
    await client.from('finance_journals').delete().eq('id', data.id).eq('school_id', schoolId)
    return jsonError(c, entriesError.message, 400)
  }
  return c.json(data, 201)
})