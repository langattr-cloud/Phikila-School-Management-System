-- Production migration: Library physical-copy custody and school tenancy.
-- This timestamped migration is the deployable Supabase CLI entry point.
-- The numbered source migrations remain for review and regression fixtures.


-- ===== Source: 002_library_chain_of_custody.sql =====
-- Individual physical-copy register and hierarchical custody ledger.
-- Legacy loans are not mapped to specific copy numbers: their exact physical
-- copies are unknown. Those quantities are quarantined as unreconciled until
-- a staff member verifies the physical copy and its actual holder.
create table if not exists public.library_book_copies (
  id uuid primary key default gen_random_uuid(),
  book_id bigint not null references public.library_books(id) on delete cascade,
  copy_number text not null,
  status text not null default 'available'
    check (status in ('available','with_teacher','with_student','lost','unreconciled')),
  current_holder_type text not null default 'library'
    check (current_holder_type in ('library','teacher','student','unverified')),
  current_holder_id bigint,
  current_holder_name text,
  condition text not null default 'good' check (condition in ('good','damaged','lost')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(book_id, copy_number),
  check (
    (current_holder_type in ('library','unverified') and current_holder_id is null)
    or (current_holder_type in ('teacher','student') and current_holder_id is not null)
  )
);
create index if not exists library_book_copies_book_idx on public.library_book_copies(book_id);
create index if not exists library_book_copies_holder_idx on public.library_book_copies(current_holder_type,current_holder_id);
create index if not exists library_book_copies_status_idx on public.library_book_copies(status);

create table if not exists public.library_copy_movements (
  id bigint generated always as identity primary key,
  copy_id uuid not null references public.library_book_copies(id) on delete restrict,
  action text not null check(action in ('issue_to_teacher','issue_to_student','student_return_to_teacher','teacher_return_to_library','mark_lost','reconcile_copy')),
  from_holder_type text not null check(from_holder_type in ('library','teacher','student','unverified')),
  from_holder_id bigint,
  from_holder_name text,
  to_holder_type text not null check(to_holder_type in ('library','teacher','student','unverified')),
  to_holder_id bigint,
  to_holder_name text,
  condition text not null default 'good' check(condition in ('good','damaged','lost')),
  due_date date,
  notes text,
  performed_by uuid,
  performed_at timestamptz not null default now(),
  transaction_ref uuid not null default gen_random_uuid()
);
create index if not exists library_copy_movements_copy_time_idx on public.library_copy_movements(copy_id,performed_at desc);
create index if not exists library_copy_movements_transaction_idx on public.library_copy_movements(transaction_ref);

-- Backfill numbered copies. Active legacy loans consume copy slots as
-- unreconciled records, never as falsely available stock or guessed copies.
with active_loan_books as (
  select book_id, count(*) as active_loan_count
  from public.library_loans
  where status in ('on_loan','overdue','borrowed')
  group by book_id
)
insert into public.library_book_copies(book_id,copy_number,status,current_holder_type,current_holder_name)
select b.id,
  lpad(n::text,greatest(2,length(coalesce(b.total_copies,1)::text)),'0')
    || '/' ||
  lpad(coalesce(b.total_copies,1)::text,greatest(2,length(coalesce(b.total_copies,1)::text)),'0'),
  case when coalesce(active.active_loan_count,0)>0 then 'unreconciled' else 'available' end,
  case when coalesce(active.active_loan_count,0)>0 then 'unverified' else 'library' end,
  case when coalesce(active.active_loan_count,0)>0 then 'Legacy loans: physical copy assignments unknown' else null end
from public.library_books b
cross join lateral generate_series(1,greatest(1,coalesce(b.total_copies,1))) as series(n)
left join active_loan_books active on active.book_id=b.id
on conflict(book_id,copy_number) do nothing;

create or replace function public.move_library_book_copy(
  p_copy_id uuid, p_action text, p_to_holder_id bigint default null,
  p_to_holder_name text default null, p_condition text default 'good',
  p_due_date date default null, p_notes text default null, p_performed_by uuid default null,
  p_reconcile_holder_type text default null
) returns public.library_book_copies
language plpgsql
set search_path = ''
as $$
declare
  v_copy public.library_book_copies%rowtype;
  v_to_type text;
  v_to_id bigint;
  v_to_name text;
  v_issuing_teacher_id bigint;
  v_tx uuid := gen_random_uuid();
begin
  if p_action not in ('issue_to_teacher','issue_to_student','student_return_to_teacher','teacher_return_to_library','mark_lost','reconcile_copy')
     or p_condition not in ('good','damaged','lost') then
    raise exception 'Invalid movement action or condition.' using errcode='22023';
  end if;
  select * into v_copy from public.library_book_copies where id=p_copy_id for update;
  if not found then raise exception 'Book copy not found.' using errcode='P0002'; end if;
  v_to_type := v_copy.current_holder_type;
  v_to_id := v_copy.current_holder_id;
  v_to_name := v_copy.current_holder_name;

  if p_action='issue_to_teacher' then
    if v_copy.current_holder_type<>'library' or v_copy.status<>'available' or p_to_holder_id is null or coalesce(trim(p_to_holder_name),'')='' then
      raise exception 'Only an available library copy can be issued to a named teacher.' using errcode='23514';
    end if;
    v_to_type:='teacher'; v_to_id:=p_to_holder_id; v_to_name:=trim(p_to_holder_name);
  elsif p_action='issue_to_student' then
    if v_copy.current_holder_type<>'teacher' or v_copy.status<>'with_teacher' or p_to_holder_id is null or coalesce(trim(p_to_holder_name),'')='' then
      raise exception 'Only a teacher-held copy can be issued to a named student.' using errcode='23514';
    end if;
    v_to_type:='student'; v_to_id:=p_to_holder_id; v_to_name:=trim(p_to_holder_name);
  elsif p_action='student_return_to_teacher' then
    if v_copy.current_holder_type<>'student' or v_copy.status<>'with_student' or p_to_holder_id is null or coalesce(trim(p_to_holder_name),'')='' then
      raise exception 'Only a student-held copy can be returned to a teacher.' using errcode='23514';
    end if;
    select m.from_holder_id into v_issuing_teacher_id
      from public.library_copy_movements m
      where m.copy_id=p_copy_id and m.action='issue_to_student'
      order by m.performed_at desc,m.id desc limit 1;
    if v_issuing_teacher_id is distinct from p_to_holder_id then
      raise exception 'The copy must be returned to the teacher who issued it.' using errcode='23514';
    end if;
    v_to_type:='teacher'; v_to_id:=p_to_holder_id; v_to_name:=trim(p_to_holder_name);
  elsif p_action='teacher_return_to_library' then
    if v_copy.current_holder_type<>'teacher' or v_copy.status<>'with_teacher' then
      raise exception 'Only a teacher-held copy can be returned to the library.' using errcode='23514';
    end if;
    v_to_type:='library'; v_to_id:=null; v_to_name:='Library';
  elsif p_action='reconcile_copy' then
    if v_copy.status<>'unreconciled' or v_copy.current_holder_type<>'unverified'
       or p_reconcile_holder_type is null or p_reconcile_holder_type not in ('library','teacher') then
      raise exception 'An unreconciled legacy copy must be verified at the library or accepted by its responsible teacher.' using errcode='23514';
    end if;
    if p_reconcile_holder_type='library' then
      if p_to_holder_id is not null then raise exception 'Library custody does not take a holder ID.' using errcode='22023'; end if;
      v_to_type:='library'; v_to_id:=null; v_to_name:='Library';
    else
      if p_to_holder_id is null or coalesce(trim(p_to_holder_name),'')='' then
        raise exception 'A verified teacher ID and name are required.' using errcode='22023';
      end if;
      v_to_type:=p_reconcile_holder_type; v_to_id:=p_to_holder_id; v_to_name:=trim(p_to_holder_name);
    end if;
  elsif p_action='mark_lost' then
    if v_copy.current_holder_type='library' or v_copy.status='lost' then
      raise exception 'Only an issued or unreconciled copy can be marked lost.' using errcode='23514';
    end if;
  end if;

  insert into public.library_copy_movements(copy_id,action,from_holder_type,from_holder_id,from_holder_name,
    to_holder_type,to_holder_id,to_holder_name,condition,due_date,notes,performed_by,transaction_ref)
  values(p_copy_id,p_action,v_copy.current_holder_type,v_copy.current_holder_id,v_copy.current_holder_name,
    v_to_type,v_to_id,v_to_name,case when p_action='mark_lost' then 'lost' else p_condition end,
    p_due_date,p_notes,p_performed_by,v_tx);

  update public.library_book_copies set current_holder_type=v_to_type,current_holder_id=v_to_id,
    current_holder_name=v_to_name,
    status=case when p_action='mark_lost' then 'lost' when v_to_type='library' then 'available'
      when v_to_type='teacher' then 'with_teacher' when v_to_type='student' then 'with_student'
      else 'unreconciled' end,
    condition=case when p_action='mark_lost' then 'lost' else p_condition end,
    due_date=case when v_to_type='library' then null else p_due_date end,
    updated_at=now()
  where id=p_copy_id returning * into v_copy;
  return v_copy;
end;
$$;
create or replace function public.prevent_library_copy_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $immutable$
begin
  raise exception 'Library movement history is immutable.' using errcode='23514';
end;
$immutable$;

drop trigger if exists library_copy_movements_immutable on public.library_copy_movements;
create trigger library_copy_movements_immutable
before update or delete on public.library_copy_movements
for each row execute function public.prevent_library_copy_movement_mutation();

revoke all on function public.prevent_library_copy_movement_mutation() from public,anon,authenticated;

revoke all on function public.move_library_book_copy(uuid,text,bigint,text,text,date,text,uuid,text) from public,anon,authenticated;
grant execute on function public.move_library_book_copy(uuid,text,bigint,text,text,date,text,uuid,text) to service_role;
alter table public.library_book_copies enable row level security;
alter table public.library_copy_movements enable row level security;
revoke all on public.library_book_copies,public.library_copy_movements from anon,authenticated;
grant select,insert,update,delete on public.library_book_copies to service_role;
grant select,insert on public.library_copy_movements to service_role;
grant usage,select on sequence public.library_copy_movements_id_seq to service_role;


-- ===== Source: 003_library_teacher_accountability.sql =====
-- Teacher accountability follows every copy issued by the librarian,
-- including copies temporarily reissued to students. A copy leaves the
-- teacher's account only when a teacher_return_to_library movement is recorded.
create or replace view public.library_teacher_accountability
with (security_invoker = true)
as
select
  c.id as copy_id,
  c.book_id,
  c.copy_number,
  c.status,
  c.current_holder_type,
  c.current_holder_id,
  c.current_holder_name,
  c.condition,
  c.due_date,
  b.title as book_title,
  case
    when c.current_holder_type = 'teacher' then c.current_holder_id
    when c.current_holder_type = 'student' then student_issue.from_holder_id
    when c.status = 'lost' and c.current_holder_type = 'teacher' then c.current_holder_id
    when c.status = 'lost' and c.current_holder_type = 'student' then student_issue.from_holder_id
    else null
  end as accountable_teacher_id,
  case
    when c.current_holder_type = 'teacher' then c.current_holder_name
    when c.current_holder_type = 'student' then teacher_issue.to_holder_name
    else null
  end as accountable_teacher_name,
  student_issue.to_holder_id as student_id,
  student_issue.to_holder_name as student_name,
  student_issue.performed_at as student_issue_at,
  teacher_issue.performed_at as librarian_issue_at
from public.library_book_copies c
join public.library_books b on b.id = c.book_id
left join lateral (
  select m.from_holder_id, m.to_holder_name, m.performed_at
  from public.library_copy_movements m
  where m.copy_id = c.id and m.action = 'issue_to_teacher'
  order by m.performed_at desc, m.id desc
  limit 1
) teacher_issue on true
left join lateral (
  select m.from_holder_id, m.to_holder_id, m.to_holder_name, m.performed_at
  from public.library_copy_movements m
  where m.copy_id = c.id and m.action = 'issue_to_student'
  order by m.performed_at desc, m.id desc
  limit 1
) student_issue on true
where c.current_holder_type in ('teacher','student')
   or (c.status = 'lost' and c.current_holder_type in ('teacher','student'));

grant select on public.library_teacher_accountability to service_role;


-- ===== Source: 004_library_grade_subject.sql =====
-- Add grade and subject classification to each catalogue title.
-- Existing titles are explicitly marked unclassified until reviewed by the librarian.
alter table public.library_books
  add column if not exists grade text not null default 'Unassigned',
  add column if not exists subject text not null default 'Unassigned';

create index if not exists library_books_grade_subject_idx
  on public.library_books(grade, subject, title);


-- ===== Source: 005_library_preissue_exclusions.sql =====
-- Allow the librarian to record numbered copies that are missing before issue.
-- These copies remain in the master register but are never assigned to a teacher.
alter table public.library_book_copies
  drop constraint if exists library_book_copies_status_check;
alter table public.library_book_copies
  add constraint library_book_copies_status_check
  check (status in ('available','with_teacher','with_student','lost','unreconciled','excluded'));

alter table public.library_copy_movements
  drop constraint if exists library_copy_movements_action_check;
alter table public.library_copy_movements
  add constraint library_copy_movements_action_check
  check (action in (
    'issue_to_teacher','issue_to_student','student_return_to_teacher',
    'teacher_return_to_library','mark_lost','reconcile_copy',
    'exclude_before_issue','restore_excluded_copy'
  ));

create or replace function public.set_library_copy_preissue_exclusion(
  p_copy_id uuid,
  p_action text,
  p_reason text,
  p_performed_by uuid default null
) returns public.library_book_copies
language plpgsql
set search_path = ''
as $$
declare
  v_copy public.library_book_copies%rowtype;
  v_status text;
  v_tx uuid := gen_random_uuid();
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
begin
  if p_action not in ('exclude_before_issue','restore_excluded_copy') then
    raise exception 'Unsupported pre-issue copy action.' using errcode='22023';
  end if;
  if v_reason is null then
    raise exception 'A reason is required for exclusion or restoration.' using errcode='22023';
  end if;

  select * into v_copy
  from public.library_book_copies
  where id=p_copy_id
  for update;
  if not found then
    raise exception 'Book copy not found.' using errcode='P0002';
  end if;

  if p_action='exclude_before_issue' then
    if v_copy.current_holder_type <> 'library' or v_copy.status <> 'available' then
      raise exception 'Only an available copy still in library custody can be excluded before issue.' using errcode='23514';
    end if;
    v_status := 'excluded';
  else
    if v_copy.current_holder_type <> 'library' or v_copy.status <> 'excluded' then
      raise exception 'Only a copy previously excluded before issue can be restored.' using errcode='23514';
    end if;
    v_status := 'available';
  end if;

  insert into public.library_copy_movements(
    copy_id,action,from_holder_type,from_holder_id,from_holder_name,
    to_holder_type,to_holder_id,to_holder_name,condition,due_date,notes,performed_by,transaction_ref
  ) values (
    p_copy_id,p_action,'library',null,'Library','library',null,'Library',
    v_copy.condition,null,v_reason,p_performed_by,v_tx
  );

  update public.library_book_copies
  set status=v_status, updated_at=now()
  where id=p_copy_id
  returning * into v_copy;

  return v_copy;
end;
$$;

revoke all on function public.set_library_copy_preissue_exclusion(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.set_library_copy_preissue_exclusion(uuid,text,text,uuid) to service_role;


-- ===== Source: 006_library_school_tenancy.sql =====
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
  if v_school_id is null then raise exception 'The catalogue book has no verified school assignment.' using errcode = '23514'; end if;
  if new.school_id is null then new.school_id := v_school_id;
  elsif new.school_id <> v_school_id then
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
  if v_school_id is null then raise exception 'The catalogue book has no verified school assignment.' using errcode = '23514'; end if;
  if new.school_id is null then new.school_id := v_school_id;
  elsif new.school_id <> v_school_id then
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
  if v_school_id is null then raise exception 'The physical copy has no verified school assignment.' using errcode = '23514'; end if;
  if new.school_id is null then new.school_id := v_school_id;
  elsif new.school_id <> v_school_id then
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


-- ===== Source: 007_library_accountability_school_scope.sql =====
-- Expose the authoritative catalogue school on the accountability view.
-- Appended as the final view column to preserve CREATE OR REPLACE compatibility.
create or replace view public.library_teacher_accountability
with (security_invoker = true)
as
select
  c.id as copy_id,
  c.book_id,
  c.copy_number,
  c.status,
  c.current_holder_type,
  c.current_holder_id,
  c.current_holder_name,
  c.condition,
  c.due_date,
  b.title as book_title,
  case
    when c.current_holder_type = 'teacher' then c.current_holder_id
    when c.current_holder_type = 'student' then student_issue.from_holder_id
    when c.status = 'lost' and c.current_holder_type = 'teacher' then c.current_holder_id
    when c.status = 'lost' and c.current_holder_type = 'student' then student_issue.from_holder_id
    else null
  end as accountable_teacher_id,
  case
    when c.current_holder_type = 'teacher' then c.current_holder_name
    when c.current_holder_type = 'student' then teacher_issue.to_holder_name
    else null
  end as accountable_teacher_name,
  student_issue.to_holder_id as student_id,
  student_issue.to_holder_name as student_name,
  student_issue.performed_at as student_issue_at,
  teacher_issue.performed_at as librarian_issue_at,
  c.school_id as school_id
from public.library_book_copies c
join public.library_books b on b.id = c.book_id
left join lateral (
  select m.from_holder_id, m.to_holder_name, m.performed_at
  from public.library_copy_movements m
  where m.copy_id = c.id and m.action = 'issue_to_teacher'
  order by m.performed_at desc, m.id desc
  limit 1
) teacher_issue on true
left join lateral (
  select m.from_holder_id, m.to_holder_id, m.to_holder_name, m.performed_at
  from public.library_copy_movements m
  where m.copy_id = c.id and m.action = 'issue_to_student'
  order by m.performed_at desc, m.id desc
  limit 1
) student_issue on true
where c.current_holder_type in ('teacher','student')
   or (c.status = 'lost' and c.current_holder_type in ('teacher','student'));

grant select on public.library_teacher_accountability to service_role;

