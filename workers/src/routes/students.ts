import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const studentsRoutes = new Hono()

studentsRoutes.get('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('students').select('*').order('id')
  return c.json(data ?? [])
})

studentsRoutes.post('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()

  // Admission numbers are entered by the school and must be unique.
  const admissionNumber = String(body.admission_number ?? '').trim()
  if (!admissionNumber) return jsonError(c, 'Admission number is required.', 422)

  const { data: duplicate } = await client.from('students_v2').select('id').eq('admission_number', admissionNumber).maybeSingle()
  if (duplicate) return jsonError(c, 'Admission number already exists.', 409)

  const academicYearId = Number(body.academic_year_id)
  const levelId = Number(body.level_id)
  const gradeId = Number(body.grade_id)
  const streamId = body.stream_id == null || body.stream_id === '' ? null : Number(body.stream_id)
  if (!Number.isInteger(academicYearId) || !Number.isInteger(levelId) || !Number.isInteger(gradeId)) {
    console.error('Student admission validation: missing academic placement', { academicYearId: body.academic_year_id, levelId: body.level_id, gradeId: body.grade_id, streamId: body.stream_id })
    return jsonError(c, 'Academic year, level and grade are required.', 422)
  }

  const { data: grade } = await client.from('grades').select('id,level_id,status').eq('id', gradeId).eq('level_id', levelId).maybeSingle()
  if (!grade || grade.status === false) {
    console.error('Student admission validation: grade unavailable', { academicYearId, levelId, gradeId, grade })
    return jsonError(c, 'Selected grade is not available for this level.', 422)
  }

  if (streamId != null) {
    const { data: stream } = await client.from('streams').select('id,grade_id,level_id,academic_year_id,status').eq('id', streamId).maybeSingle()
    if (!Number.isInteger(streamId) || !stream || Number(stream.grade_id) !== gradeId || Number(stream.level_id) !== levelId || Number(stream.academic_year_id) !== academicYearId || stream.status !== 'ACTIVE') {
      console.error('Student admission validation: invalid stream', { academicYearId, levelId, gradeId, streamId, stream })
      return jsonError(c, 'Selected stream is not available for this grade and academic year.', 422)
    }
  }

  const { data: school } = await client.from('school_info').select('id').order('id').limit(1).maybeSingle()
  if (!school) {
    console.error('Student admission validation: school configuration missing')
    return jsonError(c, 'School configuration is not available.', 422)
  }

  const legacyPayload = {
    admission_number: admissionNumber,
    first_name: String(body.first_name ?? '').trim(),
    middle_name: body.middle_name || null,
    last_name: String(body.last_name ?? '').trim(),
    gender: body.gender || null,
    date_of_birth: body.date_of_birth || null,
    nationality: body.nationality || null,
    birth_cert_or_id: body.national_id || null,
    contact_info: body.phone || body.email || body.address || null,
    photo_url: body.photo_url || null,
    status: body.status || 'active',
  }

  const { data, error: insertError } = await client.from('students').insert(legacyPayload).select().single()
  if (insertError) {
    if (String(insertError.message).toLowerCase().includes('admission_number')) return jsonError(c, 'Admission number already exists.', 409)
    return jsonError(c, insertError.message, 400)
  }

  const { data: v2Student, error: v2Error } = await client.from('students_v2').insert({
    school_id: school.id,
    admission_number: admissionNumber,
    first_name: legacyPayload.first_name,
    middle_name: legacyPayload.middle_name,
    last_name: legacyPayload.last_name,
    preferred_name: body.preferred_name || null,
    date_of_birth: legacyPayload.date_of_birth,
    gender: legacyPayload.gender,
    email: body.email || null,
    phone: body.phone || null,
    address: body.address || null,
    nationality: legacyPayload.nationality,
    national_id: legacyPayload.birth_cert_or_id,
    photo_url: legacyPayload.photo_url,
    admission_date: body.admission_date || null,
    status: body.status || 'active',
  }).select().single()

  if (v2Error || !v2Student) {
    await client.from('students').delete().eq('id', data.id)
    if (String(v2Error?.message ?? '').toLowerCase().includes('admission')) return jsonError(c, 'Admission number already exists.', 409)
    return jsonError(c, v2Error?.message ?? 'Could not create student record.', 400)
  }

  let schoolClassId: number | null = body.class_id == null || body.class_id === '' ? null : Number(body.class_id)
  if (schoolClassId == null && streamId != null) {
    const { data: streamClass } = await client.from('school_classes').select('id').eq('academic_year_id', academicYearId).eq('stream_id', streamId).eq('status', 'active').limit(1).maybeSingle()
    schoolClassId = streamClass?.id ?? null
  }

  const { error: enrollmentError } = await client.from('student_enrollments').insert({
    school_id: school.id,
    student_id: v2Student.id,
    academic_year_id: academicYearId,
    level_id: levelId,
    grade_id: gradeId,
    stream_id: streamId,
    class_id: schoolClassId,
    school_class_id: schoolClassId,
    status: 'enrolled',
    enrollment_date: body.admission_date || new Date().toISOString().slice(0, 10),
  })

  if (enrollmentError) {
    await client.from('students_v2').delete().eq('id', v2Student.id)
    await client.from('students').delete().eq('id', data.id)
    return jsonError(c, enrollmentError.message, 400)
  }

  const guardians = Array.isArray(body.guardians) ? body.guardians : []
  if (guardians.length > 0) {
    const rows = guardians.map((g: Record<string, unknown>) => ({ student_id: data.id, ...g }))
    const { error: guardianError } = await client.from('guardians').insert(rows)
    if (guardianError) return jsonError(c, guardianError.message, 400)
  }

  return c.json({ ...data, preferred_name: body.preferred_name || null, academic_year_id: academicYearId, level_id: levelId, grade_id: gradeId, stream_id: streamId }, 201)
})

studentsRoutes.get('/:studentId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const studentId = c.req.param('studentId')
  const { data } = await client.from('students').select('*').eq('id', studentId).maybeSingle()
  if (!data) return c.json({ detail: 'Student not found.' }, 404)
  const { data: guardians } = await client.from('guardians').select('*').eq('student_id', studentId)
  return c.json({ ...data, guardians: guardians ?? [] })
})

studentsRoutes.patch('/:studentId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('students')
    .update(body)
    .eq('id', c.req.param('studentId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

studentsRoutes.delete('/:studentId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('students').delete().eq('id', c.req.param('studentId'))
  return c.body(null, 204)
})