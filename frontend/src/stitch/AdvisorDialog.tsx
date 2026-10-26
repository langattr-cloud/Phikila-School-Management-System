import React, { useMemo, useState } from 'react'

type AdvisorLesson = { id: string; className: string; subject: string; day: string; period: number; teacher: string; room: string }
type AdvisorDialogProps = {
  classes: string[]
  lessons: AdvisorLesson[]
  days: string[]
  periods: { name: string; type?: 'lesson' | 'break' }[]
  onClose: () => void
}

type AdvisorIssue = { id: string; title: string; detail: string; type: 'critical' | 'suggestion'; lessonIds: string[] }

export default function AdvisorDialog({ classes, lessons, days, periods, onClose }: AdvisorDialogProps) {
  const [ignored, setIgnored] = useState<string[]>([])
  const [focusedIssue, setFocusedIssue] = useState<string | null>(null)
  const issues = useMemo(() => {
    const found: AdvisorIssue[] = []
    const usablePeriods = periods.filter(period => period.type !== 'break' && !/break|lunch|recess/i.test(period.name)).length
    const totalSlots = usablePeriods * days.length

    classes.forEach(className => {
      const classLessons = lessons.filter(lesson => lesson.className === className)
      const occupiedSlots = new Set(classLessons.map(lesson => lesson.day + ':' + lesson.period))
      const conflicts = classLessons.filter((lesson, index) => classLessons.some((other, otherIndex) => otherIndex !== index && other.day === lesson.day && other.period === lesson.period))
      if (classLessons.length > totalSlots) {
        found.push({ id: 'capacity:' + className, title: `Class ${className} has more lessons (${classLessons.length}) than available timetable positions (${totalSlots}).`, detail: className, type: 'critical', lessonIds: classLessons.map(lesson => lesson.id) })
      }
      if (conflicts.length) {
        found.push({ id: 'conflict:' + className, title: `Class ${className} has ${conflicts.length} lesson assignment(s) sharing a timetable position.`, detail: className, type: 'critical', lessonIds: conflicts.map(lesson => lesson.id) })
      }
      void occupiedSlots
    })

    const pairs = new Map<string, AdvisorLesson[]>()
    lessons.forEach(lesson => {
      const key = lesson.className + '\u0000' + lesson.subject
      pairs.set(key, [...(pairs.get(key) || []), lesson])
    })
    pairs.forEach((entries, key) => {
      const [className, subject] = key.split('\u0000')
      const uniqueDays = new Set(entries.map(lesson => lesson.day)).size
      if (entries.length > days.length) {
        found.push({ id: 'frequency:' + key, title: `${subject} · ${className} appears ${entries.length} times per week, more than the ${days.length} configured days.`, detail: className + ' · ' + subject, type: 'suggestion', lessonIds: entries.map(lesson => lesson.id) })
      } else if (entries.length > 1 && uniqueDays < entries.length) {
        found.push({ id: 'same-day:' + key, title: `${subject} · ${className} is scheduled multiple times on at least one day.`, detail: className + ' · ' + subject, type: 'suggestion', lessonIds: entries.map(lesson => lesson.id) })
      }
    })
    return found
  }, [classes, lessons, days, periods])

  const critical = issues.filter(issue => issue.type === 'critical' && !ignored.includes(issue.id))
  const suggestions = issues.filter(issue => issue.type === 'suggestion' && !ignored.includes(issue.id))
  const actionLink = (label: string, issue: AdvisorIssue) => <button type="button" onClick={() => setFocusedIssue(current => current === issue.id ? null : issue.id)} style={S.link}>{label}</button>

  return <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Timetable Advisor">
    <section style={S.window}>
      <header style={S.titleBar}><strong>Advisor</strong><button type="button" onClick={onClose} style={S.x} aria-label="Close advisor">×</button></header>
      <div style={S.body}>
        <div style={S.header}>
          <div style={S.avatar} aria-hidden="true">🧙‍♂️</div>
          <div style={S.counts}>
            <div style={S.count}><div style={{ ...S.bigBar, background: '#7a1a1a' }} /><div><div style={{ ...S.bigNum, color: '#7a1a1a' }}>{critical.length}</div><div style={S.smallLabel}>Critical problems</div></div></div>
            <div style={S.count}><div style={{ ...S.bigBar, background: '#3498db' }} /><div><div style={{ ...S.bigNum, color: '#3498db' }}>{suggestions.length}</div><div style={S.smallLabel}>Suggestions</div></div></div>
          </div>
        </div>
        {critical.length > 0 && <><div style={S.redBar}>Fix these critical timetable problems before generating.</div>{critical.map(issue => <div key={issue.id} style={S.item}><div style={{ ...S.sideBar, background: '#7a1a1a' }} /><div style={S.itemContent}><strong style={S.itemTitle}>{issue.title}</strong><div style={S.itemDetail}>{issue.detail}</div>{focusedIssue === issue.id && <div style={S.lessonList}>Matching lessons: {lessons.filter(lesson => issue.lessonIds.includes(lesson.id)).map(lesson => `${lesson.day} P${lesson.period + 1} · ${lesson.subject} · ${lesson.teacher}`).join('; ') || 'No matching lesson entries.'}</div>}</div><div style={S.actions}><button type="button" onClick={() => setIgnored(current => [...current, issue.id])} style={S.actionBtn}>Ignore</button>{actionLink('Show me the lessons', issue)}{actionLink('Check lesson assignments', issue)}</div></div>)}</>}
        {suggestions.length > 0 && <><div style={S.blueBar}>These suggestions may be acceptable, but review them.</div>{suggestions.map(issue => <div key={issue.id} style={S.item}><div style={{ ...S.sideBar, background: '#5bc0de' }} /><div style={S.itemContent}><strong style={S.itemTitle}>{issue.title}</strong><div style={S.itemDetail}>{issue.detail}</div>{focusedIssue === issue.id && <div style={S.lessonList}>Matching lessons: {lessons.filter(lesson => issue.lessonIds.includes(lesson.id)).map(lesson => `${lesson.day} P${lesson.period + 1} · ${lesson.subject} · ${lesson.teacher}`).join('; ')}</div>}</div><div style={S.actions}><button type="button" onClick={() => setIgnored(current => [...current, issue.id])} style={S.actionBtn}>Ignore</button>{actionLink('Show the lessons', issue)}{actionLink('Check lesson counts', issue)}</div></div>)}</>}
        {critical.length === 0 && suggestions.length === 0 && <div style={S.empty}>No critical problems or suggestions were found in the current timetable data.</div>}
        <footer style={S.footer}><button type="button" onClick={onClose} style={S.close}>Close</button></footer>
      </div>
    </section>
  </div>
}

