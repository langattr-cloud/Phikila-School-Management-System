type Tone = 'light' | 'dark'

/** Shared Phikila master asset: the logo supplied for this product. */
const BRAND_ASSET = '/brand/phikila-logo-192.png'

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
  return <img src={BRAND_ASSET} width={size} height={size} className={className} alt={title ?? ''} aria-hidden={!title} loading="eager" decoding="async" />
}

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
      <LogoMark size={size} tone={tone} title="Phikila" />
      <span className="logo__text">
        <span className="logo__word">PHIKILA</span>
        {showTagline && <span className="logo__sub">School Management System</span>}
      </span>
    </span>
  )
}
