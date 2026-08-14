import type { SVGProps } from 'react'

/**
 * Small inline SVG icon set. Icons are decorative by default (aria-hidden);
 * the surrounding button or text carries the accessible name. Keeping them
 * inline avoids adding an icon package to the browser bundle.
 */
type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const EyeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12 17.9 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const EyeOffIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.7A9.6 9.6 0 0 1 12 5.5c5.9 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4" />
    <path d="M6.3 8.2A17.3 17.3 0 0 0 2.5 12S6.1 18.5 12 18.5a9.7 9.7 0 0 0 4-.85" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
)

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
)

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const DashboardIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="3" width="7" height="8" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="11" width="7" height="10" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </Icon>
)

export const SchoolIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3 2.8 7.5 12 12l9.2-4.5L12 3Z" />
    <path d="M6 10v5.5c0 1.7 2.7 3 6 3s6-1.3 6-3V10" />
  </Icon>
)

export const CalendarIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
)

export const LayersIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Icon>
)

export const UserIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Icon>
)

export const LogOutIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Icon>
)

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16.2h.01" />
  </Icon>
)

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)

export const InboxIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 13h5l1.5 3h5L16 13h5" />
    <path d="M5.2 5h13.6l2.2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4l2.2-8Z" />
  </Icon>
)

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Icon>
)

export const RefreshIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 11a8 8 0 1 0-.8 4.5" />
    <path d="M20 4v7h-7" />
  </Icon>
)

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
)

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icon>
)
