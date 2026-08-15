import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { School, SchoolUpdate, SchoolContactUpdate } from '../lib/types'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'
import FormField from '../components/ui/FormField'
import LoadingSpinner from '../components/ui/LoadingSpinner'

type Tab = 'info' | 'contact' | 'settings'

export default function SchoolProfile() {
  const { success, error: toastError } = useToast()
  const [school, setSchool] = useState<School | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('info')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edit form state
  const [form, setForm] = useState<SchoolUpdate>({})
  const [contactForm, setContactForm] = useState<SchoolContactUpdate>({})

  useEffect(() => {
    loadSchool()
  }, [])

  async function loadSchool() {
    try {
      setLoading(true)
      const data = await api.getSchool()
      setSchool(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load school profile')
    } finally {
      setLoading(false)
    }
  }

  function startEdit() {
    if (!school) return
    setForm({
      name: school.name,
      code: school.code,
      registration_number: school.registration_number ?? '',
      education_system: school.education_system ?? '',
      school_type: school.school_type ?? '',
      category: school.category ?? '',
      county: school.county ?? '',
      sub_county: school.sub_county ?? '',
      ward: school.ward ?? '',
      postal_address: school.postal_address ?? '',
      physical_address: school.physical_address ?? '',
      phone: school.phone ?? '',
      email: school.email ?? '',
      website: school.website ?? '',
      motto: school.motto ?? '',
      vision: school.vision ?? '',
      mission: school.mission ?? '',
      principal_name: school.principal_name ?? '',
      established_year: school.established_year ?? undefined,
    })
    setContactForm({
      principal: school.contact?.principal ?? '',
      deputy_principal: school.contact?.deputy_principal ?? '',
      bursar: school.contact?.bursar ?? '',
      telephone: school.contact?.telephone ?? '',
      mobile: school.contact?.mobile ?? '',
      email: school.contact?.email ?? '',
      emergency_contact: school.contact?.emergency_contact ?? '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    try {
      setSaving(true)
      await api.updateSchool(form)
      await api.updateSchoolContact(contactForm)
      await loadSchool()
      setEditing(false)
      success('School profile updated successfully')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading school profile…" />
  if (error && !school) return <div className="card" style={{ color: '#8a342c' }}>{error}</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'School Info' },
    { key: 'contact', label: 'Contact Details' },
    { key: 'settings', label: 'Settings' },
  ]

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Configuration</p>
        <h1 className="page-title">School Profile</h1>
        <p className="muted">Manage your school's identity, logo, and contact details.</p>
      </header>

      {/* Tab bar */}
      <div className="tab-bar">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab${tab === t.key ? ' tab--active' : ''}`}
            type="button"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <div className="tab-spacer" />
        <button className="btn btn--primary" type="button" onClick={startEdit}>
          Edit
        </button>
      </div>

      {error && <div className="toast toast--error">{error}</div>}

      {/* Info Tab */}
      {tab === 'info' && school && (
        <div className="card-grid">
          <InfoCard label="School Name" value={school.name} />
          <InfoCard label="Code" value={school.code} />
          <InfoCard label="Registration No." value={school.registration_number} />
          <InfoCard label="Education System" value={school.education_system} />
          <InfoCard label="School Type" value={school.school_type} />
          <InfoCard label="Category" value={school.category} />
          <InfoCard label="County" value={school.county} />
          <InfoCard label="Sub-County" value={school.sub_county} />
          <InfoCard label="Ward" value={school.ward} />
          <InfoCard label="Motto" value={school.motto} />
          <InfoCard label="Vision" value={school.vision} />
          <InfoCard label="Mission" value={school.mission} />
          <InfoCard label="Principal" value={school.principal_name} />
          <InfoCard label="Established" value={school.established_year?.toString()} />
          <InfoCard label="Website" value={school.website} />
        </div>
      )}

      {/* Contact Tab */}
      {tab === 'contact' && school && (
        <div className="card-grid">
          <InfoCard label="Principal" value={school.contact?.principal} />
          <InfoCard label="Deputy Principal" value={school.contact?.deputy_principal} />
          <InfoCard label="Bursar" value={school.contact?.bursar} />
          <InfoCard label="Telephone" value={school.contact?.telephone} />
          <InfoCard label="Mobile" value={school.contact?.mobile} />
          <InfoCard label="Email" value={school.contact?.email} />
          <InfoCard label="Emergency Contact" value={school.contact?.emergency_contact} />
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && school && (
        <div className="card-grid">
          <InfoCard label="Timezone" value={school.settings?.timezone} />
          <InfoCard label="Currency" value={school.settings?.currency} />
          <InfoCard label="Date Format" value={school.settings?.date_format} />
          <InfoCard label="Language" value={school.settings?.language} />
          <InfoCard label="Lesson Duration" value={school.settings?.default_lesson_duration?.toString()} suffix=" min" />
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit School Profile">
        <div className="form-grid">
          <FormField label="School Name" value={form.name ?? ''} onChange={(v) => setForm({ ...form, name: v })} required />
          <FormField label="Code" value={form.code ?? ''} onChange={(v) => setForm({ ...form, code: v })} required />
          <FormField label="Registration No." value={form.registration_number ?? ''} onChange={(v) => setForm({ ...form, registration_number: v })} />
          <FormField label="Education System" value={form.education_system ?? ''} onChange={(v) => setForm({ ...form, education_system: v })} />
          <FormField label="School Type" value={form.school_type ?? ''} onChange={(v) => setForm({ ...form, school_type: v })} />
          <FormField label="Category" value={form.category ?? ''} onChange={(v) => setForm({ ...form, category: v })} />
          <FormField label="County" value={form.county ?? ''} onChange={(v) => setForm({ ...form, county: v })} />
          <FormField label="Sub-County" value={form.sub_county ?? ''} onChange={(v) => setForm({ ...form, sub_county: v })} />
          <FormField label="Ward" value={form.ward ?? ''} onChange={(v) => setForm({ ...form, ward: v })} />
          <FormField label="Phone" value={form.phone ?? ''} onChange={(v) => setForm({ ...form, phone: v })} />
          <FormField label="Email" type="email" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
          <FormField label="Website" value={form.website ?? ''} onChange={(v) => setForm({ ...form, website: v })} />
          <FormField label="Motto" value={form.motto ?? ''} onChange={(v) => setForm({ ...form, motto: v })} />
          <FormField as="textarea" label="Vision" value={form.vision ?? ''} onChange={(v) => setForm({ ...form, vision: v })} />
          <FormField as="textarea" label="Mission" value={form.mission ?? ''} onChange={(v) => setForm({ ...form, mission: v })} />
          <FormField label="Principal Name" value={form.principal_name ?? ''} onChange={(v) => setForm({ ...form, principal_name: v })} />
          <FormField label="Established Year" type="number" value={form.established_year?.toString() ?? ''} onChange={(v) => setForm({ ...form, established_year: v ? parseInt(v) : undefined })} />

          <h3 className="form-section-title">Contact Details</h3>
          <FormField label="Principal" value={contactForm.principal ?? ''} onChange={(v) => setContactForm({ ...contactForm, principal: v })} />
          <FormField label="Deputy Principal" value={contactForm.deputy_principal ?? ''} onChange={(v) => setContactForm({ ...contactForm, deputy_principal: v })} />
          <FormField label="Bursar" value={contactForm.bursar ?? ''} onChange={(v) => setContactForm({ ...contactForm, bursar: v })} />
          <FormField label="Telephone" value={contactForm.telephone ?? ''} onChange={(v) => setContactForm({ ...contactForm, telephone: v })} />
          <FormField label="Mobile" value={contactForm.mobile ?? ''} onChange={(v) => setContactForm({ ...contactForm, mobile: v })} />
          <FormField label="Contact Email" type="email" value={contactForm.email ?? ''} onChange={(v) => setContactForm({ ...contactForm, email: v })} />
          <FormField label="Emergency Contact" value={contactForm.emergency_contact ?? ''} onChange={(v) => setContactForm({ ...contactForm, emergency_contact: v })} />
        </div>
        <div className="modal-actions">
          <button className="btn btn--ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn btn--primary" type="button" onClick={saveEdit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function InfoCard({ label, value, suffix }: { label: string; value?: string | null; suffix?: string }) {
  return (
    <div className="info-card">
      <p className="info-card-label">{label}</p>
      <p className="info-card-value">{value || <span className="info-card-empty">—</span>}{suffix && value ? suffix : ''}</p>
    </div>
  )
}
