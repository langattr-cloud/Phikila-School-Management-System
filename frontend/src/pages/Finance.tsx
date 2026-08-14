import EmptyState from '../components/ui/EmptyState'

export default function Finance() {
  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Finance</p>
        <h1 className="page-title">Finance</h1>
        <p className="muted">Fee structures, payments, and accounting.</p>
      </header>

      <EmptyState
        icon="💰"
        title="Finance module coming soon"
        description="Fee management, payment tracking, and financial reports will be available in a future update."
      />
    </div>
  )
}
