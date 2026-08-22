"""Scheduling API.

Every route is scoped to the caller's school. ``school_id`` is resolved
server-side from the verified Supabase token (never trusted from the client),
which is the application-level counterpart to the PostgreSQL RLS policies in
docs/rls.sql.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.email.service import email_service

from . import copilot as ai
from . import jobs as job_queue
from . import models as m
from . import schemas as s
from .engine import (
    DEFAULT_DAYS,
    _blockers,
    _name_lookup,
    assign_rooms_to_lessons,
    detect_conflicts,
    explain_move,
    load_calendar,
    suggest_slots,
)
from .solver import ORTOOLS_AVAILABLE
from .tenancy import Principal, require_role, resolve_principal

router = APIRouter()


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _owned(db: Session, model, school_id: int, ident: int):
    row = db.query(model).filter(model.id == ident, model.school_id == school_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return row


def _audit(
    db: Session,
    principal: Principal,
    action: str,
    entity: str,
    entity_id: int | None,
    summary: str,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    db.add(
        m.TtAuditEntry(
            school_id=principal.school_id,
            actor=principal.email or principal.user_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            summary=summary,
            before=before,
            after=after,
        )
    )


def _crud(path: str, model, schema_in, schema_out, entity: str) -> None:
    """Register list/create/update/delete for a simple resource.

    FastAPI reads request models from type annotations, and a closure variable
    is not an annotation, so each handler's ``__annotations__`` is patched
    explicitly. This keeps one audited implementation instead of five copies.
    """

    def _list(
        db: Session = Depends(get_db),
        principal: Principal = Depends(resolve_principal),
    ):
        return (
            db.query(model)
            .filter(model.school_id == principal.school_id)
            .order_by(model.id)
            .all()
        )

    def _create(
        payload,
        db: Session = Depends(get_db),
        principal: Principal = Depends(require_role("admin", "scheduler")),
    ):
        row = model(school_id=principal.school_id, **payload.model_dump())
        db.add(row)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"A {entity} with that code already exists.",
            )
        db.refresh(row)
        _audit(db, principal, "create", entity, row.id, f"Created {entity} {getattr(row, 'name', row.id)}")
        db.commit()
        return row

    def _update(
        ident: int,
        payload,
        db: Session = Depends(get_db),
        principal: Principal = Depends(require_role("admin", "scheduler")),
    ):
        row = _owned(db, model, principal.school_id, ident)
        for key, value in payload.model_dump().items():
            setattr(row, key, value)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"A {entity} with that code already exists.",
            )
        db.refresh(row)
        _audit(db, principal, "update", entity, row.id, f"Updated {entity} {getattr(row, 'name', row.id)}")
        db.commit()
        return row

    def _delete(
        ident: int,
        db: Session = Depends(get_db),
        principal: Principal = Depends(require_role("admin", "scheduler")),
    ):
        row = _owned(db, model, principal.school_id, ident)
        name = getattr(row, "name", row.id)
        db.delete(row)
        _audit(db, principal, "delete", entity, ident, f"Deleted {entity} {name}")
        db.commit()

    _create.__annotations__["payload"] = schema_in
    _update.__annotations__["payload"] = schema_in
    for fn, suffix in ((_list, "list"), (_create, "create"), (_update, "update"), (_delete, "delete")):
        fn.__name__ = f"{suffix}_{entity}"

    router.get(f"/{path}", response_model=list[schema_out], name=f"list_{entity}")(_list)
    router.post(f"/{path}", response_model=schema_out, status_code=201, name=f"create_{entity}")(_create)
    router.put(f"/{path}/{{ident}}", response_model=schema_out, name=f"update_{entity}")(_update)
    router.delete(f"/{path}/{{ident}}", status_code=204, name=f"delete_{entity}")(_delete)


_crud("teachers", m.TtTeacher, s.TeacherIn, s.TeacherOut, "teacher")
_crud("subjects", m.TtSubject, s.SubjectIn, s.SubjectOut, "subject")
_crud("rooms", m.TtRoom, s.RoomIn, s.RoomOut, "room")
_crud("classes", m.TtClass, s.ClassIn, s.ClassOut, "class")
_crud("constraints", m.TtConstraint, s.ConstraintIn, s.ConstraintOut, "constraint")


# --------------------------------------------------------------------------
# Identity / bootstrap
# --------------------------------------------------------------------------
@router.get("/me")
def whoami(principal: Principal = Depends(resolve_principal)):
    """The signed-in user's tenancy context, used to bootstrap the PWA."""
    return {
        "user_id": principal.user_id,
        "email": principal.email,
        "school_id": principal.school_id,
        "role": principal.role,
        "teacher_id": principal.teacher_id,
        "class_id": principal.class_id,
        "solver_available": ORTOOLS_AVAILABLE,
    }


# --------------------------------------------------------------------------
# Calendar
# --------------------------------------------------------------------------
@router.get("/calendar")
def get_calendar(
    db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)
):
    calendar = load_calendar(db, principal.school_id)
    return {
        "days": [s.DayOut.model_validate(d).model_dump() for d in calendar.days],
        "periods": [s.PeriodOut.model_validate(p).model_dump() for p in calendar.periods],
    }


