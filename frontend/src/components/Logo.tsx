type Tone = 'light' | 'dark'

/**
 * Uses the supplied Phikila brand artwork for the mark, cropped to the
 * academic emblem so it remains legible at navigation/icon sizes.
 */
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
    <span
      className={`logo__mark ${className ?? ''}`.trim()}
      style={{ width: size, height: size }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <img
        src="/brand/phikila-logo.svg"
        alt=""
        draggable={false}
        style={{
          width: `${size * 2.04}px`,
          maxWidth: 'none',
          transform: `translate(${-size * 0.52}px, ${-size * 0.29}px)`,
        }}
      />
    </span>
  )
}

/** Full Phikila lockup using the supplied academic mark. */
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
