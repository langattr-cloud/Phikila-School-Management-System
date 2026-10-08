-- Reconcile legacy academic setup records so operational selectors expose only active hierarchy records.
update public.levels
set status = 'INACTIVE'
where school_id = 1 and id = 1;

update public.grades
set status = false
where school_id = 1 and id in (3, 4, 5);
