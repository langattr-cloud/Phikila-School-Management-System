# Worker finance tenant migration plan

## Purpose

This plan is for hardening the existing finance module and worker API without replacing finance workflows, resetting data, or changing balances by assumption. The worker finance guard in PR #260 is temporary containment, not the target architecture.

## Schema facts confirmed in the worker's initial migration

The initial worker schema defines these legacy tables without a `school_id` column:

- `students`
- `fee_structures`
- `student_invoices`
- `payments`
- `finance_receipts`
- `payment_inbox`
- `chart_of_accounts`
- `finance_journals`
- `finance_journal_entries`

The same schema's `school_info` table has no `status` column. Do not use a school status field as an authorization gate unless a later, deployed schema migration adds it and that migration is verified.

The newer application migration `20261007_fee_vote_heads_and_allocations.sql` defines tenant-aware fee vote heads, invoice items, payment allocations, and student fee credits with `school_id`. The newer payment-posting function also writes `school_id` to `payments`, and its journal trigger expects school ownership on journal and account rows. This is evidence of schema drift between the worker's initial schema and the newer application finance schema; do not assume either migration set alone represents the live database.

## Non-negotiable migration safeguards

1. **Inspect live schema before writing DDL.** Compare `information_schema.columns`, constraints, indexes, and deployed migration history for the actual Supabase project. Do not run schema reset commands.
2. **Establish a source of truth for student-to-school ownership.** The worker's initial `students` table does not itself identify a school. Do not assign all historical students to the only currently configured school unless an authoritative enrollment or import record proves that mapping.
3. **Reconcile each finance record.** Invoices inherit the verified school of their student and fee structure; payments must agree with the student's school; receipts must agree with their payment and student; inbox records need an auditable matching decision; journal entries must agree with the journal and account.
4. **Quarantine ambiguous or contradictory records.** Report counts and IDs for manual reconciliation; do not silently backfill or delete them.
5. **Backfill before enforcing constraints.** First add nullable ownership columns and indexes, backfill in a transaction-bounded, repeatable process, validate counts and accounting totals, then add non-null and tenant-consistency constraints only after all records reconcile.
6. **Preserve accounting integrity.** Compare invoice balances, posted payment totals, allocation totals, credit balances, receipt links, and debit/credit journal totals before and after migration. Do not re-post historical payments or regenerate receipt numbers.
7. **Deploy in stages.** Use expand/backfill/validate/contract sequencing. Keep the worker finance guard enabled until tenant-scoped queries, RPCs, and rollback procedures pass tests.
8. **Test negative cases.** A user from school A must not read, update, allocate, reverse, or create receipts for school B. The RPC must reject a student, invoice, inbox item, or account whose school does not match the supplied school.
9. **Do not grant finance access based on platform-admin status alone.** Platform-wide administration and access to private school financial records are separate permissions.

## Release gates

- A documented, authoritative student-to-school mapping source exists.
- Live schema and deployed migration history have been reviewed.
- Dry-run reconciliation reports zero unexplained ownership conflicts.
- Before/after financial totals reconcile exactly to the currency precision.
- Cross-school negative tests pass for reads, writes, posting, allocations, receipts, and reversals.
- Backup and rollback procedures are rehearsed.
- School owners approve the reconciliation report before production migration.

## Current status

This document is a review and implementation plan only. It does not run SQL, alter production records, or authorize a migration. The temporary worker guard should not be removed until the release gates above are met.
