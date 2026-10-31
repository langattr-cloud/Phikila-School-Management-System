import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const libraryRoutes = new Hono()

const movementActions = new Set([
  'issue_to_teacher',
  'issue_to_student',
  'student_return_to_teacher',
  'teacher_return_to_library',
  'mark_lost',
  'reconcile_copy',
  'exclude_before_issue',
  'restore_excluded_copy',
])
const copyConditions = new Set(['good', 'damaged', 'lost'])

function actorId(user: { id: string } | null): string | null {
  return user?.id ?? null
}

// ── Books ─────────────────────────────────────────────────────────────────
// Grade → subject → title inventory. Totals count physical copy rows, regardless of custody status.
libraryRoutes.get('/books/grade-subject-summary', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const [{ data: bookRows, error: bookError }, { data: copyRows, error: copyError }] = await Promise.all([
    client.from('library_books').select('id,title,author,grade,subject,total_copies').order('grade').order('subject').order('title'),
    client.from('library_book_copies').select('id,book_id,copy_number,status,current_holder_type'),
  ])
  if (bookError) return jsonError(c, bookError.message, 500)
  if (copyError) return jsonError(c, copyError.message, 500)
  const copiesByBook = new Map<number, Array<{ id: string; book_id: number; copy_number: string; status: string; current_holder_type: string }>>()
  for (const copy of copyRows ?? []) {
    const group = copiesByBook.get(copy.book_id) ?? []
    group.push(copy)
    copiesByBook.set(copy.book_id, group)
  }
  const groups = new Map<string, { grade: string; subject: string; title_count: number; total_copies: number; titles: Array<Record<string, unknown>> }>()
  for (const book of bookRows ?? []) {
    const grade = book.grade || 'Unassigned'
    const subject = book.subject || 'Unassigned'
    const key = grade + String.fromCharCode(0) + subject
    const group = groups.get(key) ?? { grade, subject, title_count: 0, total_copies: 0, titles: [] }
    const copies = copiesByBook.get(book.id) ?? []
    group.title_count += 1
    group.total_copies += copies.length
    group.titles.push({ ...book, total_copies: copies.length, copies })
    groups.set(key, group)
  }
  return c.json([...groups.values()].sort((a, b) => a.grade.localeCompare(b.grade) || a.subject.localeCompare(b.subject)))
})

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
  const [books, loans, copies] = await Promise.all([
    client.from('library_books').select('total_copies'),
    client.from('library_loans').select('status'),
    client.from('library_book_copies').select('status,current_holder_type'),
  ])
  if (copies.error) return jsonError(c, copies.error.message, 500)
  const copyRows = copies.data ?? []
  return c.json({
    total_titles: books.data?.length ?? 0,
    total_copies: copyRows.length || (books.data ?? []).reduce((n, b) => n + (b.total_copies ?? 0), 0),
    available_copies: copyRows.filter((x) => x.status === 'available').length,
    with_teachers: copyRows.filter((x) => x.current_holder_type === 'teacher').length,
    with_students: copyRows.filter((x) => x.current_holder_type === 'student').length,
    lost_copies: copyRows.filter((x) => x.status === 'lost').length,
    excluded_copies: copyRows.filter((x) => x.status === 'excluded').length,
    unreconciled_copies: copyRows.filter((x) => x.status === 'unreconciled').length,
    active_loans: (loans.data ?? []).filter((l) => l.status === 'borrowed' || l.status === 'overdue' || l.status === 'on_loan').length,
  })
})

libraryRoutes.post('/books', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const title = String(body.title ?? '').trim()
  const grade = String(body.grade ?? '').trim()
  const subject = String(body.subject ?? '').trim()
  const count = Number(body.total_copies ?? 1)
  if (!title) return c.json({ detail: 'Book title is required.' }, 400)
  if (!grade || !subject) return c.json({ detail: 'Grade and subject are required for every catalogue title.' }, 400)
  if (!Number.isSafeInteger(count) || count < 1 || count > 5000) {
    return c.json({ detail: 'total_copies must be a whole number between 1 and 5,000.' }, 400)
  }
  const payload = { ...body, title, grade, subject, total_copies: count, available_copies: count }
  const { data, error: insertError } = await db().from('library_books').insert(payload).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  const width = Math.max(2, String(count).length)
  const copies = Array.from({ length: count }, (_, i) => ({
    book_id: data.id,
    copy_number: String(i + 1).padStart(width, '0') + '/' + String(count).padStart(width, '0'),
  }))
  const { error: copyError } = await db().from('library_book_copies').insert(copies)
  if (copyError) {
    await db().from('library_books').delete().eq('id', data.id)
    return jsonError(c, 'Book and copy register could not be created: ' + copyError.message, 500)
  }
  return c.json(data, 201)
})

