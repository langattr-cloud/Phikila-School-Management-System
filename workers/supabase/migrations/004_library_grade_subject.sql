-- Add grade and subject classification to each catalogue title.
-- Existing titles are explicitly marked unclassified until reviewed by the librarian.
alter table public.library_books
  add column if not exists grade text not null default 'Unassigned',
  add column if not exists subject text not null default 'Unassigned';

create index if not exists library_books_grade_subject_idx
  on public.library_books(grade, subject, title);
