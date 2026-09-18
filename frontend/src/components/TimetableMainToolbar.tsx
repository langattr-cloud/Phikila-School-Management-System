import type { ReactNode } from 'react'
import { CalendarIcon, CheckIcon, GridIcon, InboxIcon, LayersIcon, PlusIcon, PrintIcon, SchoolIcon, SparkIcon, UserIcon } from './icons'
import { TimetablePrintSetLauncher } from './TimetablePrintSetLauncher'
import { Link } from '../lib/router'
import { useToast } from './Toast'

type ItemProps = { label: string; onClick?: () => void; icon?: ReactNode; href?: string }

function ToolItem({ label, onClick, icon, href }: ItemProps) {
  const content = <><span className="timetable-main-toolbar__icon">{icon}</span><span>{label}</span></>
  if (href) return <Link className="timetable-main-toolbar__item" to={href} title={label}>{content}</Link>
  return <button type="button" className="timetable-main-toolbar__item" onClick={onClick} title={label}>{content}</button>
}

function RibbonTab({ label, active = false }: { label: string; active?: boolean }) {
  return <span className={`timetable-main-toolbar__tab ${active ? 'timetable-main-toolbar__tab--active' : ''}`}>{label}</span>
}

export function TimetableMainToolbar() {
  const { notify } = useToast()

  function saveView() {
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    localStorage.setItem('phikila:timetable-view', JSON.stringify({ scope: scope?.value ?? 'all', target: target?.value ?? '' }))
    notify('Timetable view saved.', 'success')
  }

  return (
    <div className="timetable-main-toolbar-wrap">
      <div className="timetable-main-toolbar__tabs" role="tablist" aria-label="Timetable ribbon">
        <RibbonTab label="Main" active />
        <RibbonTab label="File" />
        <RibbonTab label="Specification" />
        <RibbonTab label="View" />
        <RibbonTab label="Timetable" />
        <RibbonTab label="Options" />
        <RibbonTab label="Help" />
      </div>
      <div className="timetable-main-toolbar" role="toolbar" aria-label="Whole school timetable commands">
        <div className="timetable-main-toolbar__group timetable-main-toolbar__group--view">
          <span className="timetable-main-toolbar__label">View</span>
          <span className="timetable-main-toolbar__status">Whole school</span>
        </div>
        <div className="timetable-main-toolbar__group">
          <span className="timetable-main-toolbar__label">File</span>
          <ToolItem label="New" href="/scheduling/generate" icon={<PlusIcon />} />
          <ToolItem label="Open" href="/versions" icon={<LayersIcon />} />
          <ToolItem label="Save" onClick={saveView} icon={<CheckIcon />} />
          <ToolItem label="Print" onClick={() => window.print()} icon={<PrintIcon />} />
          <div className="timetable-main-toolbar__setup"><TimetablePrintSetLauncher /></div>
        </div>
        <div className="timetable-main-toolbar__group">
          <span className="timetable-main-toolbar__label">Manage</span>
          <ToolItem label="Subjects" href="/setup/subjects" icon={<LayersIcon />} />
          <ToolItem label="Classes" href="/setup/academic-setup" icon={<GridIcon />} />
          <ToolItem label="Classrooms" href="/setup/rooms" icon={<SchoolIcon />} />
          <ToolItem label="Teachers" href="/setup/teachers" icon={<UserIcon />} />
          <ToolItem label="Students / Seminars" href="/students" icon={<UserIcon />} />
          <ToolItem label="Relations" href="/scheduling/requirements" icon={<LayersIcon />} />
        </div>
        <div className="timetable-main-toolbar__group">
          <span className="timetable-main-toolbar__label">Timetable</span>
          <ToolItem label="Test" href="/analytics" icon={<CheckIcon />} />
          <ToolItem label="Generate New" href="/scheduling/generate" icon={<SparkIcon />} />
          <ToolItem label="Generate in Cloud" href="/scheduling/generate" icon={<SparkIcon />} />
          <ToolItem label="Verification" href="/versions" icon={<CheckIcon />} />
          <ToolItem label="School" href="/setup/school" icon={<SchoolIcon />} />
          <ToolItem label="Timetables Online" href="/timetable/whole-school" icon={<CalendarIcon />} />
        </div>
        <div className="timetable-main-toolbar__group timetable-main-toolbar__group--output">
          <span className="timetable-main-toolbar__label">Help</span>
          <ToolItem label="Questions / Comments" onClick={() => notify('Questions and comments can be raised from the school support tools.', 'info')} icon={<InboxIcon />} />
        </div>
      </div>
      <style>{`
        .timetable-main-toolbar-wrap{width:100%;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif}
        .timetable-main-toolbar__tabs{display:flex;align-items:flex-end;min-height:30px;padding:0 6px;gap:2px;background:#f3f3f3;border:1px solid #cfcfcf;border-bottom:0;border-radius:5px 5px 0 0;overflow-x:auto}
        .timetable-main-toolbar__tab{display:inline-flex;align-items:center;height:29px;padding:0 13px;color:#4b5563;font-size:11px;font-weight:600;white-space:nowrap}
        .timetable-main-toolbar__tab--active{color:#111827;background:#fff;border:1px solid #cfcfcf;border-bottom-color:#fff;border-radius:4px 4px 0 0;margin-bottom:-1px}
        .timetable-main-toolbar{display:flex;align-items:stretch;width:100%;min-height:82px;background:#f7f7f7;border:1px solid #cfcfcf;border-radius:0 0 5px 5px;box-shadow:inset 0 1px #fff;overflow-x:auto;padding:0 4px;white-space:nowrap;scrollbar-width:thin}
        .timetable-main-toolbar__group{display:flex;align-items:stretch;gap:0;border-right:1px solid #c8c8c8;flex:0 0 auto}
        .timetable-main-toolbar__group:last-child{border-right:0}
        .timetable-main-toolbar__group--view{min-width:132px}
        .timetable-main-toolbar__label{display:flex;align-items:flex-start;padding:6px 6px 0;font:700 9px/1 Arial,Helvetica,sans-serif;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}
        .timetable-main-toolbar__status{display:flex;align-items:center;padding:0 9px;color:#111827;font:700 12px/1 Arial,Helvetica,sans-serif}
        .timetable-main-toolbar__item{display:flex;flex:0 0 auto;min-width:70px;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;background:transparent;color:#222;text-decoration:none;font:500 10px/1.1 Arial,Helvetica,sans-serif;cursor:pointer;padding:6px 5px}
        .timetable-main-toolbar__item:hover{background:#e7e7e7}
        .timetable-main-toolbar__item:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}
        .timetable-main-toolbar__icon{display:flex;width:25px;height:25px;align-items:center;justify-content:center;color:#355b7a}
        .timetable-main-toolbar__icon svg{width:22px;height:22px}
        .timetable-main-toolbar__setup{display:flex;flex:0 0 78px;align-items:stretch;justify-content:center;position:relative}
        .timetable-main-toolbar__setup>.button{border:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px 5px;width:78px;color:#222;font:500 10px/1.1 Arial,Helvetica,sans-serif;position:relative}
        .timetable-main-toolbar__setup>.button:before{content:'🖨';font-size:22px;line-height:23px;height:24px;display:block;filter:grayscale(1)}
        .timetable-main-toolbar__setup>.button:after{content:'⚙';position:absolute;top:27px;left:calc(50% + 7px);font-size:10px;line-height:10px;color:#333}
        .timetable-main-toolbar__setup>.button:hover{background:#e7e7e7!important}
        @media(max-width:900px){.timetable-main-toolbar__item{min-width:64px}.timetable-main-toolbar__group--view{min-width:112px}}
        @media(max-width:700px){.timetable-main-toolbar__item{min-width:62px}.timetable-main-toolbar__label{font-size:8px;padding-left:4px;padding-right:4px}.timetable-main-toolbar__tab{padding:0 9px}}
        @media print{.timetable-main-toolbar-wrap{display:none!important}}
      `}</style>
    </div>
  )
}
