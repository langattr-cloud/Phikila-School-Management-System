import { useState } from 'react'
import { useNavigate } from '../lib/router'
import { AlertIcon, CalendarIcon, CheckIcon, CloseIcon, LayersIcon, UserIcon } from './icons'

export interface NotificationItem {
  id: string
  type: 'conflict' | 'anomaly' | 'approval' | 'info'
  title: string
  message: string
  timestamp: string
  read: boolean
  link?: string
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    type: 'conflict',
    title: '4 Timetable Conflicts Detected',
    message: 'Teacher Mr. Banda has overlapping sessions on Monday 10:00.',
    timestamp: '10 mins ago',
    read: false,
    link: '/timetable',
  },
  {
    id: 'n2',
    type: 'anomaly',
    title: '8 Attendance Anomalies',
    message: 'Form 3A recorded unusual absenteeism (28% absent) today.',
    timestamp: '45 mins ago',
    read: false,
    link: '/students?tab=attendance',
  },
  {
    id: 'n3',
    type: 'approval',
    title: '3 Pending Access Requests',
    message: 'New staff members requesting platform authorization.',
    timestamp: '2 hours ago',
    read: false,
    link: '/platform/requests',
  },
  {
    id: 'n4',
    type: 'info',
    title: 'Timetable v2.4 Published',
    message: 'Term 1 schedule successfully published and synced with teachers.',
    timestamp: '1 day ago',
    read: true,
    link: '/versions',
  },
]

export interface NotificationCenterProps {
  open: boolean
  onClose: () => void
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const navigate = useNavigate()
  const [items, setItems] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  if (!open) return null

  const unreadCount = items.filter((i) => !i.read).length
  const displayedItems = items.filter((i) => (filter === 'unread' ? !i.read : true))

  function handleMarkAllRead() {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })))
  }

  function handleToggleRead(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: !item.read } : item)),
    )
  }

  function handleItemClick(item: NotificationItem) {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)),
    )
    onClose()
    if (item.link) {
      navigate(item.link)
    }
  }

  function getBadgeIcon(type: NotificationItem['type']) {
    switch (type) {
      case 'conflict':
        return <AlertIcon width={16} height={16} />
      case 'anomaly':
        return <UserIcon width={16} height={16} />
      case 'approval':
        return <LayersIcon width={16} height={16} />
      case 'info':
        return <CalendarIcon width={16} height={16} />
    }
  }

  return (
    <div className="notif-drawer" role="dialog" aria-modal="true" aria-label="Notifications center">
      <div className="notif-drawer__backdrop" onClick={onClose} role="presentation" />
      <div className="notif-drawer__panel">
        <div className="notif-drawer__header">
          <div className="notif-drawer__title-row">
            <h2 className="notif-drawer__title">Notifications</h2>
            {unreadCount > 0 && (
              <span className="badge badge--danger">{unreadCount} new</span>
            )}
            <button
              type="button"
              className="icon-button icon-button--subtle notif-drawer__close"
              onClick={onClose}
              aria-label="Close notifications"
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>

          <div className="notif-drawer__controls">
            <div className="notif-drawer__filters">
              <button
                type="button"
                className={`notif-drawer__filter-btn ${
                  filter === 'all' ? 'notif-drawer__filter-btn--active' : ''
                }`}
                onClick={() => setFilter('all')}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                className={`notif-drawer__filter-btn ${
                  filter === 'unread' ? 'notif-drawer__filter-btn--active' : ''
                }`}
                onClick={() => setFilter('unread')}
              >
                Unread ({unreadCount})
              </button>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={handleMarkAllRead}
              >
                Mark all as read
              </button>
            )}
          </div>
        </div>

        <div className="notif-drawer__body">
          {displayedItems.length === 0 ? (
            <div className="notif-drawer__empty">
              <CheckIcon width={24} height={24} />
              <p>You're all caught up!</p>
              <small>No {filter === 'unread' ? 'unread' : ''} notifications at this time.</small>
            </div>
          ) : (
            <ul className="notif-list">
              {displayedItems.map((item) => (
                <li
                  key={item.id}
                  className={`notif-item notif-item--${item.type} ${
                    !item.read ? 'notif-item--unread' : ''
                  }`}
                  onClick={() => handleItemClick(item)}
                >
                  <span className={`notif-item__icon notif-item__icon--${item.type}`}>
                    {getBadgeIcon(item.type)}
                  </span>
                  <div className="notif-item__content">
                    <div className="notif-item__head">
                      <span className="notif-item__title">{item.title}</span>
                      <span className="notif-item__time">{item.timestamp}</span>
                    </div>
                    <p className="notif-item__msg">{item.message}</p>
                  </div>
                  <button
                    type="button"
                    className="notif-item__read-toggle"
                    title={item.read ? 'Mark as unread' : 'Mark as read'}
                    onClick={(e) => handleToggleRead(item.id, e)}
                  >
                    <span className={`notif-item__dot ${item.read ? 'notif-item__dot--read' : ''}`} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
