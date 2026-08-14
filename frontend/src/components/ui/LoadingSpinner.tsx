export default function LoadingSpinner({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="loading-spinner">
      <div className="spinner" />
      <p className="loading-text">{text}</p>
    </div>
  )
}
