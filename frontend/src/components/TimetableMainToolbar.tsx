import type { ReactNode } from 'react'
import { DownloadIcon, GridIcon, LayersIcon, PlusIcon, PrintIcon, SparkIcon } from './icons'
import { TimetablePrintSetLauncher } from './TimetablePrintSetLauncher'
import { Link } from '../lib/router'

type ItemProps = { label: string; onClick?: () => void; icon: ReactNode; href?: string }

function ToolItem({ label, onClick, icon, href }: ItemProps) {
  const content = <><span className="timetable-main-toolbar__icon">{icon}</span><span>{label}</span></>
  if (href) return <Link className="timetable-main-toolbar__item" to={href} title={label}>{content}</Link>
  return <button type="button" className="timetable-main-toolbar__item" onClick={onClick} title={label}>{content}</button>
}

function clickExisting(label: string) {
  const buttons = Array.from(document.querySelectorAll('.timetable-controls-card button')) as HTMLButtonElement[]
  buttons.find((item) => item.textContent?.replace(/\s+/g, ' ').trim() === label)?.click()
}

export function TimetableMainToolbar() {
  function saveView() {
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    localStorage.setItem('phikila:timetable-view', JSON.stringify({ scope: scope?.value ?? 'all', target: target?.value ?? '' }))
  }

  return <div className="timetable-main-toolbar" role="toolbar" aria-label="Timetable main toolbar">
    <ToolItem label="New" href="/scheduling/generate" icon={<PlusIcon width={22} height={22} />} />
    <ToolItem label="Open" href="/versions" icon={<LayersIcon width={22} height={22} />} />
    <ToolItem label="Save" onClick={saveView} icon={<DownloadIcon width={22} height={22} />} />
    <span className="timetable-main-toolbar__separator" aria-hidden="true" />
    <ToolItem label="Print" onClick={() => window.print()} icon={<PrintIcon width={22} height={22} />} />
    <div className="timetable-main-toolbar__setup"><TimetablePrintSetLauncher /></div>
    <ToolItem label="CSV" onClick={() => clickExisting('CSV')} icon={<GridIcon width={22} height={22} />} />
    <ToolItem label="PNG" onClick={() => clickExisting('PNG')} icon={<SparkIcon width={22} height={22} />} />
    <style>{`
      .timetable-main-toolbar { display:flex; align-items:stretch; width:100%; min-height:82px; background:#fff; border:0; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,.08); overflow-x:auto; margin:0 0 24px; padding:0 8px; }
      .timetable-main-toolbar__item { display:flex; flex:1 1 0; min-width:82px; flex-direction:column; align-items:center; justify-content:center; gap:6px; border:0; background:transparent; color:#111; text-decoration:none; font:500 12px/1.1 Arial,Helvetica,sans-serif; cursor:pointer; padding:9px 8px; }
      .timetable-main-toolbar__item:hover { background:#f7f7f7; }
      .timetable-main-toolbar__item:focus-visible { outline:2px solid #2563eb; outline-offset:-2px; border-radius:6px; }
      .timetable-main-toolbar__icon { display:flex; width:24px; height:24px; align-items:center; justify-content:center; }
      .timetable-main-toolbar__icon svg { stroke:#111; }
      .timetable-main-toolbar__separator { width:1px; height:48px; align-self:center; background:#d7d7d7; flex:0 0 1px; }
      .timetable-main-toolbar__setup { display:flex; flex:1 1 0; min-width:82px; align-items:stretch; justify-content:center; }
      .timetable-main-toolbar__setup > .button { width:100%; border:0!important; border-radius:0!important; background:transparent!important; box-shadow:none!important; color:#111; font:500 12px/1.1 Arial,Helvetica,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:9px 8px; }
      .timetable-main-toolbar__setup > .button::before { content:'🖨'; display:block; font-size:21px; line-height:24px; filter:grayscale(1); }
      .timetable-main-toolbar__setup > .button::after { content:'⚙'; position:absolute; margin:17px 0 0 18px; font-size:10px; line-height:10px; background:#fff; filter:grayscale(1); }
      .timetable-main-toolbar__setup > .button:hover { background:#f7f7f7!important; }
      @media (max-width:700px) { .timetable-main-toolbar__item,.timetable-main-toolbar__setup { min-width:74px; } }
    `}</style>
  </div>
}
