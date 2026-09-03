import { TimetablePage } from './TimetablePage'

/**
 * The whole-school timetable keeps its existing grid, filters, and editing
 * structure. No availability/time-off controls are rendered on this route.
 */
export function EnhancedTimetablePage() {
  return <TimetablePage />
}
