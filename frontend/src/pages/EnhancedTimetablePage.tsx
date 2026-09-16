import { TimetablePage } from './TimetablePage'
import { TimetablePrintSetLauncher } from '../components/TimetablePrintSetLauncher'

/**
 * Timetable page with the aSc-style batch print-set launcher.
 * The launcher drives the existing timetable filters and combines each
 * selected timetable into one browser print job.
 */
export function EnhancedTimetablePage() {
  return <><TimetablePage /><div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 1100 }}><TimetablePrintSetLauncher /></div></>
}