libraryRoutes.get('/books/:bookId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const bookId = c.req.param('bookId')
  const [{ data }, { data: loans }, { data: copies }] = await Promise.all([
    client.from('library_books').select('*').eq('id', bookId).maybeSingle(),
    client.from('library_loans').select('*').eq('book_id', bookId).order('created_at', { ascending: false }),
    client.from('library_book_copies').select('*').eq('book_id', bookId).order('copy_number'),
  ])
  if (!data) return c.json({ detail: 'Book not found.' }, 404)
  return c.json({ ...data, loans: loans ?? [], copies: copies ?? [] })
})

libraryRoutes.patch('/books/:bookId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('library_books').update(body).eq('id', c.req.param('bookId')).select().maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

libraryRoutes.delete('/books/:bookId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { error: deleteError } = await db().from('library_books').delete().eq('id', c.req.param('bookId'))
  if (deleteError) return jsonError(c, deleteError.message, 400)
  return c.body(null, 204)
})

// ── Physical copy register and chain-of-custody ────────────────────────────
libraryRoutes.get('/copies', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  let query = db().from('library_book_copies').select('*, book:library_books(id,title,author,isbn)').order('copy_number')
  const bookId = c.req.query('book_id')
  const holderType = c.req.query('holder_type')
  const holderId = c.req.query('holder_id')
  const status = c.req.query('status')
  if (bookId) query = query.eq('book_id', bookId)
  if (holderType) query = query.eq('current_holder_type', holderType)
  if (holderId) query = query.eq('current_holder_id', holderId)
  if (status) query = query.eq('status', status)
  const { data, error: queryError } = await query
  if (queryError) return jsonError(c, queryError.message, 500)
  return c.json(data ?? [])
})

libraryRoutes.get('/copies/:copyId/movements', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data, error: queryError } = await db().from('library_copy_movements')
    .select('*').eq('copy_id', c.req.param('copyId')).order('performed_at', { ascending: false })
  if (queryError) return jsonError(c, queryError.message, 500)
  return c.json(data ?? [])
})

libraryRoutes.post('/copies/:copyId/movements', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action ?? '')
  const condition = String(body.condition ?? 'good')
  if (!movementActions.has(action)) return c.json({ detail: 'Unsupported movement action.' }, 400)
  if (!copyConditions.has(condition)) return c.json({ detail: 'Condition must be good, damaged, or lost.' }, 400)

  const toHolderId = body.to_holder_id == null || body.to_holder_id === '' ? null : Number(body.to_holder_id)
  if (toHolderId !== null && (!Number.isSafeInteger(toHolderId) || toHolderId <= 0)) {
    return c.json({ detail: 'to_holder_id must be a positive integer.' }, 400)
  }
  const toHolderName = body.to_holder_name == null ? null : String(body.to_holder_name).trim()
  const reconcileHolderType = body.to_holder_type == null ? null : String(body.to_holder_type)
  if (['issue_to_teacher', 'issue_to_student', 'student_return_to_teacher'].includes(action)
      && (!toHolderId || !toHolderName)) {
    return c.json({ detail: 'A valid receiving holder ID and name are required for this action.' }, 400)
  }
  if (action === 'reconcile_copy' && !['library', 'teacher'].includes(reconcileHolderType ?? '')) {
    return c.json({ detail: 'Physically verify the copy at the library or with its responsible teacher.' }, 400)
  }
  if (action === 'reconcile_copy' && reconcileHolderType !== 'library' && (!toHolderId || !toHolderName)) {
    return c.json({ detail: 'A verified teacher ID and name are required when the copy is with a teacher.' }, 400)
  }
  const dueDate = body.due_date == null || body.due_date === '' ? null : String(body.due_date)
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return c.json({ detail: 'due_date must use YYYY-MM-DD format.' }, 400)
  }

  if (action === 'exclude_before_issue' || action === 'restore_excluded_copy') {
    const reason = body.notes == null ? '' : String(body.notes).trim()
    if (!reason) return c.json({ detail: 'A reason is required for pre-issue exclusion or restoration.' }, 400)
    const { data, error: exclusionError } = await db().rpc('set_library_copy_preissue_exclusion', {
      p_copy_id: c.req.param('copyId'),
      p_action: action,
      p_reason: reason,
      p_performed_by: actorId(user),
    })
    if (exclusionError) {
      const status = exclusionError.code === 'P0002' ? 404
        : exclusionError.code === '23514' ? 409
        : exclusionError.code === '22023' ? 400 : 500
      return jsonError(c, exclusionError.message, status)
    }
    return c.json(data)
  }

  const { data, error: movementError } = await db().rpc('move_library_book_copy', {
    p_copy_id: c.req.param('copyId'),
    p_action: action,
    p_to_holder_id: toHolderId,
    p_to_holder_name: toHolderName,
    p_condition: condition,
    p_due_date: dueDate,
    p_notes: body.notes == null ? null : String(body.notes),
    p_performed_by: actorId(user),
    p_reconcile_holder_type: reconcileHolderType,
  })
  if (movementError) {
    const status = movementError.code === 'P0002' ? 404
      : movementError.code === '23514' ? 409
      : movementError.code === '22023' ? 400 : 500
    return jsonError(c, movementError.message, status)
  }
  return c.json(data)
})

