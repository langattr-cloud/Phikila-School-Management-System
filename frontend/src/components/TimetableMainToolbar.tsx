import { useState, type ReactNode } from 'react'
import { CalendarIcon, CheckIcon, DownloadIcon, GridIcon, LayersIcon, PlusIcon, PrintIcon } from './icons'
import { TimetablePrintSetLauncher } from './TimetablePrintSetLauncher'
import { Link } from '../lib/router'

type Tab = 'Main' | 'File' | 'Specification' | 'View' | 'Timetable' | 'Options' | 'Help'

type ItemProps = { label: string; onClick?: () => void; icon?: ReactNode; href?: string; disabled?: boolean }

function ToolItem({ label, onClick, icon, href, disabled }: ItemProps) {
  const content = <>{icon && <span className="timetable-main-toolbar__icon">{icon}</span>}<span>{label}</span></>
  if (href) {
    if (/^https?:\/\//.test(href)) return <a className={`timetable-main-toolbar__item${disabled ? ' is-disabled' : ''}`} href={href} target="_blank" rel="noreferrer" title={label}>{content}</a>
    return <Link className={`timetable-main-toolbar__item${disabled ? ' is-disabled' : ''}`} to={href} title={label}>{content}</Link>
  }
  return <button type="button" className={`timetable-main-toolbar__item${disabled ? ' is-disabled' : ''}`} onClick={onClick} title={label} disabled={disabled}>{content}</button>
}

function clickExisting(label: string) {
  const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]
  buttons.find((item) => item.textContent?.replace(/\\s+/g, ' ').trim() === label)?.click()
}

function command(label: string) {
  window.dispatchEvent(new CustomEvent('phikila:timetable-command', { detail: { command: label } }))
}

