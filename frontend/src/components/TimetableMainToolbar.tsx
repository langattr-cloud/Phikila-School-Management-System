import type { ReactNode } from 'react'
import { CalendarIcon, CheckIcon, DownloadIcon, GridIcon, LayersIcon, PlusIcon, PrintIcon } from './icons'
import { TimetablePrintSetLauncher } from './TimetablePrintSetLauncher'
import { Link } from '../lib/router'

type ItemProps = { label: string; onClick?: () => void; icon: ReactNode; href?: string }

function ToolItem({ label, onClick, icon, href }: ItemProps) {
  const content = (
    <>
      <span className="timetable-main-toolbar__icon">{icon}</span>
      <span>{label}</span>
    </>
  )

  if (href) {
    return <Link className="timetable-main-toolbar__item" to={href} title={label}>{content}</Link>
  }

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
    localStorage.setItem('phikila:timetable-view', JSON.stringify({
      scope: scope?.value ?? 'all',
      target: target?.value ?? '',
    }))
  }

  return (
    <div className="timetable-main-toolbar" role="toolbar" aria-label="Timetable main toolbar">
      <ToolItem label="New" href="/scheduling/generate" icon={<PlusIcon width={22} height={22} />} />
      <span className="timetable-main-toolbar__separator" aria-hidden="true" />
      <ToolItem label="Open" href="/versions" icon={<LayersIcon width={22} height={22} />} />
      <span className="timetable-main-toolbar__separator" aria-hidden="true" />
      <ToolItem label="Save" onClick={saveView} icon={<CheckIcon width={22} height={22} />} />
      <span className="timetable-main-toolbar__separator" aria-hidden="true" />
      <ToolItem label="Print" onClick={() => window.print()} icon={<PrintIcon width={22} height={22} />} />
      <span className="timetable-main-toolbar__separator" aria-hidden="true" />
      <div className="timetable-main-toolbar__setup">
        <TimetablePrintSetLauncher />
      </div>
      <span className="timetable-main-toolbar__separator" aria-hidden="true" />
      <ToolItem label="CSV" onClick={() => clickExisting('CSV')} icon={<GridIcon width={22} height={22} />} />
      <span className="timetable-main-toolbar__separator" aria-hidden="true" />
      <ToolItem label="Calendar" onClick={() => clickExisting('Calendar')} icon={<CalendarIcon width={22} height={22} />} />
      <span className="timetable-main-toolbar__separator" aria-hidden="true" />
      <ToolItem label="PNG" onClick={() => clickExisting('PNG')} icon={<DownloadIcon width={22} height={22} />} />
      <style>{`
        .timetable-main-toolbar {
          display: flex;
          align-items: stretch;
          width: 100%;
          min-height: 72px;
          background: #F0F0F0;
          border: 1px solid #d1d1d1;
          border-radius: 4px;
          box-shadow: inset 0 1px #fff;
          overflow-x: auto;
          margin: 0 0 14px;
          padding: 0 4px;
        }
        .timetable-main-toolbar__item {
          display: flex;
          flex: 0 0 82px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border: 0;
          background: transparent;
          color: #222;
          text-decoration: none;
          font: 500 12px/1.1 Arial, Helvetica, sans-serif;
          cursor: pointer;
          padding: 7px 6px;
        }
        .timetable-main-toolbar__item:hover { background: #e4e4e4; }
        .timetable-main-toolbar__item:focus-visible { outline: 2px solid #2563eb; outline-offset: -2px; }
        .timetable-main-toolbar__icon {
          display: flex;
          width: 24px;
          height: 24px;
          align-items: center;
          justify-content: center;
        }
        .timetable-main-toolbar__separator {
          width: 1px;
          height: 50px;
          align-self: center;
          background: #c8c8c8;
          box-shadow: 1px 0 #fff;
          flex: 0 0 1px;
        }
        .timetable-main-toolbar__setup {
          display: flex;
          flex: 0 0 92px;
          align-items: stretch;
          justify-content: center;
          position: relative;
        }
        .timetable-main-toolbar__setup > .button {
          position: relative;
          width: 92px;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          color: #222;
          font: 500 12px/1.1 Arial, Helvetica, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 7px 5px;
        }
        .timetable-main-toolbar__setup > .button::before {
          content: 'PRINT';
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          font-size: 9px;
          font-weight: 700;
          border: 2px solid #333;
          border-radius: 2px;
          letter-spacing: -0.4px;
        }
        .timetable-main-toolbar__setup > .button::after {
          content: 'SETUP';
          position: absolute;
          top: 34px;
          left: calc(50% + 7px);
          font-size: 6px;
          font-weight: 700;
          line-height: 7px;
          background: #F0F0F0;
          padding: 0 1px;
        }
        .timetable-main-toolbar__setup > .button:hover { background: #e4e4e4 !important; }
        @media (max-width: 700px) {
          .timetable-main-toolbar__item { flex-basis: 72px; }
          .timetable-main-toolbar__setup,
          .timetable-main-toolbar__setup > .button { flex-basis: 82px; width: 82px; }
        }
      `}</style>
    </div>
  )
}
