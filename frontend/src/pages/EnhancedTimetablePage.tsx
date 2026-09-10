import { useState } from 'react'
import { TimetablePage } from './TimetablePage'

/**
 * The timetable page owns its layout, filters, view state, and grid structure.
 * This wrapper also provides batch printing for every teacher or class by
 * reusing the page's existing filtered timetable view.
 */
export function EnhancedTimetablePage() {
  const [printing, setPrinting] = useState(false)

  const waitForRender = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  const setSelectValue = async (select: HTMLSelectElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await waitForRender()
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
        .timetable-print-batch { display: none; }
        @media print {
          body > *:not(.timetable-print-batch) { display: none !important; }
          .timetable-print-batch { display: block !important; padding: 0; margin: 0; }
          .timetable-print-batch__page { break-after: page; page-break-after: always; padding: 0; }
          .timetable-print-batch__page:last-child { break-after: auto; page-break-after: auto; }
          .timetable-print-batch__title { margin: 0 0 4mm; padding: 0 0 2mm; border-bottom: 0.35mm solid #111; text-align: center; font: 800 7mm/1.05 Arial, Helvetica, sans-serif; color: #111; }
          .timetable-print-batch__grid { width: 100%; }
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
      window.addEventListener('afterprint', () => batch.remove(), { once: true })
      window.print()
    } finally {
      setPrinting(false)
    }
  }

  return (
    <>
      <TimetablePage />
      <div className="timetable-batch-print-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' }}>
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
