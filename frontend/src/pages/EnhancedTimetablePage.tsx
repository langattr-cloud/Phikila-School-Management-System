import { useState } from 'react'
import { TimetablePage } from './TimetablePage'

const PRINT_CONFIG_KEY = 'phikila:timetable-print-config:v1'

type PrintConfig = {
  version: 1
  title?: Record<string, { prefix?: boolean; prefixText?: string; centered?: boolean; header?: string }>
  days?: Record<string, { vertical?: boolean }>
  periods?: Record<string, { twoLines?: boolean; showInterval?: boolean }>
}

function readPrintConfig(): PrintConfig {
  try {
    const value = JSON.parse(localStorage.getItem(PRINT_CONFIG_KEY) || '{}') as Partial<PrintConfig>
    return { version: 1, ...value }
  } catch {
    return { version: 1 }
  }
}

function waitForRender() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

export function EnhancedTimetablePage() {
  const [printing, setPrinting] = useState(false)

  const setSelectValue = async (select: HTMLSelectElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await waitForRender()
  }

  const printGrid = async (title: string) => {
    if (printing) return
    const grid = document.querySelector('.timetable__time-grid, .timetable__whole-school-grid') as HTMLElement | null
    if (!grid) return

    setPrinting(true)
    try {
      const config = readPrintConfig()
      const titleSettings = config.title?.global ?? {}
      const heading = [titleSettings.prefix ? titleSettings.prefixText : '', titleSettings.header || '', title]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' — ')

      const printRoot = document.createElement('main')
      printRoot.className = 'phikila-print-root'
      const style = document.createElement('style')
      style.textContent = `
        @page { size: A4 landscape; margin: 8mm; }
        @media screen { .phikila-print-root { display:none !important; } }
        @media print {
          body > *:not(.phikila-print-root) { display:none !important; }
          body { margin:0 !important; padding:0 !important; background:#fff !important; }
          .phikila-print-root { display:block !important; width:100%; color:#111; background:#fff; font-family:Arial,Helvetica,sans-serif; }
          .phikila-print-title { margin:0 0 5mm; padding:0 0 2.5mm; border-bottom:.35mm solid #111; font-size:7mm; line-height:1.1; font-weight:800; text-align:${titleSettings.centered === false ? 'left' : 'center'}; }
          .phikila-print-grid { width:100% !important; max-width:none !important; overflow:visible !important; transform:none !important; }
          .phikila-print-grid * { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
          .phikila-print-grid .lesson-card { break-inside:avoid; page-break-inside:avoid; }
          .phikila-print-grid .timetable__whole-row, .phikila-print-grid .timetable__day-row { break-inside:avoid; page-break-inside:avoid; }
          .phikila-print-grid .timetable__day-label { ${config.days && Object.values(config.days).some((v) => v.vertical) ? 'writing-mode:vertical-rl; transform:rotate(180deg);' : ''} }
          .phikila-print-grid .timetable__clock--split { ${Object.values(config.periods ?? {}).some((v) => v.twoLines) ? 'display:flex; flex-direction:column;' : ''} }
        }
      `
      const headingElement = document.createElement('h1')
      headingElement.className = 'phikila-print-title'
      headingElement.textContent = heading || 'Timetable'
      const clone = grid.cloneNode(true) as HTMLElement
      clone.className = `${clone.className} phikila-print-grid`
      printRoot.append(style, headingElement, clone)
      document.body.appendChild(printRoot)

      const cleanup = () => {
        printRoot.remove()
        setPrinting(false)
        window.removeEventListener('afterprint', cleanup)
      }
      window.addEventListener('afterprint', cleanup)
      await waitForRender()
      window.print()
      window.setTimeout(cleanup, 1500)
    } catch {
      setPrinting(false)
    }
  }

  const printBatch = async (kind: 'teacher' | 'class') => {
    if (printing) return
    setPrinting(true)
    try {
      const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('select'))
      const scopeSelect = selects.find((select) => {
        const values = Array.from(select.options).map((option) => option.value)
        return values.includes('teacher') && values.includes('class') && values.includes('all')
      })
      if (!scopeSelect) return

      await setSelectValue(scopeSelect, kind)
      const targetSelect = Array.from(document.querySelectorAll<HTMLSelectElement>('select')).find((select) => select !== scopeSelect && select.options.length > 1)
      if (!targetSelect) return

      const batch = document.createElement('div')
      batch.className = 'timetable-print-batch'
      const style = document.createElement('style')
      style.textContent = `
        @page { size: A4 landscape; margin: 8mm; }
        .timetable-print-batch { display:none; }
        @media print {
          body > *:not(.timetable-print-batch) { display:none !important; }
          .timetable-print-batch { display:block !important; }
          .timetable-print-batch__page { break-after:page; page-break-after:always; }
          .timetable-print-batch__page:last-child { break-after:auto; page-break-after:auto; }
          .timetable-print-batch__title { margin:0 0 5mm; text-align:center; font:800 7mm/1.05 Arial,Helvetica,sans-serif; color:#111; }
          .timetable-print-batch__grid { width:100% !important; }
          .timetable-print-batch__grid * { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
        }
      `
      batch.appendChild(style)

      const options = Array.from(targetSelect.options).filter((option) => option.value)
      for (const option of options) {
        await setSelectValue(targetSelect, option.value)
        const grid = document.querySelector('.timetable__time-grid, .timetable__whole-school-grid') as HTMLElement | null
        if (!grid) continue
        const page = document.createElement('section')
        page.className = 'timetable-print-batch__page'
        const title = document.createElement('h1')
        title.className = 'timetable-print-batch__title'
        title.textContent = option.textContent?.trim() || (kind === 'teacher' ? 'Teacher Timetable' : 'Class Timetable')
        const clone = grid.cloneNode(true) as HTMLElement
        clone.className = `${clone.className} timetable-print-batch__grid`
        page.append(title, clone)
        batch.appendChild(page)
      }

      if (!batch.querySelector('.timetable-print-batch__page')) return
      document.body.appendChild(batch)
      const cleanup = () => { batch.remove(); setPrinting(false); window.removeEventListener('afterprint', cleanup) }
      window.addEventListener('afterprint', cleanup)
      window.print()
      window.setTimeout(cleanup, 1500)
    } catch {
      setPrinting(false)
    }
  }

  return (
    <>
      <TimetablePage />
      <div className="timetable-batch-print-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' }}>
        <button type="button" className="button button--ghost button--sm" disabled={printing} onClick={() => void printGrid('Current timetable')}>
          {printing ? 'Preparing print…' : 'Print configured timetable'}
        </button>
        <button type="button" className="button button--ghost button--sm" disabled={printing} onClick={() => void printBatch('teacher')}>
          {printing ? 'Preparing print…' : 'Print all teachers'}
        </button>
        <button type="button" className="button button--ghost button--sm" disabled={printing} onClick={() => void printBatch('class')}>
          {printing ? 'Preparing print…' : 'Print all classes'}
        </button>
      </div>
    </>
  )
}
