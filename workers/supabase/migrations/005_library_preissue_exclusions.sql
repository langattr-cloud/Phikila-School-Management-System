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
