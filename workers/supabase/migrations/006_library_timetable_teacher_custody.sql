-- Allow Library to issue a physical copy to a teacher that exists in the
-- saved Timetable workspace but has not yet been created in the school
-- Teachers directory. The timetable name remains the custody identity.
-- A later teacher-directory sync can attach a numeric teacher ID without
-- rewriting the immutable issue event.
ALTER TABLE public.library_book_copies
  DROP CONSTRAINT IF EXISTS library_book_copies_check;
ALTER TABLE public.library_book_copies
  ADD CONSTRAINT library_book_copies_check CHECK (
    (current_holder_type IN ('library','unverified') AND current_holder_id IS NULL)
    OR (current_holder_type = 'teacher' AND current_holder_name IS NOT NULL AND btrim(current_holder_name) <> '')
    OR (current_holder_type = 'student' AND current_holder_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.move_library_book_copy(
  p_copy_id uuid,
  p_action text,
  p_to_holder_id bigint DEFAULT NULL,
  p_to_holder_name text DEFAULT NULL,
  p_condition text DEFAULT 'good',
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_reconcile_holder_type text DEFAULT NULL
) RETURNS public.library_book_copies
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_copy public.library_book_copies%rowtype;
  v_to_type text;
  v_to_id bigint;
  v_to_name text;
  v_issuing_teacher_id bigint;
  v_issuing_teacher_name text;
  v_tx uuid := gen_random_uuid();
BEGIN
  IF p_action NOT IN ('issue_to_teacher','issue_to_student','student_return_to_teacher','teacher_return_to_library','mark_lost','reconcile_copy')
     OR p_condition NOT IN ('good','damaged','lost') THEN
    RAISE EXCEPTION 'Invalid movement action or condition.' USING errcode='22023';
  END IF;

  SELECT * INTO v_copy FROM public.library_book_copies WHERE id=p_copy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book copy not found.' USING errcode='P0002'; END IF;

  v_to_type := v_copy.current_holder_type;
  v_to_id := v_copy.current_holder_id;
  v_to_name := v_copy.current_holder_name;

  IF p_action='issue_to_teacher' THEN
    IF v_copy.current_holder_type<>'library' OR v_copy.status<>'available'
       OR coalesce(trim(p_to_holder_name),'')='' THEN
      RAISE EXCEPTION 'Only an available library copy can be issued to a named teacher.' USING errcode='23514';
    END IF;
    v_to_type:='teacher';
    v_to_id:=p_to_holder_id;
    v_to_name:=trim(p_to_holder_name);

  ELSIF p_action='issue_to_student' THEN
    IF v_copy.current_holder_type<>'teacher' OR v_copy.status<>'with_teacher'
       OR p_to_holder_id IS NULL OR coalesce(trim(p_to_holder_name),'')='' THEN
      RAISE EXCEPTION 'Only a teacher-held copy can be issued to a named student.' USING errcode='23514';
    END IF;
    v_to_type:='student'; v_to_id:=p_to_holder_id; v_to_name:=trim(p_to_holder_name);

  ELSIF p_action='student_return_to_teacher' THEN
    IF v_copy.current_holder_type<>'student' OR v_copy.status<>'with_student'
       OR coalesce(trim(p_to_holder_name),'')='' THEN
      RAISE EXCEPTION 'Only a student-held copy can be returned to a named teacher.' USING errcode='23514';
    END IF;
    SELECT m.from_holder_id, m.from_holder_name
      INTO v_issuing_teacher_id, v_issuing_teacher_name
      FROM public.library_copy_movements m
      WHERE m.copy_id=p_copy_id AND m.action='issue_to_student'
      ORDER BY m.performed_at DESC,m.id DESC LIMIT 1;
    IF v_issuing_teacher_id IS DISTINCT FROM p_to_holder_id
       OR (v_issuing_teacher_id IS NULL AND lower(trim(coalesce(v_issuing_teacher_name,''))) <> lower(trim(p_to_holder_name))) THEN
      RAISE EXCEPTION 'The copy must be returned to the teacher who issued it.' USING errcode='23514';
    END IF;
    v_to_type:='teacher'; v_to_id:=p_to_holder_id; v_to_name:=trim(p_to_holder_name);

  ELSIF p_action='teacher_return_to_library' THEN
    IF v_copy.current_holder_type<>'teacher' OR v_copy.status<>'with_teacher' THEN
      RAISE EXCEPTION 'Only a teacher-held copy can be returned to the library.' USING errcode='23514';
    END IF;
    v_to_type:='library'; v_to_id:=NULL; v_to_name:='Library';

  ELSIF p_action='reconcile_copy' THEN
    IF v_copy.status<>'unreconciled' OR v_copy.current_holder_type<>'unverified'
       OR p_reconcile_holder_type IS NULL OR p_reconcile_holder_type NOT IN ('library','teacher') THEN
      RAISE EXCEPTION 'An unreconciled legacy copy must be verified at the library or accepted by its responsible teacher.' USING errcode='23514';
    END IF;
    IF p_reconcile_holder_type='library' THEN
      IF p_to_holder_id IS NOT NULL THEN RAISE EXCEPTION 'Library custody does not take a holder ID.' USING errcode='22023'; END IF;
      v_to_type:='library'; v_to_id:=NULL; v_to_name:='Library';
    ELSE
      IF p_to_holder_id IS NULL OR coalesce(trim(p_to_holder_name),'')='' THEN
        RAISE EXCEPTION 'A verified teacher ID and name are required.' USING errcode='22023';
      END IF;
      v_to_type:=p_reconcile_holder_type; v_to_id:=p_to_holder_id; v_to_name:=trim(p_to_holder_name);
    END IF;

  ELSIF p_action='mark_lost' THEN
    IF v_copy.current_holder_type='library' OR v_copy.status='lost' THEN
      RAISE EXCEPTION 'Only an issued or unreconciled copy can be marked lost.' USING errcode='23514';
    END IF;
  END IF;

  INSERT INTO public.library_copy_movements(
    copy_id,action,from_holder_type,from_holder_id,from_holder_name,
    to_holder_type,to_holder_id,to_holder_name,condition,due_date,notes,performed_by,transaction_ref
  ) VALUES (
    p_copy_id,p_action,v_copy.current_holder_type,v_copy.current_holder_id,v_copy.current_holder_name,
    v_to_type,v_to_id,v_to_name,CASE WHEN p_action='mark_lost' THEN 'lost' ELSE p_condition END,
    p_due_date,p_notes,p_performed_by,v_tx
  );

  UPDATE public.library_book_copies
  SET current_holder_type=v_to_type,current_holder_id=v_to_id,
      current_holder_name=v_to_name,
      status=CASE WHEN p_action='mark_lost' THEN 'lost'
        WHEN v_to_type='library' THEN 'available'
        WHEN v_to_type='teacher' THEN 'with_teacher'
        WHEN v_to_type='student' THEN 'with_student'
        ELSE 'unreconciled' END,
      condition=CASE WHEN p_action='mark_lost' THEN 'lost' ELSE p_condition END,
      due_date=CASE WHEN v_to_type='library' THEN NULL ELSE p_due_date END,
      updated_at=now()
  WHERE id=p_copy_id RETURNING * INTO v_copy;
  RETURN v_copy;
END;
$function$;

REVOKE ALL ON FUNCTION public.move_library_book_copy(uuid,text,bigint,text,text,date,text,uuid,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.move_library_book_copy(uuid,text,bigint,text,text,date,text,uuid,text) TO service_role;