const S: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontFamily: 'Segoe UI, Tahoma, sans-serif' },
  window: { width: 'min(1100px, 98vw)', height: 'min(92vh, 900px)', background: '#f5f5f5', border: '1px solid #888', boxShadow: '10px 10px 26px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', color: '#111', overflow: 'hidden' },
  titleBar: { minHeight: 32, background: '#e0e0e0', borderBottom: '1px solid #aaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px', fontSize: 13 },
  x: { width: 26, height: 24, border: '1px solid #aaa', background: '#fff', cursor: 'pointer' },
  body: { flex: 1, overflowY: 'auto', background: '#f0f0f0' },
  header: { display: 'flex', alignItems: 'center', gap: 28, padding: '18px 24px', background: '#f9f9f9', borderBottom: '1px solid #ddd' },
  avatar: { width: 76, height: 76, borderRadius: '50%', background: '#e8e8e8', border: '2px solid #ccc', display: 'grid', placeItems: 'center', fontSize: 44, flexShrink: 0 },
  counts: { display: 'flex', gap: 48, flexWrap: 'wrap' },
  count: { display: 'flex', gap: 12, alignItems: 'center' },
  bigBar: { width: 10, height: 52 },
  bigNum: { fontSize: 34, fontWeight: 300, lineHeight: 1.1 },
  smallLabel: { fontSize: 12, color: '#666' },
  redBar: { background: '#6b1a1a', color: '#fff', padding: '9px 16px', fontSize: 12 },
  blueBar: { background: '#2e9bd6', color: '#fff', padding: '9px 16px', fontSize: 12, marginTop: 12 },
  item: { display: 'flex', alignItems: 'stretch', gap: 0, background: '#fff', borderBottom: '1px solid #ddd', minHeight: 82, flexWrap: 'wrap' },
  sideBar: { width: 8, flexShrink: 0 },
  itemContent: { flex: '1 1 280px', minWidth: 0, padding: '12px 16px' },
  itemTitle: { display: 'block', fontSize: 12, lineHeight: 1.5 },
  itemDetail: { fontSize: 11, color: '#666', marginTop: 4 },
  lessonList: { fontSize: 11, color: '#334155', marginTop: 8, lineHeight: 1.5, overflowWrap: 'anywhere' },
  actions: { width: 210, padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 },
  actionBtn: { border: '1px solid #aaa', background: '#e8f8ff', padding: '4px 10px', fontSize: 11, borderRadius: 12, cursor: 'pointer' },
  link: { border: 0, padding: 0, background: 'transparent', color: '#2e8ad6', fontSize: 11, textAlign: 'left', cursor: 'pointer' },
  empty: { padding: 28, background: '#fff', color: '#475569', fontSize: 13 },
  footer: { display: 'flex', justifyContent: 'flex-end', padding: 16, background: '#f5f5f5' },
  close: { width: 80, height: 30, border: '1px solid #999', background: '#fff', cursor: 'pointer' },
}
