import { TimetableMainToolbar } from '../components/TimetableMainToolbar'
import { TimetablePage } from './TimetablePage'

/**
 * Whole-school timetable shell with the seven-action main toolbar.
 * The existing timetable functionality remains underneath the reorganized layout.
 */
export function EnhancedTimetablePage() {
  return <div className="timetable-enhanced-page">
    <TimetableMainToolbar />
    <TimetablePage />
    <style>{`
      .timetable-enhanced-page { background:#f8fafc; }
      .timetable-enhanced-page > .timetable-main-toolbar { margin:0 0 24px; }
      .timetable-enhanced-page .timetable-page-shell { gap:24px; }

      /* Keep the page header directly below the main toolbar. */
      .timetable-enhanced-page .page-header { margin:0; }
      .timetable-enhanced-page .page-header__title { font-size:32px; font-weight:800; color:#111; }
      .timetable-enhanced-page .page-header__description { color:#6b7280; }
      .timetable-enhanced-page .page-header__actions .button:not(.timetable-generate-button) { display:none; }

      /* One filter card: View on the left, zoom on the right. */
      .timetable-enhanced-page .timetable-controls-card {
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        align-items:center;
        gap:0;
        padding:16px;
        margin:0;
        background:#fff;
        border:1px solid #e5e7eb;
        border-radius:12px;
        box-shadow:0 1px 2px rgba(0,0,0,.04);
      }
      .timetable-enhanced-page .timetable-controls-row { display:contents; }
      .timetable-enhanced-page .timetable-controls-card .timetable-control-group:nth-child(2),
      .timetable-enhanced-page .timetable-controls-card > .timetable-controls-row:first-child > .toolbar__group { display:none!important; }
      .timetable-enhanced-page .timetable-controls-card .timetable-control-group:first-child { grid-column:1; }
      .timetable-enhanced-page .timetable-controls-row--secondary .timetable-control-group { grid-column:1; }
      .timetable-enhanced-page .timetable-controls-card .toolbar__spacer { display:none; }
      .timetable-enhanced-page .timetable-controls-row--secondary > .toolbar__group { grid-column:2; grid-row:1; }
      .timetable-enhanced-page .timetable-controls-row--secondary { display:contents; }
      .timetable-enhanced-page .timetable-controls-card .timetable-control-group:first-child { display:flex; align-items:center; gap:10px; }
      .timetable-enhanced-page .timetable-controls-card .field__label { margin:0; font-size:14px; font-weight:600; color:#111; }
      .timetable-enhanced-page .timetable-controls-card .input--select { min-width:150px; }
      .timetable-enhanced-page .timetable-controls-card .toolbar__group { display:flex; align-items:center; gap:0; }
      .timetable-enhanced-page .timetable-controls-card .toolbar__group .button--ghost:last-child { margin-left:10px; }
      .timetable-enhanced-page .timetable-controls-card .toolbar__zoom-label { min-width:54px; text-align:center; font-weight:600; color:#374151; }

      /* The published-state message becomes the requested light-blue info box. */
      .timetable-enhanced-page .timetable-controls-card + .alert.alert--info {
        display:flex;
        align-items:center;
        gap:10px;
        margin:0;
        padding:13px 16px;
        background:#eff6ff;
        border:1px solid #bfdbfe;
        border-radius:10px;
        color:#1e40af;
      }
      .timetable-enhanced-page .timetable-controls-card + .alert.alert--info .alert__title { display:none; }
      .timetable-enhanced-page .timetable-controls-card + .alert.alert--info::before { content:'i'; display:grid; place-items:center; width:22px; height:22px; flex:0 0 22px; border:1.5px solid currentColor; border-radius:50%; font-weight:800; }
      .timetable-enhanced-page .timetable-controls-card + .alert.alert--info .alert__message { font-size:0; }
      .timetable-enhanced-page .timetable-controls-card + .alert.alert--info .alert__message::after { content:'This timetable is published and read-only. Changes require creating a new version.'; font-size:14px; }

      @media print { .timetable-main-toolbar { display:none!important; } }
      @media (max-width:700px) {
        .timetable-enhanced-page .timetable-controls-card { grid-template-columns:1fr; gap:12px; }
        .timetable-enhanced-page .timetable-controls-row--secondary > .toolbar__group { grid-column:1; grid-row:2; justify-content:flex-end; }
        .timetable-enhanced-page .page-header__title { font-size:26px; }
      }
    `}</style>
  </div>
}
