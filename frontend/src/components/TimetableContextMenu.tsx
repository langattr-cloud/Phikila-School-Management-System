import { useEffect } from 'react'

type CellType = 'lesson' | 'period' | 'day'
type SelectedCell = { type: CellType; label: string; day?: number; period?: number; targetType?: 'title' | 'day' | 'period' | 'lesson' }

function dispatchSelection(detail: SelectedCell) {
  window.dispatchEvent(new CustomEvent('phikila:timetable-cell-selected', { detail }))
}

export function TimetableContextMenu() {
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const title = target.closest('.timetable-print-header h1, .page-header__title') as HTMLElement | null
      const lesson = target.closest('.lesson-card') as HTMLElement | null
      const day = target.closest('.timetable__day-label, .timetable__whole-day-head') as HTMLElement | null
      const period = target.closest('.timetable__period-head, .timetable__whole-period-head') as HTMLElement | null
      const timetable = target.closest('.timetable, .timetable-print-header')
      if (!timetable && !title) return
      if (title) {
        event.preventDefault()
        dispatchSelection({ type: 'day', targetType: 'title', label: title.textContent?.trim() || 'Timetable title' })
        return
      }
      if (lesson) {
        event.preventDefault()
        const label = lesson.querySelector('.lesson-card__subject')?.textContent?.trim() || lesson.getAttribute('aria-label') || 'Lesson'
        dispatchSelection({ type: 'lesson', targetType: 'lesson', label })
        return
      }
      if (day) {
        event.preventDefault()
        dispatchSelection({ type: 'day', targetType: 'day', label: day.textContent?.trim() || 'Day' })
        return
      }
      if (period) {
        event.preventDefault()
        dispatchSelection({ type: 'period', targetType: 'period', label: period.textContent?.trim() || 'Period' })
      }
    }
    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])
  return null
}
