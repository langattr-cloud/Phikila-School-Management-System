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
with ranked_loans as (
  select book_id,
    row_number() over(partition by book_id order by loan_date,id) as copy_ordinal
  from public.library_loans
  where status in ('on_loan','overdue','borrowed')
)
insert into public.library_book_copies(book_id,copy_number,status,current_holder_type,current_holder_name)
select b.id,
  lpad(n::text,greatest(2,length(coalesce(b.total_copies,1)::text)),'0')
    || '/' ||
  lpad(coalesce(b.total_copies,1)::text,greatest(2,length(coalesce(b.total_copies,1)::text)),'0'),
  case when legacy.copy_ordinal is null then 'available' else 'unreconciled' end,
  case when legacy.copy_ordinal is null then 'library' else 'unverified' end,
  case when legacy.copy_ordinal is null then null else 'Legacy loan: physical copy not identified' end
from public.library_books b
cross join lateral generate_series(1,greatest(1,coalesce(b.total_copies,1))) as series(n)
left join ranked_loans legacy on legacy.book_id=b.id and legacy.copy_ordinal=n
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
