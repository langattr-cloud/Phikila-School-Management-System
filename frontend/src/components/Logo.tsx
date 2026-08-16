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
