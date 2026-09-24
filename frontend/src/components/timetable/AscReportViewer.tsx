import React, { useEffect, useMemo, useState } from 'react'

export type AscReportScope = 'all' | 'class' | 'teacher' | 'room' | 'subject' | 'summary-class' | 'summary-teacher' | 'summary-room' | 'summary-subject' | 'lesson-grid' | 'modify'
export type AscReportSettings = { rowHeight: 'compact' | 'standard' | 'large'; columnWidth: 'compact' | 'standard' | 'wide'; showTimes: boolean; showNonTeaching: boolean }

export type AscReportItem = { id: number; name: string }
export type AscReportDay = { index: number; name: string }
export type AscReportPeriod = {
  id: number | string
  index: number
  name: string
  short_form?: string | null
  start_time: string
  end_time: string
  is_teaching: boolean
}
export type AscReportLesson = {
  id: number
  day_index: number
  period_index: number
  subject: string
  secondary?: string | null
}

export type AscReportDefinition = {
  scope: AscReportScope
  label: string
  items: AscReportItem[]
}

type Props = {
  open: boolean
  title: string
  versionLabel: string
  scope: AscReportScope
  reportIndex: number
  reportItems: AscReportItem[]
  days: AscReportDay[]
  periods: AscReportPeriod[]
  lessons: AscReportLesson[]
  reportDefinitions: AscReportDefinition[]
  onScopeChange: (scope: AscReportScope) => void
  onPrevious: () => void
  onNext: () => void
  onSelectIndex: (index: number) => void
  onPrint: () => void
  onClose: () => void
}

