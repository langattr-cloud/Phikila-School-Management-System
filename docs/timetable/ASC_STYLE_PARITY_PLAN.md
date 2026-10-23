# Timetable Rebuild: ASC-Style Feature-Parity Plan

## Goal

Build a first-party, school-integrated timetable planner inspired by the breadth of ASC Timetables. This is a feature-parity target, not a claim of exact equivalence. Do not copy proprietary source code, branding, or protected assets. Deliver incrementally behind the existing application architecture and verify every capability with tests.

## Non-negotiable safety and architecture

- Keep production data untouched while designing and validating the replacement.
- Do not run destructive migrations against the live Supabase database as part of implementation.
- Audit current tables, migration history, auth/tenant boundaries, canonical school records, and any orphaned timetable code before choosing schema changes.
- Reuse the application's existing school tenancy, authentication, staff, subject, class, and academic-year records where appropriate; avoid duplicate master data.
- Keep the new timetable schema isolated and namespaced until a reviewed migration and backup/restore plan exist.
- Enforce school/tenant authorization in every API operation; UI visibility is not authorization.
- Preserve draft/published separation and use explicit versioning for timetable edits and generated results.
- Use deterministic, testable constraint evaluation and report why a schedule cannot be completed.
- Use original UI and implementation. ASC Timetables is a reference for capability, not source code or branding to copy.

## Parity checklist

### 1. School and timetable setup
- [ ] Academic year/term and timetable cycle configuration
- [ ] Teaching days, periods, period start/end times, breaks, lunch, and non-teaching periods
- [ ] Classes/forms, streams/groups, subjects, teachers, rooms, and shared facilities
- [ ] Subject-to-class teaching requirements and lessons per week
- [ ] Teacher workload limits and availability
- [ ] Room capacity, room type, equipment, and availability
- [ ] Teacher/subject/class/room unavailability and preferred times
- [ ] Double/triple periods, consecutive lessons, split groups, and co-teaching
- [ ] Import/export and validation of setup data

### 2. Manual timetable editor
- [ ] Responsive weekly grid with class, teacher, room, and school views
- [ ] Drag/drop and keyboard-accessible lesson placement
- [ ] Add, edit, move, copy, repeat, and remove lessons
- [ ] Clear visual distinction for locked, unscheduled, conflicting, and published lessons
- [ ] Lock lessons or periods to protect manual decisions during generation
- [ ] Undo/redo, unsaved-change protection, autosave feedback, and edit history
- [ ] Filters, search, zoom/density controls, and conflict highlighting
- [ ] Multi-week/cycle support where configured

### 3. Constraint engine and diagnostics
- [ ] Hard constraints: no teacher, class, or room overlap; respect availability and valid periods
- [ ] Hard constraints: enforce required lesson counts and group membership
- [ ] Configurable soft constraints: preferred times, balanced distribution, workload balance, gaps, and consecutive lessons
- [ ] Subject sequencing, double lessons, daily/weekly limits, and spacing preferences
- [ ] Explain each conflict with the affected resources and conflicting lessons
- [ ] Distinguish impossible hard constraints from soft preference penalties
- [ ] Validate every manual edit and every generated schedule server-side

### 4. Automatic scheduling
- [ ] Generate an initial schedule from configured requirements
- [ ] Optimize against weighted soft constraints with reproducible runs
- [ ] Support fixed/locked lessons and partial regeneration
- [ ] Show progress, score, unresolved requirements, and actionable failure reasons
- [ ] Compare candidate schedules and retain prior versions
- [ ] Allow manual refinement after generation without losing provenance
- [ ] Load/performance tests on realistic school sizes

### 5. Review, publishing, and communication
- [ ] Drafts, named versions, snapshots, restore/compare, and audit trail
- [ ] Review and publish workflow with explicit permissions
- [ ] Publish atomically so viewers never see a half-written timetable
- [ ] Student/class, teacher, room, and school-wide read views
- [ ] Print-ready views and PDF/CSV export
- [ ] Mobile-friendly display and accessible color/contrast cues
- [ ] Optional notifications when a published timetable changes
- [ ] Permissions for timetable administrators, school leaders, teachers, and read-only users

### 6. Operational requirements
- [ ] Tenant isolation and object-level authorization tests
- [ ] Schema migration and rollback/recovery review
- [ ] API schema validation, safe error handling, and concurrency control
- [ ] Unit, integration, API, and frontend build tests
- [ ] Audit logging without secrets or unnecessary personal data
- [ ] Documented backup, restore, rollout, and rollback procedures

## Delivery sequence

1. **Audit and foundation:** map current app routes, auth/tenant context, canonical data models, migration heads, and legacy timetable remnants. Produce a reviewed domain model and migration plan without touching production data.
2. **Setup and validation:** isolated schema, API contracts, permissions, setup forms, and a tested constraint validator.
3. **Manual editor:** responsive grid, lesson CRUD/move, conflict feedback, draft saves, and version history.
4. **Automatic generation:** generation service, scoring, locks, partial regeneration, and diagnostics.
5. **Publish and export:** approval/publishing, role-specific views, print/PDF/CSV, and change history.
6. **Parity verification:** test every checklist item, document gaps, benchmark realistic datasets, and only then claim verified feature coverage.

## Acceptance rule

A checklist item is complete only when the UI/API behavior exists, authorization is enforced, automated tests cover the critical behavior, and the result is verified in a working preview. Do not describe the project as a 100% clone before the parity checklist is fully tested.