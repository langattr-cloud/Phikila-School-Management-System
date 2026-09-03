import { useState } from 'react'
import { TimeOffPopup } from './TimeOffPopup'

export function TimeOffPopupLauncher() {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="timeoff-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog"><span aria-hidden="true">◷</span> Time off</button>
    <TimeOffPopup open={open} onClose={() => setOpen(false)} />
    <style>{`.timeoff-launcher{position:fixed;right:22px;bottom:22px;z-index:1100;display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;font-size:13px;font-weight:700;box-shadow:0 8px 24px rgba(15,23,42,.16);cursor:pointer}.timeoff-launcher:hover{border-color:#2563eb;color:#1d4ed8;background:#f8fbff}.timeoff-launcher span{font-size:16px}@media(max-width:760px){.timeoff-launcher{right:12px;bottom:12px}}`}</style>
  </>
}
