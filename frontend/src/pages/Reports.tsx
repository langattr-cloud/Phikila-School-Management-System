import EmptyState from '../components/ui/EmptyState'

export default function Reports() {
  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Outputs</p>
        <h1 className="page-title">Reports</h1>
        <p className="muted">Generate and print report cards and transcripts.</p>
      </header>

      <EmptyState
        icon="🖨️"
        title="Reports module coming soon"
        description="Report card generation, transcripts, and analytics dashboards will be available in a future update."
      />
    </div>
  )
}
