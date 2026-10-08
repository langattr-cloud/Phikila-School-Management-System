-- Fee structures can target a grade and optionally a stream.
alter table public.fee_structures add column if not exists grade_id bigint references public.grades(id) on delete set null;
alter table public.fee_structures add column if not exists stream_id bigint references public.streams(id) on delete set null;
create index if not exists ix_fee_structures_school_year_grade on public.fee_structures(school_id, academic_year_id, grade_id);
create index if not exists ix_fee_structures_school_year_stream on public.fee_structures(school_id, academic_year_id, stream_id);
