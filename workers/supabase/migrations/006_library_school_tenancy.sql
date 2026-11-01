-- Bind every Library catalogue and legacy loan record to one timetable school.
-- NULL legacy rows remain quarantined: API queries must never expose unassigned records.
alter table public.library_books
  add column if not exists school_id integer references public.tt_schools(id) on delete restrict;
alter table public.library_loans
  add column if not exists school_id integer references public.tt_schools(id) on delete restrict;

create index if not exists library_books_school_idx
  on public.library_books(school_id, grade, subject, title);
create index if not exists library_loans_school_status_idx
  on public.library_loans(school_id, status, created_at desc);

-- A loan can only reference a book registered to the same school.
create or replace function public.enforce_library_loan_school()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_book_school_id integer;
begin
  select b.school_id into v_book_school_id
  from public.library_books b
  where b.id = new.book_id;

  if not found then
    raise exception 'Library book not found.' using errcode = '23503';
  end if;
  if new.school_id is null or v_book_school_id is null or new.school_id <> v_book_school_id then
    raise exception 'Loan school must match the registered book school.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists library_loan_school_guard on public.library_loans;
create trigger library_loan_school_guard
before insert or update of book_id, school_id on public.library_loans
for each row execute function public.enforce_library_loan_school();

revoke all on function public.enforce_library_loan_school() from public, anon, authenticated;
grant execute on function public.enforce_library_loan_school() to service_role;

-- Library access is mediated by the authenticated Worker API using its
-- service-role client after verifying tt_memberships and X-School-Id.
alter table public.library_books enable row level security;
alter table public.library_loans enable row level security;
revoke all on public.library_books, public.library_loans from anon, authenticated;
grant select, insert, update, delete on public.library_books, public.library_loans to service_role;
