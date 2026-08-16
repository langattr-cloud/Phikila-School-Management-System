/**
 * Stitch prototype screens — phikila.com
 *
 * Every screen is a self-contained static HTML page from the Stitch prototype
 * (Tailwind utility classes + a shared Command Center design theme). We import
 * them as raw strings at build time and render the body content inside a
 * `.stitch-shell` container so they pick up the compiled Tailwind styles.
 */

export type StitchScreen = {
  /** Stable route slug, e.g. 'admin-dashboard' */
  slug: string
  /** Human title, e.g. 'Administrator Dashboard' */
  title: string
  /** Raw html filename under src/stitch/html/ */
  file: string
  /** Device type from the prototype */
  deviceType: 'DESKTOP' | 'MOBILE'
  /** Optional role hint for grouping */
  role?: string
}

const screens: StitchScreen[] = [
  // ── Super admin / platform ────────────────────────────────────────────────
  { slug: 'super-admin-dashboard', title: 'Super Admin Dashboard', file: 'super_admin_dashboard.html', deviceType: 'DESKTOP', role: 'super_admin' },
  { slug: 'super-admin-multi-school', title: 'Super Admin Multi-School Dashboard', file: 'super_admin_multi_school.html', deviceType: 'DESKTOP', role: 'super_admin' },
  { slug: 'super-admin-platform', title: 'Super Admin Platform Overview', file: 'super_admin_platform.html', deviceType: 'DESKTOP', role: 'super_admin' },
  { slug: 'platform-config-ai', title: 'Platform Configuration & AI Settings', file: 'platform_config_ai.html', deviceType: 'DESKTOP', role: 'super_admin' },
  { slug: 'super-admin-mobile', title: 'Super Admin Dashboard (Mobile)', file: 'super_admin_dashboard_mobile.html', deviceType: 'MOBILE', role: 'super_admin' },
  { slug: 'super-admin-mobile-branding', title: 'Super Admin Dashboard (Mobile)', file: 'super_admin_dashboard_mobile_with_phikila_branding.html', deviceType: 'MOBILE', role: 'super_admin' },

  // ── Administrator ──────────────────────────────────────────────────────────
  { slug: 'admin-dashboard', title: 'Administrator Dashboard', file: 'admin_dashboard.html', deviceType: 'DESKTOP', role: 'admin' },
  { slug: 'admin-mobile', title: 'Administrator Dashboard (Mobile)', file: 'administrator_dashboard_mobile.html', deviceType: 'MOBILE', role: 'admin' },
  { slug: 'admin-mobile-branding', title: 'Administrator Dashboard (Mobile)', file: 'administrator_dashboard_mobile_with_phikila_branding.html', deviceType: 'MOBILE', role: 'admin' },
  { slug: 'school-tenancy', title: 'School Management & Tenancy Control', file: 'school_management_tenancy_control.html', deviceType: 'DESKTOP', role: 'admin' },

  // ── Academics ──────────────────────────────────────────────────────────────
  { slug: 'academics-dashboard', title: 'Academics Dashboard', file: 'academics_dashboard.html', deviceType: 'DESKTOP', role: 'academics' },
  { slug: 'academics-command-center', title: 'Academics Command Center & Analytics', file: 'academics_command_center.html', deviceType: 'DESKTOP', role: 'academics' },
  { slug: 'academics-mobile', title: 'Academics Dashboard (Mobile)', file: 'academics_dashboard_mobile.html', deviceType: 'MOBILE', role: 'academics' },
  { slug: 'academics-mobile-branding', title: 'Academics Dashboard (Mobile)', file: 'academics_dashboard_mobile_with_phikila_branding.html', deviceType: 'MOBILE', role: 'academics' },

  // ── Finance ────────────────────────────────────────────────────────────────
  { slug: 'finance-dashboard', title: 'Finance Dashboard', file: 'finance_dashboard.html', deviceType: 'DESKTOP', role: 'finance' },
  { slug: 'finance-bursar', title: 'Finance Dashboard for Bursar Management', file: 'finance_dashboard_for_bursar_management.html', deviceType: 'DESKTOP', role: 'finance' },
  { slug: 'finance-mobile', title: 'Finance Dashboard (Mobile)', file: 'finance_dashboard_mobile.html', deviceType: 'MOBILE', role: 'finance' },
  { slug: 'finance-mobile-branding', title: 'Finance Dashboard (Mobile)', file: 'finance_dashboard_mobile_with_phikila_branding.html', deviceType: 'MOBILE', role: 'finance' },

  // ── Students / parents ─────────────────────────────────────────────────────
  { slug: 'student-parent-dashboard', title: 'Student & Parent Dashboard', file: 'student_parent_dashboard.html', deviceType: 'DESKTOP', role: 'student' },
  { slug: 'student-parent-portal', title: 'Student & Parent Portal', file: 'student_parent_portal_space_edition.html', deviceType: 'DESKTOP', role: 'student' },
  { slug: 'student-directory', title: 'Student Directory', file: 'student_directory.html', deviceType: 'DESKTOP' },
  { slug: 'student-directory-actions', title: 'Student Directory with Quick Contact Actions', file: 'student_directory_with_quick_contact_actions.html', deviceType: 'DESKTOP' },
  { slug: 'student-profile', title: 'Student Profile', file: 'student_profile.html', deviceType: 'DESKTOP' },
  { slug: 'student-profile-parent', title: 'Student Profile with Parent Contact & Photo Upload', file: 'student_profile_with_parent_contact_photo_upload.html', deviceType: 'DESKTOP' },
  { slug: 'student-directory-mobile', title: 'Student Directory (Mobile)', file: 'student_directory_mobile.html', deviceType: 'MOBILE' },
  { slug: 'student-profile-mobile', title: 'Student Profile (Mobile)', file: 'student_profile_mobile.html', deviceType: 'MOBILE' },
  { slug: 'student-profile-mobile-edit', title: 'Student Profile (Mobile) with Contact & Photo Edits', file: 'student_profile_mobile_with_contact_photo_edits.html', deviceType: 'MOBILE' },
  { slug: 'student-profile-mobile-branding', title: 'Student Profile (Mobile)', file: 'student_profile_mobile_with_phikila_branding.html', deviceType: 'MOBILE' },

  // ── Teachers ───────────────────────────────────────────────────────────────
  { slug: 'teacher-dashboard', title: 'Teacher Dashboard', file: 'teacher_dashboard.html', deviceType: 'DESKTOP', role: 'teacher' },
  { slug: 'teacher-attendance', title: 'Teacher Dashboard with Attendance Marking', file: 'teacher_dashboard_with_attendance_marking.html', deviceType: 'DESKTOP', role: 'teacher' },
  { slug: 'teacher-mobile', title: 'Teacher Dashboard (Mobile)', file: 'teacher_dashboard_mobile.html', deviceType: 'MOBILE', role: 'teacher' },
  { slug: 'teacher-mobile-branding', title: 'Teacher Dashboard (Mobile)', file: 'teacher_dashboard_mobile_with_phikila_branding.html', deviceType: 'MOBILE', role: 'teacher' },

  // ── Timetable ──────────────────────────────────────────────────────────────
  { slug: 'timetable-workspace', title: 'Timetable Workspace', file: 'timetable_workspace.html', deviceType: 'DESKTOP' },
  { slug: 'timetable-ai-fab', title: 'Timetable Workspace with AI FAB & Collapsible Rails', file: 'timetable_workspace_with_ai_fab_collapsible_rails.html', deviceType: 'DESKTOP' },
  { slug: 'timetable-advanced', title: 'Advanced Timetable Workspace (aSc Style)', file: 'advanced_timetable_workspace_asc_style.html', deviceType: 'DESKTOP' },
  { slug: 'timetable-animated', title: 'Animated Parallelogram Timetable Workspace', file: 'animated_parallelogram_timetable_workspace.html', deviceType: 'DESKTOP' },
  { slug: 'timetable-mobile', title: 'Timetable Workspace (Mobile)', file: 'timetable_workspace_mobile.html', deviceType: 'MOBILE' },
  { slug: 'timetable-mobile-branding', title: 'Timetable Workspace (Mobile)', file: 'timetable_workspace_mobile_with_phikila_branding.html', deviceType: 'MOBILE' },

  // ── Admissions ─────────────────────────────────────────────────────────────
  { slug: 'admissions-dashboard', title: 'Admissions & Registrar Dashboard', file: 'admissions_dashboard.html', deviceType: 'DESKTOP' },
  { slug: 'admissions-registrar', title: 'Admissions & Registrar Dashboard', file: 'admissions_registrar_dashboard.html', deviceType: 'DESKTOP' },
  { slug: 'admissions-space', title: 'Admissions & Registrar (Space Edition)', file: 'admissions_registrar_space_edition.html', deviceType: 'DESKTOP' },

  // ── Health & welfare ───────────────────────────────────────────────────────
  { slug: 'health-welfare', title: 'Health & Welfare Dashboard', file: 'health_welfare.html', deviceType: 'DESKTOP' },
  { slug: 'health-welfare-alt', title: 'Health & Welfare Dashboard', file: 'health_welfare_dashboard.html', deviceType: 'DESKTOP' },
  { slug: 'health-welfare-space', title: 'Health & Welfare (Space Edition)', file: 'health_welfare_space_edition.html', deviceType: 'DESKTOP' },

  // ── Inventory / storekeeper ────────────────────────────────────────────────
  { slug: 'inventory-dashboard', title: 'Inventory & Storekeeper Dashboard', file: 'inventory_dashboard.html', deviceType: 'DESKTOP' },
  { slug: 'inventory-storekeeper', title: 'Inventory & Storekeeper Dashboard', file: 'inventory_storekeeper_dashboard.html', deviceType: 'DESKTOP' },
  { slug: 'inventory-space', title: 'Inventory & Storekeeper (Space Edition)', file: 'inventory_storekeeper_space_edition.html', deviceType: 'DESKTOP' },

  // ── Examinations ───────────────────────────────────────────────────────────
  { slug: 'examinations-workspace', title: 'Examinations Management Workspace', file: 'examinations_workspace.html', deviceType: 'DESKTOP' },
  { slug: 'examinations-alt', title: 'Examinations Management Workspace', file: 'examinations_management_workspace.html', deviceType: 'DESKTOP' },
  { slug: 'examinations-space', title: 'Examinations Management (Space Edition)', file: 'examinations_management_space_edition.html', deviceType: 'DESKTOP' },

  // ── Settings ───────────────────────────────────────────────────────────────
  { slug: 'settings', title: 'Settings & Configuration', file: 'settings_config.html', deviceType: 'DESKTOP' },
  { slug: 'settings-alt', title: 'Settings & Configuration', file: 'settings_configuration.html', deviceType: 'DESKTOP' },
  { slug: 'settings-wallpaper', title: 'Settings & Configuration with Wallpaper Controls', file: 'settings_configuration_with_wallpaper_controls.html', deviceType: 'DESKTOP' },
  { slug: 'settings-mobile', title: 'Settings & Configuration (Mobile)', file: 'settings_configuration_mobile.html', deviceType: 'MOBILE' },
  { slug: 'settings-mobile-wallpaper', title: 'Settings & Configuration (Mobile) with Wallpaper Controls', file: 'settings_configuration_mobile_with_wallpaper_controls.html', deviceType: 'MOBILE' },

  // ── Other modules ──────────────────────────────────────────────────────────
  { slug: 'board-dashboard', title: 'Board Management Dashboard', file: 'board_dashboard.html', deviceType: 'DESKTOP' },
  { slug: 'principal-hub', title: 'Principal Intelligence & Broadcast Hub', file: 'principal_hub.html', deviceType: 'DESKTOP' },
  { slug: 'principal-hub-alt', title: 'Principal Intelligence & Broadcast Hub', file: 'principal_intelligence_broadcast_hub.html', deviceType: 'DESKTOP' },
  { slug: 'principal-settings', title: 'Principal Settings with Support Channel', file: 'principal_settings_with_support_channel.html', deviceType: 'DESKTOP' },
  { slug: 'scheduler-workspace', title: 'Scheduler Workspace & Reporting', file: 'scheduler_workspace.html', deviceType: 'DESKTOP' },
  { slug: 'library', title: 'Library Management Dashboard', file: 'library_management_dashboard.html', deviceType: 'DESKTOP' },
  { slug: 'glassmorphic-os', title: 'Glassmorphic Phikila OS (Space Edition)', file: 'glassmorphic_phikila_os_space_edition.html', deviceType: 'DESKTOP' },
]

