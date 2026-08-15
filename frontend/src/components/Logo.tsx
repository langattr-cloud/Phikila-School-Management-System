/**
 * Phikila brand marks, inlined as vectors.
 *
 * Inlining keeps the logo crisp at any size, lets it inherit theme colours,
 * and avoids an extra network request on first paint. The same geometry is
 * exported to /public/brand for favicons, app icons and social cards.
 */

type Tone = 'light' | 'dark'

const NAVY = '#0F2A47'
const NAVY_LIFTED = '#1B3E63'
const EMERALD = '#12A47C'
const EMERALD_LIGHT = '#2BC194'
const GOLD = '#E0A93B'
const WHITE = '#FFFFFF'

/** Shield + open book + verification badge, on a 64x64 grid. */
function MarkPaths({ tone }: { tone: Tone }) {
  // On dark surfaces the shield is lifted a step so it never merges into the
  // background, and the rim/check are brightened for separation.
  const shield = tone === 'dark' ? NAVY_LIFTED : NAVY
  const check = tone === 'dark' ? EMERALD_LIGHT : EMERALD

  return (
    <>
      <path
        d="M20 5H44A11 11 0 0 1 55 16V30.6C55 43.4 45.5 52.9 32 58.4 18.5 52.9 9 43.4 9 30.6V16A11 11 0 0 1 20 5Z"
        fill={shield}
      />
      <path
        d="M21 9.2H43A8 8 0 0 1 51 17.2V30.2C51 40.7 43.2 48.5 32 53.2 20.8 48.5 13 40.7 13 30.2V17.2A8 8 0 0 1 21 9.2Z"
        fill="none"
        stroke={EMERALD_LIGHT}
        strokeWidth="1.05"
        opacity="0.45"
      />
      {/* open book — the primary education symbol */}
      <path
        d="M31.05 21.9C28.3 19.6 24.6 18.2 20.3 18.2A2.3 2.3 0 0 0 18 20.5V36.8A2.3 2.3 0 0 0 20.3 39.1C24.6 39.1 28.3 40.3 31.05 42.3Z"
        fill={WHITE}
      />
      <path
        d="M32.95 21.9C35.7 19.6 39.4 18.2 43.7 18.2A2.3 2.3 0 0 1 46 20.5V36.8A2.3 2.3 0 0 1 43.7 39.1C39.4 39.1 35.7 40.3 32.95 42.3Z"
        fill={WHITE}
      />
      {/* verification badge — trusted, checked administration */}
      <circle cx="41.6" cy="37.6" r="9.2" fill={shield} />
      <circle cx="41.6" cy="37.6" r="7.3" fill={check} />
      <path
        d="M38.1 37.7 40.8 40.4 45.3 35.0"
        fill="none"
        stroke={WHITE}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* gold bookmark on the spine — the active record */}
      <path d="M30.9 17.6H33.1V25.4L32 24.1 30.9 25.4Z" fill={GOLD} />
    </>
  )
}

/** Symbol only. Decorative by default; pass a title when it stands alone. */
export function LogoMark({
  size = 32,
  tone = 'light',
  title,
  className,
}: {
  size?: number
  tone?: Tone
  title?: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <MarkPaths tone={tone} />
    </svg>
  )
}

/**
 * Full lockup: mark plus the PHIKILA wordmark and secondary line.
 * The text is real text (not outlines) so it stays selectable and accessible.
 */
export function Logo({
  size = 40,
  tone = 'light',
  showTagline = true,
  className,
}: {
  size?: number
  tone?: Tone
  showTagline?: boolean
  className?: string
}) {
  return (
    <span className={`logo logo--${tone} ${className ?? ''}`.trim()}>
      <LogoMark size={size} tone={tone} />
      <span className="logo__text">
        <span className="logo__word">PHIKILA</span>
        {showTagline && <span className="logo__sub">School Management System</span>}
      </span>
    </span>
  )
}
