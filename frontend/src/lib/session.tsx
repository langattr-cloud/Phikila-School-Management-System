import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { platform, type SessionInfo } from './platform'
import { useAuth } from './auth'

type SessionState = {
  session: SessionInfo | null
  loading: boolean
  error: string | null
  reload: () => void
}

const SessionContext = createContext<SessionState | null>(null)

/**
 * Loads the caller's platform authority from the backend.
 *
 * This drives navigation only. Every endpoint independently re-derives
 * authority server-side, so editing anything here changes no permission.
 */
export function PlatformSessionProvider({ children }: { children: ReactNode }) {
  const { session: authSession } = useAuth()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!authSession) {
      setSession(null)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    platform
      .session()
      .then((data) => {
        if (active) {
          setSession(data)
          setError(null)
        }
      })
      .catch(() => {
        if (active) setError('We could not confirm your account access.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [authSession, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const value = useMemo(
    () => ({ session, loading, error, reload }),
    [session, loading, error, reload],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlatformSession(): SessionState {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('usePlatformSession must be used inside <PlatformSessionProvider>')
  }
  return context
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIsSuperAdmin(): boolean {
  return usePlatformSession().session?.is_super_admin ?? false
}