// Teacher → grade → subject → title report. All Teachers aggregates accountable copies across teachers.
libraryRoutes.get('/teacher-inventory-summary', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const teacherId = c.req.query('teacher_id')
  let custodyQuery = db().from('library_teacher_accountability').select('*').order('accountable_teacher_name').order('copy_number')
  if (teacherId && teacherId !== 'all') custodyQuery = custodyQuery.eq('accountable_teacher_id', teacherId)
  const { data: custodyRows, error: custodyError } = await custodyQuery
  if (custodyError) return jsonError(c, custodyError.message, 500)
  const rows = custodyRows ?? []
  const bookIds = [...new Set(rows.map(row => row.book_id))]
  const { data: bookRows, error: booksError } = bookIds.length ? await db().from('library_books').select('id,title,grade,subject').in('id', bookIds) : { data: [], error: null }
  if (booksError) return jsonError(c, booksError.message, 500)
  const books = new Map((bookRows ?? []).map(book => [book.id, book]))
  const teachers = new Map()
  const addCopy = (key, id, name, row) => {
    const book = books.get(row.book_id)
    if (!book) return
    const teacher = teachers.get(key) ?? { teacher_id: id, teacher_name: name, groups: new Map() }
    const grade = book.grade || 'Unassigned', subject = book.subject || 'Unassigned'
    const groupKey = grade + String.fromCharCode(0) + subject
    const group = teacher.groups.get(groupKey) ?? { grade, subject, total_copies: 0, titles: new Map() }
    const title = group.titles.get(row.book_id) ?? { book_id: row.book_id, title: book.title, total_copies: 0, copies: [] }
    title.total_copies++; group.total_copies++
    title.copies.push({ copy_id: row.copy_id, copy_number: row.copy_number, status: row.status, current_holder_type: row.current_holder_type, current_holder_name: row.current_holder_name })
    group.titles.set(row.book_id, title); teacher.groups.set(groupKey, group); teachers.set(key, teacher)
  }
  for (const row of rows) {
    if (row.accountable_teacher_id == null) continue
    addCopy(String(row.accountable_teacher_id), row.accountable_teacher_id, row.accountable_teacher_name ?? 'Teacher ' + row.accountable_teacher_id, row)
    if (!teacherId || teacherId === 'all') addCopy('all', null, 'All Teachers', row)
  }
  const serialize = teacher => ({
    teacher_id: teacher.teacher_id, teacher_name: teacher.teacher_name,
    total_copies: [...teacher.groups.values()].reduce((sum, group) => sum + group.total_copies, 0),
    grades: [...new Set([...teacher.groups.values()].map(group => group.grade))].sort().map(grade => ({
      grade, total_copies: [...teacher.groups.values()].filter(group => group.grade === grade).reduce((sum, group) => sum + group.total_copies, 0),
      subjects: [...teacher.groups.values()].filter(group => group.grade === grade).sort((a,b) => a.subject.localeCompare(b.subject)).map(group => ({
        subject: group.subject, total_copies: group.total_copies,
        titles: [...group.titles.values()].sort((a,b) => a.title.localeCompare(b.title)).map(title => ({ ...title, copies: title.copies.sort((a,b) => a.copy_number.localeCompare(b.copy_number)) }))
      }))
    }))
  })
  const output = [...teachers.values()].filter(teacher => !teacherId || teacherId === 'all' || teacher.teacher_id !== null).sort((a,b) => a.teacher_name.localeCompare(b.teacher_name)).map(serialize)
  return c.json({ teachers: output.filter(teacher => teacher.teacher_id !== null), all_teachers: teacherId && teacherId !== 'all' ? null : output.find(teacher => teacher.teacher_id === null) ?? null })
})
// Teacher accountability includes student-held copies until the teacher physically
// returns each numbered copy and the library records acceptance.
libraryRoutes.get('/teacher-accountability', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const teacherId = c.req.query('teacher_id')
  let query = db().from('library_teacher_accountability').select('*')
    .order('accountable_teacher_name').order('book_title').order('copy_number')
  if (teacherId) query = query.eq('accountable_teacher_id', teacherId)
  const { data, error: queryError } = await query
  if (queryError) return jsonError(c, queryError.message, 500)
  const rows: any[] = data ?? []
  const teachers = new Map<string, {
    teacher_id: number; teacher_name: string; total_accountable: number;
    with_students: number; retained_by_teacher: number; lost: number; copies: typeof rows
  }>()
  for (const copy of rows) {
    if (copy.accountable_teacher_id == null) continue
    const key = String(copy.accountable_teacher_id)
    const group = teachers.get(key) ?? {
      teacher_id: copy.accountable_teacher_id,
      teacher_name: copy.accountable_teacher_name ?? 'Teacher ' + key,
      total_accountable: 0, with_students: 0, retained_by_teacher: 0, lost: 0, copies: [],
    }
    group.total_accountable++
    if (copy.current_holder_type === 'student' && copy.status !== 'lost') group.with_students++
    else if (copy.current_holder_type === 'teacher' && copy.status !== 'lost') group.retained_by_teacher++
    if (copy.status === 'lost') group.lost++
    group.copies.push(copy)
    teachers.set(key, group)
  }
  return c.json({
    total_accountable: rows.length,
    with_students: rows.filter(x => x.current_holder_type === 'student' && x.status !== 'lost').length,
    retained_by_teachers: rows.filter(x => x.current_holder_type === 'teacher' && x.status !== 'lost').length,
    lost: rows.filter(x => x.status === 'lost').length,
    teachers: [...teachers.values()],
    copies: rows,
  })
})

