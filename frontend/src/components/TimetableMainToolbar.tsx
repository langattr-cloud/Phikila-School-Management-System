import type { ReactNode } from 'react'
import { CalendarIcon, CheckIcon, DownloadIcon, GridIcon, LayersIcon, PlusIcon, PrintIcon } from './icons'
import { TimetablePrintSetLauncher } from './TimetablePrintSetLauncher'
import { Link } from '../lib/router'

type ItemProps = { label: string; onClick?: () => void; icon?: ReactNode; href?: string }

function ToolItem({ label, onClick, icon, href }: ItemProps) {
  const content = <>{icon && <span className="timetable-main-toolbar__icon">{icon}</span>}<span>{label}</span></>
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

  return <div className="timetable-main-toolbar" role="toolbar" aria-label="Whole school timetable commands">
    <div className="timetable-main-toolbar__group">
      <span className="timetable-main-toolbar__label">View</span>
      <span className="timetable-main-toolbar__status">Whole school</span>
    </div>

    <div className="timetable-main-toolbar__group">
      <span className="timetable-main-toolbar__label">File</span>
      <ToolItem label="New" href="/scheduling/generate" icon={<PlusIcon width={20} height={20} />} />
      <ToolItem label="Open" href="/versions" icon={<LayersIcon width={20} height={20} />} />
      <ToolItem label="Save" onClick={saveView} icon={<CheckIcon width={20} height={20} />} />
      <ToolItem label="Print" onClick={() => window.print()} icon={<PrintIcon width={20} height={20} />} />
      <div className="timetable-main-toolbar__setup"><TimetablePrintSetLauncher /></div>
    </div>

    <div className="timetable-main-toolbar__group">
      <span className="timetable-main-toolbar__label">Manage</span>
      <ToolItem label="Subjects" href="/setup/subjects" />
      <ToolItem label="Classes" href="/setup/academic-setup" />
      <ToolItem label="Classrooms" href="/setup/rooms" />
      <ToolItem label="Teachers" href="/setup/teachers" />
      <ToolItem label="Students / Seminars" href="/students" />
      <ToolItem label="Relations" href="/scheduling/requirements" />
    </div>

    <div className="timetable-main-toolbar__group">
      <span className="timetable-main-toolbar__label">Timetable</span>
      <ToolItem label="Test" href="/analytics" />
      <ToolItem label="Generate" href="/scheduling/generate" />
      <ToolItem label="Verification" href="/versions" />
      <ToolItem label="School" href="/setup/school" />
      <ToolItem label="Timetables Online" href="/timetable/whole-school" />
    </div>

    <div className="timetable-main-toolbar__group timetable-main-toolbar__group--output">
      <span className="timetable-main-toolbar__label">Output</span>
      <ToolItem label="Print Preview" onClick={() => window.print()} />
      <ToolItem label="CSV" onClick={() => clickExisting('CSV')} icon={<GridIcon width={20} height={20} />} />
      <ToolItem label="Calendar" onClick={() => clickExisting('Calendar')} icon={<CalendarIcon width={20} height={20} />} />
      <ToolItem label="PNG" onClick={() => clickExisting('PNG')} icon={<DownloadIcon width={20} height={20} />} />
    </div>

    <style>{`
      .timetable-main-toolbar{display:flex;align-items:stretch;width:100%;min-height:74px;background:#F0F0F0;border:1px solid #d1d1d1;border-radius:4px;box-shadow:inset 0 1px #fff;overflow-x:auto;margin:0 0 10px;padding:0 4px;white-space:nowrap}
      .timetable-main-toolbar__group{display:flex;align-items:stretch;gap:0;border-right:1px solid #c8c8c8;flex:0 0 auto}
      .timetable-main-toolbar__group:last-child{border-right:0}
      .timetable-main-toolbar__label{display:flex;align-items:flex-start;padding:7px 6px 0;font:700 10px/1 Arial,Helvetica,sans-serif;color:#5f6368;text-transform:uppercase;letter-spacing:.04em}
      .timetable-main-toolbar__status{display:flex;align-items:center;padding:0 9px;font:700 12px/1 Arial,Helvetica,sans-serif;color:#222}
      .timetable-main-toolbar__item{display:flex;flex:0 0 auto;min-width:68px;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;background:transparent;color:#222;text-decoration:none;font:500 11px/1.1 Arial,Helvetica,sans-serif;cursor:pointer;padding:7px 7px}
      .timetable-main-toolbar__item:hover{background:#e4e4e4}
      .timetable-main-toolbar__item:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}
      .timetable-main-toolbar__icon{display:flex;width:22px;height:22px;align-items:center;justify-content:center}
      .timetable-main-toolbar__setup{display:flex;flex:0 0 78px;align-items:stretch;justify-content:center;position:relative}
      .timetable-main-toolbar__setup>.button{border:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:7px 5px;width:78px;color:#222;font:500 11px/1.1 Arial,Helvetica,sans-serif;position:relative}
      .timetable-main-toolbar__setup>.button:before{content:'🖨';font-size:20px;line-height:21px;height:22px;display:block;filter:grayscale(1)}
      .timetable-main-toolbar__setup>.button:after{content:'⚙';position:absolute;top:25px;left:calc(50% + 6px);font-size:10px;line-height:10px;color:#333}
      .timetable-main-toolbar__setup>.button:hover{background:#e4e4e4!important}
      @media(max-width:900px){.timetable-main-toolbar__group{flex:0 0 auto}.timetable-main-toolbar__item{min-width:64px}}
      @media(max-width:700px){.timetable-main-toolbar__item{min-width:62px}.timetable-main-toolbar__label{font-size:9px;padding-left:4px;padding-right:4px}}
      @media print{.timetable-main-toolbar{display:none!important}}
    `}</style>
  </div>
}