@router.put("/calendar")
def set_calendar(
    payload: s.CalendarIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    """Replace the working week. Rejected once lessons exist to avoid orphans."""
    existing = (
        db.query(m.TtLesson).filter(m.TtLesson.school_id == principal.school_id).count()
    )
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Delete existing timetable versions before changing the working week.",
        )

    db.query(m.TtDay).filter(m.TtDay.school_id == principal.school_id).delete()
    db.query(m.TtPeriod).filter(m.TtPeriod.school_id == principal.school_id).delete()
    for day in payload.days:
        db.add(m.TtDay(school_id=principal.school_id, **day.model_dump()))
    for period in payload.periods:
        db.add(m.TtPeriod(school_id=principal.school_id, **period.model_dump()))
    _audit(db, principal, "update", "calendar", None, "Updated working days and periods")
    db.commit()
    return get_calendar(db, principal)


# --------------------------------------------------------------------------
# Lesson requirements
# --------------------------------------------------------------------------
@router.get("/requirements", response_model=list[s.RequirementOut])
def list_requirements(
    db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)
):
    rows = (
        db.query(m.TtLessonRequirement)
        .filter(m.TtLessonRequirement.school_id == principal.school_id)
        .order_by(m.TtLessonRequirement.id)
        .all()
    )
    out = []
    for row in rows:
        item = s.RequirementOut.model_validate(row)
        item.class_name = row.tt_class.name if row.tt_class else None
        item.subject_name = row.subject.name if row.subject else None
        item.teacher_name = row.teacher.name if row.teacher else None
        item.room_name = row.room.name if row.room else None
        out.append(item)
    return out


