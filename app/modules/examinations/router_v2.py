"""Examination management API using canonical academic enrollment context."""
from __future__ import annotations
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete as sa_delete
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from app.modules.students.models_v2 import Student, StudentEnrollment
from app.modules.teachers.models import Teacher
from app.modules.academics.models import AcademicYear, Level, SchoolClass, Term
from . import models_v2 as m
from . import schemas_v2 as s
from .grading import compute_grade
from .results import build_results, resolve_student_education_level

router = APIRouter()

class ExamSubjectAssignment(BaseModel):
    subject_id: int
    academic_year_id: int
    level_id: int
    school_class_id: int
    teacher_id: int | None = Field(default=None)
    total_marks: int = Field(default=100, ge=1)
    exam_date: date | None = None

def _exam(db, school_id, exam_id):
    row = db.query(m.ExaminationV2).filter(m.ExaminationV2.id == exam_id, m.ExaminationV2.school_id == school_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Examination not found.")
    return row

def _series(db, school_id, series_id):
    row = db.query(m.ExaminationSeries).filter(m.ExaminationSeries.id == series_id, m.ExaminationSeries.school_id == school_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Examination series not found.")
    return row

def _school_class(db, school_id, school_class_id, academic_year_id, level_id):
    row = db.query(SchoolClass).filter(
        SchoolClass.id == school_class_id,
        SchoolClass.school_id == school_id,
        SchoolClass.academic_year_id == academic_year_id,
    ).first()
    if not row:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Grade does not belong to the selected academic year.")
    if row.level_id is not None and row.level_id != level_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Grade does not belong to the selected education level.")
    return row

def _class_labels(row: SchoolClass) -> tuple[str, str | None]:
    name = (row.name or "").strip()
    grade = (row.grade or "").strip()
    if not grade:
        grade = name
        if name.lower().startswith("grade "):
            grade = name.split(" ", 1)[1]
    stream = None
    # Current production stores stream identity in the class name/code rather than
    # a streams table. Only expose a stream when the class clearly has a suffix.
    import re
    match = re.match(r"^(.+?)[-_ ]([A-Za-z])$", name)
    if match and match.group(1).strip().lower() != grade.lower():
        stream = match.group(2).upper()
    return grade or name, stream

def _assignment(db, school, exam, subject, year, school_class_id):
    return db.query(m.ExamSubject).filter(
        m.ExamSubject.school_id == school,
        m.ExamSubject.exam_id == exam,
        m.ExamSubject.subject_id == subject,
        m.ExamSubject.academic_year_id == year,
        m.ExamSubject.school_class_id == school_class_id,
    ).first()

def _teacher(db, teacher_id):
    if teacher_id is not None and not db.query(Teacher.id).filter(Teacher.id == teacher_id).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assigned teacher does not exist.")

def _subject_response(db, row):
    school_class = db.query(SchoolClass).filter(SchoolClass.id == row.school_class_id, SchoolClass.school_id == row.school_id).first()
    if not school_class:
        raise HTTPException(status.HTTP_409_CONFLICT, "The grade assigned to this examination no longer exists.")
    grade, stream = _class_labels(school_class)
    return {
        "id": row.id,
        "exam_id": row.exam_id,
        "subject_id": row.subject_id,
        "academic_year_id": row.academic_year_id,
        "level_id": row.level_id,
        "school_class_id": row.school_class_id,
        "grade": grade,
        "stream": stream,
        "teacher_id": row.teacher_id,
        "total_marks": row.total_marks,
        "exam_date": row.exam_date,
    }

def _can_enter(db, p, exam_id, subject, student):
    if p.at_least("scheduler"):
        return True
    if p.role != "teacher" or p.teacher_id is None:
        return False
    enrollment = db.query(StudentEnrollment).filter(
        StudentEnrollment.student_id == student,
        StudentEnrollment.school_id == p.school_id,
        StudentEnrollment.status == "active",
    ).order_by(StudentEnrollment.enrollment_date.desc(), StudentEnrollment.id.desc()).first()
    if not enrollment or not enrollment.school_class_id:
        return False
    row = _assignment(db, p.school_id, exam_id, subject, enrollment.academic_year_id, enrollment.school_class_id)
    return bool(row and row.teacher_id == p.teacher_id)

def _assert_mutable(exam):
    if exam.status in ("published", "locked"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Published or locked examinations cannot be changed.")

def _validate_assignment(db, school_id, exam, payload):
    if payload.academic_year_id != exam.series.academic_year_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Subject assignment must use the examination series academic year.")
    if not db.query(AcademicYear.id).filter(AcademicYear.id == payload.academic_year_id, AcademicYear.school_id == school_id).first():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Academic year does not belong to this school.")
    if not db.query(Level.id).filter(Level.id == payload.level_id, Level.school_id == school_id).first():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Education level does not belong to this school.")
    return _school_class(db, school_id, payload.school_class_id, payload.academic_year_id, payload.level_id)

@router.get("/examinations/series", response_model=list[s.SeriesResponse])
def list_series(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return db.query(m.ExaminationSeries).filter(m.ExaminationSeries.school_id == principal.school_id).order_by(m.ExaminationSeries.created_at.desc()).all()

@router.post("/examinations/series", response_model=s.SeriesResponse, status_code=201)
def create_series(payload: s.SeriesCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    if payload.academic_year_id is not None and not db.query(AcademicYear.id).filter(AcademicYear.id == payload.academic_year_id, AcademicYear.school_id == principal.school_id).first():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Academic year does not belong to this school.")
    if payload.term_id is not None:
        term = db.query(Term).filter(Term.id == payload.term_id, Term.school_id == principal.school_id).first()
        if not term or (payload.academic_year_id is not None and term.academic_year_id != payload.academic_year_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Term does not belong to the selected academic year.")
    x = m.ExaminationSeries(school_id=principal.school_id, **payload.model_dump())
    db.add(x); db.commit(); db.refresh(x); return x

@router.patch("/examinations/series/{series_id}", response_model=s.SeriesResponse)
def update_series(series_id: int, payload: s.SeriesUpdate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    x = _series(db, principal.school_id, series_id)
    if x.status == "locked":
        raise HTTPException(status.HTTP_409_CONFLICT, "Locked examination series cannot be changed.")
    data = payload.model_dump(exclude_unset=True)
    year_id = data.get("academic_year_id", x.academic_year_id)
    term_id = data.get("term_id", x.term_id)
    if year_id is not None and not db.query(AcademicYear.id).filter(AcademicYear.id == year_id, AcademicYear.school_id == principal.school_id).first():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Academic year does not belong to this school.")
    if term_id is not None:
        term = db.query(Term).filter(Term.id == term_id, Term.school_id == principal.school_id).first()
        if not term or (year_id is not None and term.academic_year_id != year_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Term does not belong to the selected academic year.")
    for key, value in data.items(): setattr(x, key, value)
    db.commit(); db.refresh(x); return x

@router.get("/examinations", response_model=list[s.ExaminationResponse])
def list_examinations(series_id: int | None = Query(default=None), db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    q = db.query(m.ExaminationV2).filter(m.ExaminationV2.school_id == principal.school_id)
    if series_id is not None: q = q.filter(m.ExaminationV2.series_id == series_id)
    return q.order_by(m.ExaminationV2.created_at.desc()).all()

@router.post("/examinations", response_model=s.ExaminationResponse, status_code=201)
def create_examination(payload: s.ExaminationCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    _series(db, principal.school_id, payload.series_id)
    x = m.ExaminationV2(school_id=principal.school_id, **payload.model_dump()); db.add(x); db.commit(); db.refresh(x); return x

@router.get("/examinations/{exam_id}", response_model=s.ExaminationResponse)
def get_examination(exam_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))): return _exam(db, principal.school_id, exam_id)

@router.patch("/examinations/{exam_id}", response_model=s.ExaminationResponse)
def update_examination(exam_id: int, payload: s.ExaminationUpdate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    x = _exam(db, principal.school_id, exam_id); _assert_mutable(x)
    data = payload.model_dump(exclude_unset=True); total = data.get("total_marks", x.total_marks); passing = data.get("passing_marks", x.passing_marks)
    if passing > total: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Passing marks cannot be greater than total marks.")
    for key, value in data.items(): setattr(x, key, value)
    db.commit(); db.refresh(x); return x

@router.delete("/examinations/{exam_id}", status_code=204)
def delete_examination(exam_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    x = _exam(db, principal.school_id, exam_id); _assert_mutable(x)
    try:
        db.execute(sa_delete(m.ExamEntry).where(m.ExamEntry.exam_id == exam_id, m.ExamEntry.school_id == principal.school_id))
        db.execute(sa_delete(m.ExamSubject).where(m.ExamSubject.exam_id == exam_id, m.ExamSubject.school_id == principal.school_id))
        db.execute(sa_delete(m.ExaminationV2).where(m.ExaminationV2.id == exam_id, m.ExaminationV2.school_id == principal.school_id))
        db.commit()
    except Exception:
        db.rollback(); raise

@router.post("/examinations/{exam_id}/status", response_model=s.ExaminationResponse)
def change_examination_status(exam_id: int, payload: s.StatusChange, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    x = _exam(db, principal.school_id, exam_id)
    allowed = {"draft": {"active"}, "active": {"draft", "published"}, "published": {"locked"}, "locked": set()}
    if payload.status != x.status and payload.status not in allowed.get(x.status, set()):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot change examination status from {x.status} to {payload.status}.")
    x.status = payload.status; db.commit(); db.refresh(x); return x

@router.get("/examinations/{exam_id}/subjects", response_model=list[s.ExamSubjectResponse])
def list_exam_subjects(exam_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    _exam(db, principal.school_id, exam_id)
    return [_subject_response(db, row) for row in db.query(m.ExamSubject).filter(m.ExamSubject.school_id == principal.school_id, m.ExamSubject.exam_id == exam_id).all()]

@router.post("/examinations/{exam_id}/subjects", response_model=s.ExamSubjectResponse, status_code=201)
def assign_exam_subject(exam_id: int, payload: ExamSubjectAssignment, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    exam = _exam(db, principal.school_id, exam_id); _assert_mutable(exam); _validate_assignment(db, principal.school_id, exam, payload); _teacher(db, payload.teacher_id)
    if _assignment(db, principal.school_id, exam_id, payload.subject_id, payload.academic_year_id, payload.school_class_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "That subject is already assigned to this examination grade/stream.")
    x = m.ExamSubject(school_id=principal.school_id, exam_id=exam_id, **payload.model_dump())
    db.add(x); db.commit(); db.refresh(x); return _subject_response(db, x)

@router.patch("/examinations/{exam_id}/subjects/{assignment_id}", response_model=s.ExamSubjectResponse)
def update_exam_subject_assignment(exam_id: int, assignment_id: int, payload: ExamSubjectAssignment, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    exam = _exam(db, principal.school_id, exam_id); _assert_mutable(exam)
    x = db.query(m.ExamSubject).filter(m.ExamSubject.id == assignment_id, m.ExamSubject.exam_id == exam_id, m.ExamSubject.school_id == principal.school_id).first()
    if not x: raise HTTPException(status.HTTP_404_NOT_FOUND, "Examination subject assignment not found.")
    _validate_assignment(db, principal.school_id, exam, payload); _teacher(db, payload.teacher_id)
    d = _assignment(db, principal.school_id, exam_id, payload.subject_id, payload.academic_year_id, payload.school_class_id)
    if d and d.id != assignment_id: raise HTTPException(status.HTTP_409_CONFLICT, "That subject is already assigned to this examination grade/stream.")
    for k, v in payload.model_dump().items(): setattr(x, k, v)
    db.commit(); db.refresh(x); return _subject_response(db, x)

@router.post("/examinations/{exam_id}/entries", response_model=dict, status_code=201)
def enter_scores(exam_id: int, payload: s.BulkScoreEntry, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler", "teacher"))):
    exam = _exam(db, principal.school_id, exam_id); _assert_mutable(exam)
    assignments = {r.subject_id: r for r in db.query(m.ExamSubject).filter(m.ExamSubject.exam_id == exam_id, m.ExamSubject.school_id == principal.school_id).all()}
    if not assignments: raise HTTPException(status.HTTP_409_CONFLICT, "Configure at least one subject before entering marks.")
    if principal.role == "teacher" and any(not _can_enter(db, principal, exam_id, e.subject_id, e.student_id) for e in payload.entries):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only load marks for your assigned grade/stream and subject.")
    created = updated = 0
    for e in payload.entries:
        assignment = assignments.get(e.subject_id)
        if not assignment: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Subject {e.subject_id} is not assigned to this examination.")
        if e.score > assignment.total_marks: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Score for subject {e.subject_id} cannot exceed {assignment.total_marks}.")
        student = db.query(Student).filter(Student.id == e.student_id, Student.school_id == principal.school_id).first()
        if not student: raise HTTPException(status.HTTP_404_NOT_FOUND, f"Student {e.student_id} not found.")
        enrollment = db.query(StudentEnrollment).filter(
            StudentEnrollment.student_id == student.id,
            StudentEnrollment.school_id == principal.school_id,
            StudentEnrollment.status == "active",
            StudentEnrollment.academic_year_id == assignment.academic_year_id,
            StudentEnrollment.level_id == assignment.level_id,
            StudentEnrollment.school_class_id == assignment.school_class_id,
        ).first()
        if not enrollment:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Student {student.admission_number} is not actively enrolled in the assigned grade/stream.")
        grade = e.grade
        if not grade:
            _, level = resolve_student_education_level(db, student, getattr(exam.series, "academic_year_id", None)); grade = compute_grade(db, principal.school_id, level, e.score, assignment.total_marks)
        row = db.query(m.ExamEntry).filter(m.ExamEntry.exam_id == exam_id, m.ExamEntry.student_id == e.student_id, m.ExamEntry.subject_id == e.subject_id).first()
        if row:
            row.score, row.grade, row.position, row.remarks, row.entered_by = e.score, grade, e.position, e.remarks, principal.email or principal.user_id; updated += 1
        else:
            db.add(m.ExamEntry(school_id=principal.school_id, exam_id=exam_id, student_id=e.student_id, subject_id=e.subject_id, score=e.score, grade=grade, position=e.position, remarks=e.remarks, entered_by=principal.email or principal.user_id)); created += 1
    db.commit(); return {"created": created, "updated": updated}

@router.get("/examinations/{exam_id}/entries", response_model=list[s.ExamEntryResponse])
def list_entries(exam_id: int, subject_id: int | None = Query(default=None), student_id: int | None = Query(default=None), db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    _exam(db, principal.school_id, exam_id); q = db.query(m.ExamEntry).filter(m.ExamEntry.exam_id == exam_id, m.ExamEntry.school_id == principal.school_id)
    if subject_id is not None: q = q.filter(m.ExamEntry.subject_id == subject_id)
    if student_id is not None: q = q.filter(m.ExamEntry.student_id == student_id)
    return q.all()
