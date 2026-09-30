import React, { useMemo } from 'react'
import type { AscReportDay, AscReportLesson, AscReportPeriod } from './AscReportViewer'
import './asc-floating-timetable.css'

type Props = {
  days: AscReportDay[]
  periods: AscReportPeriod[]
  lessons: AscReportLesson[]
  showTimes: boolean
  bellTimes: boolean
  rowHeight: 'compact' | 'standard' | 'large'
  density: 'compact' | 'standard' | 'wide'
}

const teachingSpan = (periods: AscReportPeriod[], startIndex: number, duration: number) => {
  if (duration <= 1) return [startIndex]
  const teaching = periods
    .map((period, index) => ({ period, index }))
    .filter(item => item.period.is_teaching)

  const startTeaching = teaching.findIndex(item => item.index === startIndex)
  if (startTeaching < 0 || startTeaching + duration > teaching.length) return null

  const indexes = teaching.slice(startTeaching, startTeaching + duration).map(item => item.index)
  for (let i = 1; i < indexes.length; i += 1) {
    if (indexes[i] !== indexes[i - 1] + 1) return null
  }
  return indexes
}

const subjectTone = (subject: string) => {
  let hash = 0
  for (let i = 0; i < subject.length; i += 1) hash = ((hash << 5) - hash + subject.charCodeAt(i)) | 0
  const tones = ['#f6d7e8', '#f7d7c4', '#dcebcf', '#d9e8f7', '#eadcf5', '#f4e7bf', '#d9eeee', '#f0dddd']
  return tones[Math.abs(hash) % tones.length]
}

export function AscFloatingTimetable({
  days,
  periods,
  lessons,
  showTimes,
  bellTimes,
  rowHeight,
  density,
}: Props) {
  const activeDays = useMemo(() => days, [days])
  const orderedPeriods = useMemo(
    () => [...periods].sort((a, b) => a.index - b.index),
    [periods],
  )

  const teachingCount = orderedPeriods.filter(period => period.is_teaching).length
  const scheduleIsDense = activeDays.length >= 6 || orderedPeriods.length >= 9
  const rowHeightValue = rowHeight === 'compact'
    ? (scheduleIsDense ? 48 : 54)
    : rowHeight === 'large'
      ? (scheduleIsDense ? 78 : 88)
      : (scheduleIsDense ? 62 : 70)
  const headerHeightValue = rowHeight === 'compact'
    ? (scheduleIsDense ? 48 : 52)
    : rowHeight === 'large'
      ? 56
      : (scheduleIsDense ? 52 : 56)
  const dayColumn = density === 'compact' ? 'clamp(60px, 7vw, 72px)' : density === 'wide' ? 'clamp(76px, 9vw, 92px)' : 'clamp(68px, 8vw, 82px)'

  const lessonByDay = useMemo(() => {
    const map = new Map<number, AscReportLesson[]>()
    for (const lesson of lessons) {
      map.set(lesson.day_index, [...(map.get(lesson.day_index) ?? []), lesson])
    }
    return map
  }, [lessons])

  return (
    <div
      className="asc-floating-timetable"
      style={{
        ['--asc-period-count' as string]: orderedPeriods.length,
        ['--asc-row-height' as string]: rowHeightValue + 'px',
        ['--asc-header-height' as string]: headerHeightValue + 'px',
        ['--asc-day-column' as string]: dayColumn,
      }}
    >
      <div
        className="asc-floating-timetable__header"
        style={{
          gridTemplateColumns: `var(--asc-day-column) repeat(${orderedPeriods.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="asc-floating-timetable__corner">
          <strong>DAY / PERIOD</strong>
        </div>

        {orderedPeriods.map(period => (
          <div
            key={period.id}
            className={`asc-floating-timetable__period-head ${period.is_teaching ? '' : 'asc-floating-timetable__period-head--break'}`}
          >
            <strong>
              {period.is_teaching
                ? `P${orderedPeriods.filter(item => item.is_teaching).findIndex(item => item.index === period.index) + 1}`
                : period.short_form || period.name || 'BREAK'}
            </strong>

            {showTimes && bellTimes && (
              <span>
                {period.start_time.slice(0, 5)}–{period.end_time.slice(0, 5)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="asc-floating-timetable__body">
        {activeDays.map(day => {
          const dayLessons = lessonByDay.get(day.index) ?? []

          return (
            <div
              key={day.index}
              className="asc-floating-timetable__day-row"
              style={{
                gridTemplateColumns: `var(--asc-day-column) minmax(0, 1fr)`,
                minHeight: rowHeightValue,
              }}
            >
              <div className="asc-floating-timetable__day-label">
                {day.name.toUpperCase()}
              </div>

              <div className="asc-floating-timetable__schedule">
                <div
                  className="asc-floating-timetable__grid"
                  style={{
                    gridTemplateColumns: `repeat(${orderedPeriods.length}, minmax(0, 1fr))`,
                  }}
                >
                  {orderedPeriods.map(period => (
                    <div
                      key={period.id}
                      className={`asc-floating-timetable__cell ${period.is_teaching ? '' : 'asc-floating-timetable__cell--break'}`}
                    >
                      {!period.is_teaching && (
                        <span>{period.short_form || period.name || 'BREAK'}</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="asc-floating-timetable__lesson-layer">
                  {dayLessons
                    .filter(lesson => orderedPeriods.some(period => period.index === lesson.period_index))
                    .map(lesson => {
                      const start = orderedPeriods.findIndex(
                        period => period.index === lesson.period_index,
                      )
                      const duration = Math.max(1, lesson.duration ?? 1)
                      const span = teachingSpan(orderedPeriods, start, duration)
                      const safeSpan = span ?? [start]
                      const spanStart = safeSpan[0]
                      const spanEnd = safeSpan[safeSpan.length - 1]
                      const width = Math.max(1, spanEnd - spanStart + 1)
                      const invalidSpan = duration > 1 && span == null

                      return (
                        <div
                          key={lesson.id}
                          className={`asc-floating-lesson ${duration > 1 ? 'asc-floating-lesson--multi' : ''} ${invalidSpan ? 'asc-floating-lesson--invalid' : ''}`}
                          style={{
                            left: `calc(${spanStart} * (100% / ${orderedPeriods.length}) + 2px)`,
                            width: `calc(${width} * (100% / ${orderedPeriods.length}) - 4px)`,
                            backgroundColor: subjectTone(lesson.subject),
                          }}
                          title={`${lesson.subject}${lesson.secondary ? ` · ${lesson.secondary}` : ''}`}
                        >
                          <strong>{lesson.subject}</strong>
                          {lesson.secondary && <span>{lesson.secondary}</span>}
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {teachingCount === 0 && (
        <div className="asc-floating-timetable__empty">
          No teaching periods are configured for this report.
        </div>
      )}
    </div>
  )
}
