import { useNavigate } from '../lib/router'
import { usePlatformSession } from '../lib/session'
import StitchPage from './StitchPage'
import { getScreen, listScreens, ROLE_HOME } from './screens'

/** All Stitch screens are reachable under /<slug>. */
export const STITCH_PATHS: Set<string> = new Set(listScreens().map((s) => `/${s.slug}`))

export function isStitchPath(pathname: string): boolean {
  return STITCH_PATHS.has(pathname)
}

/** Renders a Stitch screen and forwards internal navigation to the router. */
export function StitchRoute({ slug }: { slug: string }) {
  const navigate = useNavigate()
  return <StitchPage slug={slug} onNavigate={(target) => navigate(`/${target}`)} />
}

/** The role-appropriate landing screen for `/`. */
export function StitchHome() {
  const { session } = usePlatformSession()
  const role = session?.is_super_admin
    ? 'super_admin'
    : session?.schools?.[0]?.role ?? 'admin'
  const slug = ROLE_HOME[role] ?? 'admin-dashboard'
  if (!getScreen(slug)) return <StitchRoute slug="admin-dashboard" />
  return <StitchRoute slug={slug} />
}