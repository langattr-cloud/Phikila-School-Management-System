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

Apply `workers/supabase/migrations/002_library_chain_of_custody.sql` after the initial schema, then apply `workers/supabase/migrations/003_library_teacher_accountability.sql` to create the teacher-level roll-up view. Existing catalogue quantities are backfilled as numbered physical copies. If a title has any active historical aggregate loans, all of that title's physical copies are marked unreconciled because the old records do not identify which numbered copies are held. None are incorrectly shown as available until the librarian physically checks each copy. Physically verify each copy and use the `reconcile_copy` movement to establish its true holder. If active historical loans exceed the catalogue's `total_copies`, investigate that discrepancy separately.

New catalogue records automatically create numbered copies through the existing books API. Existing book quantity changes should be reconciled against the physical copy register rather than assumed to create or remove copy identities.

## Teacher accountability

The teacher accountability view derives the responsible teacher from the latest librarian-to-teacher issue and the latest teacher-to-student issue. A student-held copy therefore remains on the issuing teacher's account; it is not treated as returned to the library. When a student returns a copy to the teacher, the copy remains on that teacher's account but its current holder becomes the teacher. Only the explicit `teacher_return_to_library` transition moves it out of the account. The API response and Library page show the copy-level list and summary counts, so reconciliation is performed by copy number rather than quantity alone.

**Authorization limitation:** the library endpoints currently require verified authentication but do not yet enforce separate librarian, teacher, and student membership roles or restrict a teacher to their own account. The optional `teacher_id` filter is a reporting filter, not an authorization boundary. Do not expose this API as a role-secure teacher portal until role checks are implemented using the school's authoritative membership records.
