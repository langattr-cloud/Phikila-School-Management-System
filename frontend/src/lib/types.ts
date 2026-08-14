// ── School ──
export interface School {
  id: number
  name: string
  code: string
  registration_number?: string
  education_system?: string
  school_type?: string
  category?: string
  county?: string
  sub_county?: string
  ward?: string
  postal_address?: string
  physical_address?: string
  phone?: string
  alternative_phone?: string
  email?: string
  website?: string
  motto?: string
  vision?: string
  mission?: string
  principal_name?: string
  established_year?: number
  logo?: string
  is_active: boolean
  created_at: string
  updated_at: string
  settings?: SchoolSettings
  branding?: SchoolBranding
  contact?: SchoolContact
}

export interface SchoolSettings {
  id: number
  school_id: number
  timezone: string
  currency: string
  date_format: string
  time_format: string
  language: string
  allow_multiple_sessions: boolean
  default_lesson_duration: number
  current_academic_year_id?: number
  created_at: string
  updated_at: string
}

export interface SchoolBranding {
  id: number
  school_id: number
  logo_path?: string
  stamp_path?: string
  report_header?: string
  report_footer?: string
  primary_color?: string
  secondary_color?: string
  created_at: string
  updated_at: string
}

export interface SchoolContact {
  id: number
  school_id: number
  principal?: string
  deputy_principal?: string
  bursar?: string
  telephone?: string
  mobile?: string
  email?: string
  emergency_contact?: string
  created_at: string
  updated_at: string
}

export type SchoolUpdate = Partial<Pick<School,
  'name' | 'code' | 'registration_number' | 'education_system' | 'school_type' |
  'category' | 'county' | 'sub_county' | 'ward' | 'postal_address' |
  'physical_address' | 'phone' | 'alternative_phone' | 'email' | 'website' |
  'motto' | 'vision' | 'mission' | 'principal_name' | 'established_year'
>>

export type SchoolContactUpdate = Partial<Pick<SchoolContact,
  'principal' | 'deputy_principal' | 'bursar' | 'telephone' | 'mobile' | 'email' | 'emergency_contact'
>>

// ── Departments ──
export interface Department {
  id: number
  school_id: number
  code: string
  name: string
  description?: string
  status: string
  created_at?: string
  updated_at?: string
}

export interface DepartmentCreate {
  school_id: number
  code: string
  name: string
  description?: string
  status?: string
}

// ── Subjects ──
export interface Subject {
  id: number
  name: string
  code: string
  description?: string
  is_active: boolean
}

export interface SubjectCreate {
  name: string
  code: string
  description?: string
  is_active?: boolean
}

export type SubjectUpdate = Partial<SubjectCreate>

// ── Teachers ──
export interface Teacher {
  id: number
  name: string
  tsc_number: string
  email?: string
  department_id?: number
  qualifications?: Qualification[]
  availabilities?: Availability[]
}

export interface TeacherCreate {
  name: string
  tsc_number: string
  email?: string
  department_id?: number
}

export interface Qualification {
  id: number
  teacher_id: number
  title: string
  institution?: string
  year_obtained?: number
}

export interface Availability {
  id: number
  teacher_id: number
  day_of_week: string
  start_time: string
  end_time: string
}

// ── Students ──
export interface Student {
  id: number
  admission_number: string
  first_name: string
  middle_name?: string
  last_name: string
  gender: string
  date_of_birth: string
  nationality?: string
  birth_cert_or_id?: string
  contact_info?: string
  photo_url?: string
  status: string
  created_at: string
  updated_at?: string
  guardians: Guardian[]
}

export interface StudentCreate {
  admission_number: string
  first_name: string
  middle_name?: string
  last_name: string
  gender: string
  date_of_birth: string
  nationality?: string
  birth_cert_or_id?: string
  contact_info?: string
  guardians?: GuardianCreate[]
}

export interface Guardian {
  id: number
  student_id: number
  parent_name: string
  relationship_to_student: string
  phone_number: string
  email?: string
  address?: string
  is_emergency_contact: boolean
}

export interface GuardianCreate {
  parent_name: string
  relationship_to_student: string
  phone_number: string
  email?: string
  address?: string
  is_emergency_contact?: boolean
}

// ── Class Registers ──
export interface ClassRegister {
  id: number
  academic_year_id: number
  grade_form_id: number
  stream_id: number
  class_teacher_id?: number
  room_id?: string
  capacity: number
  status: string
}

// ── Academics ──
export interface AcademicYear {
  id: number
  school_id: number
  name: string
  start_date: string
  end_date: string
  is_current: boolean
  status: string
  created_at: string
  updated_at?: string
}

export interface Term {
  id: number
  name: string
  start_date?: string
  end_date?: string
  is_current: boolean
  academic_year_id: number
  school_id: number
}

export interface Level {
  id: number
  school_id: number
  name: string
  code: string
  display_order: number
  status: boolean
  created_at: string
  updated_at?: string
}

// ── Examinations ──
export interface Examination {
  id: number
  name: string
  academic_year: string
  term: string
}

export interface AssessmentComponent {
  id: number
  exam_id: number
  name: string
  weight: number
}

// ── Timetable ──
export interface TimetableEntry {
  id: number
  class_register_id: number
  teacher_id: number
  subject_id: number
  day_of_week: string
  period_id: number
  room_id?: string
  academic_year_id: number
}
