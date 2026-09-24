import { useEffect, useState } from 'react'
import { useNavigate } from '../lib/router'
import { TimetableMainToolbar } from '../components/TimetableMainToolbar'
import { TimetablePrintSetLauncher } from '../components/TimetablePrintSetLauncher'
import { TimetablePage } from './TimetablePage'

/**
 * Dedicated whole-school timetable workspace.
 * The management shell remains available underneath, but the timetable takes
 * over the viewport so the grid gets the same screen-first treatment as a
 * desktop scheduling application.
 */
function TimetableNavigator() {
  const [scope, setScope] = useState('all')
  const [target, setTarget] = useState('')
  const [targets, setTargets] = useState<{ value: string; label: string }[]>([])

  function syncFromPage() {
    const scopeEl = document.getElementById('tt-scope') as HTMLSelectElement | null
    const targetEl = document.getElementById('tt-target') as HTMLSelectElement | null
    setScope(scopeEl?.value ?? 'all')
    setTarget(targetEl?.value ?? '')
    setTargets(targetEl ? Array.from(targetEl.options).filter((o) => o.value).map((o) => ({ value: o.value, label: o.text })) : [])
  }

  useEffect(() => {
    syncFromPage()
    const timer = window.setInterval(syncFromPage, 300)
    return () => window.clearInterval(timer)
  }, [])

  function changeScope(value: string) {
    const el = document.getElementById('tt-scope') as HTMLSelectElement | null
    if (!el) return
    el.value = value
    el.dispatchEvent(new Event('change', { bubbles: true }))
    window.setTimeout(syncFromPage, 80)
  }

  function changeTarget(value: string) {
    const el = document.getElementById('tt-target') as HTMLSelectElement | null
    if (!el) return
    el.value = value
    el.dispatchEvent(new Event('change', { bubbles: true }))
    setTarget(value)
  }

  function move(delta: number) {
    if (scope === 'all') {
      const order = ['all', 'class', 'teacher', 'room', 'subject']
      const index = Math.max(0, order.indexOf(scope))
      changeScope(order[(index + delta + order.length) % order.length])
      return
    }
    if (!targets.length) return
    const index = Math.max(0, targets.findIndex((item) => item.value === target))
    changeTarget(targets[(index + delta + targets.length) % targets.length].value)
  }

  const currentLabel = targets.find((item) => item.value === target)?.label ?? (scope === 'all' ? 'Whole school' : 'Choose…')

  return <div className="timetable-report-nav" aria-label="Timetable navigation">
    <div className="timetable-report-nav__selectors">
      <select aria-label="Report type" value={scope} onChange={(event) => changeScope(event.target.value)}>
        <option value="all">Whole school</option>
        <option value="class">Classes</option>
        <option value="teacher">Teachers</option>
        <option value="room">Rooms</option>
        <option value="subject">Subjects</option>
      </select>
      <select aria-label="Selected timetable" value={target} disabled={scope === 'all' || !targets.length} onChange={(event) => changeTarget(event.target.value)}>
        {scope === 'all' ? <option value="">Whole school timetable</option> : <><option value="">Choose…</option>{targets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</>}
      </select>
    </div>
    <button type="button" aria-label="Previous timetable" title="Previous" onClick={() => move(-1)}>‹</button>
    <span className="timetable-report-nav__current" aria-live="polite">{currentLabel}</span>
    <button type="button" aria-label="Next timetable" title="Next" onClick={() => move(1)}>›</button>
    <TimetablePrintSetLauncher />
  </div>
}

export function EnhancedTimetablePage() {
  const navigate = useNavigate()

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  return <div className="timetable-workspace" data-timetable-workspace>
    <div className="timetable-workspace__topbar">
      <button
        type="button"
        className="timetable-workspace__back"
        onClick={() => navigate('/')}
        aria-label="Back to dashboard"
      >
        <span aria-hidden="true">←</span>
        <span>Dashboard</span>
      </button>
      <div className="timetable-workspace__title">
        <strong>Timetable</strong>
        <span>Whole School</span>
      </div>
      <div className="timetable-workspace__mode" aria-label="Current timetable view">Whole school</div>
    </div>

    <main className="timetable-workspace__content">
      <TimetableMainToolbar />
      <TimetableNavigator />
      <TimetablePage />
    </main>

    <style>{`
      .timetable-workspace {
        position:fixed;
        inset:0;
        z-index:1000;
        width:100vw;
        height:100vh;
        min-height:100vh;
        overflow:auto;
        background:#f6f8fb;
        color:#111827;
        box-sizing:border-box;
        font-family:Arial,Helvetica,sans-serif;
      }
      .timetable-workspace * { box-sizing:border-box; }
      .timetable-workspace__topbar {
        position:sticky;
        top:0;
        z-index:90;
        display:grid;
        grid-template-columns:180px minmax(180px,1fr) 180px;
        align-items:center;
        min-height:42px;
        padding:0 16px;
        background:#fff;
        border-bottom:1px solid #dfe4ea;
      }
      .timetable-workspace__back {
        justify-self:start;
        display:inline-flex;
        align-items:center;
        gap:7px;
        min-height:30px;
        border:0;
        background:transparent;
        color:#334155;
        font:600 12px/1 Arial,Helvetica,sans-serif;
        cursor:pointer;
        padding:4px 6px;
        border-radius:5px;
      }
      .timetable-workspace__back:hover { background:#f1f5f9; color:#0f2a47; }
      .timetable-workspace__back span:first-child { font-size:17px; line-height:1; }
      .timetable-workspace__title { display:flex; align-items:baseline; justify-content:center; gap:8px; min-width:0; }
      .timetable-workspace__title strong { font-size:13px; letter-spacing:.01em; }
      .timetable-workspace__title span { color:#64748b; font-size:12px; }
      .timetable-workspace__mode {
        justify-self:end;
        padding:5px 9px;
        border:1px solid #dbe3ec;
        border-radius:5px;
        background:#f8fafc;
        color:#475569;
        font-size:11px;
        font-weight:700;
      }
      .timetable-workspace__content {
        width:100%;
        min-height:calc(100vh - 42px);
        padding:8px 14px 18px;
      }
      .timetable-floating-nav {
        position:fixed;
        left:14px;
        top:50%;
        transform:translateY(-50%);
        z-index:1200;
        display:flex;
        flex-direction:column;
        gap:7px;
        width:210px;
        padding:9px;
        background:#f4f4f1;
        border:1px solid #8d8d86;
        border-radius:3px;
        box-shadow:4px 5px 0 rgba(0,0,0,.12),0 8px 24px rgba(15,23,42,.16);
        font:11px Arial,Helvetica,sans-serif;
      }\n      .timetable-floating-nav__caption { display:block; margin-bottom:2px; color:#555; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }\n      .timetable-floating-nav select { height:28px; min-width:150px; padding:3px 7px; border:1px solid #cbd5e1; border-radius:4px; background:#fff; color:#1f2937; font-size:11px; }\n      .timetable-floating-nav__target { flex:1 1 auto; min-width:150px; }\n      .timetable-floating-nav__target select { width:100%; }\n      .timetable-floating-nav__arrows { display:grid; grid-template-columns:38px 1fr 38px; align-items:center; gap:5px; }\n      .timetable-floating-nav__arrows button { width:38px; height:34px; padding:0; border:1px solid #777b75; border-radius:2px; background:#e6e6e2; color:#111; font-family:Georgia,'Times New Roman',serif; font-size:29px; line-height:29px; cursor:pointer; box-shadow:inset 0 1px #fff; }\n      .timetable-floating-nav__arrows button:hover { background:#d7d7d2; }\n      .timetable-floating-nav__arrows span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center; color:#333; font-weight:700; }\n      .timetable-floating-nav__print { flex:0 0 auto; }\n\n      .timetable-workspace .timetable-main-toolbar {
        min-height:68px;
        margin:0 0 8px;
        padding:0 4px;
        border:1px solid #dfe4ea;
        border-radius:6px;
        box-shadow:0 1px 2px rgba(15,23,42,.05);
      }
      .timetable-workspace .timetable-main-toolbar__item,
      .timetable-workspace .timetable-main-toolbar__setup { min-width:76px; }
      .timetable-workspace .timetable-main-toolbar__item { gap:4px; padding:6px 7px; }
      .timetable-workspace .timetable-main-toolbar__icon { width:20px; height:20px; }
      .timetable-workspace .timetable-main-toolbar__icon svg { width:19px; height:19px; }
      .timetable-workspace .timetable-main-toolbar__item span:last-child,
      .timetable-workspace .timetable-main-toolbar__setup > .button { font-size:11px; }

      /* Compress the page chrome so the matrix, not cards and headings, owns the screen. */
      .timetable-workspace .timetable-enhanced-page { min-height:calc(100vh - 42px); background:transparent; }
      .timetable-workspace .timetable-enhanced-page > .timetable-main-toolbar { display:none; }
      .timetable-workspace .timetable-enhanced-page .timetable-page-shell { gap:8px; }
      .timetable-workspace .timetable-enhanced-page .page-header {
        margin:0;
        min-height:34px;
        padding:0 2px;
        display:flex;
        align-items:center;
      }
      .timetable-workspace .timetable-enhanced-page .page-header__title {
        margin:0;
        font-size:17px;
        line-height:1.1;
        font-weight:800;
        color:#172033;
      }
      .timetable-workspace .timetable-enhanced-page .page-header__description {
        margin:2px 0 0;
        font-size:10px;
        line-height:1.2;
        color:#64748b;
      }
      .timetable-workspace .timetable-enhanced-page .page-header__actions { display:none; }
      .timetable-workspace .timetable-enhanced-page .timetable-controls-card {
        padding:7px 9px;
        border:1px solid #dfe4ea;
        border-radius:6px;
        box-shadow:none;
      }
      .timetable-workspace .timetable-enhanced-page .timetable-controls-card .field__label { font-size:11px; }
      .timetable-workspace .timetable-enhanced-page .timetable-controls-card .input--select { min-width:130px; height:28px; font-size:11px; }
      .timetable-workspace .timetable-enhanced-page .day-chip { min-height:25px; padding:3px 7px; font-size:10px; }
      .timetable-workspace .timetable-enhanced-page .timetable-controls-card .toolbar__group { gap:2px; }
      .timetable-workspace .timetable-enhanced-page .timetable-controls-card .toolbar__zoom-label { min-width:42px; font-size:10px; }
      .timetable-workspace .timetable-enhanced-page .timetable-controls-card .button,
      .timetable-workspace .timetable-enhanced-page .timetable-controls-card .icon-button { min-height:26px; font-size:10px; }
      .timetable-workspace .timetable-enhanced-page .timetable-controls-card + .alert.alert--info {
        margin:0;
        padding:7px 10px;
        border-radius:6px;
        font-size:10px;
      }

      /* The grid is the primary workspace: remove the surrounding card chrome. */
      .timetable-workspace .timetable {
        width:100%;
        max-width:none;
        margin:0;
      }
      .timetable-workspace .timetable .card,
      .timetable-workspace .timetable-grid-card,
      .timetable-workspace .timetable__grid-card { border-radius:5px; }
      .timetable-workspace .timetable__whole-school-grid {
        width:100%;
        max-width:none;
        border-radius:3px;
        box-shadow:0 1px 2px rgba(15,23,42,.05);
      }
      .timetable-workspace .timetable__whole-class-label { font-weight:800; }

      @media (max-width:900px) {
        .timetable-workspace__topbar { grid-template-columns:130px minmax(120px,1fr) 120px; padding:0 9px; }
        .timetable-workspace__content { padding:7px 8px 14px; }
      }
      @media (max-width:700px) {
        .timetable-workspace__topbar { grid-template-columns:1fr auto; }
        .timetable-workspace__title { justify-content:flex-start; }
        .timetable-workspace__mode { display:none; }
        .timetable-workspace__content { padding:7px 6px 12px; }
        .timetable-floating-nav { left:6px; right:6px; top:auto; bottom:8px; transform:none; width:auto; }\n        .timetable-floating-nav__report, .timetable-floating-nav__target { flex:1 1 auto; }\n        .timetable-floating-nav__print { margin-left:auto; }\n        .timetable-workspace .timetable-main-toolbar { overflow-x:auto; }
        .timetable-workspace .timetable-main-toolbar__item,
        .timetable-workspace .timetable-main-toolbar__setup { min-width:68px; }
        .timetable-workspace .timetable-enhanced-page .page-header { display:none; }
      }
      @media print {
        .timetable-workspace { position:static; width:auto; height:auto; overflow:visible; background:#fff; }
        .timetable-workspace__topbar { display:none; }
        .timetable-workspace__content { padding:0; }
      }
    `}</style>
  </div>
}
