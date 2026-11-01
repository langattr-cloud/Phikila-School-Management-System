-- Restore least-privilege access for the tables identified by the Supabase
-- security advisor. The FastAPI service connects as the database owner and the
-- Worker uses service_role; browser clients must not access finance or
-- account-owned timetable profile/revision tables directly.
--
-- Do not FORCE RLS on these backend-owned tables: the FastAPI database owner
-- must continue to execute its own school-scoped authorization checks.
DO $$
DECLARE
  table_name text;
  sequence_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'finance_supplier_invoices',
    'finance_supplier_payments',
    'finance_capitation_templates',
    'finance_capitation_vote_heads',
    'finance_capitation_receipts',
    'finance_capitation_allocations',
    'finance_capitation_expenditure',
    'timetable_teacher_profiles',
    'tt_timetable_ribbon_workspace_revisions'
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

-- Streams are used by authenticated school staff. The Worker additionally
-- checks an active admin/super_admin membership before each stream operation.
-- These RLS policies provide the independent PostgREST/database boundary.
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.streams FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.streams TO authenticated, service_role;

DO $
DECLARE
  sequence_name text := pg_get_serial_sequence('public.streams', 'id');
BEGIN
  IF sequence_name IS NOT NULL THEN
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon', sequence_name::regclass);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role', sequence_name::regclass);
  END IF;
END
$;

REVOKE ALL PRIVILEGES ON FUNCTION public.tt_user_schools() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tt_user_schools() TO authenticated, service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.tt_user_role(integer) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.tt_user_role(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tt_user_role(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tt_user_role(bigint) TO authenticated, service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.tt_can_write(integer) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.tt_can_write(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tt_can_write(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tt_can_write(bigint) TO authenticated, service_role;

DROP POLICY IF EXISTS streams_read ON public.streams;
CREATE POLICY streams_read ON public.streams
  FOR SELECT TO authenticated
  USING (school_id IN (SELECT public.tt_user_schools()));

DROP POLICY IF EXISTS streams_write ON public.streams;
CREATE POLICY streams_write ON public.streams
  FOR ALL TO authenticated
  USING (
    school_id IN (SELECT public.tt_user_schools())
    AND public.tt_can_write(school_id)
  )
  WITH CHECK (
    school_id IN (SELECT public.tt_user_schools())
    AND public.tt_can_write(school_id)
  );

-- Fail the migration rather than silently leaving a partially protected set.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'finance_supplier_invoices',
    'finance_supplier_payments',
    'finance_capitation_templates',
    'finance_capitation_vote_heads',
    'finance_capitation_receipts',
    'finance_capitation_allocations',
    'finance_capitation_expenditure',
    'timetable_teacher_profiles',
    'tt_timetable_ribbon_workspace_revisions'
  ]
  LOOP
    IF NOT (
      SELECT c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name
    ) THEN
      RAISE EXCEPTION 'RLS was not enabled on public.%', table_name;
    END IF;
    IF has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') THEN
      RAISE EXCEPTION 'Browser table access remains on public.%', table_name;
    END IF;
    IF NOT has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') THEN
      RAISE EXCEPTION 'service_role cannot read public.%', table_name;
    END IF;
  END LOOP;

  IF NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='streams') THEN
    RAISE EXCEPTION 'RLS was not enabled on public.streams';
  END IF;
  IF has_table_privilege('anon', 'public.streams', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.streams', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.streams', 'SELECT') THEN
    RAISE EXCEPTION 'Unexpected grants on public.streams';
  END IF;
  IF has_function_privilege('anon', 'public.tt_user_schools()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.tt_user_schools()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected execution grants on tt_user_schools()';
  END IF;
END
$$;
