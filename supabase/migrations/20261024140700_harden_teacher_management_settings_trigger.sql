-- Keep the trigger function independent of caller-controlled search paths.
create or replace function public.set_teacher_management_settings_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
