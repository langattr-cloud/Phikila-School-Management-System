import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge, EmptyState } from '../components/States'
import {
  CloseIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
} from '../components/icons'

export interface StudentRecord {
  id: string
  studentId: string
  firstName: string
  lastName: string
  form: string
  attendance: number
  academicAvg: number
  status: 'Active' | 'Inactive' | 'On Leave'
  guardianName: string
  guardianPhone: string
  guardianEmail: string
  notes: string[]
  recentActivity: Array<{ date: string; text: string }>
}

const MOCK_STUDENTS: StudentRecord[] = [
  {
    id: '1',
    studentId: '#1048',
    firstName: 'Jane',
    lastName: 'Doe',
    form: 'Form 3A',
    attendance: 94,
    academicAvg: 78,
    status: 'Active',
    guardianName: 'Robert Doe',
    guardianPhone: '+265 999 123 456',
    guardianEmail: 'r.doe@example.com',
    notes: [
      'Consistently excels in Mathematics and Sciences.',
      'Elected Form 3A Class Representative for Term 1.',
    ],
    recentActivity: [
      { date: 'Today, 08:30', text: 'Present in Mathematics (Room 102)' },
      { date: 'Yesterday', text: 'Scored 88% in Chemistry Quiz #2' },
      { date: '12 May 2026', text: 'Fee payment acknowledged for Term 1' },
    ],
  },
  {
    id: '2',
    studentId: '#1052',
    firstName: 'John',
    lastName: 'Smith',
    form: 'Form 4B',
    attendance: 82,
    academicAvg: 65,
    status: 'Active',
    guardianName: 'Mary Smith',
    guardianPhone: '+265 888 234 567',
    guardianEmail: 'm.smith@example.com',
    notes: ['Attendance needs monitoring in morning periods.'],
    recentActivity: [
      { date: 'Today, 08:30', text: 'Absent without prior note' },
      { date: '10 May 2026', text: 'Submitted History assignment late' },
    ],
  },
  {
    id: '3',
    studentId: '#1060',
    firstName: 'Grace',
    lastName: 'Phiri',
    form: 'Form 2A',
    attendance: 98,
    academicAvg: 91,
    status: 'Active',
    guardianName: 'David Phiri',
    guardianPhone: '+265 991 345 678',
    guardianEmail: 'd.phiri@example.com',
    notes: ['Top performing learner in Form 2.'],
    recentActivity: [
      { date: 'Today, 08:30', text: 'Present in English Literature' },
      { date: '11 May 2026', text: 'Awarded Science Fair 1st Prize' },
    ],
  },
  {
    id: '4',
    studentId: '#1075',
    firstName: 'Chifundo',
    lastName: 'Banda',
    form: 'Form 1C',
    attendance: 88,
    academicAvg: 72,
    status: 'Active',
    guardianName: 'Alice Banda',
    guardianPhone: '+265 881 456 789',
    guardianEmail: 'a.banda@example.com',
    notes: ['Joined this academic year.'],
    recentActivity: [
      { date: 'Today, 08:30', text: 'Present in Biology' },
    ],
  },
]

