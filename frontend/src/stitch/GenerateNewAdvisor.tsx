import React, { useState } from 'react'

type GenerateNewAdvisorProps = { onClose: () => void }

export default function GenerateNewAdvisor({ onClose }: GenerateNewAdvisorProps) {
  const [criticalIgnored, setCriticalIgnored] = useState(false)
  const [suggestIgnored, setSuggestIgnored] = useState(false)

  return <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Generate New Advisor">
    <section style={S.window}>
      <header style={S.titleBar}><strong>Advisor</strong><button type="button" onClick={onClose} style={S.x} aria-label="Close advisor">×</button></header>
      <div style={S.body}>
        <div style={S.top}>
          <div style={S.einstein} aria-hidden="true">👨‍🦳</div>
          <div style={S.counts}>
            <div style={S.countBox}><div style={S.barDark}/><div><div style={S.num}>{criticalIgnored ? 0 : 1}</div><div style={S.label}>Critical problems</div></div></div>
            <div style={S.countBox}><div style={S.barBlue}/><div><div style={{ ...S.num, color: '#3498db' }}>{suggestIgnored ? 0 : 1}</div><div style={{ ...S.label, color: '#3498db' }}>Suggestions</div></div></div>
          </div>
        </div>
        {!criticalIgnored && <>
          <div style={S.redBar}>No need to generate the timetable, these points need to be fixed first:</div>
          <div style={S.row}><div style={S.leftDark}/><div style={S.mid}><div style={S.bold}>Class GRADE 9B has more lessons (44) than free positions in timeoff (40).</div><div style={S.small}>9B</div></div>
            <div style={S.right}><div style={S.line}><button type="button" onClick={() => setCriticalIgnored(true)} style={S.btn}><span style={S.iconBox}>□</span> Ignore</button><span>✨🪄</span><div style={S.links}><button type="button" style={S.link}>Show me the lessons</button><button type="button" style={S.link}>Check the lesson counts</button></div></div>
              <div style={S.line}><button type="button" style={S.btn}><span style={S.q}>?</span> Help</button><div style={S.links}><button type="button" style={S.link}>Raise the lessons per day</button><button type="button" style={S.link}>Raise the global number of lessons per day</button></div></div>
            </div>
          </div>
        </>}
        {!suggestIgnored && <>
          <div style={S.blueBar}>These points are most likely OK, but please check the help article to avoid potential problems</div>
          <div style={S.row}><div style={S.leftBlue}/><div style={S.mid}><div style={S.bold}>CREATIVE ARTS SPORTS-GRADE 4 more times per week than days</div><div style={S.small}>G4,5E,5W, 6E,6W,6N, 9B</div></div>
            <div style={S.right}><div style={S.line}><button type="button" onClick={() => setSuggestIgnored(true)} style={S.btn}><span style={S.iconBox}>□</span> Ignore</button><span>✨🪄</span><div style={S.links}><button type="button" style={S.link}>Show the lessons</button><button type="button" style={S.link}>Check how the lessons are defined</button></div></div>
              <div style={S.line}><button type="button" style={S.btn}><span style={S.q}>?</span> Help</button></div>
            </div>
          </div>
        </>}
        {criticalIgnored && suggestIgnored && <div style={S.empty}>All items have been ignored.</div>}
        <footer style={S.footer}><button type="button" onClick={onClose} style={S.close}>Close</button></footer>
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
  right: { width: 380, maxWidth: '100%', padding: 8, boxSizing: 'border-box' },
  line: { display: 'flex', gap: 12, marginBottom: 8, alignItems: 'flex-start', flexWrap: 'wrap' },
  btn: { display: 'flex', alignItems: 'center', gap: 5, border: '1px solid #a0c8e0', background: '#e3f2fb', borderRadius: 12, padding: '2px 10px', fontSize: 11, cursor: 'pointer', minHeight: 22, flexShrink: 0 },
  iconBox: { width: 12, height: 12, border: '1px solid #777', background: '#fff', fontSize: 8, display: 'inline-grid', placeItems: 'center' },
  q: { width: 16, height: 16, background: '#5bc0de', color: '#fff', borderRadius: '50%', display: 'inline-grid', placeItems: 'center', fontWeight: 700 },
  links: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
  link: { border: 0, padding: 0, background: 'transparent', fontSize: 11, color: '#2980b9', cursor: 'pointer', lineHeight: 1.4, textAlign: 'left' },
  empty: { padding: 24, background: '#fff', fontSize: 12, color: '#666' },
  footer: { display: 'flex', justifyContent: 'flex-end', padding: 12, borderTop: '1px solid #ddd' },
  close: { width: 80, height: 26, border: '1px solid #999', background: '#fff', cursor: 'pointer', fontSize: 11 },
}
