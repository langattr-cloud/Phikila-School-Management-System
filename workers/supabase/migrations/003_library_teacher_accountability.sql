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
