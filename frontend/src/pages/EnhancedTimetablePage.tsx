import { TimetablePage } from './TimetablePage'

/**
 * The timetable page owns its layout, filters, view state, and grid structure.
 * Keep this route as a thin compatibility wrapper so the old floating
 * grade/teacher controls cannot appear above the page header.
 */
export function EnhancedTimetablePage() {
  return <TimetablePage />
}