const bySlug = new Map(screens.map((s) => [s.slug, s]))

export function getScreen(slug: string): StitchScreen | undefined {
  return bySlug.get(slug)
}

export function listScreens(): StitchScreen[] {
  return screens
}

/** Nav label → primary screen slug (used by the sidebar click layer). */
export const NAV_TO_SLUG: Record<string, string> = {
  Dashboard: 'admin-dashboard',
  Academics: 'academics-dashboard',
  Students: 'student-directory',
  Timetable: 'timetable-workspace',
  Finance: 'finance-dashboard',
  Settings: 'settings',
  Support: 'principal-settings',
  Personnel: 'teacher-dashboard',
  Institutions: 'super-admin-multi-school',
  Users: 'super-admin-platform',
  'Finance Hub': 'finance-bursar',
  'AI Intelligence': 'platform-config-ai',
  'Academic Management': 'academics-dashboard',
  'All Schools': 'super-admin-multi-school',
  Schools: 'super-admin-multi-school',
  'Platform Analytics': 'super-admin-platform',
  Billing: 'finance-bursar',
  'School Administrators': 'super-admin-platform',
  'Roles & Permissions': 'settings',
  'Platform Settings': 'settings',
  'Add School': 'super-admin-multi-school',
  'Sign Out': 'super-admin-dashboard',
}

/** Best desktop screen for a given role. */
export const ROLE_HOME: Record<string, string> = {
  super_admin: 'super-admin-dashboard',
  admin: 'admin-dashboard',
  academics: 'academics-dashboard',
  finance: 'finance-dashboard',
  teacher: 'teacher-dashboard',
  student: 'student-parent-dashboard',
}