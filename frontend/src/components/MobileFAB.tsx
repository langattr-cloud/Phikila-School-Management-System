import { useState } from 'react'
import { useNavigate } from '../lib/router'
import { CalendarIcon, LayersIcon, PlusIcon, SparkIcon, UserIcon } from './icons'

export function MobileFAB() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function handleAction(path: string) {
    setOpen(false)
    navigate(path)
  }

  return (
    <div className="mobile-fab-container">
      {open && (
        <div
          className="mobile-fab-backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        />
      )}

      {open && (
        <div className="mobile-fab-menu" role="menu">
          <button
            type="button"
            className="mobile-fab-menu-item"
            onClick={() => handleAction('/students?action=new')}
          >
            <UserIcon width={18} height={18} />
            <span>Add student</span>
          </button>
          <button
            type="button"
            className="mobile-fab-menu-item"
            onClick={() => handleAction('/students?tab=attendance')}
          >
            <CalendarIcon width={18} height={18} />
            <span>Record attendance</span>
          </button>
          <button
            type="button"
            className="mobile-fab-menu-item"
            onClick={() => handleAction('/scheduling/generate')}
          >
            <SparkIcon width={18} height={18} />
            <span>Generate timetable</span>
          </button>
          <button
            type="button"
            className="mobile-fab-menu-item"
            onClick={() => handleAction('/?action=announcement')}
          >
            <LayersIcon width={18} height={18} />
            <span>Send announcement</span>
          </button>
        </div>
      )}

      <button
        type="button"
        className={`mobile-fab-button ${open ? 'mobile-fab-button--open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Quick actions menu"
        aria-expanded={open}
      >
        <PlusIcon width={24} height={24} />
      </button>
    </div>
  )
}
