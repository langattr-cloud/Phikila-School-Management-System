import { useEffect, useRef, useState, useId } from 'react'
import { useNavigate } from '../lib/router'
import {
  CalendarIcon,
  DashboardIcon,
  LayersIcon,
  SchoolIcon,
  SearchIcon,
  SparkIcon,
  UserIcon,
} from './icons'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onAction?: (actionId: string, payload?: unknown) => void
}

interface CommandItem {
  id: string
  label: string
  category: 'Quick Actions' | 'Navigation' | 'Students & Staff' | 'AI Copilot'
  hint?: string
  icon?: React.ReactNode
  onSelect: () => void
}

export function CommandPalette({ open, onClose, onAction }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (open) onClose()
        else {
          // Open handled by shell or parent
          const btn = document.getElementById('cmd-k-trigger')
          btn?.click()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const items: CommandItem[] = [
    // Quick actions
    {
      id: 'act-add-student',
      label: 'Add student record',
      category: 'Quick Actions',
      hint: 'Register a new learner to a class',
      icon: <UserIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/students?action=new')
      },
    },
    {
      id: 'act-record-attendance',
      label: 'Record class attendance',
      category: 'Quick Actions',
      hint: 'Take daily register for a class',
      icon: <CalendarIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        if (onAction) onAction('record-attendance')
        else navigate('/students?tab=attendance')
      },
    },
    {
      id: 'act-generate-timetable',
      label: 'Generate timetable',
      category: 'Quick Actions',
      hint: 'Run automated AI scheduling engine',
      icon: <SparkIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/scheduling/generate')
      },
    },
    {
      id: 'act-create-announcement',
      label: 'Send school announcement',
      category: 'Quick Actions',
      hint: 'Broadcast alert to parents and staff',
      icon: <LayersIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        if (onAction) onAction('send-announcement')
        else navigate('/?action=announcement')
      },
    },

    // Navigation
    {
      id: 'nav-dashboard',
      label: 'Dashboard Command Center',
      category: 'Navigation',
      hint: 'Overview, tasks, alerts & metrics',
      icon: <DashboardIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/')
      },
    },
    {
      id: 'nav-students',
      label: 'Students Directory & 360° Profiles',
      category: 'Navigation',
      hint: 'Manage learner records, attendance & grades',
      icon: <UserIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/students')
      },
    },
    {
      id: 'nav-timetable',
      label: 'Timetable Workspace',
      category: 'Navigation',
      hint: 'Interactive grid, conflict solver & day view',
      icon: <CalendarIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/timetable')
      },
    },
    {
      id: 'nav-copilot',
      label: 'AI Copilot Assistant',
      category: 'Navigation',
      hint: 'Ask questions, analyze schedules & generate advice',
      icon: <SparkIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/scheduling/copilot')
      },
    },
    {
      id: 'nav-analytics',
      label: 'Scheduling Analytics & Reports',
      category: 'Navigation',
      hint: 'Room utilization, workload & compliance',
      icon: <LayersIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/analytics')
      },
    },
    {
      id: 'nav-setup-teachers',
      label: 'Teachers & Staff Directory',
      category: 'Navigation',
      hint: 'Teacher workloads & subject mapping',
      icon: <SchoolIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/setup/teachers')
      },
    },

    // Students & Staff
    {
      id: 'student-jane-doe',
      label: 'Jane Doe (Form 3A · Student #1048)',
      category: 'Students & Staff',
      hint: 'Attendance 94% · Academic Avg 78%',
      icon: <UserIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/students?id=1048')
      },
    },
    {
      id: 'student-john-smith',
      label: 'John Smith (Form 4B · Student #1052)',
      category: 'Students & Staff',
      hint: 'Attendance 82% · Needs attention',
      icon: <UserIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/students?id=1052')
      },
    },
    {
      id: 'teacher-mr-banda',
      label: 'Mr. Banda (Mathematics · Senior Teacher)',
      category: 'Students & Staff',
      hint: '24 periods/week · Form 3A Advisor',
      icon: <SchoolIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/setup/teachers')
      },
    },

    // AI Copilot Natural Language Queries
    {
      id: 'ai-query-low-attendance',
      label: '“Show Form 3 students with attendance below 80%”',
      category: 'AI Copilot',
      hint: 'Run AI query on learner attendance risks',
      icon: <SparkIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/scheduling/copilot?prompt=' + encodeURIComponent('Show Form 3 students with attendance below 80%'))
      },
    },
    {
      id: 'ai-query-absenteeism',
      label: '“Which classes have unusual absenteeism this week?”',
      category: 'AI Copilot',
      hint: 'Identify attendance anomalies across classes',
      icon: <SparkIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/scheduling/copilot?prompt=' + encodeURIComponent('Which classes have unusual absenteeism this week?'))
      },
    },
    {
      id: 'ai-query-slots',
      label: '“Find available slots for Form 3A Mathematics”',
      category: 'AI Copilot',
      hint: 'Find open periods and unassigned rooms',
      icon: <SparkIcon width={16} height={16} />,
      onSelect: () => {
        onClose()
        navigate('/scheduling/copilot?prompt=' + encodeURIComponent('Find available slots for Form 3A Mathematics'))
      },
    },
  ]

  const filteredItems = items.filter((item) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.hint && item.hint.toLowerCase().includes(q))
    )
  })

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + (filteredItems.length || 1)) % (filteredItems.length || 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].onSelect()
      }
    }
  }

  // Group items by category for rendering
  const categories = Array.from(new Set(filteredItems.map((item) => item.category)))

  let runningIndex = 0

  return (
    <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="palette__backdrop" onClick={onClose} role="presentation" />
      <div className="palette__panel">
        <div className="palette__search-row">
          <SearchIcon className="palette__search-icon" width={18} height={18} />
          <input
            ref={inputRef}
            type="text"
            className="input palette__input"
            placeholder="Search students, staff, classes, actions, or ask AI… (⌘K)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-controls={listboxId}
          />
          <kbd className="palette__kbd">ESC</kbd>
        </div>

        <div className="palette__results" id={listboxId} role="listbox">
          {filteredItems.length === 0 ? (
            <div className="palette__empty">
              No matching commands or records found for "{query}".
            </div>
          ) : (
            categories.map((cat) => {
              const catItems = filteredItems.filter((i) => i.category === cat)
              return (
                <div key={cat} className="palette__group">
                  <div className="palette__group-title">{cat}</div>
                  {catItems.map((item) => {
                    const currentIndex = runningIndex
                    runningIndex += 1
                    const isSelected = currentIndex === selectedIndex
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`palette__item ${isSelected ? 'palette__item--selected' : ''}`}
                        onClick={() => item.onSelect()}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                      >
                        <span className="palette__item-icon">{item.icon}</span>
                        <div className="palette__item-content">
                          <span className="palette__item-label">{item.label}</span>
                          {item.hint && <span className="palette__item-hint">{item.hint}</span>}
                        </div>
                        {isSelected && <span className="palette__item-enter">↵ Select</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        <div className="palette__footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to navigate
          </span>
          <span>
            <kbd>↵</kbd> to select
          </span>
          <span>
            <kbd>ESC</kbd> to close
          </span>
        </div>
      </div>
    </div>
  )
}
