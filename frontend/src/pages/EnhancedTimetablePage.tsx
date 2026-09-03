import { TimetablePage } from './TimetablePage'
import { TimeOffPopupLauncher } from '../components/TimeOffPopupLauncher'

/**
 * The whole-school timetable owns its existing grid, filters, and editing
 * structure. Time-off is layered on top as an independent popup so the
 * teacher/class timetable views are not changed.
 */
export function EnhancedTimetablePage() {
  return <><TimetablePage /><TimeOffPopupLauncher /></>
}
