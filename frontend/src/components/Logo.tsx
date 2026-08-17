type Tone = 'light' | 'dark'

/**
 * Shared Phikila branding.
 * The supplied official logo is kept as a public vector asset so it remains
 * crisp, cacheable and reusable across the application shell and auth flows.
 */
export function LogoMark({
  size = 32,
  title,
  className,
}: {
  size?: number
  tone?: Tone
  title?: string
  className?: string
}) {
  return (
    <img
      src="/brand/phikila-mark.svg"
      width={size}
      height={size}
      className={className}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      decoding="async"
    />
  )
}

/**
 * The official circular Phikila badge (gold ring, graduation cap, serif P and
 * open book). Used on the public landing page and the sign in / sign up flow.
 */
export function BrandBadge({
  size = 44,
  withWordmark = false,
  title = 'Phikila School Management System',
  className,
}: {
  size?: number
  /** Use the version that carries the "Phikila" wordmark inside the ring. */
  withWordmark?: boolean
  title?: string
  className?: string
}) {
  return (
    <img
      src={withWordmark ? '/brand/phikila-badge.svg' : '/brand/phikila-badge-mark.svg'}
      width={size}
      height={size}
      className={['brand-badge', className].filter(Boolean).join(' ')}
      alt={title}
      decoding="async"
    />
  )
}

/** Full Phikila lockup using the supplied logo treatment. */
export function Logo({
  size = 40,
  title = 'Phikila School Management System',
  className,
}: {
  size?: number
  tone?: Tone
  showTagline?: boolean
  title?: string
  className?: string
}) {
  const width = Math.round(size * 2.55)

  return (
    <img
      src="/brand/phikila-official.svg"
      width={width}
      height={size}
      className={className}
      alt={title}
      decoding="async"
    />
  )
}
