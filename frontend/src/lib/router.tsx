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

type NavigateOptions = { replace?: boolean }
type RouterLocation = { pathname: string; search: string; hash: string }
type RouterContextValue = RouterLocation & { navigate: (to: string, options?: NavigateOptions) => void }

const RouterContext = createContext<RouterContextValue | null>(null)

export function normalisePath(pathname: string): string {
  const value = pathname || '/'
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value
}

function readLocation(): RouterLocation {
  return { pathname: normalisePath(window.location.pathname), search: window.location.search, hash: window.location.hash }
}

function resolveTarget(to: string): URL | null {
  try {
    const url = new URL(to, window.location.href)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.origin !== window.location.origin) return null
    return url
  } catch {
    return null
  }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<RouterLocation>(() => readLocation())

  useEffect(() => {
    const sync = () => setLocation(readLocation())
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  const navigate = useCallback((to: string, options: NavigateOptions = {}) => {
    const url = resolveTarget(to)
    if (!url) return

    const target = `${normalisePath(url.pathname)}${url.search}${url.hash}`
    const current = `${normalisePath(window.location.pathname)}${window.location.search}${window.location.hash}`
    if (target === current) return

    if (options.replace) window.history.replaceState({}, '', target)
    else window.history.pushState({}, '', target)
    setLocation(readLocation())

    if (url.hash) {
      window.setTimeout(() => {
        const id = decodeURIComponent(url.hash.slice(1))
        document.getElementById(id)?.scrollIntoView({ block: 'start' })
      }, 0)
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [])

  const value = useMemo(() => ({ ...location, navigate }), [location, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRouter(): RouterContextValue {
  const context = useContext(RouterContext)
  if (!context) throw new Error('useRouter must be used inside <RouterProvider>')
  return context
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNavigate() { return useRouter().navigate }

// eslint-disable-next-line react-refresh/only-export-components
export function useSearchParams(): URLSearchParams {
  const { search } = useRouter()
  return useMemo(() => new URLSearchParams(search), [search])
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean }

function shouldUseBrowserNavigation(event: MouseEvent<HTMLAnchorElement>, to: string) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return true
  const anchor = event.currentTarget
  if (anchor.target && anchor.target !== '_self') return true
  if (anchor.hasAttribute('download')) return true
  return resolveTarget(to) === null
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
