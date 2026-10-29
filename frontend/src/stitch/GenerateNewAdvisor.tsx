import React, { useMemo, useState } from 'react'

type Lesson = { id: string; day: string; period: number; className: string; subject: string; teacher: string; room: string; locked: boolean }
type Period = { name: string; type?: 'lesson' | 'break' }
type GridDetails = { timeOffGrid?: number[][]; classrooms?: string[] }
type AdvisorIssue = { id: string; title: string; detail: string; kind: 'critical' | 'suggestion'; lessonIds: string[] }
type Props = {
  classes: string[]
  lessons: Lesson[]
  days: string[]
  periods: Period[]
  classDetails: Record<string, GridDetails>
  teacherDetails: Record<string, GridDetails>
  subjectDetails: Record<string, GridDetails>
  onGenerate: (reportProgress: (percent: number, message: string) => void) => Promise<void> | void
  onClose: () => void
}

export default function GenerateNewAdvisor({ classes, lessons, days, periods, classDetails, teacherDetails, subjectDetails, onGenerate, onClose }: Props) {
  const [ignored, setIgnored] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('Ready to generate timetable')

  const issues = useMemo(() => {
    const result: AdvisorIssue[] = []
    const usablePeriods = periods.map((period, index) => ({ period, index }))
      .filter(({ period }) => period.type !== 'break' && !/break|lunch|recess/i.test(period.name))
      .map(({ index }) => index)
    classes.forEach(className => {
      const assigned = lessons.filter(lesson => lesson.className === className)
      const grid = classDetails[className]?.timeOffGrid
      const availableSlots = days.reduce((total, _day, dayIndex) => total + usablePeriods.filter(periodIndex => grid?.[dayIndex]?.[periodIndex] !== 2).length, 0)
      if (assigned.length > availableSlots) result.push({
        id: 'capacity:' + className,
        title: `Class ${className} has ${assigned.length} lesson entries but only ${availableSlots} available teaching positions after configured time-off.`,
        detail: className, kind: 'critical', lessonIds: assigned.map(lesson => lesson.id),
      })
    })

    lessons.filter(lesson => lesson.locked).forEach(lesson => {
      const dayIndex = days.indexOf(lesson.day)
      const unavailableFor = [
        classDetails[lesson.className]?.timeOffGrid?.[dayIndex]?.[lesson.period] === 2 ? 'class ' + lesson.className : '',
        teacherDetails[lesson.teacher]?.timeOffGrid?.[dayIndex]?.[lesson.period] === 2 ? 'teacher ' + lesson.teacher : '',
        subjectDetails[lesson.subject]?.timeOffGrid?.[dayIndex]?.[lesson.period] === 2 ? 'subject ' + lesson.subject : '',
      ].filter(Boolean)
      if (dayIndex >= 0 && unavailableFor.length) result.push({
        id: 'timeoff:' + lesson.id,
        title: `Locked lesson ${lesson.subject} · ${lesson.className} is placed in configured time-off for ${unavailableFor.join(', ')}.`,
        detail: lesson.day + ' · ' + (periods[lesson.period]?.name || 'Period ' + (lesson.period + 1)),
        kind: 'critical', lessonIds: [lesson.id],
      })
    })

    const locked = lessons.filter(lesson => lesson.locked)
    locked.forEach((lesson, index) => locked.slice(index + 1).forEach(other => {
      if (lesson.day !== other.day || lesson.period !== other.period) return
      const resources: string[] = []
      if (lesson.className && lesson.className === other.className) resources.push('class ' + lesson.className)
      if (lesson.teacher && lesson.teacher === other.teacher) resources.push('teacher ' + lesson.teacher)
      if (lesson.room && lesson.room === other.room) resources.push('room ' + lesson.room)
      if (resources.length) result.push({
        id: 'locked:' + lesson.id + ':' + other.id,
        title: `Locked lessons clash at ${lesson.day}, ${periods[lesson.period]?.name || 'period ' + (lesson.period + 1)} (${resources.join(', ')}).`,
        detail: lesson.className + ' · ' + lesson.subject,
        kind: 'critical', lessonIds: [lesson.id, other.id],
      })
    }))

    const byClassSubject = new Map<string, Lesson[]>()
    lessons.forEach(lesson => {
      const key = lesson.className + '\u0000' + lesson.subject
      byClassSubject.set(key, [...(byClassSubject.get(key) || []), lesson])
    })
    byClassSubject.forEach((entries, key) => {
      if (entries.length <= days.length) return
      const [className, subject] = key.split('\u0000')
      result.push({
        id: 'frequency:' + key,
        title: `${subject} in ${className} has ${entries.length} lesson entries per week across ${days.length} configured days.`,
        detail: className + ' · ' + subject, kind: 'suggestion', lessonIds: entries.map(lesson => lesson.id),
      })
    })
    return result
  }, [classes, lessons, days, periods])

  const critical = issues.filter(issue => issue.kind === 'critical' && !ignored.includes(issue.id))
  const suggestions = issues.filter(issue => issue.kind === 'suggestion' && !ignored.includes(issue.id))
  const startGeneration = async () => {
    if (critical.length || generating) return
    setGenerating(true)
    setProgress(1)
    setProgressMessage('Preparing timetable generation')
    try {
      await onGenerate((percent, message) => {
        setProgress(Math.max(0, Math.min(100, percent)))
        setProgressMessage(message)
      })
    } catch (error) {
      setGenerating(false)
      setProgressMessage(error instanceof Error ? error.message : 'Generation failed. Existing timetable was preserved.')
    }
  }
  const lessonSummary = (issue: AdvisorIssue) => lessons.filter(lesson => issue.lessonIds.includes(lesson.id))
    .map(lesson => `${lesson.day} · ${periods[lesson.period]?.name || 'Period ' + (lesson.period + 1)} · ${lesson.subject} · ${lesson.className} · ${lesson.teacher}`)
    .join('; ')

  return <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Generate New Advisor">
    <section style={S.window}>
      <header style={S.titleBar}><strong>Advisor</strong><button type="button" onClick={onClose} style={S.x} aria-label="Close advisor">×</button></header>
      <div style={S.body}>
        <div style={S.top}>
          <div style={S.einstein} aria-hidden="true">👨‍🦳</div>
          <div style={S.counts}>
            <div style={S.countBox}><div style={S.barDark}/><div><div style={S.num}>{critical.length}</div><div style={S.label}>Critical problems</div></div></div>
            <div style={S.countBox}><div style={S.barBlue}/><div><div style={{ ...S.num, color: '#3498db' }}>{suggestions.length}</div><div style={{ ...S.label, color: '#3498db' }}>Suggestions</div></div></div>
          </div>
        </div>
        {critical.length > 0 && <>
          <div style={S.redBar}>Resolve these critical problems before generating the timetable.</div>
          {critical.map(issue => <div key={issue.id} style={S.row}><div style={S.leftDark}/><div style={S.mid}><div style={S.bold}>{issue.title}</div><div style={S.small}>{issue.detail}</div>{expanded === issue.id && <div style={S.lessonList}>{lessonSummary(issue)}</div>}</div>
            <div style={S.right}><div style={S.line}><button type="button" onClick={() => setIgnored(current => current.filter(id => id !== issue.id))} style={S.btn} disabled>Required</button><div style={S.links}><button type="button" onClick={() => setExpanded(expanded === issue.id ? null : issue.id)} style={S.link}>Show me the lessons</button><button type="button" onClick={() => setExpanded(expanded === issue.id ? null : issue.id)} style={S.link}>Check lesson counts</button></div></div></div>
          </div>)}
        </>}
        {suggestions.length > 0 && <>
          <div style={S.blueBar}>Review these suggestions. They do not block generation.</div>
          {suggestions.map(issue => <div key={issue.id} style={S.row}><div style={S.leftBlue}/><div style={S.mid}><div style={S.bold}>{issue.title}</div><div style={S.small}>{issue.detail}</div>{expanded === issue.id && <div style={S.lessonList}>{lessonSummary(issue)}</div>}</div>
            <div style={S.right}><div style={S.line}><button type="button" onClick={() => setIgnored(current => [...current, issue.id])} style={S.btn}>Ignore</button><div style={S.links}><button type="button" onClick={() => setExpanded(expanded === issue.id ? null : issue.id)} style={S.link}>Show the lessons</button><button type="button" onClick={() => setExpanded(expanded === issue.id ? null : issue.id)} style={S.link}>Check lesson counts</button></div></div></div>
          </div>)}
        </>}
        {issues.length === 0 && <div style={S.empty}>No critical problems or suggestions were found in the current timetable data.</div>}
        <div role="status" aria-live="polite" style={{padding:'12px 16px',background:'#eef6fb',borderTop:'1px solid #c8deed',borderBottom:'1px solid #c8deed'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,fontSize:12,marginBottom:7}}><strong>{progressMessage}</strong><span style={{fontVariantNumeric:'tabular-nums',fontWeight:700}}>{progress}%</span></div>
          <div role="progressbar" aria-label="Timetable generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={{height:10,background:'#d6e0e8',borderRadius:6,overflow:'hidden'}}>
            <div style={{width:progress+'%',height:'100%',background:'#2185d0',transition:'width 160ms ease'}} />
          </div>
          <div style={{fontSize:10,color:'#52616b',marginTop:6}}>{generating ? 'Your existing timetable stays unchanged until a successful draft is ready.' : 'Progress will update here as the timetable is generated.'}</div>
        </div>
        <footer style={S.footer}>
          <button type="button" onClick={onClose} disabled={generating} style={{...S.close,opacity:generating?.5:1}}>{generating ? 'Please wait…' : 'Close'}</button>
          <button type="button" onClick={startGeneration} disabled={critical.length > 0 || generating} style={{ ...S.generate, opacity: critical.length > 0 || generating ? .5 : 1 }}>{generating ? 'Generating…' : 'Continue to Generate'}</button>
        </footer>
      </div>
    </section>
  </div>
}

