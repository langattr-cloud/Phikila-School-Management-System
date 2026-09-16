import { useMemo, useState } from 'react'

type Report = 'class' | 'teacher' | 'room' | 'subject'

export function TimetablePrintSetLauncher() {
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<Report>('class')
  const [selected, setSelected] = useState<string[]>([])
  const [perPage, setPerPage] = useState<1 | 2 | 4>(1)
  const [landscape, setLandscape] = useState(true)
  const [busy, setBusy] = useState(false)

  const options = useMemo(() => {
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    if (!target) return []
    return Array.from(target.options).filter((option) => option.value).map((option) => ({ value: option.value, label: option.text }))
  }, [open, report])

  if (!open) return <button type="button" className="button button--ghost button--sm" onClick={() => setOpen(true)}>Print set</button>

  const wait = () => new Promise<void>((resolve) => window.setTimeout(resolve, 180))

  async function capture(id: string) {
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    if (!scope) return null
    scope.value = report
    scope.dispatchEvent(new Event('change', { bubbles: true }))
    await wait()
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    if (!target) return null
    target.value = id
    target.dispatchEvent(new Event('change', { bubbles: true }))
    await wait()
    const grid = document.querySelector('.workspace__grid') as HTMLElement | null
    const title = document.querySelector('.timetable-print-header h1')?.textContent ?? 'Timetable'
    return grid ? { title, html: grid.innerHTML } : null
  }

  async function printSet() {
    if (busy) return
    const ids = selected.length ? selected : options.map((option) => option.value)
    if (!ids.length) return
    setBusy(true)
    try {
      const captured: { title: string; html: string }[] = []
      for (const id of ids) {
        const result = await capture(id)
        if (result) captured.push(result)
      }
      if (!captured.length) return
      const pages: string[] = []
      for (let index = 0; index < captured.length; index += perPage) {
        const chunk = captured.slice(index, index + perPage)
        pages.push(`<div class="print-page cols-${perPage}">${chunk.map((item) => `<section class="sheet"><header><h1>${escapeHtml(item.title)}</h1><p>Phikila School Management System · Print set</p></header><div class="grid-wrap">${item.html}</div></section>`).join('')}</div>`)
      }
      const popup = window.open('', '_blank', 'noopener,noreferrer,width=1400,height=1000')
      if (!popup) return
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Timetable print set</title><style>${printCss()}</style></head><body>${pages.join('')}</body></html>`)
      popup.document.close()
      popup.focus()
      window.setTimeout(() => popup.print(), 300)
      setOpen(false)
    } finally { setBusy(false) }
  }

  function escapeHtml(value: string) { return value.replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char] ?? char)) }
  function printCss() { return `@page{size:${landscape ? 'landscape' : 'portrait'};margin:9mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111}.print-page{display:grid;grid-template-columns:1fr;gap:8mm;break-after:page}.print-page.cols-2,.print-page.cols-4{grid-template-columns:1fr 1fr}.sheet{border:1px solid #999;padding:4mm;break-inside:avoid}.sheet header{margin-bottom:3mm}.sheet h1{font-size:16px;margin:0 0 1mm}.sheet p{font-size:8px;color:#666;margin:0}.grid-wrap{overflow:hidden}.workspace__panel,.timetable-controls-card,.unassigned,.alert,.page-header{display:none!important}` }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false) }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="print-set-title" style={{ maxWidth: 680 }}>
      <div className="modal__head"><div><h2 id="print-set-title">Print set</h2><p className="form__note">Batch print class, teacher, room or subject timetables in one print job.</p></div><button type="button" className="icon-button icon-button--subtle" disabled={busy} onClick={() => setOpen(false)} aria-label="Close">×</button></div>
      <div className="modal__body" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>{(['class','teacher','room','subject'] as Report[]).map((item) => <button key={item} type="button" className={`button button--${report === item ? 'primary' : 'secondary'} button--sm`} onClick={() => { setReport(item); setSelected([]) }}>{item === 'class' ? 'Classes' : item === 'teacher' ? 'Teachers' : item === 'room' ? 'Rooms' : 'Subjects'}</button>)}</div>
        <div><label className="field__label">Items</label><p className="form__note">Leave all unchecked to print every {report}. Select specific items for a custom set.</p><div style={{ maxHeight: 180, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, border: '1px solid var(--color-line,#ddd)', borderRadius: 8, padding: 10 }}>{options.map((option) => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={() => setSelected((current) => current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value])} /> {option.label}</label>)}</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><label className="field__label">Timetables per page</label><select className="input input--select" value={perPage} onChange={(event) => setPerPage(Number(event.target.value) as 1 | 2 | 4)}><option value={1}>1</option><option value={2}>2</option><option value={4}>4</option></select></div><div><label className="field__label">Orientation</label><select className="input input--select" value={landscape ? 'landscape' : 'portrait'} onChange={(event) => setLandscape(event.target.value === 'landscape')}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></div></div>
        <div className="alert alert--info">{selected.length ? `${selected.length} selected` : `All ${options.length} ${report}s`} will be combined into one print job.</div>
      </div>
      <div className="modal__foot"><button type="button" className="button button--secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button type="button" className="button button--primary" disabled={busy || !options.length} onClick={printSet}>{busy ? 'Preparing…' : 'Print set'}</button></div>
    </div>
  </div>
}
