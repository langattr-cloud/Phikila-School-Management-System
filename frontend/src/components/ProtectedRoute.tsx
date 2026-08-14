import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="loading">Restoring your session…</p>
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />

  return <>{children}</>
}