export function TimetableMainToolbar() {
  const [tab, setTab] = useState<Tab>('Main')

  function saveView() {
    command('save')
    const scope = document.getElementById('tt-scope') as HTMLSelectElement | null
    const target = document.getElementById('tt-target') as HTMLSelectElement | null
    localStorage.setItem('phikila:timetable-view', JSON.stringify({ scope: scope?.value ?? 'all', target: target?.value ?? '' }))
  }

  const renderTab = () => {
    switch (tab) {
      case 'File':
        return <>
          <ToolItem label="New" href="/scheduling/generate" icon={<PlusIcon width={20} height={20} />} />
          <ToolItem label="Open" href="/versions" icon={<LayersIcon width={20} height={20} />} />
          <ToolItem label="Save" onClick={saveView} icon={<CheckIcon width={20} height={20} />} />
          <ToolItem label="Save As" onClick={() => command('save-as')} />
          <ToolItem label="Backup" onClick={() => command('backup')} />
          <ToolItem label="Print" onClick={() => window.print()} icon={<PrintIcon width={20} height={20} />} />
          <div className="timetable-main-toolbar__setup"><TimetablePrintSetLauncher /></div>
        </>
      case 'Specification':
        return <>
          <ToolItem label="Wizard" href="/scheduling/generate" />
          <ToolItem label="Subjects" href="/setup/subjects" />
          <ToolItem label="Classes" href="/setup/academic-setup" />
          <ToolItem label="Classrooms" href="/setup/rooms" />
          <ToolItem label="Teachers" href="/setup/teachers" />
          <ToolItem label="Lessons" href="/scheduling/requirements" />
          <ToolItem label="Students / Seminars" href="/students" />
          <ToolItem label="Relations" href="/scheduling/requirements" />
          <ToolItem label="Constraints" href="/scheduling/constraints" />
        </>
      case 'View':
        return <>
          <ToolItem label="Classes" onClick={() => command('view-classes')} />
          <ToolItem label="Teachers" onClick={() => command('view-teachers')} />
          <ToolItem label="Classrooms" onClick={() => command('view-classrooms')} />
          <ToolItem label="Subjects" onClick={() => command('view-subjects')} />
          <ToolItem label="Main timetable" onClick={() => command('view-main')} />
          <ToolItem label="Lesson grid" onClick={() => command('view-lesson-grid')} />
          <ToolItem label="Custom views" onClick={() => command('view-custom')} />
          <ToolItem label="Filter" onClick={() => command('view-filter')} />
        </>
      case 'Timetable':
        return <>
          <ToolItem label="Back" onClick={() => command('back')} icon={<LayersIcon width={20} height={20} />} />
          <ToolItem label="Test" onClick={() => command('verification')} />
          <ToolItem label="Generate new" href="/scheduling/generate" icon={<PlusIcon width={20} height={20} />} />
          <ToolItem label="Improve" onClick={() => command('improve')} />
          <ToolItem label="Parameters" onClick={() => command('parameters')} />
          <ToolItem label="Verification" onClick={() => command('verification')} />
          <ToolItem label="Statistics" onClick={() => command('statistics')} />
          <ToolItem label="Assign classrooms" onClick={() => command('assign-classrooms')} />
          <ToolItem label="Duplicate lesson" onClick={() => command('duplicate-lesson')} />
          <ToolItem label="Lock" onClick={() => command('lock')} />
          <ToolItem label="Unlock" onClick={() => command('unlock')} />
          <ToolItem label="Remove timetable" onClick={() => command('remove-timetable')} />
        </>
      case 'Options':
        return <>
          <ToolItem label="School settings" href="/setup/school" />
          <ToolItem label="Timetable settings" onClick={() => command('timetable-settings')} />
          <ToolItem label="Display settings" onClick={() => command('display-settings')} />
          <ToolItem label="Colors" onClick={() => command('colors')} />
          <ToolItem label="Preferences" onClick={() => command('preferences')} />
        </>
      case 'Help':
        return <>
          <ToolItem label="Tutorial / Demo" onClick={() => command('tutorial')} />
          <ToolItem label="Tip of the day" onClick={() => command('tip-of-the-day')} />
          <ToolItem label="Demo files" onClick={() => command('demo-files')} />
          <ToolItem label="Online help" href="https://help.asctimetables.com/" />
          <ToolItem label="Technical support" onClick={() => command('technical-support')} />
          <ToolItem label="About" onClick={() => command('about')} />
        </>
      case 'Main':
      default:
        return <>
          <ToolItem label="Wizard" href="/scheduling/generate" />
          <ToolItem label="Subjects" href="/setup/subjects" />
          <ToolItem label="Classes" href="/setup/academic-setup" />
          <ToolItem label="Classrooms" href="/setup/rooms" />
          <ToolItem label="Teachers" href="/setup/teachers" />
          <ToolItem label="Lessons" href="/scheduling/requirements" />
          <ToolItem label="Print" onClick={() => window.print()} icon={<PrintIcon width={20} height={20} />} />
          <ToolItem label="Calendar" onClick={() => clickExisting('Calendar')} icon={<CalendarIcon width={20} height={20} />} />
          <ToolItem label="CSV" onClick={() => clickExisting('CSV')} icon={<GridIcon width={20} height={20} />} />
          <ToolItem label="PNG" onClick={() => clickExisting('PNG')} icon={<DownloadIcon width={20} height={20} />} />
        </>
    }
  }

  return <div className="timetable-main-toolbar" aria-label="aSc-style timetable ribbon">
    <div className="timetable-main-toolbar__tabs" role="tablist" aria-label="Timetable">
      {(['Main', 'File', 'Specification', 'View', 'Timetable', 'Options', 'Help'] as Tab[]).map(item =>
        <button key={item} type="button" role="tab" aria-selected={tab === item} className={`timetable-main-toolbar__tab${tab === item ? ' is-active' : ''}`} onClick={() => setTab(item)}>{item}</button>
      )}
    </div>
    <div className="timetable-main-toolbar__commands" role="tabpanel">
      {renderTab()}
    </div>
    <style>{`
      .timetable-main-toolbar{width:100%;background:#f3f3f3;border:1px solid #c9c9c9;border-radius:3px;box-shadow:inset 0 1px #fff;margin:0 0 10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif}
      .timetable-main-toolbar__tabs{display:flex;align-items:flex-end;height:34px;padding:0 5px;background:linear-gradient(#fafafa,#e4e4e4);border-bottom:1px solid #c4c4c4;overflow-x:auto}
      .timetable-main-toolbar__tab{height:34px;padding:0 15px;border:0;border-left:1px solid transparent;border-right:1px solid transparent;background:transparent;color:#333;font:600 12px/34px Arial,Helvetica,sans-serif;cursor:pointer;white-space:nowrap}
      .timetable-main-toolbar__tab:hover{background:#ececec}
      .timetable-main-toolbar__tab.is-active{background:#fff;border-color:#c4c4c4;border-bottom-color:#fff;margin-bottom:-1px}
      .timetable-main-toolbar__commands{display:flex;align-items:stretch;min-height:76px;overflow-x:auto;padding:3px 5px;background:#fff;white-space:nowrap}
      .timetable-main-toolbar__item{display:flex;flex:0 0 auto;min-width:72px;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;border-right:1px solid #ededed;background:#fff;color:#222;text-decoration:none;font:500 11px/1.1 Arial,Helvetica,sans-serif;cursor:pointer;padding:7px 8px}
      .timetable-main-toolbar__item:hover{background:#f1f1f1}
      .timetable-main-toolbar__item:focus-visible,.timetable-main-toolbar__tab:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}
      .timetable-main-toolbar__item.is-disabled,.timetable-main-toolbar__item:disabled{opacity:.45;cursor:default}
      .timetable-main-toolbar__icon{display:flex;width:22px;height:22px;align-items:center;justify-content:center}
      .timetable-main-toolbar__setup{display:flex;flex:0 0 78px;align-items:stretch;justify-content:center}
      .timetable-main-toolbar__setup>.button{border:0!important;background:#fff!important;box-shadow:none!important;border-radius:0!important;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:7px 5px;width:78px;color:#222;font:500 11px/1.1 Arial,Helvetica,sans-serif}
      .timetable-main-toolbar__setup>.button:before{content:'🖨';font-size:20px;line-height:21px;height:22px;display:block;filter:grayscale(1)}
      @media(max-width:700px){.timetable-main-toolbar__tab{padding:0 10px}.timetable-main-toolbar__item{min-width:64px}}
      @media print{.timetable-main-toolbar{display:none!important}}
    `}</style>
  </div>
}
