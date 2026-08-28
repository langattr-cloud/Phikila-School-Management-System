import type { Lesson, SchoolClass } from '../lib/scheduling'

export type TimetableViewKind = 'whole-school' | 'class' | 'teacher' | 'generic'

export function timetableClassLabel(item: SchoolClass): string {
  const grade = item.grade?.trim() ?? ''
  const stream = (item.stream ?? item.academic_stream)?.trim() ?? ''
  if (grade && stream) {
    const normalGrade = grade.replace(/^grade\s*/i, '')
    const normalStream = stream.replace(/^grade\s*/i, '')
    if (normalStream === normalGrade || normalStream.startsWith(`${normalGrade}`)) return normalStream
    return `${normalGrade}${normalStream}`
  }
  if (grade) return grade.replace(/^grade\s*/i, '')
  return stream || item.code?.trim() || item.name.trim()
}

export function inferTimetableView(
  lessons: Lesson[],
  secondary?: (lesson: Lesson) => string | null | undefined,
): TimetableViewKind {
  if (!lessons.length) return 'whole-school'
  if (secondary && lessons.every((lesson) => secondary(lesson) == null)) return 'class'
  const teacherIds = new Set(lessons.map((lesson) => lesson.teacher_id).filter((id): id is number => id != null))
  if (teacherIds.size === 1) return 'teacher'
  return 'whole-school'
}
