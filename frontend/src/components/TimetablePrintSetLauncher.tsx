import { useEffect, useMemo, useState } from 'react'

type Report = 'class' | 'teacher' | 'room' | 'subject' | 'all'
type Tab = 'selection' | 'appearance' | 'page' | 'header'
type Option = { value: string; label: string }
type Captured = { title: string; html: string }
type PrintSetConfig = {
  name: string
  report: Report
  selected: string[]
  perPage: 1 | 2 | 4
  landscape: boolean
  scale: number
  margin: number
  color: boolean
  showTeacher: boolean
  showClass: boolean
  showRoom: boolean
  showTimes: boolean
  showBreaks: boolean
  showSchoolName: boolean
  showTitle: boolean
  showPageNumber: boolean
  schoolName: string
  headerText: string
  footerText: string
}

const STORAGE_KEY = 'phikila:timetable-print-sets:v1'
const DEFAULT_CONFIG: PrintSetConfig = {
  name: 'Default timetable print set', report: 'class', selected: [], perPage: 1,
  landscape: true, scale: 100, margin: 8, color: true,
  showTeacher: true, showClass: true, showRoom: true, showTimes: true, showBreaks: true,
  showSchoolName: true, showTitle: true, showPageNumber: true,
  schoolName: 'Phikila School Management System', headerText: '', footerText: '',
}

function readTargetOptions(): Option[] {
  const target = document.getElementById('tt-target') as HTMLSelectElement | null
  if (!target) return []
  return Array.from(target.options).filter((option) => option.value).map((option) => ({ value: option.value, label: option.text }))
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char] ?? char))
}

function printCss(config: PrintSetConfig) {
  const cols = config.perPage === 1 ? 1 : 2
  const rows = config.perPage === 4 ? 2 : 1
  return `
    @page { size: ${config.landscape ? 'landscape' : 'portrait'}; margin: ${config.margin}mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: white; color: #111; font-family: Arial, Helvetica, sans-serif; }
    body { print-color-adjust: ${config.color ? 'exact' : 'economy'}; -webkit-print-color-adjust: ${config.color ? 'exact' : 'economy'}; }
    .print-page { display: grid; grid-template-columns: repeat(${cols}, minmax(0,1fr)); grid-template-rows: repeat(${rows}, minmax(0,1fr)); gap: 5mm; width: 100%; min-height: calc(100vh - ${config.margin * 2}mm); break-after: page; page-break-after: always; }
    .print-page:last-child { break-after: auto; page-break-after: auto; }
    .sheet { min-width: 0; min-height: 0; overflow: hidden; border: .3mm solid #999; border-radius: 1mm; padding: 3mm; break-inside: avoid; page-break-inside: avoid; }
    .sheet header { margin: 0 0 2.5mm; padding: 0 0 2mm; border-bottom: .3mm solid #111; text-align: center; }
    .sheet h1 { margin: 0; font-size: 5mm; line-height: 1.05; font-weight: 800; }
    .sheet p { margin: 1mm 0 0; font-size: 2.4mm; line-height: 1.1; color: #555; }
    .grid-wrap { width: 100%; overflow: hidden; transform: scale(${config.scale / 100}); transform-origin: top left; width: ${10000 / config.scale}%; }
    .timetable__whole-school-grid, .timetable__time-grid { width: 100% !important; max-width: 100% !important; min-width: 0 !important; transform: none !important; zoom: 1 !important; }
    .timetable-controls-card, .unassigned, .alert, .page-header, .workspace__panel, .workspace__toolbar, .workspace__actions { display: none !important; }
    button, input, select { display: none !important; }
    .print-footer { display: flex; justify-content: space-between; margin-top: 1.5mm; font-size: 2.1mm; color: #555; }
    .no-break { break-inside: avoid; page-break-inside: avoid; }
  `
}

function loadSaved(): PrintSetConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [DEFAULT_CONFIG]
    const parsed = JSON.parse(raw) as PrintSetConfig[]
    return Array.isArray(parsed) && parsed.length ? parsed : [DEFAULT_CONFIG]
  } catch { return [DEFAULT_CONFIG] }
}

