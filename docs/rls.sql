-- Row Level Security for the multi-tenant timetable schema.
--
-- The FastAPI layer already resolves school_id from the verified Supabase JWT
-- and never trusts a client-supplied value (see app/modules/scheduling/tenancy.py).
-- These policies are the second, independent line of defence: if a query ever
-- reached PostgreSQL with the wrong tenant, the database itself would refuse.
--
-- Apply with:  psql "$DATABASE_URL" -f docs/rls.sql
--
-- IMPORTANT: the API connects as the table owner. Owners bypass RLS unless
-- FORCE ROW LEVEL SECURITY is set, so these policies matter mainly for
-- Supabase's PostgREST/anon roles and for any direct client access. Keep the
-- application-level checks either way; defence in depth, not instead of.

create or replace function public.tt_user_schools()
returns setof integer
language sql stable security definer set search_path = public
as $$
  select school_id from public.tt_memberships
  where user_id = coalesce(auth.jwt() ->> 'sub', '') and is_active
$$;

create or replace function public.tt_user_role(target_school integer)
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.tt_memberships
  where user_id = coalesce(auth.jwt() ->> 'sub', '')
    and school_id = target_school and is_active limit 1
$$;

create or replace function public.tt_can_write(target_school integer)
returns boolean language sql stable
as $$
  select public.tt_user_role(target_school) in ('scheduler', 'admin', 'super_admin')
$$;

do $$
declare t text;
tenant_tables text[] := array[
  'tt_periods', 'tt_days', 'tt_teachers', 'tt_subjects', 'tt_rooms',
  'tt_classes', 'tt_lesson_requirements', 'tt_constraints', 'tt_versions',
  'tt_lessons', 'tt_solver_jobs', 'tt_audit'
];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format($f$create policy %I on public.%I for select using (school_id in (select public.tt_user_schools()))$f$, t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format($f$create policy %I on public.%I for all using (school_id in (select public.tt_user_schools()) and public.tt_can_write(school_id)) with check (school_id in (select public.tt_user_schools()) and public.tt_can_write(school_id))$f$, t || '_write', t);
  end loop;
end $$;

alter table public.tt_schools enable row level security;
alter table public.tt_schools force row level security;
drop policy if exists tt_schools_read on public.tt_schools;
create policy tt_schools_read on public.tt_schools for select using (id in (select public.tt_user_schools()));
drop policy if exists tt_schools_write on public.tt_schools;
create policy tt_schools_write on public.tt_schools for all using (public.tt_user_role(id) in ('admin', 'super_admin')) with check (public.tt_user_role(id) in ('admin', 'super_admin'));

alter table public.tt_memberships enable row level security;
alter table public.tt_memberships force row level security;
drop policy if exists tt_memberships_self on public.tt_memberships;
create policy tt_memberships_self on public.tt_memberships for select using (user_id = coalesce(auth.jwt() ->> 'sub', ''));
drop policy if exists tt_memberships_admin on public.tt_memberships;
create policy tt_memberships_admin on public.tt_memberships for all using (public.tt_user_role(school_id) in ('admin', 'super_admin')) with check (public.tt_user_role(school_id) in ('admin', 'super_admin'));

-- Academic Streams: tenant isolated in the same way as timetable data.
alter table public.streams enable row level security;
drop policy if exists streams_read on public.streams;
create policy streams_read on public.streams
  for select using (school_id in (select public.tt_user_schools()));
drop policy if exists streams_write on public.streams;
create policy streams_write on public.streams
  for all
  using (school_id in (select public.tt_user_schools()) and public.tt_can_write(school_id))
  with check (school_id in (select public.tt_user_schools()) and public.tt_can_write(school_id));

create index if not exists ix_tt_memberships_user on public.tt_memberships (user_id, is_active);
create index if not exists ix_tt_lessons_version on public.tt_lessons (version_id, day_index, period_index);
create index if not exists ix_tt_lessons_teacher on public.tt_lessons (school_id, teacher_id);
create index if not exists ix_tt_lessons_class on public.tt_lessons (school_id, class_id);
create index if not exists ix_tt_audit_recent on public.tt_audit (school_id, at desc);
create index if not exists ix_streams_school_level on public.streams (school_id, level_id);