// Exact, per-copy reconciliation; a copy stays assigned to its last recorded holder.
libraryRoutes.get('/reconciliation', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const teacherId = c.req.query('teacher_id')
  let query = client.from('library_book_copies')
    .select('id,book_id,copy_number,status,current_holder_type,current_holder_id,current_holder_name,condition,due_date,book:library_books(id,title)')
    .neq('current_holder_type', 'library')
    .order('book_id').order('copy_number')
  if (teacherId) {
    query = query.eq('current_holder_type', 'teacher').eq('current_holder_id', teacherId)
  }
  const { data, error: queryError } = await query
  if (queryError) return jsonError(c, queryError.message, 500)
  const outstanding: any[] = data ?? []
  const grouped = new Map<string, { holder_type: string; holder_id: number | null; holder_name: string | null; copies: typeof outstanding }>()
  for (const copy of outstanding) {
    const key = copy.current_holder_type + ':' + String(copy.current_holder_id)
    const group = grouped.get(key) ?? {
      holder_type: copy.current_holder_type,
      holder_id: copy.current_holder_id,
      holder_name: copy.current_holder_name,
      copies: [],
    }
    group.copies.push(copy)
    grouped.set(key, group)
  }
  return c.json({
    outstanding_count: outstanding.length,
    with_teachers: outstanding.filter((x) => x.current_holder_type === 'teacher').length,
    with_students: outstanding.filter((x) => x.current_holder_type === 'student').length,
    unreconciled_count: outstanding.filter((x) => x.status === 'unreconciled').length,
    lost_count: outstanding.filter((x) => x.status === 'lost').length,
    outstanding_copies: outstanding,
    by_holder: [...grouped.values()],
  })
})

// ── Legacy aggregate loans (kept for compatibility with existing clients) ──
libraryRoutes.get('/loans', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('library_loans').select('*').order('created_at', { ascending: false })
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

libraryRoutes.post('/loans/:loanId/return', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const loanId = c.req.param('loanId')
  const { data: loan } = await client.from('library_loans').select('*').eq('id', loanId).maybeSingle()
  if (!loan) return c.json({ detail: 'Loan not found.' }, 404)
  if (loan.status === 'returned') return c.json({ detail: 'Loan already returned.' }, 409)
  const { data, error: updateError } = await client.from('library_loans')
    .update({ status: 'returned', returned_date: new Date().toISOString().slice(0, 10) })
    .eq('id', loanId).select().single()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})
