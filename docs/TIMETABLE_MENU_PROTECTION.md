# Timetable menu protection

## Source of truth
`frontend/src/stitch/AscTimetableMenu.tsx` is the approved timetable menu component. Preserve the existing menu and its integration with the timetable module.

## Approved toolbar
New, Open, Save, Print, Print preview, Whole/Class/Teacher view selector, Subjects, Classes, Classrooms, Teachers, Relations, Test, Generate new, Generate in cloud, Verification, School, Timetables Online, Questions? Comments? Write us.

Students / Seminars is intentionally excluded.

## Layout contract
- Keep the toolbar in one horizontal row.
- Use the full available width without a horizontal scrollbar.
- Do not change the menu labels, action names, component export, or `onNavigate` contract without explicit approval.
- Keep the existing timetable grid and its integration intact.

## Regression protection
The GitHub Actions workflow `Timetable menu protection` runs `frontend/scripts/check-timetable-menu.mjs` on pull requests and pushes to `main` when the menu or guard changes. A failing check indicates the approved menu contract was altered.

Repository branch protection is a separate GitHub repository setting and must be enabled in Settings → Rules → Rulesets (or Branches) to require this check before merging.
