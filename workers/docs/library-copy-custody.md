# Library copy custody API

The library keeps the existing aggregate catalogue and legacy loan endpoints. The new physical-copy register is the source of truth for the hand-off workflow.

## Custody sequence

1. Librarian issues a copy from the library to a teacher: `issue_to_teacher`.
2. That teacher issues the same copy to a student: `issue_to_student`.
3. The student returns it to the issuing teacher: `student_return_to_teacher`.
4. The teacher returns it to the library: `teacher_return_to_library`.

Each transition is performed through the database function under a row lock. Invalid transitions are rejected. Every successful action appends a movement record with the prior holder, new holder, condition, actor, timestamp and transaction reference. A copy remains assigned to its last known holder until a valid hand-off is recorded. Lost copies remain outstanding against that holder.

## Endpoints

All endpoints require a verified Supabase bearer token.

- `GET /api/v1/library/copies` — list physical copies. Optional filters: `book_id`, `holder_type`, `holder_id`, `status`.
- `GET /api/v1/library/copies/:copyId/movements` — full audit history for one copy.
- `POST /api/v1/library/copies/:copyId/movements` — record a validated custody transition.
- `GET /api/v1/library/reconciliation` — list every copy currently outside the library and group by current holder. Optional `teacher_id` narrows the result to copies currently held directly by that teacher.\n- `GET /api/v1/library/teacher-accountability` — roll up each teacher's full outstanding account, including copies reissued to students. Optional `teacher_id` filters to one teacher. The response includes per-teacher totals for student-held, teacher-retained and lost copies, plus the individual numbered copies and student recipient details.
- `GET /api/v1/library/books/:bookId` — includes the physical `copies` array alongside legacy loan history.

### Verify a legacy copy

The migration deliberately marks copies that correspond to existing active aggregate loans as `unreconciled` / `unverified`. The old loan rows do not contain physical copy numbers, so the system does not guess which copy is in whose hands or show those copies as available. Physically inspect each copy, choose `reconcile_copy`, and set `to_holder_type` to `library` or `teacher`. If a legacy copy is still with a student, first have the student return it to the responsible teacher; then reconcile it to that teacher. For teacher custody, also supply `to_holder_id` and `to_holder_name`. This creates an auditable opening balance before ordinary issue/return operations can proceed.

### Record a hand-off

```json
{
  "action": "issue_to_teacher",
  "to_holder_id": 42,
  "to_holder_name": "Jane Doe",
  "condition": "good",
  "due_date": "2026-11-30",
  "notes": "Grade 9 English class set"
}
```

For `teacher_return_to_library`, no receiving holder is supplied: the copy is explicitly checked back into library custody. For `student_return_to_teacher`, the supplied teacher must match the teacher recorded on the student's most recent issue event.

## Migration and existing records

The deployable Supabase CLI entry point is `workers/supabase/migrations/20261101130000_library_custody_school_tenancy.sql`. It applies the numbered source migrations 002–007 in dependency order: physical-copy custody, accountability view, grade/subject classification, pre-issue exclusions, school tenancy and school-scoped accountability. The numbered files remain as reviewable source components and are used by the regression fixtures; the timestamped file is the production migration tracked by Supabase migration history.

Before applying this migration, apply the earlier `20261101120000_reassert_backend_only_rls.sql` migration from PR #317 so Supabase migration versions are applied in ascending order. Run `npm run db:up:linked` from `workers/` only after the pull requests have been reviewed and approved.

Existing catalogue quantities are backfilled as numbered physical copies. If a title has any active historical aggregate loans, all of that title's physical copies are marked unreconciled because the old records do not identify which numbered copies are held. None are incorrectly shown as available until the librarian physically checks each copy. Physically verify each copy and use the `reconcile_copy` movement to establish its true holder. If active historical loans exceed the catalogue's `total_copies`, investigate that discrepancy separately.

New catalogue records automatically create numbered copies through the existing books API and are stamped with the selected school. Legacy rows with no verified school assignment remain quarantined (not returned by school-scoped APIs) until an administrator assigns the correct school. New copy and movement rows inherit and validate the catalogue school's identity. Existing book quantity changes should be reconciled against the physical copy register rather than assumed to create or remove copy identities.

## Teacher accountability

The teacher accountability view derives the responsible teacher from the latest librarian-to-teacher issue and the latest teacher-to-student issue. A student-held copy therefore remains on the issuing teacher's account; it is not treated as returned to the library. When a student returns a copy to the teacher, the copy remains on that teacher's account but its current holder becomes the teacher. Only the explicit `teacher_return_to_library` transition moves it out of the account. The API response and Library page show the copy-level list and summary counts, so reconciliation is performed by copy number rather than quantity alone.

**Authorization:** every Library endpoint verifies an active membership in the selected school. Multi-school users must send `X-School-Id`; catalogue and reporting operations require an admin, super-admin or librarian membership. Student issue/return operations require a teacher membership linked to a saved timetable teacher profile in that same school. Librarian/admin hand-offs validate the receiving teacher against the school's saved timetable directory. Copy IDs are always checked against the selected school before movement history is read or changed. The optional `teacher_id` report filter is applied only after school scoping and is not an authorization boundary by itself.

**Live identity prerequisite:** the current production membership audit found no active teacher or librarian memberships, and the Teachers module table is empty, while timetable teacher profiles exist only for one of the three schools. The code deliberately does not create synthetic teacher accounts or membership links. Teacher self-service custody actions and teacher hand-off reporting for schools without saved profiles remain unavailable until real staff accounts are linked to the existing timetable identities.


## Grade and subject inventory report

Every new catalogue title must include a grade and subject. Migration 004 adds those fields and leaves existing catalogue rows as **Unassigned** until the librarian classifies them. The Library page's **View book totals** button calls the grade-subject summary endpoint. Totals are calculated from individual physical copy records, regardless of whether copies are in the library, with teachers, or with students. Expanding a grade/subject group lists each title, its copy count, and numbered copies.


## Missing before issue: pre-issue exclusion

If a numbered copy cannot be physically located before the librarian issues a class set to a teacher, record **Exclude missing copy before issue** for that exact copy number. The librarian must enter a reason. The copy remains in the master physical-copy register with status `excluded` and holder `Library`, but it is not available for issue and is not included in any teacher accountability account. The immutable movement log records the actor, timestamp, reason and transaction reference.

A copy may later be restored using **Restore previously excluded copy**, with a reason explaining the physical verification. Restoration changes its status to `available`; it does not erase the original exclusion event. This is distinct from `mark_lost`: a copy lost after it was issued remains accountable to its last responsible teacher.

Example: for 25 registered copies, if 13/25 is missing before issue, exclude 13/25 and issue only the remaining 24 copies. The report must show 24 accountable copies for that teacher, while the catalogue still shows all 25 registered copy numbers and one pre-issue exclusion.
