"""Reusable helpers for matching finance input to a student."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.modules.students.models_v2 import Student


def normalize_admission_number(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if value.startswith("#"):
        value = value[1:].strip()
    return value or None


def find_student_by_admission_number(
    db: Session,
    *,
    school_id: int,
    admission_number: str | None,
) -> Student | None:
    normalized = normalize_admission_number(admission_number)
    if not normalized:
        return None
    return (
        db.query(Student)
        .filter(
            Student.school_id == school_id,
            Student.admission_number == normalized,
        )
        .first()
    )
