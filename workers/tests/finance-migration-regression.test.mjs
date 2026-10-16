import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ownershipMigration = await readFile(
  new URL('../../supabase/migrations/20261014190000_enforce_finance_school_reference_consistency.sql', import.meta.url),
  'utf8',
)
const postingMigration = await readFile(
  new URL('../../supabase/migrations/20261014210000_fix_payment_journal_posting_order.sql', import.meta.url),
  'utf8',
)

test('allocation type migration removes both conflicting legacy checks', () => {
  assert.match(postingMigration, /drop constraint if exists payment_allocations_type_check/i)
  assert.match(postingMigration, /drop constraint if exists payment_allocations_allocation_type_check/i)
  assert.match(postingMigration, /check\s*\(allocation_type in\s*\('FEE','CREDIT','CREDIT_APPLIED','REVERSAL'\)\)/i)
})

test('receipt creation is idempotent per payment', () => {
  assert.match(postingMigration, /create unique index if not exists uq_finance_receipts_payment_id[\s\S]*?on public\.finance_receipts\(payment_id\)[\s\S]*?where payment_id is not null/i)
  assert.match(postingMigration, /on conflict do nothing/i)
})

test('posting waits for allocations and retries after allocation insert', () => {
  assert.match(postingMigration, /abs\(v_payment\.amount - v_fee_allocated - v_credit_created\) > 0\.005/i)
  assert.match(postingMigration, /create constraint trigger trg_post_finance_payment_journal_after_allocation[\s\S]*?after insert on public\.payment_allocations[\s\S]*?deferrable initially deferred/i)
  assert.match(postingMigration, /allocation_type = 'CREDIT_APPLIED'/i)
})

test('posted journal is checked for balanced entries and a matching receipt', () => {
  assert.match(postingMigration, /abs\(coalesce\([\s\S]*?sum\(e\.debit - e\.credit\)[\s\S]*?\),0\)\) <= 0\.005/i)
  assert.match(postingMigration, /raise exception 'Payment % must have a linked, posted, balanced journal and matching receipt'/i)
})

test('receipt trigger checks payment school, student, amount and status', () => {
  assert.match(ownershipMigration, /p\.school_id = new\.school_id[\s\S]*?p\.student_id = new\.student_id[\s\S]*?not coalesce\(p\.reversed, false\)[\s\S]*?abs\(p\.amount - new\.amount\) <= 0\.005/i)
  assert.match(ownershipMigration, /before update of school_id, payment_id, student_id[\s\S]*?execute function public\.enforce_finance_receipt_school_scope\(\)/i)
})

test('invoice, payment, and allocation writes have school-scope triggers on insert and ownership updates', () => {
  for (const name of [
    'trg_enforce_finance_invoice_school_scope',
    'trg_enforce_finance_invoice_school_scope_update',
    'trg_enforce_finance_payment_school_scope',
    'trg_enforce_finance_payment_school_scope_update',
    'trg_enforce_payment_allocation_school_scope',
    'trg_enforce_payment_allocation_school_scope_update',
  ]) {
    assert.ok(ownershipMigration.includes(name), `missing school-scope trigger: ${name}`)
  }
  assert.match(ownershipMigration, /Invoice ownership cannot change while dependent finance rows exist/)
  assert.match(ownershipMigration, /Payment ownership cannot change while allocations or receipts exist/)
})
