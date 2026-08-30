import { useCallback, useEffect, useMemo, useState } from 'react'
import { TimetablePage } from './TimetablePage'

type Mode = 'grade' | 'teacher'
type PrintChoice = 'current' | 'all' | 'selected'

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function waitForPaint() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 120))
}

export function EnhancedTimetablePage() {
  const [mode, setMode] = useState<Mode>('grade')
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const [selected, setSelected] = useState('')
  const [printOpen, setPrintOpen] = useState(false)
  const [printChoice, setPrintChoice] = useState<PrintChoice>('current')
  const [checked, setChecked] = useState<string[]>([])
  const [printing, setPrinting] = useState(false)

  const syncOptions = useCallback(() => {
    const target = document.querySelector<HTMLSelectElement>('#tt-target')
    if (!target) return
    const next = Array.from(target.options)
      .filter((option) => option.value)
      .map((option) => ({ value: option.value, label: option.textContent?.trim() || option.value }))
    setOptions(next)
    if (!next.some((option) => option.value === selected)) {
      setSelected(next[0]?.value ?? '')
    }
  }, [selected])

  useEffect(() => {
    const observer = new MutationObserver(syncOptions)
    observer.observe(document.body, { childList: true, subtree: true })
    syncOptions()
    const timer = window.setInterval(syncOptions, 500)
    return () => {
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [syncOptions])

  const applySelection = useCallback((nextMode: Mode, value: string) => {
    const scope = document.querySelector<HTMLSelectElement>('#tt-scope')
    if (!scope) return
    const scopeValue = nextMode === 'grade' ? 'class' : 'teacher'
    setNativeSelectValue(scope, scopeValue)
    window.setTimeout(() => {
      const target = document.querySelector<HTMLSelectElement>('#tt-target')
      if (target && value) setNativeSelectValue(target, value)
    }, 0)
  }, [])

  useEffect(() => {
    const target = document.querySelector<HTMLSelectElement>('#tt-target')
    const first = target?.options[1]?.value ?? ''
    setSelected(first)
    if (first) applySelection(mode, first)
  }, [applySelection, mode])

  const currentLabel = useMemo(() => options.find((option) => option.value === selected)?.label ?? '', [options, selected])

  const navigateSelection = (direction: -1 | 1) => {
    if (!options.length) return
    const index = Math.max(0, options.findIndex((option) => option.value === selected))
    const next = options[(index + direction + options.length) % options.length]
    if (!next) return
    setSelected(next.value)
    applySelection(mode, next.value)
  }

  const openPrint = () => {
    setChecked(options.map((option) => option.value))
    setPrintChoice('current')
    setPrintOpen(true)
  }

  const captureCurrentGrid = () => {
    const grid = document.querySelector<HTMLElement>('.workspace__grid')
    return grid?.outerHTML ?? ''
  }

  const printCaptured = (pages: { title: string; html: string }[]) => {
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900')
    if (!popup) return false
    const styles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .map((link) => `<link rel="stylesheet" href="${link.href}">`)
      .join('')
    popup.document.write(`<!doctype html><html><head><title>Timetables</title>${styles}<style>@page{size:landscape;margin:8mm}.print-page{break-after:page}.print-page:last-child{break-after:auto}.print-title{font:700 20px system-ui,sans-serif;margin:0 0 12px}.workspace__grid{display:block!important}.workspace__grid .card{box-shadow:none!important}</style></head><body>${pages.map((page) => `<section class="print-page"><h1 class="print-title">${page.title.replaceAll('&','&amp;').replaceAll('<','&lt;')}</h1>${page.html}</section>`).join('')}</body></html>`)
    popup.document.close()
    popup.focus()
    window.setTimeout(() => popup.print(), 350)
    return true
  }

  const submitPrint = async () => {
    if (printing || !options.length) return
    setPrinting(true)
    const originalMode = mode
    const originalSelected = selected
    const values = printChoice === 'current' ? [selected] : printChoice === 'all' ? options.map((option) => option.value) : checked
    const pages: { title: string; html: string }[] = []
    try {
      for (const value of values.filter(Boolean)) {
        setSelected(value)
        applySelection(mode, value)
        await waitForPaint()
        const label = options.find((option) => option.value === value)?.label ?? value
        pages.push({ title: `${mode === 'grade' ? 'Grade' : 'Teacher'} — ${label}`, html: captureCurrentGrid() })
      }
      if (pages.length) printCaptured(pages)
    } finally {
      setSelected(originalSelected)
      applySelection(originalMode, originalSelected)
      setPrinting(false)
      setPrintOpen(false)
    }
  }

  return (
    <>
      <div className="timetable-view-controls card section" style={{ marginBottom: '1rem' }}>
        <div className="panel__head">
          <div>
            <h2 className="section__title">{currentLabel ? `${mode === 'grade' ? 'Grade' : 'Teacher'} — ${currentLabel}` : 'Timetable view'}</h2>
            <div className="form__row" style={{ alignItems: 'center', gap: '.75rem', marginTop: '.5rem' }}>
              <label className="form__label" htmlFor="enhanced-timetable-filter">Filter by</label>
              <select id="enhanced-timetable-filter" className="input input--select" value={mode} onChange={(event) => {
                const nextMode = event.target.value as Mode
                setMode(nextMode)
                setSelected('')
                const scope = document.querySelector<HTMLSelectElement>('#tt-scope')
                if (scope) setNativeSelectValue(scope, nextMode === 'grade' ? 'class' : 'teacher')
              }}>
                <option value="grade">Grades</option>
                <option value="teacher">Teachers</option>
              </select>
            </div>
          </div>
          <button type="button" className="button button--secondary" onClick={openPrint} disabled={!options.length}>Print</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.75rem', marginTop: '1rem' }}>
          <button type="button" className="button button--ghost" onClick={() => navigateSelection(-1)} disabled={!options.length}>←</button>
          <select className="input input--select" value={selected} onChange={(event) => { setSelected(event.target.value); applySelection(mode, event.target.value) }} aria-label={mode === 'grade' ? 'Grade' : 'Teacher'}>
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" className="button button--ghost" onClick={() => navigateSelection(1)} disabled={!options.length}>→</button>
        </div>
      </div>

      <TimetablePage />

      {printOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => !printing && setPrintOpen(false)}>
          <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="bulk-print-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="bulk-print-title">Print timetables</h2>
            <label style={{ display: 'block', margin: '.5rem 0' }}><input type="radio" checked={printChoice === 'current'} onChange={() => setPrintChoice('current')} /> Current {mode === 'grade' ? 'grade' : 'teacher'}</label>
            <label style={{ display: 'block', margin: '.5rem 0' }}><input type="radio" checked={printChoice === 'all'} onChange={() => setPrintChoice('all')} /> All {mode === 'grade' ? 'grades' : 'teachers'}</label>
            <label style={{ display: 'block', margin: '.5rem 0' }}><input type="radio" checked={printChoice === 'selected'} onChange={() => setPrintChoice('selected')} /> Select {mode === 'grade' ? 'grades' : 'teachers'}</label>
            {printChoice === 'selected' && <div style={{ maxHeight: '18rem', overflow: 'auto', marginTop: '1rem' }}>{options.map((option) => <label key={option.value} style={{ display: 'block', margin: '.35rem 0' }}><input type="checkbox" checked={checked.includes(option.value)} onChange={(event) => setChecked((values) => event.target.checked ? [...values, option.value] : values.filter((value) => value !== option.value))} /> {option.label}</label>)}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', marginTop: '1rem' }}><button type="button" className="button button--ghost" onClick={() => setPrintOpen(false)} disabled={printing}>Cancel</button><button type="button" className="button button--primary" onClick={() => void submitPrint()} disabled={printing || (printChoice === 'selected' && checked.length === 0)}>{printing ? 'Preparing…' : 'Print'}</button></div>
          </div>
        </div>
      )}
    </>
  )
}
