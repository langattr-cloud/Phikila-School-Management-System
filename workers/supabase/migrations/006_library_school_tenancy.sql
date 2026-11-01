-- Enforce school ownership for the complete Library data graph.
-- Existing records without an authoritative school assignment remain NULL and
-- are intentionally hidden by the API until an administrator maps them.
alter table public.library_books
  add column if not exists school_id integer references public.tt_schools(id) on delete restrict;
alter table public.library_loans
  add column if not exists school_id integer references public.tt_schools(id) on delete restrict;
alter table public.library_book_copies
  add column if not exists school_id integer references public.tt_schools(id) on delete restrict;
alter table public.library_copy_movements
  add column if not exists school_id integer references public.tt_schools(id) on delete restrict;

-- Derive physical-copy and movement tenancy only from an already assigned
-- catalogue book. Never guess a school for legacy catalogue rows.
update public.library_book_copies c
set school_id = b.school_id
from public.library_books b
where c.book_id = b.id and c.school_id is distinct from b.school_id;

update public.library_copy_movements m
set school_id = c.school_id
from public.library_book_copies c
where m.copy_id = c.id and m.school_id is distinct from c.school_id;

create index if not exists library_books_school_idx
  on public.library_books(school_id, grade, subject, title);
create index if not exists library_loans_school_status_idx
  on public.library_loans(school_id, status, created_at desc);
create index if not exists library_book_copies_school_book_idx
  on public.library_book_copies(school_id, book_id, copy_number);
create index if not exists library_copy_movements_school_copy_time_idx
  on public.library_copy_movements(school_id, copy_id, performed_at desc);

create or replace function public.enforce_library_loan_school()
returns trigger language plpgsql set search_path = '' as $$
declare v_school_id integer;
begin
  select b.school_id into v_school_id from public.library_books b where b.id = new.book_id;
  if not found then raise exception 'Library book not found.' using errcode = '23503'; end if;
  if new.school_id is null or v_school_id is null or new.school_id <> v_school_id then
    raise exception 'Loan school must match the registered book school.' using errcode = '23514';
  end if;
  return new;
end; $$;

create or replace function public.enforce_library_copy_school()
returns trigger language plpgsql set search_path = '' as $$
declare v_school_id integer;
begin
  select b.school_id into v_school_id from public.library_books b where b.id = new.book_id;
  if not found then raise exception 'Library book not found.' using errcode = '23503'; end if;
  if new.school_id is null or v_school_id is null or new.school_id <> v_school_id then
    raise exception 'Copy school must match the registered book school.' using errcode = '23514';
  end if;
  return new;
end; $$;

create or replace function public.enforce_library_movement_school()
returns trigger language plpgsql set search_path = '' as $$
declare v_school_id integer;
begin
  select c.school_id into v_school_id from public.library_book_copies c where c.id = new.copy_id;
  if not found then raise exception 'Library copy not found.' using errcode = '23503'; end if;
  if new.school_id is null or v_school_id is null or new.school_id <> v_school_id then
    raise exception 'Movement school must match the physical copy school.' using errcode = '23514';
  end if;
  return new;
end; $$;

drop trigger if exists library_loan_school_guard on public.library_loans;
create trigger library_loan_school_guard before insert or update of book_id, school_id
on public.library_loans for each row execute function public.enforce_library_loan_school();

drop trigger if exists library_copy_school_guard on public.library_book_copies;
create trigger library_copy_school_guard before insert or update of book_id, school_id
on public.library_book_copies for each row execute function public.enforce_library_copy_school();

drop trigger if exists library_movement_school_guard on public.library_copy_movements;
create trigger library_movement_school_guard before insert or update of copy_id, school_id
on public.library_copy_movements for each row execute function public.enforce_library_movement_school();

revoke all on function public.enforce_library_loan_school() from public, anon, authenticated;
revoke all on function public.enforce_library_copy_school() from public, anon, authenticated;
revoke all on function public.enforce_library_movement_school() from public, anon, authenticated;
grant execute on function public.enforce_library_loan_school() to service_role;
grant execute on function public.enforce_library_copy_school() to service_role;
grant execute on function public.enforce_library_movement_school() to service_role;

-- The Worker API verifies membership and school selection before using the
-- service-role database client. Direct client access remains disabled.
alter table public.library_books enable row level security;
alter table public.library_loans enable row level security;
alter table public.library_book_copies enable row level security;
alter table public.library_copy_movements enable row level security;
revoke all on public.library_books, public.library_loans, public.library_book_copies, public.library_copy_movements from anon, authenticated;
grant select, insert, update, delete on public.library_books, public.library_loans, public.library_book_copies to service_role;
grant select, insert on public.library_copy_movements to service_role;
grant usage, select on sequence public.library_copy_movements_id_seq to service_role;
