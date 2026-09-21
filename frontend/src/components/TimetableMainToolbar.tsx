import { useState, type ReactNode } from 'react'
import { CalendarIcon, CheckIcon, DownloadIcon, GridIcon, LayersIcon, PlusIcon, PrintIcon } from './icons'
import { TimetablePrintSetLauncher } from './TimetablePrintSetLauncher'
import { Link } from '../lib/router'

type Tab = 'Main' | 'File' | 'Specification' | 'View' | 'Timetable' | 'Options' | 'Help'

type ItemProps = { label: string; onClick?: () => void; icon?: ReactNode; href?: string; active?: boolean }

function ToolItem({ label, onClick, icon, href, active }: ItemProps) {
  const content = <>{icon && <span className="timetable-main-toolbar__icon">{icon}</span>}<span>{label}</span></>
  const className = `timetable-main-toolbar__item${active ? ' timetable-main-toolbar__item--active' : ''}`
  if (href) return <Link className={className} to={href} title={label}>{content}</Link>
  return <button type="button" className={className} onClick={onClick} title={label}>{content}</button>
}

function clickExisting(label: string) {
  const buttons = Array.from(document.querySelectorAll('.timetable-controls-card button')) as HTMLButtonElement[]
  buttons.find((item) => item.textContent?.replace(/\s+/g, ' ').trim() === label)?.click()
}

function chooseView(scope: string) {
  const select = document.getElementById('tt-scope') as HTMLSelectElement | null
  if (!select) return
  select.value = scope
  select.dispatchEvent(new Event('change', { bubbles: true }))
  document.getElementById('tt-scope')?.focus()
}

function focusFilters() {
  document.getElementById('tt-scope')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  ;(document.getElementById('tt-scope') as HTMLSelectElement | null)?.focus()
}

