# Phikila Timetabling — aSc TimeTables Feature-Parity Plan

## Goal

Build an original, school-management-integrated timetabling system targeting functional feature parity with aSc TimeTables. This is a staged engineering plan, not a claim that parity already exists. Do not copy proprietary source code, branding, or exact UI assets.

## Safety and architecture rules

- Keep production timetable data untouched throughout development.
- Do not run destructive migrations against production. Preserve the legacy tables and migration history until a backup, dependency review, and explicit migration plan have been approved.
- Reuse Phikila authentication, tenant/school boundaries, and canonical school records (classes, teachers, subjects) where the existing contracts are sound.
- Put new timetable functionality behind a dedicated module and new, versioned schema. Avoid reactivating the retired implementation by accident.
- All timetable writes must be school-scoped and authorization-checked server-side.
- Build deterministic validation and tests before trusting generated schedules.

## Feature parity checklist

### 1. School setup and data import
- [ ] Academic years, terms, days, alternating weeks, periods, bells, breaks, and configurable lesson grids
- [ ] Classes, grades, student groups, subjects, teachers, rooms, buildings, and shared resources
- [ ] Lessons with weekly frequency, duration/double lessons, parallel lessons, co-teachers, co-teaching rooms, and split/joined groups
- [ ] Import and export of setup data with validation, preview, and error reporting

### 2. Constraint model
- [ ] Hard constraints versus soft preferences with explicit weights
- [ ] Teacher/class/room availability and time-off
- [ ] Teacher and class daily/weekly limits, gaps/windows, starts/ends, consecutive lessons, and subject distribution
- [ ] Room capacity, room type/equipment, building travel, and room availability
- [ ] Subject ordering, double-period rules, forbidden combinations, fixed/locked lessons, and lesson relationships
- [ ] Optional courses/seminars, multi-week patterns, and region-specific school calendars
- [ ] Constraint explanation and validation before generation

### 3. Automatic generation and diagnostics
- [ ] Constraint solver that produces feasible schedules and scores soft preferences
- [ ] Repeatable generation runs with configurable time/quality limits
- [ ] Draft generation with selected constraints disabled or relaxed
- [ ] Progress, cancellation, versioned candidates, and safe recovery from failed runs
- [ ] Unplaced-lesson report, conflict diagnostics, and focused tests to isolate infeasible constraint subsets
- [ ] Compare candidates and explain major trade-offs; never silently violate hard constraints

### 4. Interactive timetable editor
- [ ] Grid views by class, teacher, room, and group
- [ ] Drag/drop move, swap, lock/unlock, and safe manual placement
- [ ] Live conflict detection with actionable explanations
- [ ] Undo/redo, autosave or explicit save states, change history, and version comparison
- [ ] Filters, search, color schemes, zoom, and keyboard-accessible editing

### 5. Verification, publication, and outputs
- [ ] Whole-school verification and per-class/teacher/room reports
- [ ] Draft, approved, and published states with permissions and audit history
- [ ] Printable layouts for classes, teachers, rooms, and individual students where data permits
- [ ] PDF and spreadsheet export, print styling, school branding, and accessible web views
- [ ] Secure sharing for staff, students, and parents with role-aware visibility

### 6. Substitutions and operational changes
- [ ] Teacher/room absence entry and eligible cover suggestions
- [ ] Move, split, join, cancel, or create replacement lessons with collision checks
- [ ] Approval workflows, reasons, audit trail, and notification integration
- [ ] Published daily changes reflected in teacher/class views and exports

### 7. Collaboration and operations
- [ ] Concurrent editing with conflict-safe saves and clear ownership/locking
- [ ] School-scoped access control, audit events, backups, restore drills, and migration safety
- [ ] Performance tests on realistic school sizes; observability for long-running generation jobs
- [ ] Mobile-responsive teacher/class views and resilient error/loading/empty states

## Delivery sequence

1. **Foundation:** new schema, permissions, API contracts, canonical-record adapters, seed fixtures, migration tests.
2. **Constraint and validation engine:** formal hard/soft constraints and explainable diagnostics.
3. **Manual editor:** complete editable grid, conflict detection, history, and versioning.
4. **Generator:** candidate generation, optimization, draft relaxation, progress/cancel, infeasibility analysis.
5. **Outputs and publishing:** approval lifecycle, print/PDF/spreadsheet, role-aware views.
6. **Substitutions and collaboration:** operational changes, notifications, concurrent edits.
7. **Parity validation:** documented feature matrix, end-to-end scenarios, load/performance testing, and staged migration review.

## Definition of done

A feature is only marked complete when the backend authorization and persistence, frontend workflow, automated tests, accessibility/error states, and migration impact have been checked. “100% clone” is a target, not a truthful status claim; parity must be demonstrated against this checklist and the reference product's documented behavior.
