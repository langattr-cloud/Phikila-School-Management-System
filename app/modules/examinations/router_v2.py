"""Examination management API — school-scoped, with score entry and result generation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from app.modules.students.models_v2 import Student

from . import models_v2 as m
from . import schemas_v2 as s

router = APIRouter()


def _audit(db, principal, action, entity, eid, summary):
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(
        school_id=principal.school_id, actor=principal.email or principal.user_id,
        action=action, entity=entity, entity_id=eid, summary=summary,
    ))


# ---- Series ----

@router.get("/examinations/series", response_model=list[s.SeriesResponse])
def list_series(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return db.query(m.ExaminationSeries).filter(m.ExaminationSeries.school_id == principal.school_id).order_by(m.ExaminationSeries.created_at.desc()).all()


@router.post("/examinations/series", response_model=s.SeriesResponse, status_code=201)
def create_series(payload: s.SeriesCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    series = m.ExaminationSeries(school_id=principal.school_id, **payload.model_dump())
    db.add(series)
    _audit(db, principal, "create", "exam_series", 0, f"Created series '{payload.name}'")
    db.commit()
    db.refresh(series)
    return series


# ---- Examinations ----

@router.get("/examinations", response_model=list[s.ExaminationResponse])
def list_examinations(
    series_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("viewer", "teacher", "admin")),
):
    q = db.query(m.ExaminationV2).filter(m.ExaminationV2.school_id == principal.school_id)
    if series_id:
        q = q.filter(m.ExaminationV2.series_id == series_id)
    return q.order_by(m.ExaminationV2.created_at.desc()).all()


@router.post("/examinations", response_model=s.ExaminationResponse, status_code=201)
def create_examination(payload: s.ExaminationCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    exam = m.ExaminationV2(school_id=principal.school_id, **payload.model_dump())
    db.add(exam)
    _audit(db, principal, "create", "examination", 0, f"Created exam '{payload.name}'")
    db.commit()
    db.refresh(exam)
    return exam


@router.get("/examinations/{exam_id}", response_model=s.ExaminationResponse)
def get_examination(exam_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    exam = db.query(m.ExaminationV2).filter(m.ExaminationV2.id == exam_id, m.ExaminationV2.school_id == principal.school_id).first()
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Examination not found.")
    return exam


@router.delete("/examinations/{exam_id}", status_code=204)
def delete_examination(exam_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    exam = db.query(m.ExaminationV2).filter(m.ExaminationV2.id == exam_id, m.ExaminationV2.school_id == principal.school_id).first()
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Examination not found.")
    _audit(db, principal, "delete", "examination", exam_id, f"Deleted exam '{exam.name}'")
    db.delete(exam)
    db.commit()


# ---- Score Entry ----

@router.post("/examinations/{exam_id}/entries", response_model=dict, status_code=201)
def enter_scores(exam_id: int, payload: s.BulkScoreEntry, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler", "teacher"))):
    exam = db.query(m.ExaminationV2).filter(m.ExaminationV2.id == exam_id, m.ExaminationV2.school_id == principal.school_id).first()
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Examination not found.")

    # Load grade scale
    grade_scale = (
        db.query(m.GradeScale)
        .filter(m.GradeScale.school_id == principal.school_id)
        .order_by(m.GradeScale.min_score.desc())
        .all()
    )

    created = 0
    updated = 0
    for entry in payload.entries:
        grade = entry.grade
        if not grade and grade_scale:
            for gs in grade_scale:
                if gs.min_score <= entry.score <= gs.max_score:
                    grade = gs.grade
                    break

        existing = (
            db.query(m.ExamEntry)
            .filter(
                m.ExamEntry.exam_id == exam_id,
                m.ExamEntry.student_id == entry.student_id,
                m.ExamEntry.subject_id == entry.subject_id,
            )
            .first()
        )
        if existing:
            existing.score = entry.score
            existing.grade = grade
            existing.remarks = entry.remarks
            existing.entered_by = principal.user_id
            updated += 1
        else:
            db.add(m.ExamEntry(
                school_id=principal.school_id,
                exam_id=exam_id,
                student_id=entry.student_id,
                subject_id=entry.subject_id,
                score=entry.score,
                grade=grade,
                remarks=entry.remarks,
                entered_by=principal.user_id,
            ))
            created += 1

    _audit(db, principal, "score_entry", "examination", exam_id,
           f"Entered {created} new + {updated} updated scores for '{exam.name}'")
    db.commit()
    return {"created": created, "updated": updated}


@router.get("/examinations/{exam_id}/entries", response_model=list[s.ExamEntryResponse])
def list_entries(
    exam_id: int,
    subject_id: int | None = Query(default=None),
    student_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("viewer", "teacher", "admin")),
):
    q = db.query(m.ExamEntry).filter(m.ExamEntry.exam_id == exam_id, m.ExamEntry.school_id == principal.school_id)
    if subject_id:
        q = q.filter(m.ExamEntry.subject_id == subject_id)
    if student_id:
        q = q.filter(m.ExamEntry.student_id == student_id)
    return q.all()


# ---- Results Generation ----

@router.get("/examinations/{exam_id}/results", response_model=list[s.StudentResult])
def generate_results(
    exam_id: int,
    class_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("viewer", "teacher", "admin")),
):
    exam = db.query(m.ExaminationV2).filter(m.ExaminationV2.id == exam_id, m.ExaminationV2.school_id == principal.school_id).first()
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Examination not found.")

    entries = db.query(m.ExamEntry).filter(m.ExamEntry.exam_id == exam_id, m.ExamEntry.school_id == principal.school_id).all()
    if not entries:
        return []

    # Group by student
    student_entries: dict[int, list[m.ExamEntry]] = {}
    for e in entries:
        student_entries.setdefault(e.student_id, []).append(e)

    # Fetch student info
    student_ids = list(student_entries.keys())
    students = db.query(Student).filter(Student.id.in_(student_ids), Student.school_id == principal.school_id).all()
    student_map = {st.id: st for st in students}

    results: list[s.StudentResult] = []
    for sid, ents in student_entries.items():
        st = student_map.get(sid)
        if not st:
            continue
        total = sum(e.score or 0 for e in ents)
        avg = total / len(ents) if ents else 0
        subject_scores = [{"subject_id": e.subject_id, "score": e.score, "grade": e.grade} for e in ents]
        results.append(s.StudentResult(
            student_id=sid,
            student_name=f"{st.first_name} {st.last_name}",
            admission_number=st.admission_number,
            subject_scores=subject_scores,
            total_score=total,
            average=round(avg, 1),
        ))

    # Calculate positions by total score
    results.sort(key=lambda r: r.total_score, reverse=True)
    for i, r in enumerate(results):
        r.position = i + 1

    return results


# ---- Grade Scale ----

@router.get("/examinations/grade-scale", response_model=list[s.GradeScaleResponse])
def list_grade_scale(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return db.query(m.GradeScale).filter(m.GradeScale.school_id == principal.school_id).order_by(m.GradeScale.min_score.desc()).all()


@router.post("/examinations/grade-scale", response_model=s.GradeScaleResponse, status_code=201)
def create_grade_scale(payload: s.GradeScaleCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    gs = m.GradeScale(school_id=principal.school_id, **payload.model_dump())
    db.add(gs)
    db.commit()
    db.refresh(gs)
    return gs
