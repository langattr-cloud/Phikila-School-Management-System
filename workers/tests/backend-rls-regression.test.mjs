import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20261101120000_reassert_backend_only_rls.sql', import.meta.url),
  'utf8',
)

test('finance and account-owned timetable tables are backend-only with RLS enabled', () => {
  const tables = [
    'finance_supplier_invoices',
    'finance_supplier_payments',
    'finance_capitation_templates',
    'finance_capitation_vote_heads',
    'finance_capitation_receipts',
    'finance_capitation_allocations',
    'finance_capitation_expenditure',
    'timetable_teacher_profiles',
    'tt_timetable_ribbon_workspace_revisions',
  ]
  for (const table of tables) assert.ok(migration.includes("'" + table + "'"), table)
  assert.match(migration, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/i)
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM PUBLIC, anon, authenticated/i)
  assert.match(migration, /GRANT ALL PRIVILEGES ON TABLE public\.%I TO service_role/i)
  assert.match(migration, /has_table_privilege\('anon'/i)
  assert.match(migration, /has_table_privilege\('authenticated'/i)
  assert.doesNotMatch(migration, /FORCE ROW LEVEL SECURITY/i)
})

test('streams are restricted by authenticated school membership and admin write authority', () => {
  assert.match(migration, /ALTER TABLE public\.streams ENABLE ROW LEVEL SECURITY/i)
  assert.match(migration, /CREATE POLICY streams_read[\s\S]*?tt_user_schools\(\)/i)
  assert.match(migration, /CREATE POLICY streams_write[\s\S]*?tt_can_write\(school_id\)/i)
  assert.match(migration, /REVOKE ALL PRIVILEGES ON FUNCTION public\.tt_user_schools\(\) FROM PUBLIC, anon/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.tt_user_schools\(\) TO authenticated, service_role/i)
})
