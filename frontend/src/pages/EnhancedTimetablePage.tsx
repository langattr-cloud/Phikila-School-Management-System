import { TimetablePage } from './TimetablePage'

/**
 * Compatibility wrapper for the timetable page.
 * Batch printing is handled by TimetablePage so the selected scope and
 * selected entity remain the single source of truth for the rendered data.
 */
export function EnhancedTimetablePage() {
  return <TimetablePage />
}
