import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'

/**
 * Small history-API router used by the frontend.
 *
 * It intentionally has no routing dependency. Navigation stays client-side,
 * browser Back/Forward works, query strings and hashes are preserved, and
 * normal links can still be handled by the browser when appropriate.
 */

type NavigateOptions = { replace?: boolean }

type RouterLocation = {
  pathname: string
  search: string
  hash: string
}

type RouterContextValue = RouterLocation & {
  navigate: (to: string, options?: NavigateOptions) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

function readLocation(): RouterLocation {
  return {
    pathname: normalisePath(window.location.pathname || '/'),
    search: window.location.search,
    hash: window.location.hash,
  }
}

function resolveTarget(to: string): string {
  try {
    const url = new URL(to, window.location.href)
    return `${normalisePath(url.pathname)}${url.search}${url.hash}`
  } catch {
    return to
  }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<RouterLocation>(() => readLocation())

  useEffect(() => {
    const onPopState = () => setLocation(readLocation())
    const onHashChange = () => setLocation(readLocation())

    window.addEventListener('popstate', onPopState)
    window.addEventListener('hashchange', onHashChange)

    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  const navigate = useCallback((to: string, options: NavigateOptions = {}) => {
    const target = resolveTarget(to)
    const current = `${normalisePath(window.location.pathname)}${window.location.search}${window.location.hash}`

    if (target === current) return

    let targetUrl: URL
    try {
      targetUrl = new URL(target, window.location.href)
    } catch {
      return
    }

    const targetPath = normalisePath(targetUrl.pathname)
    const targetLocation = `${targetPath}${targetUrl.search}${targetUrl.hash}`

    if (options.replace) {
      window.history.replaceState({}, '', targetLocation)
    } else {
      window.history.pushState({}, '', targetLocation)
    }

    setLocation(readLocation())

    if (targetUrl.hash) {
      window.setTimeout(() => {
        const id = decodeURIComponent(targetUrl.hash.slice(1))
        document.getElementById(id)?.scrollIntoView({ block: 'start' })
      }, 0)
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [])

  const value = useMemo(
    () => ({ ...location, navigate }),
    [location, navigate],
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
  const value = pathname || '/'
  if (value.length > 1 && value.endsWith('/')) return value.slice(0, -1)
  return value
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string
  replace?: boolean
}

function shouldUseBrowserNavigation(event: MouseEvent<HTMLAnchorElement>, to: string) {
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  ) {
    return true
  }

  const anchor = event.currentTarget
  if (anchor.target && anchor.target !== '_self') return true
  if (anchor.hasAttribute('download')) return true

  try {
    const url = new URL(to, window.location.href)
    if (url.origin !== window.location.origin) return true
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true
  } catch {
    return true
  }

  return false
}

export function Link({ to, replace, onClick, ...rest }: LinkProps) {
  const navigate = useNavigate()

  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event)
        if (shouldUseBrowserNavigation(event, to)) return

        event.preventDefault()
        navigate(to, { replace })
      }}
      {...rest}
    />
  )
}
