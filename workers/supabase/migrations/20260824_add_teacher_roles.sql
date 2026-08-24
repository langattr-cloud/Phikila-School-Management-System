-- Teaching staff profile enhancements
alter table public.teachers
  add column if not exists role text,
  add column if not exists role_assignment jsonb not null default '{}'::jsonb;
