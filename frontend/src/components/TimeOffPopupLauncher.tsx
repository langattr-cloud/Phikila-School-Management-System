import { useState } from 'react'
import { TimeOffPopup } from './TimeOffPopup'

export function TimeOffPopupLauncher() {
  const [open, setOpen] = useState(false)

  return <>
    <aside className="timeoff-outlook" aria-label="Whole-school time-off outlook">
      <div className="timeoff-outlook__copy">
        <span className="timeoff-outlook__eyebrow">Whole-school outlook</span>
        <strong>Availability & time off</strong>
        <small>Teachers · Learning areas · Classes</small>
      </div>
      <button type="button" className="timeoff-outlook__button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span aria-hidden="true">◷</span>
        <span>Manage time off</span>
      </button>
    </aside>
    <TimeOffPopup open={open} onClose={() => setOpen(false)} />
    <style>{`.timeoff-outlook{position:fixed;right:22px;bottom:22px;z-index:1100;display:flex;align-items:center;gap:14px;max-width:min(430px,calc(100vw - 32px));padding:12px 13px 12px 16px;border:1px solid #bfdbfe;border-radius:14px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.18)}.timeoff-outlook__copy{display:flex;min-width:0;flex-direction:column;gap:2px}.timeoff-outlook__eyebrow{color:#2563eb;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.timeoff-outlook strong{color:#0f172a;font-size:13px;line-height:1.2}.timeoff-outlook small{color:#64748b;font-size:11px;white-space:nowrap}.timeoff-outlook__button{display:inline-flex;align-items:center;gap:7px;flex:none;border:0;border-radius:9px;padding:9px 12px;background:#2563eb;color:#fff;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 5px 14px rgba(37,99,235,.25)}.timeoff-outlook__button:hover{background:#1d4ed8}.timeoff-outlook__button:focus-visible{outline:3px solid rgba(37,99,235,.25);outline-offset:2px}.timeoff-outlook__button span:first-child{font-size:16px}@media(max-width:760px){.timeoff-outlook{right:12px;bottom:12px;left:12px;max-width:none}.timeoff-outlook__copy{flex:1}.timeoff-outlook small{white-space:normal}.timeoff-outlook__button{padding:9px 10px}}@media(max-width:520px){.timeoff-outlook{align-items:stretch;flex-direction:column;gap:9px}.timeoff-outlook__button{justify-content:center}}`}</style>
  </>
}
