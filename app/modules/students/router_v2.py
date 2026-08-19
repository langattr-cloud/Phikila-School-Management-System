"""Student management API — school-scoped, production-ready.

Endpoints:
  GET/POST   /students              List/create students
  GET/PATCH/DELETE /students/{id}   Read/update/delete a student
  GET/POST   /students/{id}/guardians
  GET        /students/{id}/enrollment
  GET        /students/{id}/documents
  POST       /students/{id}/documents
"""

from __future__ import annotations

import math
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role

from . import models_v2 as m
from . import schemas_v2 as s

router = APIRouter()


def _get_student_or_404(db: Session, school_id: int, student_id: int) -> m.Student:
    student = (
        db.query(m.Student)
        .filter(m.Student.id == student_id, m.Student.school_id == school_id)
        .first()
    )
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    return student


def _audit(
    db: Session, principal: Principal, action: str, entity: str,
    entity_id: int, summary: str,
    before: dict | None = None, after: dict | None = None,
) -> None:
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(
        school_id=principal.school_id,
        actor=principal.email or principal.user_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        summary=summary,
        before=before,
        after=after,
    ))


@router.get("/students", response_model=s.StudentListResponse)
def list_students(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, max_length=200),
    status_filter: str | None = Query(default=None, alias="status"),
    class_id: int | None = Query(default=None),
    academic_year_id: int | None = Query(default=None),
    level_id: int | None = Query(default=None),
    grade_id: int | None = Query(default=None),
    stream_id: int | None = Query(default=None),
    admission_number: str | None = Query(default=None),
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("viewer", "teacher", "admin")),
):
    """List students, with canonical academic filters resolved through enrollment."""
    query = db.query(m.Student).filter(m.Student.school_id == principal.school_id)

    if search:
        pattern = f"%{search.strip().lower()}%"
        query = query.filter(
            (func.lower(m.Student.first_name).like(pattern))
            | (func.lower(m.Student.last_name).like(pattern))
            | (func.lower(m.Student.admission_number).like(pattern))
            | (func.lower(m.Student.middle_name).like(pattern))
        )
    if status_filter:
        query = query.filter(m.Student.status == status_filter)
    if class_id:
        query = query.filter(m.Student.current_class_id == class_id)
    if academic_year_id or level_id or grade_id or stream_id:
        enrollment_filters = [m.StudentEnrollment.school_id == principal.school_id]
        if academic_year_id:
            enrollment_filters.append(m.StudentEnrollment.academic_year_id == academic_year_id)
        if level_id:
            enrollment_filters.append(m.StudentEnrollment.level_id == level_id)
        if grade_id:
            enrollment_filters.append(m.StudentEnrollment.grade_id == grade_id)
        if stream_id:
            enrollment_filters.append(m.StudentEnrollment.stream_id == stream_id)
        enrollment_filters.append(m.StudentEnrollment.status == "active")
        query = query.filter(m.Student.enrollments.any(*enrollment_filters))
    if admission_number:
        query = query.filter(func.lower(m.Student.admission_number) == admission_number.strip().lower())

    total = query.count()
    pages = math.ceil(total / page_size) if total else 1
    items = (
        query
        .options(joinedload(m.Student.guardians))
        .order_by(m.Student.last_name, m.Student.first_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    seen = set()
    unique = []
    for s_ in items:
        if s_.id not in seen:
            seen.add(s_.id)
            unique.append(s_)

    return s.StudentListResponse(items=unique, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/students", response_model=s.StudentResponse, status_code=201)
def create_student(
    payload: s.StudentCreate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    existing = (
        db.query(m.Student)
        .filter(
            m.Student.school_id == principal.school_id,
            func.lower(m.Student.admission_number) == payload.admission_number.strip().lower(),
        )
        .first()
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Admission number '{payload.admission_number}' already exists.")

    student = m.Student(school_id=principal.school_id, **payload.model_dump(exclude={"guardians"}))
    db.add(student)
    db.flush()

    for g in payload.guardians:
        db.add(m.StudentGuardian(school_id=principal.school_id, student_id=student.id, **g.model_dump()))

    _audit(db, principal, "create", "student", student.id,
           f"Admitted student {payload.first_name} {payload.last_name} ({payload.admission_number})")
    db.commit()
    db.refresh(student)
    return student


@router.get("/students/{student_id}", response_model=s.StudentResponse)
def get_student(student_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return _get_student_or_404(db, principal.school_id, student_id)


@router.patch("/students/{student_id}", response_model=s.StudentResponse)
def update_student(student_id: int, payload: s.StudentUpdate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    student = _get_student_or_404(db, principal.school_id, student_id)
    before = {c.name: getattr(student, c.name) for c in m.Student.__table__.columns if c.name != "updated_at"}
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(student, key, value)
    after = {c.name: getattr(student, c.name) for c in m.Student.__table__.columns if c.name != "updated_at"}
    _audit(db, principal, "update", "student", student.id, f"Updated student {student.first_name} {student.last_name}", before, after)
    db.commit()
    db.refresh(student)
    return student


@router.delete("/students/{student_id}", status_code=204)
def delete_student(student_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    student = _get_student_or_404(db, principal.school_id, student_id)
    _audit(db, principal, "delete", "student", student.id, f"Deleted student {student.first_name} {student.last_name} ({student.admission_number})")
    db.delete(student)
    db.commit()


@router.get("/students/{student_id}/guardians", response_model=list[s.GuardianResponse])
def list_guardians(student_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    _get_student_or_404(db, principal.school_id, student_id)
    return db.query(m.StudentGuardian).filter(m.StudentGuardian.student_id == student_id, m.StudentGuardian.school_id == principal.school_id).all()


@router.post("/students/{student_id}/guardians", response_model=s.GuardianResponse, status_code=201)
def add_guardian(student_id: int, payload: s.GuardianCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    _get_student_or_404(db, principal.school_id, student_id)
    guardian = m.StudentGuardian(school_id=principal.school_id, student_id=student_id, **payload.model_dump())
    db.add(guardian)
    _audit(db, principal, "create", "guardian", student_id, f"Added guardian {payload.full_name} for student #{student_id}")
    db.commit()
    db.refresh(guardian)
    return guardian


@router.get("/students/{student_id}/enrollment", response_model=list[s.EnrollmentResponse])
def list_enrollments(student_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    _get_student_or_404(db, principal.school_id, student_id)
    return db.query(m.StudentEnrollment).filter(m.StudentEnrollment.student_id == student_id, m.StudentEnrollment.school_id == principal.school_id).order_by(m.StudentEnrollment.created_at.desc()).all()


@router.get("/students/{student_id}/documents", response_model=list[s.DocumentResponse])
def list_documents(student_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    _get_student_or_404(db, principal.school_id, student_id)
    return db.query(m.StudentDocument).filter(m.StudentDocument.student_id == student_id, m.StudentDocument.school_id == principal.school_id).order_by(m.StudentDocument.created_at.desc()).all()


@router.post("/students/{student_id}/documents", response_model=s.DocumentResponse, status_code=201)
def add_document(student_id: int, payload: s.DocumentCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler", "teacher"))):
    _get_student_or_404(db, principal.school_id, student_id)
    doc = m.StudentDocument(school_id=principal.school_id, student_id=student_id, uploaded_by=principal.user_id, **payload.model_dump())
    db.add(doc)
    _audit(db, principal, "create", "document", student_id, f"Added document '{payload.title}' for student #{student_id}")
    db.commit()
    db.refresh(doc)
    return doc
