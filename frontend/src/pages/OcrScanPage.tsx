import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { friendlyApiError, apiFetch } from '../lib/api'
import { useAsync } from '../lib/useAsync'

/* ------------------------------------------------------------------ types */
type DocumentType = 'exam_sheet' | 'student_document' | 'timetable' | 'general'

interface ScanResult {
  id: number
  filename: string
  document_type: string
  backend_used: string | null
  processing_time_ms: number | null
  parsed_data: Record<string, unknown> | null
  raw_text: string | null
  error: string | null
  status: string
  created_at: string | null
}

interface BackendInfo {
  name: string
  available: boolean
  label: string
}

/* ------------------------------------------------------------------ constants */
const DOC_TYPE_LABELS: Record<string, string> = {
  exam_sheet: 'Exam / Results',
  student_document: 'Student Document',
  timetable: 'Timetable',
  general: 'General Document',
  auto: 'Auto-detect',
}

/* ------------------------------------------------------------------ PDF generation */
async function generatePdf(scan: ScanResult): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  // Title
  doc.setFontSize(18)
  doc.text('Phikila Document Scan', 20, 20)
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`File: ${scan.filename}`, 20, 28)
  doc.text(`Type: ${DOC_TYPE_LABELS[scan.document_type] || scan.document_type}`, 20, 34)
  doc.text(`Scanned: ${scan.created_at ? new Date(scan.created_at).toLocaleString() : 'N/A'}`, 20, 40)
  doc.text(`Engine: ${scan.backend_used || 'auto'} · ${scan.processing_time_ms?.toFixed(0) || '?'}ms`, 20, 46)

  doc.setDrawColor(200)
  doc.line(20, 50, 190, 50)

  let y = 58

  // Render parsed data based on type
  if (scan.parsed_data) {
    const data = scan.parsed_data

    if (data.type === 'exam_sheet') {
      const examInfo = data.exam_info as Record<string, string> | undefined
      if (examInfo) {
        doc.setFontSize(12)
        doc.setTextColor(0)
        doc.text('Exam Information', 20, y)
        y += 8
        doc.setFontSize(10)
        for (const [key, val] of Object.entries(examInfo)) {
          if (val) {
            doc.text(`${key.replace(/_/g, ' ')}: ${val}`, 24, y)
            y += 6
          }
        }
        y += 4
      }

      const students = (data.students as Array<Record<string, unknown>>) || []
      const subjects = (data.subjects as string[]) || []

      if (students.length > 0) {
        doc.setFontSize(12)
        doc.text(`Student Results (${students.length} students)`, 20, y)
        y += 10

        // Table header
        doc.setFontSize(8)
        doc.setFont(undefined, 'bold')
        doc.text('#', 22, y)
        doc.text('Name', 30, y)
        let x = 90
        for (const sub of subjects.slice(0, 5)) {
          doc.text(sub.slice(0, 10), x, y)
          x += 20
        }
        doc.text('Total', x, y)
        y += 2
        doc.line(20, y, 190, y)
        y += 5

        // Table rows
        doc.setFont(undefined, 'normal')
        for (let i = 0; i < students.length; i++) {
          if (y > 270) {
            doc.addPage()
            y = 20
          }
          const s = students[i]
          doc.text(String(i + 1), 22, y)
          doc.text(String(s.name || '').slice(0, 25), 30, y)
          x = 90
          const scores = (s.scores as Record<string, number>) || {}
          for (const sub of subjects.slice(0, 5)) {
            doc.text(String(scores[sub] ?? '—'), x, y)
            x += 20
          }
          doc.text(String(s.total ?? '—'), x, y)
          y += 6
        }
      }
    } else if (data.type === 'timetable') {
      const entries = (data.entries as Array<Record<string, string>>) || []
      doc.setFontSize(12)
      doc.text(`Timetable (${entries.length} periods)`, 20, y)
      y += 10

      doc.setFontSize(8)
      doc.setFont(undefined, 'bold')
      doc.text('Day', 22, y)
      doc.text('Time', 50, y)
      doc.text('Subject', 85, y)
      doc.text('Teacher', 130, y)
      doc.text('Room', 165, y)
      y += 2
      doc.line(20, y, 190, y)
      y += 5

      doc.setFont(undefined, 'normal')
      for (const e of entries) {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.text(e.day || '', 22, y)
        doc.text(`${e.start_time || ''}–${e.end_time || ''}`, 50, y)
        doc.text(String(e.subject || '—').slice(0, 20), 85, y)
        doc.text(String(e.teacher || '—').slice(0, 18), 130, y)
        doc.text(String(e.room || '—'), 165, y)
        y += 6
      }
    } else {
      // General — render as key-value pairs
      doc.setFontSize(12)
      doc.text('Extracted Data', 20, y)
      y += 10
      doc.setFontSize(10)
      const kv = (data.key_value_pairs as Record<string, string>) || {}
      for (const [key, val] of Object.entries(kv)) {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.setFont(undefined, 'bold')
        doc.text(`${key.replace(/_/g, ' ')}:`, 24, y)
        doc.setFont(undefined, 'normal')
        doc.text(String(val), 80, y)
        y += 7
      }
    }
  }

  // Raw text on a new page if available
  if (scan.raw_text) {
    doc.addPage()
    doc.setFontSize(12)
    doc.text('Raw OCR Text', 20, 20)
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    const lines = doc.splitTextToSize(scan.raw_text, 170)
    let ty = 30
    for (const line of lines) {
      if (ty > 275) { doc.addPage(); ty = 20 }
      doc.text(line, 20, ty)
      ty += 5
    }
  }

  doc.save(`phikila-scan-${scan.id}.pdf`)
}

