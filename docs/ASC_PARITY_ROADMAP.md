# aSc Timetables Parity Roadmap

## Objective

Make Phikila behave and present like an aSc-style timetable application while preserving the existing FastAPI/Supabase/CP-SAT architecture.

This document is an implementation contract: reproduce aSc workflow and functionality; do not introduce unrelated UX concepts.

## Priority order

1. Timetable editor parity
2. Data-entry parity
3. Test-before-generation workflow
4. Strict / Draft / Allow Relaxation generation modes
5. Locked-lesson preservation during regeneration
6. Constraint priorities and diagnostics
7. Generation complexity/progress/cancellation
8. Appearance/font popup parity
9. Print/export parity
10. Versions/publishing
11. Operational timetable features

## Existing capabilities to preserve

- FastAPI backend and Supabase persistence
- Alembic migrations
- Existing CP-SAT solver
- Existing conflict detection and move explanation
- Existing timetable grid and views
- Existing appearance editor
- Existing solver progress and cancellation
- Existing audit trail

## First implementation slice

### Locked lessons

A locked lesson must be treated as a fixed placement during generation. The lock must preserve day, period, duration, class, subject, teacher and room where assigned. Regeneration must not delete or relocate locked lessons.

Implementation must wire existing `TtLesson.is_locked` into `SolverInput.locked`, enforce those positions in CP-SAT, and preserve them through generation persistence.

### Generation modes

Add an explicit generation configuration with:

- `strict`: all enabled hard constraints must hold; no intentional relaxation
- `draft`: produce a best-effort draft with unresolved requirements clearly reported
- `relax`: progressively relax eligible soft/hard constraints according to priority and report every relaxation

Do not replace the existing solver. Modes should configure the existing solver and validation pipeline.

### Test workflow

Expose the existing preflight/conflict analysis before generation as a first-class Test action. Test must not create or publish a timetable.

Return actionable blockers and affected entities.

## Safety

Changes should be additive and incremental. Do not alter unrelated modules, credentials, production data, or deployment configuration as part of parity work.
