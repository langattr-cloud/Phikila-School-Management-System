import { useState, type ChangeEvent } from 'react'
import { Alert } from '../components/Alert'
import { PageHeader } from '../components/PageHeader'
import { students } from '../lib/students'
import { friendlyApiError } from '../lib/api'
import { Link } from '../lib/router'

const TEMPLATE = [
  'admission_number,first_name,middle_name,last_name,preferred_name,date_of_birth,gender,email,phone,address,nationality,national_id,admission_date,status,academic_year,level,class,term',
  'ADM001,Jane,,Doe,,12/03/2010,Female,jane@example.com,0712345678,,Kenyan,,01/01/2026,active,2026,Form 1,Form 1 A,Term 1',
].join('\n')

export default function StudentImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null
    setFile(selected)
    setError(null)
    setResult(null)
  }

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'phikila-student-import-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importFile() {
    if (!file) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const response = await students.importExcel(file)
      setResult(response.message)
      setFile(null)
    } catch (err) {
      setError(friendlyApiError(err, 'import students'))
    } finally {
      setBusy(false)
    }
  }

  return <div>
    <PageHeader title="Import Students" description="Upload an Excel workbook to create students and their academic enrolments." actions={<Link className="button button--secondary button--sm" to="/students">← Back to Students</Link>} />
    <div className="card section" style={{ maxWidth: '58rem' }}>
      <h2 className="section__title">Excel student import</h2>
      <p style={{ color: 'var(--color-ink-muted)', marginTop: 0 }}>Use one student per row. The import is validated before anything is saved, so an invalid row will not create a partial import.</p>
      {error && <Alert tone="error">{error}</Alert>}
      {result && <Alert tone="success">{result}</Alert>}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <button className="button button--secondary button--sm" type="button" onClick={downloadTemplate}>Download spreadsheet template</button>
        <label className="button button--secondary button--sm" style={{ cursor: 'pointer' }}>
          Choose .xlsx file
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile} style={{ display: 'none' }} />
        </label>
      </div>
      {file && <div style={{ border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)' }}><strong>{file.name}</strong><div style={{ color: 'var(--color-ink-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{Math.ceil(file.size / 1024)} KB</div></div>}
      <button className="button button--primary" type="button" disabled={!file || busy} onClick={() => void importFile()}>{busy ? 'Importing…' : 'Import students'}</button>
      <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-line)' }}>
        <strong>Required columns</strong>
        <p style={{ color: 'var(--color-ink-muted)', marginBottom: 'var(--space-2)' }}>Admission Number, First Name, Last Name, Academic Year, Level and Class.</p>
        <strong>Optional columns</strong>
        <p style={{ color: 'var(--color-ink-muted)', marginBottom: 0 }}>Middle Name, Preferred Name, DOB, Gender, Email, Phone, Address, Nationality, National ID, Admission Date, Status and Term.</p>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.875rem', marginBottom: 0 }}>Academic year, level and class can be matched by name/code. Dates accept Excel dates, DD/MM/YYYY, or YYYY-MM-DD. Maximum file size is 10 MB and 2,000 students.</p>
      </div>
    </div>
  </div>
}
