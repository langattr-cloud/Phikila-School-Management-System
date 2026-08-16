import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from '../lib/router'
import { getScreen, NAV_TO_SLUG } from './screens'
import '../stitch.css'

// All Stitch html files are imported as raw strings at build time so Tailwind
// can compile their utility classes (they're in tailwind.config content glob).
const htmlLoaders = import.meta.glob('./html/*.html', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

function extractBody(html: string): string {
  const bodyStart = html.indexOf('<body')
  const bodyOpen = html.indexOf('>', bodyStart)
  const bodyEnd = html.lastIndexOf('</body>')
  if (bodyStart === -1 || bodyOpen === -1 || bodyEnd === -1) return html
  // Drop the Tailwind CDN config + script tags (styling comes from build-time Tailwind).
  return html
    .slice(bodyOpen + 1, bodyEnd)
    .replace(/<script\b[^>]*src="[^"]*cdn\.tailwindcss\.com[^"]*"[^>]*>\s*<\/script>/gi, '')
    .replace(/<script[^>]*>\s*?tailwind\.config\s*=\s*\{[\s\S]*?\}[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b(?![^>]*tailwind)[^>]*>[\s\S]*?<\/script>/gi, '')
}

type StitchPageProps = {
  slug: string
  onNavigate?: (path: string) => void
}

export default function StitchPage({ slug, onNavigate }: StitchPageProps) {
  const screen = getScreen(slug)
  const { pathname } = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (!screen) {
      setHtml('')
      return
    }
    let active = true
    const loader = htmlLoaders[`./html/${screen.file}`]
    if (!loader) {
      setHtml('')
      return
    }
    loader()
      .then((raw) => {
        if (active) setHtml(extractBody(raw))
      })
      .catch(() => {
        if (active) setHtml('')
      })
    return () => {
      active = false
    }
  }, [screen])

  const bodyHtml = useMemo(() => html, [html])

  // Rewrite nav links on each navigation so the sidebar reflects the active
  // section and anchor clicks route through the app router.
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href="#"]'))
    for (const a of links) {
      const label = a.textContent?.trim()
      const target = label ? NAV_TO_SLUG[label] : undefined
      if (target) {
        const active = target === slug
        a.dataset.stitchRoute = target
        a.setAttribute('aria-current', active ? 'page' : 'false')
        if (active) {
          a.classList.add('bg-primary', 'text-on-primary')
        }
      }
    }
  }, [slug, pathname])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-stitch-route]')
    if (!anchor) return
    e.preventDefault()
    const target = anchor.dataset.stitchRoute!
    onNavigate?.(`/${target}`)
  }

  if (!screen) {
    return <div className="stitch-shell">Screen "{slug}" not found.</div>
  }

  return (
    <div
      ref={ref}
      className="stitch-shell"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: bodyHtml }}
    />
  )
}