const S: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10060, padding: 12, fontFamily: 'Segoe UI, sans-serif' },
  window: { width: '98%', maxWidth: 1050, height: '85vh', background: '#f5f5f5', border: '1px solid #888', boxShadow: '8px 8px 20px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', color: '#111', overflow: 'hidden' },
  titleBar: { minHeight: 28, background: '#eee', borderBottom: '1px solid #aaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px', fontSize: 12 },
  x: { cursor: 'pointer', width: 22, height: 20, border: '1px solid #aaa', background: '#fff', display: 'grid', placeItems: 'center' },
  body: { flex: 1, overflowY: 'auto' },
  top: { display: 'flex', alignItems: 'center', gap: 50, padding: 20, background: '#fafafa', flexWrap: 'wrap' },
  einstein: { fontSize: 64 },
  counts: { display: 'flex', gap: 60, flexWrap: 'wrap' },
  countBox: { display: 'flex', gap: 10, alignItems: 'center' },
  barDark: { width: 12, height: 60, background: '#6b1a1a' },
  barBlue: { width: 12, height: 60, background: '#3498db' },
  num: { fontSize: 36, color: '#333' },
  label: { fontSize: 11, color: '#666' },
  redBar: { background: '#6b1a1a', color: '#fff', padding: '7px 14px', fontSize: 11 },
  blueBar: { background: '#2ea3dc', color: '#fff', padding: '7px 14px', fontSize: 11, marginTop: 10 },
  row: { display: 'flex', background: '#fff', borderBottom: '1px solid #ddd', minHeight: 80, flexWrap: 'wrap' },
  leftDark: { width: 10, background: '#6b1a1a', flexShrink: 0 },
  leftBlue: { width: 10, background: '#5bc0de', flexShrink: 0 },
  mid: { flex: '1 1 280px', padding: '10px 14px', minWidth: 0 },
  bold: { fontSize: 12, fontWeight: 700 },
  small: { fontSize: 11, color: '#666', marginTop: 3 },
  lessonList: { fontSize: 11, color: '#334155', marginTop: 8, lineHeight: 1.5, overflowWrap: 'anywhere' },
  right: { width: 300, maxWidth: '100%', padding: 8, boxSizing: 'border-box' },
  line: { display: 'flex', gap: 12, marginBottom: 8, alignItems: 'flex-start', flexWrap: 'wrap' },
  btn: { display: 'flex', alignItems: 'center', gap: 5, border: '1px solid #a0c8e0', background: '#e3f2fb', borderRadius: 12, padding: '2px 10px', fontSize: 11, cursor: 'pointer', minHeight: 22, flexShrink: 0 },
  links: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
  link: { border: 0, padding: 0, background: 'transparent', fontSize: 11, color: '#2980b9', cursor: 'pointer', lineHeight: 1.4, textAlign: 'left' },
  empty: { padding: 24, background: '#fff', fontSize: 12, color: '#666' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12, borderTop: '1px solid #ddd' },
  close: { width: 80, height: 28, border: '1px solid #999', background: '#fff', cursor: 'pointer', fontSize: 11 },
  generate: { minWidth: 150, height: 28, border: '1px solid #246b45', background: '#e2f4e8', cursor: 'pointer', fontSize: 11, padding: '0 12px' },
}