@router.post("/requirements", response_model=s.RequirementOut, status_code=201)
def create_requirement(
    payload: s.RequirementIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    for model, ident, label in (
        (m.TtClass, payload.class_id, "class"),
        (m.TtSubject, payload.subject_id, "subject"),
    ):
        _owned(db, model, principal.school_id, ident)
    if payload.teacher_id:
        _owned(db, m.TtTeacher, principal.school_id, payload.teacher_id)
    if payload.room_id:
        _owned(db, m.TtRoom, principal.school_id, payload.room_id)

    row = m.TtLessonRequirement(school_id=principal.school_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    _audit(db, principal, "create", "requirement", row.id, "Added a lesson requirement")
    db.commit()
    return s.RequirementOut.model_validate(row)


@router.delete("/requirements/{ident}", status_code=204)
def delete_requirement(
    ident: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    row = _owned(db, m.TtLessonRequirement, principal.school_id, ident)
    db.delete(row)
    _audit(db, principal, "delete", "requirement", ident, "Removed a lesson requirement")
    db.commit()


# --------------------------------------------------------------------------
# Solver jobs
# --------------------------------------------------------------------------
@router.post("/solver/generate", response_model=s.JobOut, status_code=202)
def generate(
    payload: s.GenerateIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    if not ORTOOLS_AVAILABLE:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The scheduling engine is not available on this server.",
        )
    running = (
        db.query(m.TtSolverJob)
        .filter(
            m.TtSolverJob.school_id == principal.school_id,
            m.TtSolverJob.status.in_(["queued", "running", "optimizing", "validating"]),
        )
        .first()
    )
    if running:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A timetable is already being generated."
        )

    job = job_queue.create_job(db, principal.school_id, principal.email)
    job_queue.enqueue(job.id, principal.school_id, payload.max_seconds)
    return job


@router.get("/solver/jobs/{job_id}", response_model=s.JobOut)
def job_status(
    job_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(resolve_principal),
):
    return _owned(db, m.TtSolverJob, principal.school_id, job_id)


@router.post("/solver/jobs/{job_id}/cancel", response_model=s.JobOut)
def cancel_job(
    job_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    job = _owned(db, m.TtSolverJob, principal.school_id, job_id)
    if job.status in {"completed", "failed", "cancelled"}:
        return job
    job.cancel_requested = True
    db.commit()
    db.refresh(job)
    return job


# --------------------------------------------------------------------------
# Versions and lessons
# --------------------------------------------------------------------------
@router.get("/versions", response_model=list[s.VersionOut])
def list_versions(
    db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)
):
    """Return published versions to normal users and all versions to reviewers."""
    query = db.query(m.TtVersion).filter(m.TtVersion.school_id == principal.school_id)
    if not principal.at_least("scheduler"):
        query = query.filter(m.TtVersion.status == "published")
    return query.order_by(m.TtVersion.number.desc()).all()


@router.get("/versions/current", response_model=s.VersionOut | None)
def current_version(
    db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)
):
    """The published timetable if there is one, otherwise the latest draft for reviewers."""
    published = (
        db.query(m.TtVersion)
        .filter(
            m.TtVersion.school_id == principal.school_id,
            m.TtVersion.status == "published",
        )
        .order_by(m.TtVersion.number.desc())
        .first()
    )
    if published or not principal.at_least("scheduler"):
        return published
    return (
        db.query(m.TtVersion)
        .filter(m.TtVersion.school_id == principal.school_id)
        .order_by(m.TtVersion.number.desc())
        .first()
    )


@router.get("/versions/{version_id}/lessons", response_model=list[s.LessonOut])
def version_lessons(
    version_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(resolve_principal),
):
    version = _owned(db, m.TtVersion, principal.school_id, version_id)
    if version.status == "draft" and not principal.at_least("scheduler"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Draft timetables are only available to schedulers and administrators.")
    return (
        db.query(m.TtLesson)
        .filter(
            m.TtLesson.school_id == principal.school_id,
            m.TtLesson.version_id == version_id,
        )
        .order_by(m.TtLesson.day_index, m.TtLesson.period_index)
        .all()
    )


@router.patch("/lessons/{lesson_id}", response_model=s.LessonOut)
def update_lesson(
    lesson_id: int,
    payload: s.LessonPatch,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    """Edit a lesson: move it, resize it, or change its teacher, class,
    subject or room. Hard conflicts are rejected with the reasons why."""
    lesson = _owned(db, m.TtLesson, principal.school_id, lesson_id)
    version = _owned(db, m.TtVersion, principal.school_id, lesson.version_id)
    if version.status == "published":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Published timetables are immutable. Create a new draft to make changes.",
        )

    changed = payload.model_fields_set
    structural_keys = {"day_index", "period_index", "duration", "teacher_id", "class_id", "subject_id", "room_id"}
    if lesson.is_locked and changed & structural_keys:
        unlocking = changed == {"is_locked"} and payload.is_locked is False
        if not unlocking:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                {
                    "message": "This lesson is locked. Unlock it before moving or changing it.",
                    "reasons": [{"factor": "Locked lesson", "detail": "Locked lessons keep their slot when the timetable is regenerated."}],
                    "alternatives": [],
                },
            )

    if "teacher_id" in changed and payload.teacher_id is not None:
        _owned(db, m.TtTeacher, principal.school_id, payload.teacher_id)
    if "class_id" in changed and payload.class_id is not None:
        _owned(db, m.TtClass, principal.school_id, payload.class_id)
    if "subject_id" in changed and payload.subject_id is not None:
        _owned(db, m.TtSubject, principal.school_id, payload.subject_id)
    if "room_id" in changed and payload.room_id is not None:
        _owned(db, m.TtRoom, principal.school_id, payload.room_id)

    new_day = payload.day_index if "day_index" in changed else lesson.day_index
    new_period = payload.period_index if "period_index" in changed else lesson.period_index
    new_duration = payload.duration if "duration" in changed else (lesson.duration or 1)
    new_teacher = payload.teacher_id if "teacher_id" in changed else lesson.teacher_id
    new_class = payload.class_id if "class_id" in changed else lesson.class_id
    new_room = payload.room_id if "room_id" in changed else lesson.room_id
    new_subject = payload.subject_id if "subject_id" in changed else lesson.subject_id

    reasons = _blockers(
        db,
        principal.school_id,
        lesson,
        new_day,
        new_period,
        teacher_id=new_teacher,
        class_id=new_class,
        room_id=new_room,
        subject_id=new_subject,
        duration=new_duration,
    )
    if reasons:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "That change breaks a hard constraint.",
                "reasons": reasons,
                "alternatives": suggest_slots(db, principal.school_id, lesson, limit=3),
            },
        )

    before = {
        "day_index": lesson.day_index,
        "period_index": lesson.period_index,
        "duration": lesson.duration,
        "teacher_id": lesson.teacher_id,
        "class_id": lesson.class_id,
        "subject_id": lesson.subject_id,
        "room_id": lesson.room_id,
        "is_locked": lesson.is_locked,
    }
    for key, value in payload.model_dump().items():
        if key in changed:
            setattr(lesson, key, value)
    after = {
        "day_index": lesson.day_index,
        "period_index": lesson.period_index,
        "duration": lesson.duration,
        "teacher_id": lesson.teacher_id,
        "class_id": lesson.class_id,
        "subject_id": lesson.subject_id,
        "room_id": lesson.room_id,
        "is_locked": lesson.is_locked,
    }

    calendar = load_calendar(db, principal.school_id)
    day_name = next((d.name for d in calendar.days if d.index == lesson.day_index), lesson.day_index)
    period_name = next((p.name for p in calendar.periods if p.index == lesson.period_index), lesson.period_index)
    _audit(
        db, principal, "update", "lesson", lesson.id,
        f"Edited a lesson ({day_name} {period_name})", before, after,
    )
    db.commit()
    db.refresh(lesson)
    return lesson


@router.post("/versions/{version_id}/lessons", response_model=s.LessonOut, status_code=201)
def create_lesson(
    version_id: int,
    payload: s.LessonCreate,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    """Place one unscheduled requirement period onto the grid."""
    version = _owned(db, m.TtVersion, principal.school_id, version_id)
    if version.status == "published":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Published timetables are immutable. Create a new draft to make changes.",
        )
    row = m.TtLesson(school_id=principal.school_id, version_id=version_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    _audit(db, principal, "create", "lesson", row.id, "Added a lesson to a draft timetable")
    db.commit()
    return row
