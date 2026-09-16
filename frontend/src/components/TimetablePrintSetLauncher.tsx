import { useEffect, useState } from 'react'

type Report = 'class' | 'teacher' | 'room' | 'subject'
type Option = { value: string; label: string }
type Captured = { title: string; html: string }

function readTargetOptions(): Option[] {
  const target = document.getElementById('tt-target') as HTMLSelectElement | null
  if (!target) return []
  return Array.from(target.options)
    .filter((option) => option.value)
    .map((option) => ({ value: option.value, label: option.text }))
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char] ?? char))
}

function printCss(landscape: boolean) {
  return `
    @page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: white; color: #111; font-family: Arial, Helvetica, sans-serif; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .print-page { display: grid; gap: 6mm; width: 100%; min-height: calc(100vh - 16mm); break-after: page; page-break-after: always; }
    .print-page:last-child { break-after: auto; page-break-after: auto; }
    .cols-1 { grid-template-columns: 1fr; }
    .cols-2 { grid-template-columns: 1fr 1fr; align-items: start; }
    .cols-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; align-items: stretch; }
    .sheet { min-width: 0; overflow: hidden; border: .3mm solid #999; border-radius: 1mm; padding: 3mm; break-inside: avoid; page-break-inside: avoid; }
    .sheet header { margin: 0 0 2.5mm; padding: 0 0 2mm; border-bottom: .3mm solid #111; text-align: center; }
    .sheet h1 { margin: 0; font-size: 5mm; line-height: 1.05; font-weight: 800; }
    .sheet p { margin: 1mm 0 0; font-size: 2.4mm; line-height: 1.1; color: #555; }
    .grid-wrap { width: 100%; overflow: hidden; }
    .timetable__whole-school-grid, .timetable__time-grid { width: 100% !important; max-width: 100% !important; transform: none !important; zoom: 1 !important; }
    .timetable__whole-school-grid { min-width: 0 !important; }
    .timetable__time-grid { min-width: 0 !important; }
    .timetable-controls-card, .unassigned, .alert, .page-header, .workspace__panel { display: none !important; }
    button, input, select { display: none !important; }
  `
}

export function TimetablePrintSetLauncher() {
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<Report>('class')
  const [options, setOptions] = useState<Option[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [perPage, setPerPage] = useState<1 | 2 | 4>(1)
  const [landscape, setLandscape] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    if (!scope) return
    scope.value = report
    scope.dispatchEvent(new Event('change', { bubbles: true }))
    const timer = window.setTimeout(() => setOptions(readTargetOptions()), 220)
    return () => window.clearTimeout(timer)
  }, [open, report])

  function wait(ms = 220) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
  }

  async function capture(id: string): Promise<Captured | null> {
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    if (!scope || !target) return null

    target.value = id
    target.dispatchEvent(new Event('change', { bubbles: true }))
    await wait()

    const grid = document.querySelector('.timetable__whole-school-grid, .timetable__time-grid') as HTMLElement | null
    if (!grid) return null

    const heading = document.querySelector('.timetable-print-header h1')?.textContent?.trim()
      || target.options[target.selectedIndex]?.text
      || 'Timetable'
    return { title: heading, html: grid.outerHTML }
  }

  async function printSet() {
    if (busy || !options.length) return
    const ids = selected.length ? selected : options.map((option) => option.value)
    setBusy(true)

    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    const previousScope = scope?.value ?? 'all'
    const previousTarget = target?.value ?? ''

    try {
      const captured: Captured[] = []
      for (const id of ids) {
        const result = await capture(id)
        if (result) captured.push(result)
      }
      if (!captured.length) return

      const pages: string[] = []
      for (let index = 0; index < captured.length; index += perPage) {
        const chunk = captured.slice(index, index + perPage)
        pages.push(`<div class="print-page cols-${perPage}">${chunk.map((item) => `<section class="sheet"><header><h1>${escapeHtml(item.title)}</h1><p>Phikila School Management System · Timetable Print Set</p></header><div class="grid-wrap">${item.html}</div></section>`).join('')}</div>`)
      }

      const popup = window.open('', '_blank', 'noopener,noreferrer,width=1500,height=1100')
      if (!popup) return
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Timetable Print Set</title><style>${printCss(landscape)}</style></head><body>${pages.join('')}</body></html>`)
      popup.document.close()
      popup.focus()
      await wait(350)
      popup.print()
      setOpen(false)
    } finally {
      if (scope) {
        scope.value = previousScope
        scope.dispatchEvent(new Event('change', { bubbles: true }))
        await wait(120)
      }
      if (target && previousScope !== 'all') {
        target.value = previousTarget
        target.dispatchEvent(new Event('change', { bubbles: true }))
      }
      setBusy(false)
    }
  }

  if (!open) return <button type="button" className="button button--ghost button--sm" onClick={() => setOpen(true)}>Print set</button>

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false) }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="print-set-title" style={{ maxWidth: 720 }}>
      <div className="modal__head">
        <div><h2 id="print-set-title">Print set</h2><p className="form__note">Create one print job containing individual aSc-style timetable sheets.</p></div>
        <button type="button" className="icon-button icon-button--subtle" disabled={busy} onClick={() => setOpen(false)} aria-label="Close">×</button>
      </div>
      <div className="modal__body" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {(['class', 'teacher', 'room', 'subject'] as Report[]).map((item) => <button key={item} type="button" className={`button button--${report === item ? 'primary' : 'secondary'} button--sm`} onClick={() => { setReport(item); setSelected([]) }}>{item === 'class' ? 'Classes' : item === 'teacher' ? 'Teachers' : item === 'room' ? 'Rooms' : 'Subjects'}</button>)}
        </div>
        <div>
          <label className="field__label">Timetables</label>
          <p className="form__note">Select specific items, or select none to print every {report}.</p>
          <div style={{ maxHeight: 220, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, border: '1px solid var(--color-line,#ddd)', borderRadius: 8, padding: 10 }}>
            {options.map((option) => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={() => setSelected((current) => current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value])} /> {option.label}</label>)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="field__label">Timetables per page</label><select className="input input--select" value={perPage} onChange={(event) => setPerPage(Number(event.target.value) as 1 | 2 | 4)}><option value={1}>1</option><option value={2}>2</option><option value={4}>4 (2 × 2)</option></select></div>
          <div><label className="field__label">Orientation</label><select className="input input--select" value={landscape ? 'landscape' : 'portrait'} onChange={(event) => setLandscape(event.target.value === 'landscape')}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></div>
        </div>
        <div className="alert alert--info">{selected.length ? `${selected.length} timetable${selected.length === 1 ? '' : 's'} selected` : `All ${options.length} ${report}s`} will be printed in one job.</div>
      </div>
      <div className="modal__foot"><button type="button" className="button button--secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button type="button" className="button button--primary" disabled={busy || !options.length} onClick={printSet}>{busy ? 'Preparing…' : 'Print set'}</button></div>
    </div>
  </div>
}
