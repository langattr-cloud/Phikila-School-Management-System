-- Persist teacher-management UI settings separately from the canonical teacher record.
-- The frontend accesses this table only through the authenticated Worker API.
create table if not exists public.teacher_management_settings (
  teacher_id bigint primary key references public.teachers(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.teacher_management_settings enable row level security;
revoke all on table public.teacher_management_settings from anon, authenticated;

create or replace function public.set_teacher_management_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_teacher_management_settings_updated_at on public.teacher_management_settings;
create trigger trg_teacher_management_settings_updated_at
before update on public.teacher_management_settings
for each row execute function public.set_teacher_management_settings_updated_at();
