import { TimetableMainToolbar } from '../components/TimetableMainToolbar'
import { TimetablePage } from './TimetablePage'

/**
 * Timetable page with an aSc-style main toolbar.
 * Print setup remains backed by the existing full Print Set dialog.
 */
export function EnhancedTimetablePage() {
  return <div className="timetable-enhanced-page">
    <TimetableMainToolbar />
    <TimetablePage />
    <style>{`\n      @media (min-width: 701px) { .timetable-controls-card .timetable-controls-row:first-child .toolbar__group { display:none; } }\n      .timetable-enhanced-page > .timetable-main-toolbar { margin-top:0; }\n      @media print { .timetable-main-toolbar { display:none!important; } }\n    `}</style>
  </div>
}