export function AscReportViewer({
  open, title, versionLabel, scope, reportIndex, reportItems, days, periods, lessons,
  reportDefinitions, onScopeChange, onPrevious, onNext, onSelectIndex, onPrint, onClose,
}: Props) {
  const [filterOpen, setFilterOpen] = useState(false)
  const [showTimes, setShowTimes] = useState(true)
  const [fit, setFit] = useState<'paper' | 'wide'>('paper')
  const [selectedDays, setSelectedDays] = useState(() => new Set(days.map(day => day.index)))
  const [selectedPeriodRange, setSelectedPeriodRange] = useState(() => ({ start: 0, end: Math.max(0, periods.length - 1) }))
  const [layout, setLayout] = useState<'compact' | 'standard' | 'wide'>('standard')
  const [bellTimes, setBellTimes] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rowHeight, setRowHeight] = useState<'compact' | 'standard' | 'large'>('standard')
  const [showNonTeaching, setShowNonTeaching] = useState(true)

  useEffect(() => {
    setSelectedDays(new Set(days.map(day => day.index)))
    setSelectedPeriodRange({ start: 0, end: Math.max(0, periods.length - 1) })
  }, [days, periods])

  const activeItems = reportItems
  const pageCount = Math.max(1, activeItems.length)
  const pageNumber = activeItems.length ? Math.min(reportIndex + 1, activeItems.length) : 1

  const visiblePeriods = useMemo(
    () => periods.filter((period, index) => index >= selectedPeriodRange.start && index <= selectedPeriodRange.end && (showNonTeaching || period.is_teaching)),
    [periods, selectedPeriodRange, showNonTeaching],
  )

  const rowHeightPx = rowHeight === 'compact' ? 54 : rowHeight === 'large' ? 88 : 70

  const visibleLessons = useMemo(
    () => lessons.filter(lesson => {
      const periodPosition = periods.findIndex(period => period.index === lesson.period_index)
      return selectedDays.has(lesson.day_index) && periodPosition >= selectedPeriodRange.start && periodPosition <= selectedPeriodRange.end
    }),
    [lessons, selectedDays, selectedPeriodRange],
  )

  if (!open) return null

  const toggleDay = (index: number) => {
    setSelectedDays(current => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div
      className="asc-report-viewer timetable-report-float"
      role="dialog"
      aria-modal="true"
      aria-label="aSc-style print preview"
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', flexDirection: 'column', background: '#aeb4bf', overflow: 'hidden' }}
    >
      <style>{`
        @media print {
          @page { size: landscape; margin: 8mm; }
          body.printing-timetable-report > *:not(.timetable-report-float) { display: none !important; }
          body.printing-timetable-report .asc-report-viewer {
            position: static !important;
            inset: auto !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }
          body.printing-timetable-report .asc-report-viewer > header,
          body.printing-timetable-report .asc-report-viewer > div[style*="background: #f6f6f6"] {
            display: none !important;
          }
          body.printing-timetable-report .asc-report-viewer > main {
            overflow: visible !important;
            padding: 0 !important;
          }
          body.printing-timetable-report .asc-report-viewer section {
            width: 100% !important;
            min-height: auto !important;
            margin: 0 !important;
            box-shadow: none !important;
            padding: 8mm !important;
            break-inside: avoid;
          }
          body.printing-timetable-report .asc-report-viewer table {
            break-inside: avoid;
          }
        }
      `}</style>
      <header style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '5px 8px', background: '#ececec', borderBottom: '1px solid #8f8f8f', boxShadow: '0 1px 2px rgba(0,0,0,.18)', fontFamily: 'Arial,Helvetica,sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button type="button" onClick={onPrevious} disabled={!activeItems.length} title="Previous page" style={buttonStyle}>‹</button>
          <span style={{ minWidth: 62, textAlign: 'center', fontSize: 11, fontWeight: 700 }}>{pageNumber} / {pageCount}</span>
          <button type="button" onClick={onNext} disabled={!activeItems.length} title="Next page" style={buttonStyle}>›</button>
        </div>

        <div style={{ height: 24, borderLeft: '1px solid #bbb' }} />

        <select
          aria-label="Report"
          value={scope}
          onChange={event => onScopeChange(event.target.value as AscReportScope)}
          style={{ height: 28, border: '1px solid #999', background: '#fff', fontSize: 11, padding: '0 5px' }}
        >
          {reportDefinitions.map(definition => <option key={definition.scope} value={definition.scope}>{definition.label}</option>)}
        </select>

        {scope !== 'all' && activeItems.length > 0 && (
          <select
            aria-label="Report item"
            value={String(activeItems[Math.min(reportIndex, activeItems.length - 1)].id)}
            onChange={event => {
              const index = activeItems.findIndex(item => item.id === Number(event.target.value))
              if (index >= 0) onSelectIndex(index)
            }}
            style={{ height: 28, maxWidth: 180, border: '1px solid #999', background: '#fff', fontSize: 11, padding: '0 5px' }}
          >
            {activeItems.map(item => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
          </select>
        )}

        <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center', fontSize: 12 }}>{title}</strong>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" onClick={() => setFilterOpen(value => !value)} style={buttonStyle} aria-expanded={filterOpen}>Filter</button>
          <button type="button" onClick={() => setShowTimes(value => !value)} style={buttonStyle}>{showTimes ? 'Hide times' : 'Show times'}</button>
          <button type="button" onClick={() => setFit(value => value === 'paper' ? 'wide' : 'paper')} style={buttonStyle}>{fit === 'paper' ? 'Fit paper' : 'Fit wide'}</button>
          <select aria-label="Layout" value={layout} onChange={event => setLayout(event.target.value as typeof layout)} style={{ ...buttonStyle, width: 88 }}><option value="compact">Compact</option><option value="standard">Standard</option><option value="wide">Wide columns</option></select>
          <button type="button" onClick={() => setBellTimes(value => !value)} style={buttonStyle}>{bellTimes ? 'Bell times' : 'No times'}</button>
          <button type="button" onClick={() => setSettingsOpen(value => !value)} style={buttonStyle} aria-expanded={settingsOpen}>Settings</button>
          <button type="button" onClick={onPrint} style={buttonStyle}>Print</button>
          <button type="button" onClick={onClose} title="Close preview" aria-label="Close preview" style={{ ...buttonStyle, fontSize: 17, lineHeight: 1 }}>×</button>
        </div>
      </header>

      {settingsOpen && (
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: '#ededed', borderBottom: '1px solid #aaa', fontFamily: 'Arial,Helvetica,sans-serif' }}>
          <strong style={{ fontSize: 11 }}>Report settings:</strong>
          <label style={{ fontSize: 11 }}>Rows <select value={rowHeight} onChange={event => setRowHeight(event.target.value as typeof rowHeight)} style={{ height: 26, fontSize: 11 }}><option value="compact">Compact</option><option value="standard">Standard</option><option value="large">Large</option></select></label>
          <label style={{ fontSize: 11 }}>Columns <select value={layout} onChange={event => setLayout(event.target.value as typeof layout)} style={{ height: 26, fontSize: 11 }}><option value="compact">Compact</option><option value="standard">Standard</option><option value="wide">Wide</option></select></label>
          <label style={{ fontSize: 11 }}><input type="checkbox" checked={showNonTeaching} onChange={event => setShowNonTeaching(event.target.checked)} /> Show non-teaching periods</label>
        </div>
      )}

      {filterOpen && (
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f6f6f6', borderBottom: '1px solid #aaa', fontFamily: 'Arial,Helvetica,sans-serif' }}>
          <strong style={{ fontSize: 11 }}>Filter:</strong>
          {days.map(day => (
            <label key={day.index} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
              <input type="checkbox" checked={selectedDays.has(day.index)} onChange={() => toggleDay(day.index)} />
              {day.name}
            </label>
          ))}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }}>Period from
            <select value={selectedPeriodRange.start} onChange={event => setSelectedPeriodRange(current => ({ start: Math.min(Number(event.target.value), current.end), end: current.end }))} style={{ height: 26, fontSize: 11 }}>
              {periods.map((period, index) => <option key={period.id} value={index}>{period.short_form || period.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }}>to
            <select value={selectedPeriodRange.end} onChange={event => setSelectedPeriodRange(current => ({ start: current.start, end: Math.max(current.start, Number(event.target.value)) }))} style={{ height: 26, fontSize: 11 }}>
              {periods.map((period, index) => <option key={period.id} value={index}>{period.short_form || period.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => { setSelectedDays(new Set(days.map(day => day.index))); setSelectedPeriodRange({ start: 0, end: Math.max(0, periods.length - 1) }) }} style={buttonStyle}>Clear filter — Print ALL</button>
        </div>
      )}

      <main style={{ flex: 1, overflow: 'auto', padding: fit === 'paper' ? 24 : 10 }}>
        <section style={{ width: fit === 'paper' ? (layout === 'compact' ? 820 : layout === 'wide' ? 1040 : 900) : 'min(1400px, calc(100vw - 20px))', minHeight: 650, margin: '0 auto', background: '#fff', boxShadow: '0 2px 14px rgba(0,0,0,.35)', padding: 22, boxSizing: 'border-box', fontFamily: 'Arial,Helvetica,sans-serif' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, borderBottom: '2px solid #222', paddingBottom: 7 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
              <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>{versionLabel}</div>
            </div>
            <div style={{ fontSize: 9, color: '#555' }}>Page {pageNumber} / {pageCount}</div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 92, border: '1px solid #777', background: '#e6e6e6', padding: 7, fontSize: 10 }}>DAY</th>
                {visiblePeriods.map(period => (
                  <th key={period.id} style={{ border: '1px solid #777', background: period.is_teaching ? '#efefef' : '#d0d0d0', padding: 4, height: 44 }}>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{period.is_teaching ? (period.short_form || period.name) : (period.short_form || period.name)}</div>
                    {showTimes && bellTimes && <div style={{ fontSize: 8, fontWeight: 500 }}>{period.start_time.slice(0,5)}–{period.end_time.slice(0,5)}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.filter(day => selectedDays.has(day.index)).map(day => (
                <tr key={day.index}>
                  <th style={{ border: '1px solid #777', background: '#e6e6e6', padding: 8, textAlign: 'left', fontSize: 11 }}>{day.name.toUpperCase()}</th>
                  {visiblePeriods.map(period => {
                    const items = visibleLessons.filter(lesson => lesson.day_index === day.index && lesson.period_index === period.index)
                    return (
                      <td key={period.id} style={{ border: '1px solid #777', background: period.is_teaching ? '#fff' : '#d0d0d0', minHeight: 70, height: rowHeightPx, padding: period.is_teaching ? 5 : 3, textAlign: 'center', verticalAlign: 'middle' }}>
                        {period.is_teaching
                          ? items.map(lesson => (
                            <div key={lesson.id} style={{ fontSize: 12, lineHeight: 1.15, fontWeight: 800, marginBottom: 3 }}>
                              <div>{lesson.subject}</div>
                              {lesson.secondary && <div style={{ fontSize: 9, fontWeight: 600, color: '#555', marginTop: 2 }}>{lesson.secondary}</div>}
                            </div>
                          ))
                          : <span style={{ fontSize: 8, fontWeight: 800 }}>{period.short_form || period.name}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <footer style={{ marginTop: 10, paddingTop: 6, borderTop: '1px solid #aaa', display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#555' }}>
            <span>Phikila timetable report</span>
            <span>Page {pageNumber} / {pageCount}</span>
          </footer>
        </section>
      </main>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  height: 28,
  padding: '3px 8px',
  border: '1px solid #999',
  background: '#fff',
  borderRadius: 2,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
}
