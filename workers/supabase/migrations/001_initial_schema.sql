-- Phikila School Management System — initial schema
-- All tables live in the public schema and are accessed server-side by the
-- Cloudflare Worker using the service-role key. Row Level Security is NOT
-- enabled on these tables because the Worker is the only data-plane client;
-- every request is authenticated at the edge before reaching SQL.

-- ════════════════════════════════════════════════════════════════════════
-- Extension helpers
-- ════════════════════════════════════════════════════════════════════════
create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- Identity & platform
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.school_info (
  id bigint primary key generated always as identity,
  name text not null,
  motto text,
  slug text unique,
  establishment_year integer,
  phone text,
  email text,
  address text,
  timezone text,
  academic_year text,
  term text,
  school_days text[],
  session_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_settings (
  id bigint primary key generated always as identity,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key)
);

create table if not exists public.school_branding (
  id bigint primary key generated always as identity,
  school_id bigint references public.school_info(id) on delete cascade,
  primary_color text,
  logo_url text,
  accent_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_contact (
  id bigint primary key generated always as identity,
  school_id bigint references public.school_info(id) on delete cascade,
  phone text,
  email text,
  physical_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key,
  email text unique,
  full_name text,
  role text default 'user',
  status text default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  id bigint primary key generated always as identity,
  name text unique not null,
  permissions jsonb not null default '[]'::jsonb
);

create table if not exists public.tt_platform_admins (
  id bigint primary key generated always as identity,
  user_id uuid not null,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.tt_access_requests (
  id bigint primary key generated always as identity,
  user_id uuid not null,
  requested_role text,
  requested_school_id bigint,
  requested_school_name text,
  status text not null default 'pending', -- pending | approved | rejected
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tt_platform_audit (
  id bigint primary key generated always as identity,
  user_id uuid,
  action text not null,
  entity text,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tt_audit (
  id bigint primary key generated always as identity,
  user_id uuid,
  action text not null,
  entity text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- Academics
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.academic_years (
  id bigint primary key generated always as identity,
  name text not null,
  start_date date,
  end_date date,
  is_current boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.terms (
  id bigint primary key generated always as identity,
  year_id bigint references public.academic_years(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.levels (
  id bigint primary key generated always as identity,
  name text not null,
  description text,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.streams (
  id bigint primary key generated always as identity,
  level_id bigint references public.levels(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.departments (
  id bigint primary key generated always as identity,
  name text not null,
  description text,
  head_of_department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.department_members (
  id bigint primary key generated always as identity,
  department_id bigint references public.departments(id) on delete cascade,
  member_type text not null default 'teacher',
  member_id bigint,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- Teachers
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.teachers (
  id bigint primary key generated always as identity,
  staff_number text unique,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  gender text,
  tsc_number text,
  employment_status text default 'Permanent',
  subject_specialization text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qualifications (
  id bigint primary key generated always as identity,
  teacher_id bigint references public.teachers(id) on delete cascade,
  qualification text not null,
  institution text,
  year_completed integer,
  created_at timestamptz not null default now()
);

create table if not exists public.availabilities (
  id bigint primary key generated always as identity,
  teacher_id bigint references public.teachers(id) on delete cascade,
  day text,
  start_time time,
  end_time time,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- Students, guardians, class registers
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.students (
  id bigint primary key generated always as identity,
  admission_number text unique not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  gender text not null,
  date_of_birth date not null,
  nationality text default 'Kenyan',
  birth_cert_or_id text unique,
  contact_info text,
  photo_url text,
  status text default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardians (
  id bigint primary key generated always as identity,
  student_id bigint not null references public.students(id) on delete cascade,
  parent_name text not null,
  relationship_to_student text not null,
  phone_number text not null,
  email text,
  address text,
  is_emergency_contact boolean default false
);

create table if not exists public.class_registers (
  id bigint primary key generated always as identity,
  class_name text not null,
  level text,
  stream text,
  capacity integer,
  class_teacher_id bigint references public.teachers(id) on delete set null,
  academic_year text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- Subjects & timetable
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.subjects (
  id bigint primary key generated always as identity,
  name text not null,
  code text,
  description text,
  category text default 'Core',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timetables (
  id bigint primary key generated always as identity,
  class_register_id bigint references public.class_registers(id) on delete cascade,
  academic_year_id bigint references public.academic_years(id) on delete cascade,
  name text,
  status text default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timetable_entries (
  id bigint primary key generated always as identity,
  timetable_id bigint references public.timetables(id) on delete cascade,
  class_register_id bigint references public.class_registers(id) on delete cascade,
  subject_id bigint references public.subjects(id) on delete cascade,
  teacher_id bigint references public.teachers(id) on delete cascade,
  room text,
  day text,
  period integer,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_periods (
  id bigint primary key generated always as identity,
  name text not null,
  start_time time not null,
  end_time time not null,
  break boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists public.working_days (
  id bigint primary key generated always as identity,
  name text not null,
  day_of_week integer,
  is_active boolean default true
);

create table if not exists public.timetable_allocations (
  id bigint primary key generated always as identity,
  timetable_id bigint references public.timetables(id) on delete cascade,
  teacher_id bigint references public.teachers(id) on delete cascade,
  subject_id bigint references public.subjects(id) on delete cascade,
  class_register_id bigint references public.class_registers(id) on delete cascade,
  day text,
  period integer,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- Scheduling engine (tt_*)
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.tt_teachers (
  id bigint primary key generated always as identity,
  name text not null,
  email text,
  subject_specialization text,
  max_periods integer default 30,
  preferred_days text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tt_classes (
  id bigint primary key generated always as identity,
  name text not null,
  level text,
  stream text,
  class_teacher_id bigint,
  size integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tt_subjects (
  id bigint primary key generated always as identity,
  name text not null,
  code text,
  category text default 'Core',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tt_rooms (
  id bigint primary key generated always as identity,
  name text not null,
  capacity integer,
  room_type text default 'Classroom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tt_periods (
  id bigint primary key generated always as identity,
  name text not null,
  start_time time not null,
  end_time time not null,
  is_break boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tt_days (
  id bigint primary key generated always as identity,
  name text not null,
  day_of_week integer not null,
  is_active boolean default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tt_lesson_requirements (
  id text primary key,
  subject_id bigint,
  class_id bigint,
  periods_per_week integer not null default 1,
  teacher_id bigint,
  room_type text,
  preferred_rooms text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tt_lessons (
  id bigint primary key generated always as identity,
  version_id bigint not null,
  subject_id bigint,
  class_id bigint,
  teacher_id bigint,
  room text,
  day text,
  period integer,
  start_time time,
  end_time time,
  status text default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tt_versions (
  id bigint primary key generated always as identity,
  name text not null,
  description text,
  status text default 'draft', -- draft | published
  is_current boolean default false,
  stats jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tt_solver_jobs (
  id text primary key,
  status text not null default 'queued', -- queued | running | completed | failed | cancelled
  progress float default 0,
  message text,
  version_id bigint,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tt_constraints (
  id bigint primary key generated always as identity,
  type text not null,
  subject text,
  payload jsonb default '{}'::jsonb,
  active boolean default true,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- Attendance
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.attendance_sessions (
  id bigint primary key generated always as identity,
  session_type text not null, -- lesson | exam
  session_date date not null,
  start_time time,
  end_time time,
  subject text,
  class_name text,
  teacher_name text,
  lesson_id bigint,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id bigint primary key generated always as identity,
  session_id bigint not null references public.attendance_sessions(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  status text not null default 'present', -- present | absent | late | excused
  remark text,
  marked_by uuid,
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);

-- ════════════════════════════════════════════════════════════════════════
-- Examinations
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.examinations (
  id bigint primary key generated always as identity,
  name text not null,
  term text,
  academic_year text,
  start_date date,
  end_date date,
  status text default 'draft', -- draft | published
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_components (
  id bigint primary key generated always as identity,
  examination_id bigint not null references public.examinations(id) on delete cascade,
  name text not null,
  max_score numeric not null default 100,
  weight numeric not null default 100,
  component_type text default 'exam',
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- Finance
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.fee_structures (
  id bigint primary key generated always as identity,
  name text not null,
  class_name text,
  amount numeric not null default 0,
  frequency text default 'term', -- term | year | one-time
  category text default 'Tuition',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_invoices (
  id bigint primary key generated always as identity,
  invoice_number text unique,
  student_id bigint references public.students(id) on delete cascade,
  fee_structure_id bigint references public.fee_structures(id) on delete set null,
  amount numeric not null default 0,
  status text default 'unpaid', -- unpaid | partial | paid | void
  due_date date,
  term text,
  academic_year text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id bigint primary key generated always as identity,
  payment_number text unique,
  student_id bigint references public.students(id) on delete cascade,
  amount numeric not null default 0,
  method text default 'cash', -- cash | mpesa | bank | cheque
  reference text,
  status text default 'completed',
  paid_at timestamptz,
  reversed boolean default false,
  reversal_reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_receipts (
  id bigint primary key generated always as identity,
  receipt_number text unique,
  payment_id bigint references public.payments(id) on delete cascade,
  student_id bigint references public.students(id) on delete cascade,
  amount numeric not null default 0,
  issued_at timestamptz not null default now()
);

create table if not exists public.payment_inbox (
  id bigint primary key generated always as identity,
  source text not null, -- mpesa | bank | cheque | cash
  transaction_id text unique,
  sender_name text,
  sender_phone text,
  amount numeric not null default 0,
  narration text,
  received_at timestamptz,
  status text default 'unmatched', -- unmatched | matched | posted | void
  student_id bigint references public.students(id) on delete set null,
  matched_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.chart_of_accounts (
  id bigint primary key generated always as identity,
  code text unique,
  name text not null,
  account_type text not null default 'income', -- income | expense | asset | liability
  created_at timestamptz not null default now()
);

create table if not exists public.finance_journals (
  id bigint primary key generated always as identity,
  journal_date date not null default current_date,
  description text,
  reference text,
  status text default 'posted',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_journal_entries (
  id bigint primary key generated always as identity,
  journal_id bigint not null references public.finance_journals(id) on delete cascade,
  account_id bigint references public.chart_of_accounts(id) on delete set null,
  debit numeric not null default 0,
  credit numeric not null default 0,
  description text
);

-- ════════════════════════════════════════════════════════════════════════
-- OCR
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.ocr_scans (
  id bigint primary key generated always as identity,
  filename text,
  content_type text,
  document_type text,
  raw_text text,
  structured jsonb,
  status text default 'pending',
  error text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- LLM
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.tt_llm_credentials (
  id bigint primary key generated always as identity,
  provider text not null,
  api_key_encrypted text,
  base_url text,
  is_connected boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider)
);

create table if not exists public.tt_llm_models (
  id bigint primary key generated always as identity,
  provider text not null,
  model_id text not null,
  display_name text,
  is_default boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tt_llm_settings (
  id bigint primary key generated always as identity,
  key text not null,
  value jsonb,
  created_at timestamptz not null default now(),
  unique (key)
);

-- ════════════════════════════════════════════════════════════════════════
-- NEW MODULES
-- ════════════════════════════════════════════════════════════════════════

-- Admissions & Registrar ──────────────────────────────────────────────────
create table if not exists public.admission_applications (
  id bigint primary key generated always as identity,
  application_number text unique,
  first_name text not null,
  middle_name text,
  last_name text not null,
  gender text,
  date_of_birth date,
  applying_for_level text,
  previous_school text,
  parent_name text,
  parent_phone text,
  parent_email text,
  status text default 'pending', -- pending | shortlisted | accepted | rejected | enrolled
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enrollment_records (
  id bigint primary key generated always as identity,
  student_id bigint references public.students(id) on delete cascade,
  application_id bigint references public.admission_applications(id) on delete set null,
  admission_date date not null default current_date,
  academic_year text,
  level text,
  stream text,
  admission_type text default 'new', -- new | transfer | re-admission
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Health & Welfare ────────────────────────────────────────────────────────
create table if not exists public.health_records (
  id bigint primary key generated always as identity,
  student_id bigint not null references public.students(id) on delete cascade,
  record_type text not null, -- medical | checkup | immunization | incident
  date date not null default current_date,
  title text not null,
  description text,
  blood_group text,
  allergies text,
  medication text,
  handler_name text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.welfare_cases (
  id bigint primary key generated always as identity,
  student_id bigint references public.students(id) on delete cascade,
  case_type text not null, -- counseling | support | disciplinary | other
  title text not null,
  description text,
  status text default 'open', -- open | in_progress | resolved | closed
  assigned_to text,
  resolution_notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Inventory & Storekeeper ─────────────────────────────────────────────────
create table if not exists public.inventory_items (
  id bigint primary key generated always as identity,
  name text not null,
  sku text unique,
  category text default 'General',
  quantity integer not null default 0,
  unit text,
  reorder_level integer default 0,
  location text,
  supplier text,
  unit_cost numeric default 0,
  status text default 'In Stock', -- In Stock | Low | Out of Stock
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id bigint primary key generated always as identity,
  item_id bigint not null references public.inventory_items(id) on delete cascade,
  movement_type text not null, -- issue | receipt | adjustment | return
  quantity integer not null default 0,
  reason text,
  recipient text,
  performed_by uuid,
  performed_at timestamptz not null default now()
);

-- Library ─────────────────────────────────────────────────────────────────
create table if not exists public.library_books (
  id bigint primary key generated always as identity,
  title text not null,
  author text,
  isbn text,
  category text default 'General',
  shelf_location text,
  total_copies integer default 1,
  available_copies integer default 1,
  status text default 'Available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_loans (
  id bigint primary key generated always as identity,
  book_id bigint not null references public.library_books(id) on delete cascade,
  borrower_type text not null, -- student | teacher | staff
  borrower_id bigint,
  borrower_name text not null,
  loan_date date not null default current_date,
  due_date date,
  returned_date date,
  status text default 'on_loan', -- on_loan | returned | overdue
  created_at timestamptz not null default now()
);

-- Board Management ────────────────────────────────────────────────────────
create table if not exists public.board_members (
  id bigint primary key generated always as identity,
  full_name text not null,
  position text not null,
  email text,
  phone text,
  term_start date,
  term_end date,
  status text default 'Active', -- Active | Expired | Resigned
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_meetings (
  id bigint primary key generated always as identity,
  title text not null,
  meeting_date date not null,
  start_time time,
  location text,
  agenda jsonb,
  minutes text,
  status text default 'scheduled', -- scheduled | held | cancelled
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_resolutions (
  id bigint primary key generated always as identity,
  meeting_id bigint references public.board_meetings(id) on delete set null,
  title text not null,
  description text,
  status text default 'pending', -- pending | adopted | implemented | archived
  adopted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Principal Broadcast Hub ─────────────────────────────────────────────────
create table if not exists public.announcements (
  id bigint primary key generated always as identity,
  title text not null,
  body text not null,
  audience text default 'all', -- all | teachers | students | parents | staff
  priority text default 'normal', -- normal | important | urgent
  status text default 'draft', -- draft | published | archived
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.principal_insights (
  id bigint primary key generated always as identity,
  insight_type text not null, -- attendance | finance | academics | welfare | custom
  title text not null,
  summary text,
  detail jsonb,
  severity text default 'info', -- info | warning | critical
  status text default 'new', -- new | acknowledged | resolved
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- Indexes & triggers
-- ════════════════════════════════════════════════════════════════════════

create index if not exists idx_guardians_student on public.guardians(student_id);
create index if not exists idx_terms_year on public.terms(year_id);
create index if not exists idx_streams_level on public.streams(level_id);
create index if not exists idx_attendance_session on public.attendance_records(session_id);
create index if not exists idx_attendance_student on public.attendance_records(student_id);
create index if not exists idx_invoices_student on public.student_invoices(student_id);
create index if not exists idx_payments_student on public.payments(student_id);
create index if not exists idx_payment_inbox_status on public.payment_inbox(status);
create index if not exists idx_lessons_version on public.tt_lessons(version_id);
create index if not exists idx_loans_book on public.library_loans(book_id);
create index if not exists idx_loans_status on public.library_loans(status);
create index if not exists idx_health_student on public.health_records(student_id);
create index if not exists idx_announcements_status on public.announcements(status);
create index if not exists idx_enrollment_student on public.enrollment_records(student_id);
create index if not exists idx_movements_item on public.inventory_movements(item_id);