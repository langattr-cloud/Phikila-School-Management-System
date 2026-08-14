interface EmptyStateProps {
  icon?: string
  title: string
  description: string
  action?: React.ReactNode
}

export default function EmptyState({ icon = '📋', title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
