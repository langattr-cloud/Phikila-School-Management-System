import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'

/**
 * Minimal history-API router.
 *
 * The project intentionally avoids pulling in a routing dependency for the
 * handful of routes this application needs. The FastAPI SPA fallback already
 * serves index.html for extension-less browser paths, so real URLs work on
 * refresh and on Vercel without any routing configuration change.
 */

type NavigateOptions = { replace?: boolean }

type RouterContextValue = {
  pathname: string
  search: string
  navigate: (to: string, options?: NavigateOptions) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

function currentLocation() {
  return { pathname: window.location.pathname, search: window.location.search }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(currentLocation)

  useEffect(() => {
    const onPopState = () => setLocation(currentLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: string, options: NavigateOptions = {}) => {
    const [pathname, rawSearch = ''] = to.split('?')
    const search = rawSearch ? `?${rawSearch}` : ''
    const target = `${pathname}${search}`
    if (target === `${window.location.pathname}${window.location.search}`) return

    if (options.replace) {
      window.history.replaceState({}, '', target)
    } else {
      window.history.pushState({}, '', target)
    }
    setLocation({ pathname, search })
    window.scrollTo({ top: 0 })
  }, [])

  const value = useMemo(
    () => ({ pathname: location.pathname, search: location.search, navigate }),
    [location.pathname, location.search, navigate],
  )

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRouter(): RouterContextValue {
  const context = useContext(RouterContext)
  if (!context) throw new Error('useRouter must be used inside <RouterProvider>')
  return context
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNavigate() {
  return useRouter().navigate
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSearchParams(): URLSearchParams {
  const { search } = useRouter()
  return useMemo(() => new URLSearchParams(search), [search])
}

// eslint-disable-next-line react-refresh/only-export-components
export function normalisePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string
  replace?: boolean
}

export function Link({ to, replace, onClick, ...rest }: LinkProps) {
  const navigate = useNavigate()
  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event)
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return
        }
        event.preventDefault()
        navigate(to, { replace })
      }}
      {...rest}
    />
  )
}