export function TimetableMainToolbar() {
  const [tab, setTab] = useState<Tab>('Main')
  const [printRibbon, setPrintRibbon] = useState(false)

  function saveView() {
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    localStorage.setItem('phikila:timetable-view', JSON.stringify({ scope: scope?.value ?? 'all', target: target?.value ?? '' }))
  }

  function printPreview() {
    setPrintRibbon(true)
    window.setTimeout(() => window.print(), 40)
  }

  const tabs: Tab[] = ['Main', 'File', 'Specification', 'View', 'Timetable', 'Options', 'Help']

  return <div className="timetable-main-toolbar-wrap">
    <div className="timetable-main-toolbar__tabs" role="tablist" aria-label="Timetable commands">
      {tabs.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={tab === item}
          className={`timetable-main-toolbar__tab${tab === item ? ' timetable-main-toolbar__tab--active' : ''}`}
          onClick={() => setTab(item)}
        >
          {item}
        </button>
      ))}
    </div>

    {printRibbon ? (
      <div className="timetable-main-toolbar timetable-main-toolbar--contextual" role="toolbar" aria-label="Print preview commands">
        <div className="timetable-main-toolbar__group">
          <span className="timetable-main-toolbar__label">Print preview</span>
          <ToolItem label="Print" onClick={() => window.print()} icon={<PrintIcon width={20} height={20} />} />
          <ToolItem label="Filter" onClick={focusFilters} />
          <ToolItem label="Global settings" onClick={() => window.alert('Print preview uses the timetable view, active filters and A4 landscape print settings.')} />
        </div>
        <div className="timetable-main-toolbar__group">
          <span className="timetable-main-toolbar__label">Layout</span>
          <ToolItem label="Rows / columns" onClick={() => document.querySelector('.timetable-workspace .timetable')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
          <ToolItem label="Extra rows / columns" onClick={() => focusFilters()} />
          <ToolItem label="Sizes" onClick={() => clickExisting('Compact')} />
          <ToolItem label="Design" onClick={() => window.alert('Use the timetable cell Format action to adjust supported display styling.')} />
          <ToolItem label="Colors" onClick={() => window.alert('Subject colors remain data-driven from the timetable subject configuration.')} />
        </div>
        <div className="timetable-main-toolbar__group timetable-main-toolbar__group--output">
          <ToolItem label="Close preview" onClick={() => setPrintRibbon(false)} />
        </div>
      </div>
    ) : (
      <div className="timetable-main-toolbar" role="toolbar" aria-label={`${tab} timetable commands`}>
        {tab === 'Main' && <>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">View</span>
            <span className="timetable-main-toolbar__status">Whole school</span>
          </div>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">File</span>
            <ToolItem label="New" href="/scheduling/generate" icon={<PlusIcon width={20} height={20} />} />
            <ToolItem label="Open" href="/versions" icon={<LayersIcon width={20} height={20} />} />
            <ToolItem label="Save" onClick={saveView} icon={<CheckIcon width={20} height={20} />} />
            <ToolItem label="Print" onClick={printPreview} icon={<PrintIcon width={20} height={20} />} />
          </div>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Timetable</span>
            <ToolItem label="Generate" href="/scheduling/generate" />
            <ToolItem label="Verification" href="/versions" />
            <ToolItem label="Print preview" onClick={printPreview} />
            <div className="timetable-main-toolbar__setup"><TimetablePrintSetLauncher /></div>
          </div>
          <div className="timetable-main-toolbar__group timetable-main-toolbar__group--output">
            <span className="timetable-main-toolbar__label">Output</span>
            <ToolItem label="CSV" onClick={() => clickExisting('CSV')} icon={<GridIcon width={20} height={20} />} />
            <ToolItem label="Calendar" onClick={() => clickExisting('Calendar')} icon={<CalendarIcon width={20} height={20} />} />
            <ToolItem label="PNG" onClick={() => clickExisting('PNG')} icon={<DownloadIcon width={20} height={20} />} />
          </div>
        </>}

        {tab === 'File' && <>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">File</span>
            <ToolItem label="New timetable" href="/scheduling/generate" icon={<PlusIcon width={20} height={20} />} />
            <ToolItem label="Open version" href="/versions" icon={<LayersIcon width={20} height={20} />} />
            <ToolItem label="Save view" onClick={saveView} icon={<CheckIcon width={20} height={20} />} />
            <ToolItem label="Print" onClick={printPreview} icon={<PrintIcon width={20} height={20} />} />
          </div>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Output</span>
            <ToolItem label="Print preview" onClick={printPreview} />
            <ToolItem label="CSV" onClick={() => clickExisting('CSV')} />
            <ToolItem label="Calendar" onClick={() => clickExisting('Calendar')} />
            <ToolItem label="PNG" onClick={() => clickExisting('PNG')} />
          </div>
        </>}

        {tab === 'Specification' && <>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Data</span>
            <ToolItem label="Subjects" href="/setup/subjects" />
            <ToolItem label="Classes" href="/setup/academic-setup" />
            <ToolItem label="Classrooms" href="/setup/rooms" />
            <ToolItem label="Teachers" href="/setup/teachers" />
          </div>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Relations</span>
            <ToolItem label="Requirements" href="/scheduling/requirements" />
            <ToolItem label="Constraints" href="/scheduling/constraints" />
            <ToolItem label="Time off" href="/scheduling/time-off" />
            <ToolItem label="Periods" href="/setup/periods" />
          </div>
        </>}

        {tab === 'View' && <>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Timetable views</span>
            <ToolItem label="Whole" onClick={() => chooseView('all')} active />
            <ToolItem label="Classes" onClick={() => chooseView('class')} />
            <ToolItem label="Teachers" onClick={() => chooseView('teacher')} />
            <ToolItem label="Rooms" onClick={() => chooseView('room')} />
            <ToolItem label="Subjects" onClick={() => chooseView('subject')} />
          </div>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Days</span>
            <ToolItem label="All days" onClick={() => clickExisting('All days')} />
            <ToolItem label="Compact" onClick={() => clickExisting('Compact')} />
            <ToolItem label="Zoom out" onClick={() => clickExisting('Zoom out')} />
            <ToolItem label="Zoom in" onClick={() => clickExisting('Zoom in')} />
          </div>
        </>}

        {tab === 'Timetable' && <>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Schedule</span>
            <ToolItem label="Generate" href="/scheduling/generate" />
            <ToolItem label="Verification" href="/versions" />
            <ToolItem label="Analytics" href="/analytics" />
            <ToolItem label="Versions" href="/versions" />
          </div>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Publish / online</span>
            <ToolItem label="Timetables online" href="/timetable" />
            <ToolItem label="Projects" href="/timetable-projects" />
            <ToolItem label="Test" href="/analytics" />
          </div>
        </>}

        {tab === 'Options' && <>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Display</span>
            <ToolItem label="Compact" onClick={() => clickExisting('Compact')} />
            <ToolItem label="Zoom out" onClick={() => clickExisting('Zoom out')} />
            <ToolItem label="Zoom in" onClick={() => clickExisting('Zoom in')} />
            <ToolItem label="Save view" onClick={saveView} />
          </div>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Print</span>
            <ToolItem label="Print preview" onClick={printPreview} />
            <ToolItem label="Print setup" onClick={() => window.alert('Print setup follows the current timetable view and A4 landscape print layout.')} />
          </div>
        </>}

        {tab === 'Help' && <>
          <div className="timetable-main-toolbar__group">
            <span className="timetable-main-toolbar__label">Help</span>
            <ToolItem label="Timetable help" href="/analytics" />
            <ToolItem label="Keyboard / view tips" onClick={() => window.alert('Use View to switch between whole school, class, teacher, room and subject views. Use Print preview for print-specific controls.')} />
          </div>
        </>}
      </div>
    )}

    <style>{`
      .timetable-main-toolbar-wrap{width:100%;margin:0 0 10px}
      .timetable-main-toolbar__tabs{display:flex;align-items:flex-end;min-height:31px;padding:0 6px;background:#e7e7e7;border:1px solid #c9c9c9;border-bottom:0;border-radius:5px 5px 0 0;overflow-x:auto;white-space:nowrap}
      .timetable-main-toolbar__tab{appearance:none;border:0;border-right:1px solid #d0d0d0;background:transparent;color:#3f4448;padding:7px 15px 6px;font:600 11px/1 Arial,Helvetica,sans-serif;cursor:pointer}
      .timetable-main-toolbar__tab:hover{background:#f3f3f3}
      .timetable-main-toolbar__tab--active{background:#fff;color:#0f2a47;border-top:2px solid #0f2a47;padding-top:5px}
      .timetable-main-toolbar{display:flex;align-items:stretch;width:100%;min-height:74px;background:#f5f5f5;border:1px solid #c9c9c9;border-radius:0 0 5px 5px;box-shadow:inset 0 1px #fff;overflow-x:auto;padding:0 4px;white-space:nowrap}
      .timetable-main-toolbar--contextual{background:#fafafa}
      .timetable-main-toolbar__group{display:flex;align-items:stretch;gap:0;border-right:1px solid #c8c8c8;flex:0 0 auto}
      .timetable-main-toolbar__group:last-child{border-right:0}
      .timetable-main-toolbar__label{display:flex;align-items:flex-start;padding:7px 6px 0;font:700 10px/1 Arial,Helvetica,sans-serif;color:#5f6368;text-transform:uppercase;letter-spacing:.04em}
      .timetable-main-toolbar__status{display:flex;align-items:center;padding:0 9px;font:700 12px/1 Arial,Helvetica,sans-serif;color:#222}
      .timetable-main-toolbar__item{display:flex;flex:0 0 auto;min-width:68px;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;background:transparent;color:#222;text-decoration:none;font:500 11px/1.1 Arial,Helvetica,sans-serif;cursor:pointer;padding:7px 7px}
      .timetable-main-toolbar__item:hover,.timetable-main-toolbar__item--active{background:#e4e4e4}
      .timetable-main-toolbar__item:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}
      .timetable-main-toolbar__icon{display:flex;width:22px;height:22px;align-items:center;justify-content:center}
      .timetable-main-toolbar__setup{display:flex;flex:0 0 78px;align-items:stretch;justify-content:center;position:relative}
      .timetable-main-toolbar__setup>.button{border:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:7px 5px;width:78px;color:#222;font:500 11px/1.1 Arial,Helvetica,sans-serif;position:relative}
      .timetable-main-toolbar__setup>.button:before{content:'🖨';font-size:20px;line-height:21px;height:22px;display:block;filter:grayscale(1)}
      .timetable-main-toolbar__setup>.button:after{content:'⚙';position:absolute;top:25px;left:calc(50% + 6px);font-size:10px;line-height:10px;color:#333}
      .timetable-main-toolbar__setup>.button:hover{background:#e4e4e4!important}
      @media(max-width:900px){.timetable-main-toolbar__tab{padding-left:11px;padding-right:11px}.timetable-main-toolbar__item{min-width:64px}}
      @media(max-width:700px){.timetable-main-toolbar__tab{font-size:10px;padding-left:9px;padding-right:9px}.timetable-main-toolbar__item{min-width:62px}.timetable-main-toolbar__label{font-size:9px;padding-left:4px;padding-right:4px}}
      @media print{.timetable-main-toolbar-wrap{display:none!important}}
    `}</style>
  </div>
}
