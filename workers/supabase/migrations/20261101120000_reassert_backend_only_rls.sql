-- Reassert server-only access for tables whose data plane is the authenticated Worker.
-- The Worker uses the Supabase service_role key; no browser client should query these tables directly.
-- RLS without client policies is intentional: service_role bypasses RLS, while anon/authenticated have no table grants.
DO $$
DECLARE
  table_name text;
  sequence_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'streams',
    'finance_supplier_invoices',
    'finance_supplier_payments',
    'finance_capitation_templates',
    'finance_capitation_vote_heads',
    'finance_capitation_receipts',
    'finance_capitation_allocations',
    'finance_capitation_expenditure',
    'tt_timetable_ribbon_workspace_revisions',
    'timetable_teacher_profiles'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', table_name);

    sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'id');
    IF sequence_name IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated', sequence_name::regclass);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', sequence_name::regclass);
    END IF;
  END LOOP;
END
$$;
