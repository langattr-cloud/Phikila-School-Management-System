import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const academicTransitionRoutes = new Hono()

type Action = 'promote' | 'repeat' | 'graduate' | 'transfer' | 'review'

function numericGrade(value: unknown): number | null {
  const match = String(value ?? '').match(/\d+/)
  return match ? Number(match[0]) : null
}

async function buildPreview(fromYearId: number, toYearId: number) {
  const client = db()
  const [{ data: fromYear }, { data: toYear }] = await Promise.all([
    client.from('academic_years').select('*').eq('id', fromYearId).maybeSingle(),
    client.from('academic_years').select('*').eq('id', toYearId).maybeSingle(),
  ])
  if (!fromYear || !toYear) throw new Error('Both academic years must exist.')
  if (fromYearId === toYearId) throw new Error('The source and destination academic years must be different.')

  const [{ data: enrollments }, { data: grades }, { data: streams }, { data: classes }, { data: students }] = await Promise.all([
    client.from('student_enrollments').select('*').eq('academic_year_id', fromYearId).eq('status', 'active'),
    client.from('grades').select('*').eq('status', true).order('display_order'),
    client.from('streams').select('*').eq('academic_year_id', toYearId).eq('status', 'ACTIVE').order('id'),
    client.from('school_classes').select('*').eq('academic_year_id', toYearId).eq('status', 'active').order('id'),
    client.from('students_v2').select('id,admission_number,first_name,middle_name,last_name,preferred_name,status'),
  ])
  if (!enrollments) return { from_year: fromYear, to_year: toYear, students: [] }

  const studentMap = new Map((students ?? []).map((s: any) => [s.id, s]))
  const gradeMap = new Map((grades ?? []).map((g: any) => [g.id, g]))
  const gradesByNumber = new Map<number, any>()
  for (const g of grades ?? []) {
    const n = numericGrade(g.name) ?? numericGrade(g.code)
    if (n != null) gradesByNumber.set(n, g)
  }
  const streamMap = new Map((streams ?? []).map((s: any) => [s.id, s]))
  const targetStreamsByGrade = new Map<number, any[]>()
  for (const s of streams ?? []) {
    const list = targetStreamsByGrade.get(s.grade_id) ?? []
    list.push(s)
    targetStreamsByGrade.set(s.grade_id, list)
  }

  const items = enrollments.map((e: any) => {
    const student = studentMap.get(e.student_id)
    const currentGrade = gradeMap.get(e.grade_id)
    const currentStream = streamMap.get(e.stream_id)
    const currentNumber = numericGrade(currentGrade?.name) ?? numericGrade(currentGrade?.code)
    const targetGrade = currentNumber != null ? gradesByNumber.get(currentNumber + 1) : null
    const targetStreams = targetGrade ? (targetStreamsByGrade.get(targetGrade.id) ?? []) : []
    const sameNameStream = currentStream ? targetStreams.find((s: any) => String(s.name).toLowerCase() === String(currentStream.name).toLowerCase()) : null
    const action: Action = targetGrade ? 'promote' : (currentNumber != null && currentNumber >= 12 ? 'graduate' : 'review')
    const targetStream = sameNameStream ?? (targetStreams.length === 1 ? targetStreams[0] : null)
    const targetClass = targetGrade ? (classes ?? []).find((c: any) => c.grade && numericGrade(c.grade) === (numericGrade(targetGrade.name) ?? numericGrade(targetGrade.code)) && (!targetStream || c.stream_id === targetStream.id)) : null
    return {
      student_id: e.student_id,
      admission_number: student?.admission_number ?? '',
      student_name: [student?.first_name, student?.middle_name, student?.last_name].filter(Boolean).join(' '),
      student_status: student?.status ?? null,
      enrollment_id: e.id,
      current_level_id: e.level_id,
      current_grade_id: e.grade_id ?? null,
      current_grade_name: currentGrade?.name ?? null,
      current_stream_id: e.stream_id ?? null,
      current_stream_name: currentStream?.name ?? null,
      action,
      target_level_id: targetGrade?.level_id ?? null,
      target_grade_id: targetGrade?.id ?? null,
      target_grade_name: targetGrade?.name ?? null,
      target_stream_id: targetStream?.id ?? null,
      target_stream_name: targetStream?.name ?? null,
      target_school_class_id: targetClass?.id ?? null,
      target_options: targetStreams.map((s: any) => ({ id: s.id, name: s.name, code: s.code })),
    }
  })

  return { from_year: fromYear, to_year: toYear, students: items }
}