function saveSaved(items: PrintSetConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function TimetablePrintSetLauncher() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('selection')
  const [config, setConfig] = useState<PrintSetConfig>(DEFAULT_CONFIG)
  const [savedSets, setSavedSets] = useState<PrintSetConfig[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)

  const reportOptions = useMemo(() => [
    ['all', 'Whole school'], ['class', 'Classes'], ['teacher', 'Teachers'], ['room', 'Rooms'], ['subject', 'Subjects'],
  ] as const, [])

  useEffect(() => {
    if (open) setSavedSets(loadSaved())
  }, [open])

  useEffect(() => {
    if (!open) return
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    if (!scope) return
    scope.value = config.report
    scope.dispatchEvent(new Event('change', { bubbles: true }))
    const timer = window.setTimeout(() => setOptions(config.report === 'all' ? [] : readTargetOptions()), 280)
    return () => window.clearTimeout(timer)
  }, [open, config.report])

  function patch(next: Partial<PrintSetConfig>) { setConfig((current) => ({ ...current, ...next })) }
  function wait(ms = 240) { return new Promise<void>((resolve) => window.setTimeout(resolve, ms)) }

  async function capture(id?: string): Promise<Captured | null> {
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    if (!scope) return null
    if (config.report !== 'all' && target && id) {
      target.value = id
      target.dispatchEvent(new Event('change', { bubbles: true }))
      await wait()
    }
    const grid = document.querySelector('.timetable__whole-school-grid, .timetable__time-grid') as HTMLElement | null
    if (!grid) return null
    const heading = document.querySelector('.timetable-print-header h1')?.textContent?.trim()
      || (id && target?.options[target.selectedIndex]?.text)
      || 'Whole School Timetable'
    return { title: heading, html: grid.outerHTML }
  }

  function buildHtml(captured: Captured[]) {
    const pages: string[] = []
    for (let index = 0; index < captured.length; index += config.perPage) {
      const chunk = captured.slice(index, index + config.perPage)
      pages.push(`<div class="print-page">${chunk.map((item) => `<section class="sheet"><header>${config.showSchoolName ? `<p>${escapeHtml(config.schoolName)}</p>` : ''}${config.showTitle ? `<h1>${escapeHtml(item.title)}</h1>` : ''}${config.headerText ? `<p>${escapeHtml(config.headerText)}</p>` : ''}</header><div class="grid-wrap">${item.html}</div><div class="print-footer"><span>${escapeHtml(config.footerText)}</span>${config.showPageNumber ? `<span>Page ${Math.floor(index / config.perPage) + 1}</span>` : ''}</div></section>`).join('')}</div>`)
    }
    return pages.join('')
  }

  async function collect(): Promise<Captured[]> {
    const ids = config.report === 'all' ? [undefined] : (config.selected.length ? config.selected : options.map((option) => option.value))
    const captured: Captured[] = []
    for (const id of ids) {
      const result = await capture(id)
      if (result) captured.push(result)
    }
    return captured
  }

  async function openPreview() {
    if (busy) return
    setBusy(true)
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    const previousScope = scope?.value ?? 'all'
    const previousTarget = target?.value ?? ''
    try {
      const captured = await collect()
      if (!captured.length) return
      const popup = window.open('', '_blank', 'noopener,noreferrer,width=1500,height=1100')
      if (!popup) return
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print Set Preview</title><style>${printCss(config)}body{padding:4mm;background:#e9edf2}.print-page{background:white;box-shadow:0 1mm 4mm #999;padding:0}</style></head><body>${buildHtml(captured)}</body></html>`)
      popup.document.close()
      popup.focus()
      setPreview(true)
    } finally {
      if (scope) { scope.value = previousScope; scope.dispatchEvent(new Event('change', { bubbles: true })) }
      if (target && previousScope !== 'all') { await wait(100); target.value = previousTarget; target.dispatchEvent(new Event('change', { bubbles: true })) }
      setBusy(false)
    }
  }

  async function printSet() {
    if (busy) return
    setBusy(true)
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    const previousScope = scope?.value ?? 'all'
    const previousTarget = target?.value ?? ''
    try {
      const captured = await collect()
      if (!captured.length) return
      const popup = window.open('', '_blank', 'noopener,noreferrer,width=1500,height=1100')
      if (!popup) return
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(config.name)}</title><style>${printCss(config)}</style></head><body>${buildHtml(captured)}</body></html>`)
      popup.document.close(); popup.focus(); await wait(350); popup.print(); setOpen(false)
    } finally {
      if (scope) { scope.value = previousScope; scope.dispatchEvent(new Event('change', { bubbles: true })) }
      if (target && previousScope !== 'all') { await wait(100); target.value = previousTarget; target.dispatchEvent(new Event('change', { bubbles: true })) }
      setBusy(false)
    }
  }

  function saveCurrent() {
    const next = [...savedSets.filter((item) => item.name !== config.name), config]
    setSavedSets(next); saveSaved(next)
  }
  function saveAs() {
    const name = window.prompt('Name this print set', `${config.name} copy`)
    if (!name?.trim()) return
    const nextConfig = { ...config, name: name.trim() }
    const next = [...savedSets.filter((item) => item.name !== nextConfig.name), nextConfig]
    setConfig(nextConfig); setSavedSets(next); saveSaved(next)
  }
  function deleteCurrent() {
    const next = savedSets.filter((item) => item.name !== config.name)
    const fallback = next.length ? next[0] : DEFAULT_CONFIG
    setSavedSets(next.length ? next : [fallback]); saveSaved(next.length ? next : [fallback]); setConfig(fallback)
  }

  if (!open) return <button type="button" className="button button--ghost button--sm" onClick={() => setOpen(true)}>Print set</button>

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false) }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="print-set-title" style={{ maxWidth: 940, width: 'calc(100vw - 32px)' }}>
      <div className="modal__head">
        <div><h2 id="print-set-title">Timetable Print Set</h2><p className="form__note">Configure, preview, save, and print a complete timetable set.</p></div>
        <button type="button" className="icon-button icon-button--subtle" disabled={busy} onClick={() => setOpen(false)} aria-label="Close">×</button>
      </div>
      <div className="modal__body" style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 20 }}>
        <aside style={{ display: 'grid', alignContent: 'start', gap: 6 }}>
          <label className="field__label">Print set</label>
          <select className="input input--select" value={config.name} onChange={(event) => { const found = savedSets.find((item) => item.name === event.target.value); if (found) setConfig(found) }}>
            {savedSets.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
          <button type="button" className="button button--secondary button--sm" onClick={() => patch(DEFAULT_CONFIG)}>New / reset</button>
          <button type="button" className="button button--secondary button--sm" onClick={saveCurrent}>Save</button>
          <button type="button" className="button button--secondary button--sm" onClick={saveAs}>Save as…</button>
          {savedSets.length > 1 && <button type="button" className="button button--ghost button--sm" onClick={deleteCurrent}>Delete</button>}
          <hr />
          {([['selection','Selection'],['appearance','Appearance'],['page','Page layout'],['header','Header & footer']] as [Tab,string][]).map(([value,label]) => <button key={value} type="button" className={`button button--${tab === value ? 'primary' : 'ghost'} button--sm`} onClick={() => setTab(value)}>{label}</button>)}
        </aside>
        <section style={{ minWidth: 0 }}>
          {tab === 'selection' && <div style={{ display: 'grid', gap: 16 }}>
            <div><label className="field__label">Report type</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>{reportOptions.map(([value,label]) => <button key={value} type="button" className={`button button--${config.report === value ? 'primary' : 'secondary'} button--sm`} onClick={() => patch({ report: value, selected: [] })}>{label}</button>)}</div></div>
            {config.report !== 'all' && <div><label className="field__label">Timetables</label><p className="form__note">Choose individual items or leave all unchecked to include every item.</p><div style={{ maxHeight: 300, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 7, border: '1px solid var(--color-line,#ddd)', borderRadius: 8, padding: 10 }}>{options.map((option) => <label key={option.value} style={{ minWidth: 0 }}><input type="checkbox" checked={config.selected.includes(option.value)} onChange={() => patch({ selected: config.selected.includes(option.value) ? config.selected.filter((value) => value !== option.value) : [...config.selected, option.value] })} /> {option.label}</label>)}</div><div style={{ marginTop: 8, display: 'flex', gap: 8 }}><button type="button" className="button button--ghost button--sm" onClick={() => patch({ selected: options.map((item) => item.value) })}>Select all</button><button type="button" className="button button--ghost button--sm" onClick={() => patch({ selected: [] })}>Clear</button></div></div>}
            <div className="alert alert--info">{config.report === 'all' ? 'The current whole-school timetable will be printed.' : config.selected.length ? `${config.selected.length} selected` : `All ${options.length} ${config.report}s`}</div>
          </div>}

          {tab === 'appearance' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[['showTeacher','Teacher name'],['showClass','Class name'],['showRoom','Room'],['showTimes','Times'],['showBreaks','Breaks / free periods'],['color','Print colours']].map(([key,label]) => <label key={key} className="field__label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(config[key as keyof PrintSetConfig])} onChange={(event) => patch({ [key]: event.target.checked } as Partial<PrintSetConfig>)} /> {label}</label>)}
            <div><label className="field__label">Scale</label><input className="input" type="range" min="60" max="120" step="5" value={config.scale} onChange={(event) => patch({ scale: Number(event.target.value) })} /><div className="form__note">{config.scale}%</div></div>
          </div>}

          {tab === 'page' && <div style={{ display: 'grid', gap: 16 }}>
            <div><label className="field__label">Timetables per page</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>{([1,2,4] as const).map((value) => <button key={value} type="button" className={`button button--${config.perPage === value ? 'primary' : 'secondary'}`} onClick={() => patch({ perPage: value })}>{value === 4 ? '4 · 2 × 2' : value}</button>)}</div></div>
            <div><label className="field__label">Orientation</label><select className="input input--select" value={config.landscape ? 'landscape' : 'portrait'} onChange={(event) => patch({ landscape: event.target.value === 'landscape' })}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></div>
            <div><label className="field__label">Margins (mm)</label><input className="input" type="number" min="3" max="25" value={config.margin} onChange={(event) => patch({ margin: Math.max(3, Math.min(25, Number(event.target.value) || 8)) })} /></div>
          </div>}

          {tab === 'header' && <div style={{ display: 'grid', gap: 14 }}>
            <label className="field__label" style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={config.showSchoolName} onChange={(event) => patch({ showSchoolName: event.target.checked })} /> Show school name</label>
            <label className="field__label" style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={config.showTitle} onChange={(event) => patch({ showTitle: event.target.checked })} /> Show timetable title</label>
            <label className="field__label" style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={config.showPageNumber} onChange={(event) => patch({ showPageNumber: event.target.checked })} /> Show page number</label>
            <div><label className="field__label">School name</label><input className="input" value={config.schoolName} onChange={(event) => patch({ schoolName: event.target.value })} /></div>
            <div><label className="field__label">Header text</label><input className="input" placeholder="Optional academic year, term, etc." value={config.headerText} onChange={(event) => patch({ headerText: event.target.value })} /></div>
            <div><label className="field__label">Footer text</label><input className="input" placeholder="Optional footer" value={config.footerText} onChange={(event) => patch({ footerText: event.target.value })} /></div>
          </div>}

          <div style={{ marginTop: 20, borderTop: '1px solid var(--color-line,#ddd)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <div className="form__note">{config.name} · {config.perPage} per page · {config.landscape ? 'Landscape' : 'Portrait'}</div>
            <button type="button" className="button button--secondary" disabled={busy} onClick={openPreview}>{busy ? 'Preparing…' : 'Preview'}</button>
          </div>
        </section>
      </div>
      <div className="modal__foot"><button type="button" className="button button--secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button type="button" className="button button--primary" disabled={busy || (config.report !== 'all' && !options.length)} onClick={printSet}>{busy ? 'Preparing…' : 'Print set'}</button></div>
      {preview && <span aria-hidden="true" style={{ display: 'none' }}>preview-opened</span>}
    </div>
  </div>
}