/* ------------------------------------------------------------------ Camera component */
function CameraCapture({ onCapture, onClose }: { onCapture: (blob: Blob) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mediaStream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((stream) => {
        mediaStream = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          setStreaming(true)
        }
      })
      .catch(() => setError('Camera access denied. Please allow camera permissions.'))

    return () => {
      mediaStream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob)
    }, 'image/jpeg', 0.92)
  }

  return (
    <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#000' }}>
      {error && <Alert tone="error">{error}</Alert>}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', display: streaming ? 'block' : 'none' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {!streaming && !error && (
        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: '#999' }}>
          <p>Initializing camera…</p>
        </div>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3)', justifyContent: 'center' }}>
        <button className="button button--primary" onClick={capture} disabled={!streaming}>
          📸 Capture
        </button>
        <button className="button button--secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Main page */
export function OcrScanPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [docType, setDocType] = useState<DocumentType | ''>('')
  const [scanning, setScanning] = useState(false)
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload')

  // Load scan history
  const toMsg = useCallback((e: unknown) => friendlyApiError(e, 'load scans'), [])
  const { data: history, loading: historyLoading, reload: reloadHistory } =
    useAsync<ScanResult[]>(() => apiFetch<ScanResult[]>('/api/v1/ocr/scans?limit=20'), toMsg)

  // Load available backends
  const { data: backendData } = useAsync<{ backends: BackendInfo[] }>(
    () => apiFetch<{ backends: BackendInfo[] }>('/api/v1/ocr/backends'),
    toMsg,
  )

  function selectFile(file: File) {
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setLastResult(null)
    setUploadError(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) selectFile(file)
  }

  function handleCameraCapture(blob: Blob) {
    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
    selectFile(file)
    setShowCamera(false)
  }

  async function handleUpload() {
    if (!selectedFile) return
    setScanning(true)
    setUploadError(null)
    setLastResult(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      if (docType) formData.append('document_type', docType)

      const result = await apiFetch<ScanResult>('/api/v1/ocr/scan', {
        method: 'POST',
        body: formData,
        headers: {},
      })
      setLastResult(result)
      setActiveTab('history')
      reloadHistory()
    } catch (err) {
      setUploadError(friendlyApiError(err, 'scan the document'))
    } finally {
      setScanning(false)
    }
  }

  function clearSelection() {
    setSelectedFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setLastResult(null)
    setUploadError(null)
  }

  if (showCamera) {
    return (
      <>
        <PageHeader
          title="Document Scanner"
          description="Use your camera to capture a document."
        />
        <section className="section card">
          <CameraCapture onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
        </section>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Document Scanner"
        description="Upload or photograph exam papers, student documents, and timetables to extract structured data."
      />

      {/* ---- Tab bar ---- */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button
          className={`button ${activeTab === 'upload' ? 'button--primary' : 'button--secondary'} button--sm`}
          onClick={() => setActiveTab('upload')}
        >
          📄 Upload
        </button>
        <button
          className={`button ${activeTab === 'history' ? 'button--primary' : 'button--secondary'} button--sm`}
          onClick={() => setActiveTab('history')}
        >
          📋 History {history?.length ? `(${history.length})` : ''}
        </button>
      </div>

      {activeTab === 'upload' && (
        <>
          {/* ---- Upload area ---- */}
          <section className="section card" style={{ marginBottom: 'var(--space-4)' }}>
            <h2 className="section__title">Capture or Upload</h2>

            {/* Source buttons */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <button
                className="button button--primary"
                onClick={() => fileRef.current?.click()}
                style={{ flex: 1 }}
              >
                📁 Choose File
              </button>
              <button
                className="button button--secondary"
                onClick={() => setShowCamera(true)}
                style={{ flex: 1 }}
              >
                📷 Take Photo
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const file = e.dataTransfer.files[0]
                if (file) selectFile(file)
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-3)',
                minHeight: selectedFile ? 'auto' : '8rem',
                padding: 'var(--space-4)',
                border: '2px dashed var(--color-line-strong)',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-surface-muted)',
                textAlign: 'center',
              }}
            >
              {selectedFile ? (
                <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'wrap', width: '100%' }}>
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: 'var(--radius-md)', objectFit: 'contain' }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: '12rem' }}>
                    <p style={{ fontWeight: 600 }}>{selectedFile.name}</p>
                    <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
                      {(selectedFile.size / 1024).toFixed(1)} KB · {selectedFile.type || 'unknown'}
                    </p>
                    <button className="button button--ghost button--sm" onClick={clearSelection} style={{ marginTop: 'var(--space-2)' }}>
                      ✕ Remove
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: '2rem' }}>📄</span>
                  <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem' }}>
                    Drag and drop a file here, or use the buttons above
                  </p>
                  <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.8rem' }}>
                    JPEG, PNG, WebP, TIFF, BMP, PDF — up to 10 MB
                  </p>
                </>
              )}
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-4)', alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '1 1 12rem' }}>
                <label className="field__label" htmlFor="doc-type">Document type</label>
                <select
                  id="doc-type"
                  className="input"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as DocumentType | '')}
                >
                  <option value="">Auto-detect</option>
                  <option value="exam_sheet">Exam / Results</option>
                  <option value="student_document">Student Document</option>
                  <option value="timetable">Timetable</option>
                  <option value="general">General Document</option>
                </select>
              </div>

              {backendData && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-ink-muted)', paddingBottom: '0.65rem' }}>
                  Engine: {backendData.backends.find((b) => b.available)?.label || 'None available'}
                </div>
              )}

              <button
                className="button button--primary"
                disabled={!selectedFile || scanning}
                onClick={handleUpload}
              >
                {scanning ? '⏳ Scanning…' : '🔍 Scan Document'}
              </button>
            </div>

            {uploadError && (
              <Alert tone="error" title="Scan failed" style={{ marginTop: 'var(--space-3)' }}>
                {uploadError}
              </Alert>
            )}
          </section>

          {/* ---- Last result ---- */}
          {lastResult && (
            <ScanResultCard
              scan={lastResult}
              onExportPdf={() => generatePdf(lastResult)}
            />
          )}
        </>
      )}

      {activeTab === 'history' && (
        <section className="section card">
          <h2 className="section__title">Recent Scans</h2>
          {historyLoading ? (
            <LoadingBlock label="Loading scan history" rows={3} />
          ) : !history?.length ? (
            <EmptyState
              title="No scans yet"
              description="Upload or photograph a document to get started."
              icon={<span style={{ fontSize: '1.5rem' }}>📋</span>}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {history.map((scan) => (
                <ScanResultCard
                  key={scan.id}
                  scan={scan}
                  compact
                  onExportPdf={() => generatePdf(scan)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ Scan result card */
function ScanResultCard({
  scan,
  compact = false,
  onExportPdf,
}: {
  scan: ScanResult
  compact?: boolean
  onExportPdf?: () => void
}) {
  const [expanded, setExpanded] = useState(!compact)

  return (
    <div
      className="card"
      style={{ padding: 'var(--space-4)', marginBottom: compact ? 0 : 'var(--space-4)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div>
          <p style={{ fontWeight: 600 }}>{scan.filename}</p>
          <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.8125rem' }}>
            {DOC_TYPE_LABELS[scan.document_type] || scan.document_type}
            {scan.processing_time_ms ? ` · ${scan.processing_time_ms.toFixed(0)}ms` : ''}
            {scan.created_at ? ` · ${new Date(scan.created_at).toLocaleString()}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <Badge tone={scan.status === 'completed' ? 'success' : scan.status === 'failed' ? 'danger' : 'warning'}>
            {scan.status}
          </Badge>
          {scan.status === 'completed' && onExportPdf && (
            <button className="button button--ghost button--sm" onClick={onExportPdf} title="Export as PDF">
              📥 PDF
            </button>
          )}
          {compact && (
            <button className="button button--ghost button--sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>

      {expanded && scan.status === 'completed' && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          {scan.error && <Alert tone="error">{scan.error}</Alert>}

          {scan.parsed_data && <ParsedDataView data={scan.parsed_data} />}

          {scan.raw_text && (
            <details style={{ marginTop: 'var(--space-3)' }}>
              <summary className="link" style={{ cursor: 'pointer', fontSize: '0.875rem' }}>
                Show raw OCR text
              </summary>
              <pre style={{
                marginTop: 'var(--space-2)',
                padding: 'var(--space-3)',
                background: 'var(--color-surface-muted)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                maxHeight: '20rem',
                overflowY: 'auto',
              }}>
                {scan.raw_text}
              </pre>
            </details>
          )}
        </div>
      )}

      {expanded && scan.status === 'failed' && scan.error && (
        <Alert tone="error" style={{ marginTop: 'var(--space-3)' }}>{scan.error}</Alert>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Parsed data viewer */
function ParsedDataView({ data }: { data: Record<string, unknown> }) {
  const type = data.type as string

  if (type === 'exam_sheet') {
    const students = (data.students as Array<Record<string, unknown>>) || []
    const examInfo = (data.exam_info as Record<string, string>) || {}
    const subjects = (data.subjects as string[]) || []

    return (
      <div>
        {Object.entries(examInfo).filter(([, v]) => v).map(([k, v]) => (
          <p key={k} style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>
            <strong>{k.replace(/_/g, ' ')}:</strong> {v}
          </p>
        ))}
        <p style={{ fontSize: '0.875rem', fontWeight: 600, marginTop: 'var(--space-2)' }}>
          {students.length} student{students.length !== 1 ? 's' : ''} found
          {subjects.length > 0 ? ` · ${subjects.length} subject${subjects.length !== 1 ? 's' : ''}` : ''}
        </p>
        {students.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 'var(--space-2)' }}>
            <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-line)' }}>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>#</th>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Name</th>
                  {subjects.slice(0, 6).map((s) => (
                    <th key={s} style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{s}</th>
                  ))}
                  {students[0]?.total != null && <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Total</th>}
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-line)' }}>
                    <td style={{ padding: 'var(--space-2)' }}>{i + 1}</td>
                    <td style={{ padding: 'var(--space-2)', fontWeight: 600 }}>{s.name as string}</td>
                    {subjects.slice(0, 6).map((sub) => (
                      <td key={sub} style={{ padding: 'var(--space-2)', textAlign: 'right' }}>
                        {(s.scores as Record<string, number>)?.[sub] ?? '—'}
                      </td>
                    ))}
                    {s.total != null && (
                      <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 700 }}>
                        {s.total as number}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  if (type === 'timetable') {
    const entries = (data.entries as Array<Record<string, string>>) || []
    return (
      <div>
        <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>
          {entries.length} period{entries.length !== 1 ? 's' : ''} across {(data.days_detected as string[])?.length || 0} day(s)
        </p>
        {entries.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 'var(--space-2)' }}>
            <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-line)' }}>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Day</th>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Time</th>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Subject</th>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Teacher</th>
                  <th style={{ padding: 'var(--space-2)', textAlign: 'left' }}>Room</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-line)' }}>
                    <td style={{ padding: 'var(--space-2)' }}>{e.day}</td>
                    <td style={{ padding: 'var(--space-2)' }}>{e.start_time}–{e.end_time}</td>
                    <td style={{ padding: 'var(--space-2)', fontWeight: 600 }}>{e.subject || '—'}</td>
                    <td style={{ padding: 'var(--space-2)' }}>{e.teacher || '—'}</td>
                    <td style={{ padding: 'var(--space-2)' }}>{e.room || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  if (type === 'student_document') {
    const fields = (data.fields as Record<string, string>) || {}
    return (
      <div>
        {Object.entries(fields).length === 0 ? (
          <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem' }}>No structured fields detected.</p>
        ) : (
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: 'var(--space-3)' }}>
            {Object.entries(fields).map(([k, v]) => (
              <div key={k}>
                <dt style={{ color: 'var(--color-ink-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {k.replace(/_/g, ' ')}
                </dt>
                <dd style={{ marginTop: '0.15rem', fontWeight: 600 }}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    )
  }

  // General fallback
  const kv = (data.key_value_pairs as Record<string, string>) || {}
  const emails = (data.emails as string[]) || []
  const phones = (data.phones as string[]) || []
  return (
    <div>
      {Object.keys(kv).length > 0 && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: 'var(--space-3)' }}>
          {Object.entries(kv).map(([k, v]) => (
            <div key={k}>
              <dt style={{ color: 'var(--color-ink-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>
                {k.replace(/_/g, ' ')}
              </dt>
              <dd style={{ marginTop: '0.15rem', fontWeight: 600 }}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {(emails.length > 0 || phones.length > 0) && (
        <div style={{ marginTop: 'var(--space-3)', fontSize: '0.875rem' }}>
          {emails.length > 0 && <p><strong>Emails:</strong> {emails.join(', ')}</p>}
          {phones.length > 0 && <p><strong>Phones:</strong> {phones.join(', ')}</p>}
        </div>
      )}
    </div>
  )
}