academicTransitionRoutes.get('/preview', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const fromYearId = Number(c.req.query('from_year_id'))
  const toYearId = Number(c.req.query('to_year_id'))
  if (!fromYearId || !toYearId) return c.json({ detail: 'Select both source and destination academic years.' }, 400)
  try { return c.json(await buildPreview(fromYearId, toYearId)) }
  catch (e) { return jsonError(c, e instanceof Error ? e.message : 'Could not prepare the academic year transition.', 400) }
})

academicTransitionRoutes.post('/', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const fromYearId = Number(body.from_year_id)
  const toYearId = Number(body.to_year_id)
  const decisions = Array.isArray(body.decisions) ? body.decisions : []
  if (!fromYearId || !toYearId || fromYearId === toYearId) return c.json({ detail: 'Select two different academic years.' }, 400)

  const client = db()
  const preview = await buildPreview(fromYearId, toYearId)
  const allowed = new Map(preview.students.map((x: any) => [x.student_id, x]))
  const existingResult = await client.from('student_enrollments').select('student_id').eq('academic_year_id', toYearId)
  if (existingResult.error) return jsonError(c, existingResult.error.message, 400)
  const existing = new Set((existingResult.data ?? []).map((x: any) => x.student_id))

  const inserted: any[] = []
  const skipped: any[] = []
  for (const decision of decisions) {
    const item = allowed.get(Number(decision.student_id))
    if (!item) { skipped.push({ student_id: decision.student_id, reason: 'Student is not in the source-year active enrollment.' }); continue }
    if (existing.has(item.student_id)) { skipped.push({ student_id: item.student_id, reason: 'Student already has an enrollment in the destination year.' }); continue }

    const action: Action = ['promote','repeat','graduate','transfer','review'].includes(decision.action) ? decision.action : item.action
    if (action === 'graduate' || action === 'transfer' || action === 'review') {
      await client.from('student_enrollments').update({ status: action === 'graduate' ? 'graduated' : action === 'transfer' ? 'transferred' : 'review' }).eq('id', item.enrollment_id)
      skipped.push({ student_id: item.student_id, action, reason: 'No destination enrollment created.' })
      continue
    }

    const gradeId = Number(decision.target_grade_id || item.target_grade_id)
    const streamId = decision.target_stream_id == null ? item.target_stream_id : Number(decision.target_stream_id)
    const grade = (await client.from('grades').select('id,level_id').eq('id', gradeId).maybeSingle()).data
    if (!grade) { skipped.push({ student_id: item.student_id, reason: 'Target grade does not exist.' }); continue }

    let schoolClassId = decision.target_school_class_id == null ? item.target_school_class_id : Number(decision.target_school_class_id)
    if (schoolClassId) {
      const cls = (await client.from('school_classes').select('id').eq('id', schoolClassId).eq('academic_year_id', toYearId).maybeSingle()).data
      if (!cls) schoolClassId = null
    }

    const { data: newEnrollment, error: insertError } = await client.from('student_enrollments').insert({
      student_id: item.student_id,
      academic_year_id: toYearId,
      level_id: Number(decision.target_level_id || grade.level_id),
      grade_id: gradeId,
      stream_id: streamId || null,
      school_class_id: schoolClassId || null,
      class_id: schoolClassId || null,
      status: 'active',
      enrollment_date: body.enrollment_date || new Date().toISOString().slice(0, 10),
    }).select().single()
    if (insertError) { skipped.push({ student_id: item.student_id, reason: insertError.message }); continue }

    await client.from('student_enrollments').update({ status: action === 'repeat' ? 'completed' : 'promoted' }).eq('id', item.enrollment_id)
    existing.add(item.student_id)
    inserted.push(newEnrollment)
  }

  const { error: oldYearError } = await client.from('academic_years').update({ is_current: false }).eq('id', fromYearId)
  if (oldYearError) return jsonError(c, oldYearError.message, 400)
  const { error: newYearError } = await client.from('academic_years').update({ is_current: true }).eq('id', toYearId)
  if (newYearError) return jsonError(c, newYearError.message, 400)

  return c.json({ from_year_id: fromYearId, to_year_id: toYearId, transitioned: inserted.length, skipped, enrollments: inserted })
})
