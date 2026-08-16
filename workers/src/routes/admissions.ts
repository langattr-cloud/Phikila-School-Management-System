import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const admissionsRoutes = new Hono()

admissionsRoutes.get('/applications', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('admission_applications').select('*').order('created_at', { ascending: false })
  return c.json(data ?? [])
})

admissionsRoutes.get('/applications/stats', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('admission_applications').select('status')
  const counts: Record<string, number> = {}
  for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1
  return c.json({ counts, total: data?.length ?? 0 })
})

admissionsRoutes.post('/applications', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: insertError } = await db().from('admission_applications').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  return c.json(data, 201)
})

admissionsRoutes.get('/applications/:applicationId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('admission_applications').select('*').eq('id', c.req.param('applicationId')).maybeSingle()
  if (!data) return c.json({ detail: 'Application not found.' }, 404)
  return c.json(data)
})

admissionsRoutes.patch('/applications/:applicationId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('admission_applications')
    .update(body)
    .eq('id', c.req.param('applicationId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

/** Enroll an approved applicant → creates a student + enrollment record. */
admissionsRoutes.post('/applications/:applicationId/enroll', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const applicationId = c.req.param('applicationId')
  const { data: application } = await client
    .from('admission_applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle()
  if (!application) return c.json({ detail: 'Application not found.' }, 404)

  const { count } = await client.from('students').select('id', { count: 'exact' })
  const admissionNumber = `ADM-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { data: student, error: studentError } = await client
    .from('students')
    .insert({
      first_name: application.first_name,
      last_name: application.last_name,
      date_of_birth: application.date_of_birth ?? null,
      gender: application.gender ?? null,
      admission_number: admissionNumber,
    })
    .select()
    .single()
  if (studentError) return jsonError(c, studentError.message, 400)

  const { error: enrollmentError } = await client.from('enrollment_records').insert({
    student_id: student.id,
    level_id: application.level_id ?? null,
    stream_id: application.stream_id ?? null,
    academic_year_id: application.academic_year_id ?? null,
    enrollment_date: new Date().toISOString().slice(0, 10),
    status: 'enrolled',
  })
  if (enrollmentError) return jsonError(c, enrollmentError.message, 400)

  await client.from('admission_applications').update({ status: 'enrolled' }).eq('id', applicationId)
  return c.json({ student, status: 'enrolled' }, 201)
})

admissionsRoutes.get('/enrollments', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('enrollment_records').select('*').order('enrollment_date', { ascending: false })
  return c.json(data ?? [])
})