export default function Students() {
  const [students, setStudents] = useState<StudentRecord[]>(MOCK_STUDENTS)
  const [search, setSearch] = useState('')
  const [formFilter, setFormFilter] = useState('All')
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null)
  const [activeProfileTab, setActiveProfileTab] = useState<
    'Overview' | 'Academics' | 'Attendance' | 'Behaviour' | 'Documents' | 'Activity'
  >('Overview')

  // Multi-step Registration Modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addStep, setAddStep] = useState<1 | 2 | 3>(1)
  const [newStudent, setNewStudent] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    gender: 'Female',
    form: 'Form 3A',
    guardianName: '',
    guardianPhone: '',
    guardianEmail: '',
  })

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.firstName.toLowerCase().includes(search.toLowerCase()) ||
      s.lastName.toLowerCase().includes(search.toLowerCase()) ||
      s.studentId.toLowerCase().includes(search.toLowerCase())
    const matchesForm = formFilter === 'All' || s.form === formFilter
    return matchesSearch && matchesForm
  })

  function handleCreateStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!newStudent.firstName || !newStudent.lastName) return

    const created: StudentRecord = {
      id: String(Date.now()),
      studentId: `#${Math.floor(1000 + Math.random() * 9000)}`,
      firstName: newStudent.firstName,
      lastName: newStudent.lastName,
      form: newStudent.form,
      attendance: 100,
      academicAvg: 75,
      status: 'Active',
      guardianName: newStudent.guardianName || 'N/A',
      guardianPhone: newStudent.guardianPhone || 'N/A',
      guardianEmail: newStudent.guardianEmail || 'N/A',
      notes: ['Newly registered learner.'],
      recentActivity: [{ date: 'Just now', text: 'Registered into system' }],
    }

    setStudents([created, ...students])
    setShowAddModal(false)
    setAddStep(1)
    setNewStudent({
      firstName: '',
      lastName: '',
      dob: '',
      gender: 'Female',
      form: 'Form 3A',
      guardianName: '',
      guardianPhone: '',
      guardianEmail: '',
    })
  }

  return (
    <>
      <PageHeader
        title="Student Directory & 360° Profiles"
        description="Comprehensive learner records, attendance tracking, and academic performance."
        actions={
          <button
            type="button"
            className="button button--primary button--sm"
            onClick={() => setShowAddModal(true)}
          >
            <PlusIcon width={16} height={16} /> Register Student
          </button>
        }
      />

      {/* SEARCH AND FILTERS */}
      <div className="toolbar">
        <div className="search">
          <SearchIcon className="search__icon" width={18} height={18} />
          <input
            type="text"
            className="input input--search"
            placeholder="Search by student name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="field field--inline">
          <label className="field__label" htmlFor="form-select">
            Filter Form:
          </label>
          <select
            id="form-select"
            className="input input--select"
            value={formFilter}
            onChange={(e) => setFormFilter(e.target.value)}
          >
            <option value="All">All Forms</option>
            <option value="Form 1C">Form 1C</option>
            <option value="Form 2A">Form 2A</option>
            <option value="Form 3A">Form 3A</option>
            <option value="Form 4B">Form 4B</option>
          </select>
        </div>

        <span className="toolbar__count">
          Showing {filteredStudents.length} of {students.length} students
        </span>
      </div>

      {/* STUDENT DIRECTORY TABLE */}
      {filteredStudents.length === 0 ? (
        <EmptyState
          title="No students found"
          description="Try adjusting your search criteria or register a new student."
          icon={<UserIcon width={24} height={24} />}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Full Name</th>
                  <th>Class / Form</th>
                  <th>Attendance %</th>
                  <th>Academic Avg</th>
                  <th>Status</th>
                  <th className="table__actions">360° Profile</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.studentId}</strong></td>
                    <td>{s.firstName} {s.lastName}</td>
                    <td>{s.form}</td>
                    <td>
                      <span className={s.attendance < 85 ? 'text-danger font-bold' : ''}>
                        {s.attendance}%
                      </span>
                    </td>
                    <td>{s.academicAvg}%</td>
                    <td>
                      <Badge tone={s.status === 'Active' ? 'success' : 'warning'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="table__actions">
                      <button
                        type="button"
                        className="button button--secondary button--sm"
                        onClick={() => {
                          setSelectedStudent(s)
                          setActiveProfileTab('Overview')
                        }}
                      >
                        View 360° Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARDS */}
          <div className="record-cards">
            {filteredStudents.map((s) => (
              <div key={s.id} className="record-card">
                <div className="record-card__row">
                  <dt>Student</dt>
                  <dd><strong>{s.firstName} {s.lastName}</strong> ({s.studentId})</dd>
                </div>
                <div className="record-card__row">
                  <dt>Class</dt>
                  <dd>{s.form}</dd>
                </div>
                <div className="record-card__row">
                  <dt>Attendance</dt>
                  <dd>{s.attendance}%</dd>
                </div>
                <div className="record-card__row">
                  <dt>Academic Avg</dt>
                  <dd>{s.academicAvg}%</dd>
                </div>
                <div className="record-card__actions">
                  <button
                    type="button"
                    className="button button--secondary button--sm button--block"
                    onClick={() => {
                      setSelectedStudent(s)
                      setActiveProfileTab('Overview')
                    }}
                  >
                    View 360° Profile
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 360° STUDENT PROFILE DRAWER */}
      {selectedStudent && (
        <div className="profile-drawer-overlay" role="dialog" aria-modal="true">
          <div
            className="profile-drawer-backdrop"
            onClick={() => setSelectedStudent(null)}
          />
          <div className="profile-drawer">
            <div className="profile-drawer__header">
              <div className="profile-avatar">
                {selectedStudent.firstName[0]}
                {selectedStudent.lastName[0]}
              </div>
              <div className="profile-header-info">
                <h2 className="profile-name">
                  {selectedStudent.firstName} {selectedStudent.lastName}
                </h2>
                <div className="profile-meta">
                  <span>{selectedStudent.form}</span> · <span>{selectedStudent.studentId}</span>
                </div>
              </div>
              <button
                type="button"
                className="icon-button icon-button--subtle profile-close"
                onClick={() => setSelectedStudent(null)}
              >
                <CloseIcon width={18} height={18} />
              </button>
            </div>

            {/* QUICK STATS STRIP */}
            <div className="profile-stats-strip">
              <div className="profile-stat-box">
                <span className="profile-stat-label">Attendance</span>
                <span className={`profile-stat-val ${selectedStudent.attendance < 85 ? 'text-danger' : ''}`}>
                  {selectedStudent.attendance}%
                </span>
              </div>
              <div className="profile-stat-box">
                <span className="profile-stat-label">Academic Avg</span>
                <span className="profile-stat-val">{selectedStudent.academicAvg}%</span>
              </div>
              <div className="profile-stat-box">
                <span className="profile-stat-label">Status</span>
                <Badge tone="success">{selectedStudent.status}</Badge>
              </div>
            </div>

            {/* 360° TABS */}
            <div className="profile-tabs" role="tablist">
              {(
                ['Overview', 'Academics', 'Attendance', 'Behaviour', 'Documents', 'Activity'] as const
              ).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeProfileTab === tab}
                  className={`profile-tab ${activeProfileTab === tab ? 'profile-tab--active' : ''}`}
                  onClick={() => setActiveProfileTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* TAB CONTENTS */}
            <div className="profile-tab-content">
              {activeProfileTab === 'Overview' && (
                <div className="profile-overview">
                  <section className="profile-section">
                    <h3>Guardian / Parent Details</h3>
                    <dl className="detail-list detail-list--two">
                      <div>
                        <dt>Guardian Name</dt>
                        <dd>{selectedStudent.guardianName}</dd>
                      </div>
                      <div>
                        <dt>Contact Phone</dt>
                        <dd>{selectedStudent.guardianPhone}</dd>
                      </div>
                      <div className="detail-list__full">
                        <dt>Email Address</dt>
                        <dd>{selectedStudent.guardianEmail}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="profile-section">
                    <h3>Teacher Notes & Remarks</h3>
                    <ul className="notes-list">
                      {selectedStudent.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </section>
                </div>
              )}

              {activeProfileTab === 'Academics' && (
                <div className="profile-academics">
                  <h3>Curriculum Performance</h3>
                  <ul className="grade-list">
                    <li className="grade-item">
                      <span>Mathematics</span>
                      <strong>84% (Grade A)</strong>
                    </li>
                    <li className="grade-item">
                      <span>English Literature</span>
                      <strong>76% (Grade B)</strong>
                    </li>
                    <li className="grade-item">
                      <span>Physical Sciences</span>
                      <strong>81% (Grade A)</strong>
                    </li>
                    <li className="grade-item">
                      <span>Biology</span>
                      <strong>71% (Grade B)</strong>
                    </li>
                  </ul>
                </div>
              )}

              {activeProfileTab === 'Attendance' && (
                <div className="profile-attendance">
                  <h3>Attendance Log & Trend</h3>
                  <div className="attendance-bar-container">
                    <div
                      className="attendance-bar-fill"
                      style={{ width: `${selectedStudent.attendance}%` }}
                    />
                  </div>
                  <p className="field__hint" style={{ marginTop: '0.5rem' }}>
                    {selectedStudent.attendance}% present across 60 recorded periods this term.
                  </p>
                </div>
              )}

              {activeProfileTab === 'Behaviour' && (
                <div className="profile-behaviour">
                  <h3>Behaviour & Conduct Log</h3>
                  <div className="alert alert--success" style={{ margin: 0 }}>
                    Excellent discipline record. Zero disciplinary infractions recorded this term.
                  </div>
                </div>
              )}

              {activeProfileTab === 'Documents' && (
                <div className="profile-documents">
                  <h3>Uploaded Records</h3>
                  <ul className="doc-list">
                    <li>📄 Enrollment_Form_1048.pdf (1.2 MB)</li>
                    <li>📄 Term1_Report_Card.pdf (840 KB)</li>
                    <li>📄 Medical_Exemption_Certificate.pdf (450 KB)</li>
                  </ul>
                </div>
              )}

              {activeProfileTab === 'Activity' && (
                <div className="profile-activity">
                  <h3>Timeline & Activity Feed</h3>
                  <ul className="activity-list">
                    {selectedStudent.recentActivity.map((act, i) => (
                      <li key={i} className="activity">
                        <span className="activity__dot" />
                        <div>
                          <p className="activity__summary">{act.text}</p>
                          <p className="activity__meta">{act.date}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MULTI-STEP REGISTRATION MODAL */}
      {showAddModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog multi-step-dialog">
            <div className="panel__head">
              <h2 className="dialog__title">Register New Student</h2>
              <button
                type="button"
                className="icon-button icon-button--subtle"
                onClick={() => setShowAddModal(false)}
              >
                <CloseIcon width={18} height={18} />
              </button>
            </div>

            {/* STEP PROGRESS INDICATOR */}
            <div className="step-indicator">
              <div className={`step-node ${addStep >= 1 ? 'step-node--active' : ''}`}>
                1. Identity
              </div>
              <div className="step-line" />
              <div className={`step-node ${addStep >= 2 ? 'step-node--active' : ''}`}>
                2. Enrollment
              </div>
              <div className="step-line" />
              <div className={`step-node ${addStep >= 3 ? 'step-node--active' : ''}`}>
                3. Guardian
              </div>
            </div>

            <form onSubmit={handleCreateStudent} className="form">
              {addStep === 1 && (
                <div className="step-content">
                  <div className="field">
                    <label className="field__label">First Name *</label>
                    <input
                      type="text"
                      className="input"
                      required
                      value={newStudent.firstName}
                      onChange={(e) => setNewStudent({ ...newStudent, firstName: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label">Last Name *</label>
                    <input
                      type="text"
                      className="input"
                      required
                      value={newStudent.lastName}
                      onChange={(e) => setNewStudent({ ...newStudent, lastName: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label">Date of Birth</label>
                    <input
                      type="date"
                      className="input"
                      value={newStudent.dob}
                      onChange={(e) => setNewStudent({ ...newStudent, dob: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {addStep === 2 && (
                <div className="step-content">
                  <div className="field">
                    <label className="field__label">Class / Form *</label>
                    <select
                      className="input input--select"
                      value={newStudent.form}
                      onChange={(e) => setNewStudent({ ...newStudent, form: e.target.value })}
                    >
                      <option value="Form 1C">Form 1C</option>
                      <option value="Form 2A">Form 2A</option>
                      <option value="Form 3A">Form 3A</option>
                      <option value="Form 4B">Form 4B</option>
                    </select>
                  </div>
                </div>
              )}

              {addStep === 3 && (
                <div className="step-content">
                  <div className="field">
                    <label className="field__label">Guardian Name</label>
                    <input
                      type="text"
                      className="input"
                      value={newStudent.guardianName}
                      onChange={(e) => setNewStudent({ ...newStudent, guardianName: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label">Guardian Phone</label>
                    <input
                      type="tel"
                      className="input"
                      value={newStudent.guardianPhone}
                      onChange={(e) => setNewStudent({ ...newStudent, guardianPhone: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label">Guardian Email</label>
                    <input
                      type="email"
                      className="input"
                      value={newStudent.guardianEmail}
                      onChange={(e) => setNewStudent({ ...newStudent, guardianEmail: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="dialog__actions">
                {addStep > 1 && (
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => setAddStep((s) => (s - 1) as 1 | 2 | 3)}
                  >
                    Back
                  </button>
                )}
                {addStep < 3 ? (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => {
                      if (addStep === 1 && (!newStudent.firstName || !newStudent.lastName)) return
                      setAddStep((s) => (s + 1) as 1 | 2 | 3)
                    }}
                  >
                    Continue →
                  </button>
                ) : (
                  <button type="submit" className="button button--primary">
                    Submit & Register
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
