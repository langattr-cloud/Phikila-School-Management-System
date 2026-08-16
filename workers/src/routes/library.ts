import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const libraryRoutes = new Hono()

// ── Books ─────────────────────────────────────────────────────────────────
libraryRoutes.get('/books', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('library_books').select('*').order('title')
  return c.json(data ?? [])
})

libraryRoutes.get('/books/stats', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const [books, loans] = await Promise.all([
    client.from('library_books').select('quantity'),
    client.from('library_loans').select('status'),
  ])
  const totalCopies = (books.data ?? []).reduce((acc, b) => acc + (b.quantity ?? 0), 0)
  const activeLoans = (loans.data ?? []).filter((l) => l.status === 'borrowed' || l.status === 'overdue').length
  return c.json({
    total_titles: books.data?.length ?? 0,
    total_copies: totalCopies,
    active_loans: activeLoans,
  })
})

libraryRoutes.post('/books', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('library_books').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

libraryRoutes.get('/books/:bookId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const bookId = c.req.param('bookId')
  const { data } = await client.from('library_books').select('*').eq('id', bookId).maybeSingle()
  if (!data) return c.json({ detail: 'Book not found.' }, 404)
  const { data: loans } = await client.from('library_loans').select('*').eq('book_id', bookId).order('loaned_at', { ascending: false })
  return c.json({ ...data, loans: loans ?? [] })
})

libraryRoutes.patch('/books/:bookId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('library_books')
    .update(body)
    .eq('id', c.req.param('bookId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

libraryRoutes.delete('/books/:bookId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('library_books').delete().eq('id', c.req.param('bookId'))
  return c.body(null, 204)
})

// ── Loans ─────────────────────────────────────────────────────────────────
libraryRoutes.get('/loans', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('library_loans').select('*').order('loaned_at', { ascending: false })
  return c.json(data ?? [])
})

libraryRoutes.post('/loans', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('library_loans').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

/** Return a loan → marks returned + due date settled. */
libraryRoutes.post('/loans/:loanId/return', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const loanId = c.req.param('loanId')
  const { data: loan } = await client.from('library_loans').select('*').eq('id', loanId).maybeSingle()
  if (!loan) return c.json({ detail: 'Loan not found.' }, 404)
  if (loan.status === 'returned') return c.json({ detail: 'Loan already returned.' }, 409)
  const { data, error: updateError } = await client
    .from('library_loans')
    .update({ status: 'returned', returned_at: new Date().toISOString() })
    .eq('id', loanId)
    .select()
    .single()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})