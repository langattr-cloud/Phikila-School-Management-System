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
        # Links a teacher/student account to their own timetable row, so the
        # mobile "My timetable" screen can default straight to them.
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
    return (
        db.query(m.TtVersion)
        .filter(m.TtVersion.school_id == principal.school_id)
        .order_by(m.TtVersion.number.desc())
        .all()
    )


@router.get("/versions/current", response_model=s.VersionOut | None)
def current_version(
    db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)
):
    """The published timetable if there is one, otherwise the latest draft."""
    published = (
        db.query(m.TtVersion)
        .filter(
            m.TtVersion.school_id == principal.school_id,
            m.TtVersion.status == "published",
        )
        .order_by(m.TtVersion.number.desc())
        .first()
    )
    if published:
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
    _owned(db, m.TtVersion, principal.school_id, version_id)
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

    # Locked lessons cannot be altered — except by an explicit unlock, so a
    # pinned lesson can never be moved or changed by accident.
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

    # Reference rows must exist and belong to the school.
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
    requirement = _owned(db, m.TtLessonRequirement, principal.school_id, payload.requirement_id)
    if requirement.class_id is None or requirement.subject_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This requirement is incomplete.")

    placed = (
        db.query(func.count(m.TtLesson.id))
        .filter(
            m.TtLesson.school_id == principal.school_id,
            m.TtLesson.version_id == version_id,
            m.TtLesson.requirement_id == requirement.id,
        )
        .scalar()
        or 0
    )
    if placed >= (requirement.periods_per_week or 0):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"All {requirement.periods_per_week} weekly periods of this requirement are already scheduled.",
        )

    lesson = m.TtLesson(
        school_id=principal.school_id,
        version_id=version_id,
        requirement_id=requirement.id,
        class_id=requirement.class_id,
        subject_id=requirement.subject_id,
        teacher_id=requirement.teacher_id,
        room_id=payload.room_id or requirement.room_id,
        day_index=payload.day_index,
        period_index=payload.period_index,
        duration=payload.duration,
    )
    reasons = _blockers(
        db,
        principal.school_id,
        lesson,
        payload.day_index,
        payload.period_index,
        duration=payload.duration,
    )
    if reasons:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "That slot breaks a hard constraint.",
                "reasons": reasons,
                "alternatives": [],
            },
        )

    db.add(lesson)
    calendar = load_calendar(db, principal.school_id)
    day_name = next((d.name for d in calendar.days if d.index == payload.day_index), payload.day_index)
    period_name = next((p.name for p in calendar.periods if p.index == payload.period_index), payload.period_index)
    _audit(
        db, principal, "create", "lesson", None,
        f"Scheduled a {requirement.subject.name if requirement.subject else 'lesson'} for "
        f"{requirement.tt_class.name if requirement.tt_class else 'a class'} at {day_name} {period_name}",
    )
    db.commit()
    db.refresh(lesson)
    return lesson


@router.post("/lessons/{lesson_id}/duplicate", response_model=s.LessonOut, status_code=201)
def duplicate_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    """Copy a lesson so it can be dragged somewhere else.

    The copy is a free lesson (no requirement link), so duplicating never
    changes a subject's weekly quota — the copy simply appears as an extra
    lesson, and if it lands on an occupied slot the conflict engine explains
    exactly what is wrong.
    """
    lesson = _owned(db, m.TtLesson, principal.school_id, lesson_id)
    version = _owned(db, m.TtVersion, principal.school_id, lesson.version_id)
    if version.status == "published":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Published timetables are immutable. Create a new draft to make changes.",
        )
    copy = m.TtLesson(
        school_id=principal.school_id,
        version_id=lesson.version_id,
        requirement_id=None,
        class_id=lesson.class_id,
        subject_id=lesson.subject_id,
        teacher_id=lesson.teacher_id,
        room_id=lesson.room_id,
        day_index=lesson.day_index,
        period_index=lesson.period_index,
        duration=lesson.duration,
        is_locked=False,
    )
    db.add(copy)
    _audit(db, principal, "duplicate", "lesson", lesson.id, "Duplicated a lesson")
    db.commit()
    db.refresh(copy)
    return copy


@router.delete("/lessons/{lesson_id}", status_code=204)
def delete_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    lesson = _owned(db, m.TtLesson, principal.school_id, lesson_id)
    version = _owned(db, m.TtVersion, principal.school_id, lesson.version_id)
    if version.status == "published":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Published timetables are immutable. Create a new draft to make changes.",
        )
    _audit(db, principal, "delete", "lesson", lesson.id, "Deleted a lesson")
    db.delete(lesson)
    db.commit()


@router.get("/versions/{version_id}/unassigned", response_model=list[s.UnassignedOut])
def unassigned_lessons(
    version_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(resolve_principal),
):
    """Requirement periods that still have to be scheduled, for the
    unassigned-lessons panel."""
    version = _owned(db, m.TtVersion, principal.school_id, version_id)
    lessons = (
        db.query(m.TtLesson)
        .filter(m.TtLesson.school_id == principal.school_id, m.TtLesson.version_id == version.id)
        .all()
    )
    placed: dict[int, int] = {}
    for lesson in lessons:
        if lesson.requirement_id:
            placed[lesson.requirement_id] = placed.get(lesson.requirement_id, 0) + 1

    names = _name_lookup(db, principal.school_id)
    rows = (
        db.query(m.TtLessonRequirement)
        .filter(m.TtLessonRequirement.school_id == principal.school_id)
        .order_by(m.TtLessonRequirement.class_id, m.TtLessonRequirement.subject_id)
        .all()
    )
    out: list[s.UnassignedOut] = []
    for req in rows:
        got = placed.get(req.id, 0)
        remaining = (req.periods_per_week or 0) - got
        if remaining <= 0:
            continue
        subject = db.query(m.TtSubject).filter(m.TtSubject.id == req.subject_id).first()
        out.append(
            s.UnassignedOut(
                requirement_id=req.id,
                subject_id=req.subject_id,
                subject_name=subject.name if subject else "Unknown",
                subject_colour=subject.colour if subject and subject.colour else "#0F2A47",
                class_id=req.class_id,
                class_name=names["class"].get(req.class_id, "Unknown"),
                teacher_id=req.teacher_id,
                teacher_name=names["teacher"].get(req.teacher_id),
                room_id=req.room_id,
                room_name=names["room"].get(req.room_id),
                periods_per_week=req.periods_per_week or 0,
                placed=got,
                remaining=remaining,
                requires_double=bool(req.double_periods),
            )
        )
    return out


@router.post("/versions/{version_id}/assign-rooms")
def assign_rooms(
    version_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    version = _owned(db, m.TtVersion, principal.school_id, version_id)
    if version.status == "published":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Published timetables are immutable. Create a new draft to make changes.",
        )
    assigned = assign_rooms_to_lessons(db, principal.school_id, version_id)
    _audit(db, principal, "assign-rooms", "version", version_id, f"Assigned rooms to {assigned} lessons")
    db.commit()
    return {"assigned": assigned}


@router.post("/lessons/{lesson_id}/explain")
def explain_lesson_move(
    lesson_id: int,
    payload: s.ExplainIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(resolve_principal),
):
    _owned(db, m.TtLesson, principal.school_id, lesson_id)
    return explain_move(db, principal.school_id, lesson_id, payload.day_index, payload.period_index)


@router.get("/lessons/{lesson_id}/suggestions")
def lesson_suggestions(
    lesson_id: int,
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    principal: Principal = Depends(resolve_principal),
):
    lesson = _owned(db, m.TtLesson, principal.school_id, lesson_id)
    return {"alternatives": suggest_slots(db, principal.school_id, lesson, limit=limit)}


@router.get("/versions/{version_id}/conflicts", response_model=list[s.ConflictOut])
def version_conflicts(
    version_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(resolve_principal),
):
    _owned(db, m.TtVersion, principal.school_id, version_id)
    return [c.as_dict() for c in detect_conflicts(db, principal.school_id, version_id)]


@router.post("/versions/{version_id}/publish", response_model=s.VersionOut)
def publish_version(
    version_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin")),
):
    """Publish only if the final validation passes with zero hard conflicts."""
    version = _owned(db, m.TtVersion, principal.school_id, version_id)
    conflicts = detect_conflicts(db, principal.school_id, version_id)
    hard = [c for c in conflicts if c.severity == "hard"]
    if hard:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": f"Resolve {len(hard)} hard conflict(s) before publishing.",
                "conflicts": [c.as_dict() for c in hard[:10]],
            },
        )

    db.query(m.TtVersion).filter(
        m.TtVersion.school_id == principal.school_id,
        m.TtVersion.status == "published",
    ).update({"status": "archived"})

    version.status = "published"
    version.published_at = datetime.utcnow()
    _audit(db, principal, "publish", "version", version.id, f"Published timetable v{version.number}")
    db.commit()
    db.refresh(version)
    return version


@router.post("/versions/{version_id}/restore", response_model=s.VersionOut)
def restore_version(
    version_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    """Copy an old version into a new editable draft. History is never rewritten."""
    source = _owned(db, m.TtVersion, principal.school_id, version_id)
    last = (
        db.query(m.TtVersion)
        .filter(m.TtVersion.school_id == principal.school_id)
        .order_by(m.TtVersion.number.desc())
        .first()
    )
    clone = m.TtVersion(
        school_id=principal.school_id,
        number=(last.number + 1) if last else 1,
        label=f"Restored from v{source.number}",
        status="draft",
        quality=source.quality,
        stats=source.stats,
        created_by=principal.email,
    )
    db.add(clone)
    db.flush()
    for lesson in db.query(m.TtLesson).filter(
        m.TtLesson.school_id == principal.school_id, m.TtLesson.version_id == source.id
    ):
        db.add(
            m.TtLesson(
                school_id=principal.school_id,
                version_id=clone.id,
                requirement_id=lesson.requirement_id,
                class_id=lesson.class_id,
                subject_id=lesson.subject_id,
                teacher_id=lesson.teacher_id,
                room_id=lesson.room_id,
                day_index=lesson.day_index,
                period_index=lesson.period_index,
                duration=lesson.duration,
                is_locked=lesson.is_locked,
            )
        )
    _audit(db, principal, "restore", "version", clone.id, f"Restored v{source.number} as v{clone.number}")
    db.commit()
    db.refresh(clone)
    return clone


@router.delete("/versions/{version_id}", status_code=204)
def delete_version(
    version_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin")),
):
    version = _owned(db, m.TtVersion, principal.school_id, version_id)
    if version.status == "published":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Archive the published version before deleting it."
        )
    db.delete(version)
    _audit(db, principal, "delete", "version", version_id, f"Deleted timetable v{version.number}")
    db.commit()


# --------------------------------------------------------------------------
# Dashboard and analytics
# --------------------------------------------------------------------------
@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)
):
    school_id = principal.school_id

    def count(model) -> int:
        return db.query(func.count(model.id)).filter(model.school_id == school_id).scalar() or 0

    version = current_version(db, principal)
    required = (
        db.query(func.coalesce(func.sum(m.TtLessonRequirement.periods_per_week), 0))
        .filter(m.TtLessonRequirement.school_id == school_id)
        .scalar()
        or 0
    )

    scheduled = 0
    hard = soft = 0
    if version:
        scheduled = (
            db.query(func.count(m.TtLesson.id))
            .filter(m.TtLesson.school_id == school_id, m.TtLesson.version_id == version.id)
            .scalar()
            or 0
        )
        conflicts = detect_conflicts(db, school_id, version.id)
        hard = sum(1 for c in conflicts if c.severity == "hard")
        soft = sum(1 for c in conflicts if c.severity == "soft")

    recent = (
        db.query(m.TtAuditEntry)
        .filter(m.TtAuditEntry.school_id == school_id)
        .order_by(m.TtAuditEntry.at.desc())
        .limit(6)
        .all()
    )

    return {
        "counts": {
            "teachers": count(m.TtTeacher),
            "subjects": count(m.TtSubject),
            "classes": count(m.TtClass),
            "rooms": count(m.TtRoom),
        },
        "lessons": {
            "required": int(required),
            "scheduled": int(scheduled),
            "unassigned": max(0, int(required) - int(scheduled)),
        },
        "conflicts": {"hard": hard, "soft": soft},
        "version": s.VersionOut.model_validate(version).model_dump() if version else None,
        "quality": (version.quality if version else {}) or {},
        "recent": [
            {
                "at": entry.at.isoformat() if entry.at else None,
                "actor": entry.actor,
                "action": entry.action,
                "summary": entry.summary,
            }
            for entry in recent
        ],
        "solver_available": ORTOOLS_AVAILABLE,
    }


@router.get("/analytics")
def analytics(
    db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)
):
    school_id = principal.school_id
    version = current_version(db, principal)
    calendar = load_calendar(db, school_id)
    slots = max(1, len(calendar.day_indexes) * len(calendar.teaching_indexes))

    lessons = (
        db.query(m.TtLesson)
        .filter(m.TtLesson.school_id == school_id, m.TtLesson.version_id == version.id)
        .all()
        if version
        else []
    )

    teachers = {t.id: t for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id)}
    rooms = {r.id: r for r in db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id)}
    classes = {c.id: c for c in db.query(m.TtClass).filter(m.TtClass.school_id == school_id)}

    teacher_rows = []
    for ident, teacher in teachers.items():
        taught = [l for l in lessons if l.teacher_id == ident]
        by_day: dict[int, list[int]] = {}
        for lesson in taught:
            by_day.setdefault(lesson.day_index, []).append(lesson.period_index)
        gaps = 0
        for periods in by_day.values():
            periods.sort()
            if len(periods) > 1:
                gaps += (periods[-1] - periods[0] + 1) - len(periods)
        teacher_rows.append({
            "id": ident,
            "name": teacher.name,
            "lessons": len(taught),
            "free_periods": slots - len(taught),
            "gaps": gaps,
            "target": teacher.workload_target,
            "utilisation": round(100 * len(taught) / slots, 1),
        })
    teacher_rows.sort(key=lambda row: row["lessons"], reverse=True)

    room_rows = []
    for ident, room in rooms.items():
        used = sum(1 for l in lessons if l.room_id == ident)
        room_rows.append({
            "id": ident,
            "name": room.name,
            "type": room.room_type,
            "used": used,
            "capacity_slots": slots,
            "utilisation": round(100 * used / slots, 1),
        })
    room_rows.sort(key=lambda row: row["utilisation"], reverse=True)

    class_rows = []
    for ident, klass in classes.items():
        taught = [l for l in lessons if l.class_id == ident]
        per_day: dict[int, int] = {}
        for lesson in taught:
            per_day[lesson.day_index] = per_day.get(lesson.day_index, 0) + 1
        class_rows.append({
            "id": ident,
            "name": klass.name,
            "lessons": len(taught),
            "free_periods": slots - len(taught),
            "busiest_day": max(per_day.values()) if per_day else 0,
            "quietest_day": min(per_day.values()) if per_day else 0,
        })
    class_rows.sort(key=lambda row: row["name"])

    return {
        "teachers": teacher_rows,
        "rooms": room_rows,
        "classes": class_rows,
        "quality": (version.quality if version else {}) or {},
    }


@router.get("/audit")
def audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    action: str | None = None,
    db: Session = Depends(get_db),
    principal: Principal = Depends(resolve_principal),
):
    query = db.query(m.TtAuditEntry).filter(m.TtAuditEntry.school_id == principal.school_id)
    if action:
        query = query.filter(m.TtAuditEntry.action == action)
    rows = query.order_by(m.TtAuditEntry.at.desc()).limit(limit).all()
    return [
        {
            "id": row.id,
            "at": row.at.isoformat() if row.at else None,
            "actor": row.actor,
            "action": row.action,
            "entity": row.entity,
            "entity_id": row.entity_id,
            "summary": row.summary,
            "before": row.before,
            "after": row.after,
        }
        for row in rows
    ]


# --------------------------------------------------------------------------
# Personal timetables (teacher / student PWA)
# --------------------------------------------------------------------------
@router.get("/timetable/view")
def timetable_view(
    scope: str = Query(pattern="^(class|teacher|room)$"),
    target_id: int = Query(ge=1),
    db: Session = Depends(get_db),
    principal: Principal = Depends(resolve_principal),
):
    """A denormalised timetable for one class, teacher or room.

    Returned in a single payload so the PWA can cache it for offline use.
    """
    version = current_version(db, principal)
    calendar = load_calendar(db, principal.school_id)
    if not version:
        return {"version": None, "days": [], "periods": [], "lessons": []}

    column = {"class": m.TtLesson.class_id, "teacher": m.TtLesson.teacher_id, "room": m.TtLesson.room_id}[scope]
    lessons = (
        db.query(m.TtLesson)
        .filter(
            m.TtLesson.school_id == principal.school_id,
            m.TtLesson.version_id == version.id,
            column == target_id,
        )
        .order_by(m.TtLesson.day_index, m.TtLesson.period_index)
        .all()
    )

    names = {
        "class": {c.id: c.name for c in db.query(m.TtClass).filter(m.TtClass.school_id == principal.school_id)},
        "teacher": {t.id: t.name for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id == principal.school_id)},
        "room": {r.id: r.name for r in db.query(m.TtRoom).filter(m.TtRoom.school_id == principal.school_id)},
        "subject": {s_.id: (s_.name, s_.colour) for s_ in db.query(m.TtSubject).filter(m.TtSubject.school_id == principal.school_id)},
    }

    return {
        "version": {"id": version.id, "number": version.number, "status": version.status},
        "scope": scope,
        "target_id": target_id,
        "target_name": names[scope].get(target_id),
        "days": [{"index": d.index, "name": d.name} for d in calendar.days if d.is_active],
        "periods": [
            {
                "index": p.index,
                "name": p.name,
                "start_time": p.start_time,
                "end_time": p.end_time,
                "is_teaching": p.is_teaching,
            }
            for p in calendar.periods
        ],
        "lessons": [
            {
                "id": l.id,
                "day": l.day_index,
                "period": l.period_index,
                "subject": names["subject"].get(l.subject_id, ("Unknown", "#0F2A47"))[0],
                "colour": names["subject"].get(l.subject_id, ("Unknown", "#0F2A47"))[1],
                "class": names["class"].get(l.class_id),
                "teacher": names["teacher"].get(l.teacher_id),
                "room": names["room"].get(l.room_id),
            }
            for l in lessons
        ],
    }


# --------------------------------------------------------------------------
# AI copilot
# --------------------------------------------------------------------------
def _vocabulary(db: Session, school_id: int) -> ai.SchoolVocabulary:
    calendar = load_calendar(db, school_id)
    return ai.SchoolVocabulary(
        classes={c.id: c.name for c in db.query(m.TtClass).filter(m.TtClass.school_id == school_id)},
        teachers={t.id: t.name for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id)},
        subjects={s.id: s.name for s in db.query(m.TtSubject).filter(m.TtSubject.school_id == school_id)},
        rooms={r.id: r.name for r in db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id)},
        periods=[
            {"index": p.index, "name": p.name, "start_time": p.start_time, "is_teaching": p.is_teaching}
            for p in calendar.periods
        ],
        days=[{"index": d.index, "name": d.name} for d in calendar.days],
    )


def _slot_label(calendar, day: int, period: int) -> str:
    day_name = next((d.name for d in calendar.days if d.index == day), f"Day {day}")
    row = next((p for p in calendar.periods if p.index == period), None)
    return f"{day_name} {row.name if row else f'P{period}'}" + (
        f" ({row.start_time})" if row and row.is_teaching else ""
    )


def _answer_find_free(db: Session, school_id: int, command: ai.Command) -> ai.Command:
    """Answer 'find a free period for X and Y' from the stored timetable."""
    version = db.query(m.TtVersion).filter(
        m.TtVersion.school_id == school_id, m.TtVersion.status != "archived"
    ).order_by(m.TtVersion.number.desc()).first()
    if not version:
        command.explanation = "There is no timetable version yet, so every teaching period is free."
        return command

    calendar = load_calendar(db, school_id)
    days = [d.index for d in calendar.days if d.is_active]
    if command.day is not None:
        days = [command.day]

    lessons = db.query(m.TtLesson).filter(
        m.TtLesson.school_id == school_id, m.TtLesson.version_id == version.id
    ).all()
    class_id = command.params.get("class_id")
    teacher_id = command.params.get("teacher_id")
    class_busy = {(l.day_index, l.period_index) for l in lessons if class_id and l.class_id == class_id}
    teacher_busy = {(l.day_index, l.period_index) for l in lessons if teacher_id and l.teacher_id == teacher_id}

    free = []
    for day in days:
        for period in calendar.teaching_indexes:
            slot = (day, period)
            if slot in class_busy or slot in teacher_busy:
                continue
            free.append(slot)
    if not free:
        command.explanation = (
            f"{command.target} have no shared free teaching period "
            f"{'on ' + command.day_name if command.day_name else 'this week'}."
        )
    else:
        shown = ", ".join(_slot_label(calendar, d, p) for d, p in free[:8])
        command.explanation = (
            f"{command.target} are both free in {len(free)} period(s): {shown}"
            + ("…" if len(free) > 8 else ".")
        )
    return command


def _answer_find_room(db: Session, school_id: int, command: ai.Command) -> ai.Command:
    """Answer 'rooms available at 11:20' from the stored timetable."""
    calendar = load_calendar(db, school_id)
    hour, minute = int(command.params.get("hour", 0)), int(command.params.get("minute", 0))
    target = hour * 60 + minute
    period = None
    for candidate in calendar.periods:
        if not candidate.is_teaching:
            continue
        try:
            start_hour, start_min = [int(x) for x in candidate.start_time.split(":")]
            end_hour, end_min = [int(x) for x in candidate.end_time.split(":")]
        except ValueError:
            continue
        if start_hour * 60 + start_min <= target < end_hour * 60 + end_min:
            period = candidate
            break
    if period is None:
        command.explanation = (
            f"{hour:02d}:{minute:02d} falls outside the teaching day, so every room is available."
        )
        return command

    version = db.query(m.TtVersion).filter(
        m.TtVersion.school_id == school_id, m.TtVersion.status != "archived"
    ).order_by(m.TtVersion.number.desc()).first()
    busy_rooms = set()
    if version:
        lessons = db.query(m.TtLesson).filter(
            m.TtLesson.school_id == school_id, m.TtLesson.version_id == version.id
        ).all()
        for lesson in lessons:
            if command.day is not None and lesson.day_index != command.day:
                continue
            if lesson.period_index <= period.index < lesson.period_index + (lesson.duration or 1):
                if lesson.room_id:
                    busy_rooms.add(lesson.room_id)
    rooms = db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id).order_by(m.TtRoom.name).all()
    free_rooms = [room.name for room in rooms if room.id not in busy_rooms]
    when = f"{command.day_name} " if command.day_name else ""
    if not free_rooms:
        command.explanation = f"No rooms are free at {period.start_time} {when}({period.name})."
    else:
        command.explanation = (
            f"Rooms free at {period.start_time} {when}({period.name}): {', '.join(free_rooms[:12])}"
            + ("…" if len(free_rooms) > 12 else ".")
        )
    return command


def _answer_find_gaps(db: Session, school_id: int, command: ai.Command) -> ai.Command:
    """Answer 'teachers with more than two consecutive free periods'."""
    version = db.query(m.TtVersion).filter(
        m.TtVersion.school_id == school_id, m.TtVersion.status != "archived"
    ).order_by(m.TtVersion.number.desc()).first()
    min_free = int(command.params.get("min_free", 3))
    if not version:
        command.explanation = "There is no timetable yet, so this question has nothing to measure."
        return command

    calendar = load_calendar(db, school_id)
    lessons = db.query(m.TtLesson).filter(
        m.TtLesson.school_id == school_id, m.TtLesson.version_id == version.id
    ).all()
    teachers = db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id).all()
    hits = []
    for teacher in teachers:
        longest = 0
        for day in calendar.day_indexes:
            busy = sorted(l.period_index for l in lessons if l.teacher_id == teacher.id and l.day_index == day)
            if len(busy) < 2:
                continue
            run = 0
            for current, previous in zip(busy[1:], busy):
                gap = current - previous - 1
                run = run + 1 if current == previous + 1 else 0
                longest = max(longest, gap)
        if longest >= min_free:
            hits.append((teacher.name, longest))
    if not hits:
        command.explanation = f"No teacher has {min_free} or more consecutive free periods."
    else:
        hits.sort(key=lambda pair: -pair[1])
        command.explanation = (
            "Teachers with long free runs: "
            + "; ".join(f"{name} ({count} in a row)" for name, count in hits[:8])
            + "."
        )
    return command


def _answer_explain(db: Session, school_id: int, command: ai.Command, text: str) -> ai.Command:
    """Answer a 'why can't I put X in room Y on day Z' question with real data."""
    lowered = text.lower()
    vocab = _vocabulary(db, school_id)
    subject_id, subject_name, _ = ai._match_name(lowered, vocab.subjects)
    room_id, room_name, _ = ai._match_name(lowered, vocab.rooms)
    day_index, day_name = ai._day_from_text(lowered, vocab)
    calendar = load_calendar(db, school_id)

    version = db.query(m.TtVersion).filter(
        m.TtVersion.school_id == school_id, m.TtVersion.status != "archived"
    ).order_by(m.TtVersion.number.desc()).first()
    if not version:
        command.explanation = "There is no timetable version yet, so nothing is blocking anything."
        return command

    lessons = db.query(m.TtLesson).filter(
        m.TtLesson.school_id == school_id, m.TtLesson.version_id == version.id
    ).all()

    parts: list[str] = []
    if room_id is not None and day_index is not None:
        occupants = sorted(
            (l for l in lessons if l.room_id == room_id and l.day_index == day_index),
            key=lambda l: l.period_index,
        )
        if occupants:
            labels = ", ".join(
                f"{_slot_label(calendar, l.day_index, l.period_index)} "
                f"{vocab.subjects.get(l.subject_id, 'a lesson')} "
                f"({vocab.classes.get(l.class_id, 'another class')})"
                for l in occupants
            )
            parts.append(f"{room_name} is occupied on {day_name} by: {labels}.")
        else:
            parts.append(f"{room_name} has no lessons on {day_name}.")
    elif room_id is not None:
        week = {}
        for l in lessons:
            if l.room_id == room_id:
                week.setdefault(l.day_index, []).append(_slot_label(calendar, l.day_index, l.period_index))
        if week:
            summary = "; ".join(
                f"{vocab.days[d]['name']}: {', '.join(slots[:6])}"
                for d, slots in sorted(week.items())
            )
            parts.append(f"{room_name} is used as follows — {summary}.")
        else:
            parts.append(f"{room_name} is free all week.")

    if subject_id is not None:
        placed = sorted(
            (l for l in lessons if l.subject_id == subject_id),
            key=lambda l: (l.day_index, l.period_index),
        )
        if placed:
            where = ", ".join(_slot_label(calendar, l.day_index, l.period_index) for l in placed[:12])
            parts.append(
                f"{subject_name} currently sits at {where}. Pick one of those slots and check "
                "the grid's 'Why?' explorer to see exactly what blocks a different slot."
            )
        else:
            parts.append(f"{subject_name} is not on the timetable at all yet.")

    command.explanation = (
        " ".join(parts)
        if parts
        else "I could not tell which subject or room you meant. Try: 'Why can't I put Physics in Lab 2 on Tuesday?'"
    )
    return command


@router.post("/copilot/interpret")
def copilot_interpret(
    payload: s.CopilotIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    """Turn a sentence into a structured command. Never applies it.

    Question-style commands (find_free / find_room / find_gaps) are answered
    here, directly from the stored timetable and constraint data — the AI
    assistant describes the database, it never invents timetable data.
    """
    parser = ai.get_parser()
    command = parser.parse(payload.text, _vocabulary(db, principal.school_id))

    if command.action == "find_free":
        command = _answer_find_free(db, principal.school_id, command)
    elif command.action == "find_room":
        command = _answer_find_room(db, principal.school_id, command)
    elif command.action == "find_gaps":
        command = _answer_find_gaps(db, principal.school_id, command)
    elif command.action == "explain":
        command = _answer_explain(db, principal.school_id, command, payload.text)

    return {"command": command.as_dict()}


@router.post("/copilot/apply")
def copilot_apply(
    payload: s.CopilotApplyIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    """Persist a confirmed command as a real constraint the solver will honour."""
    command = payload.command or {}
    action = command.get("action")

    if action == "avoid_lessons":
        target_id = command.get("target_id")
        day = command.get("day")
        periods = command.get("periods") or []
        scope = command.get("target_kind")
        if scope not in {"class", "teacher"} or not target_id or day is None or not periods:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That command is incomplete.")
        _owned(db, m.TtClass if scope == "class" else m.TtTeacher, principal.school_id, target_id)

        row = m.TtConstraint(
            school_id=principal.school_id,
            kind="avoid_lessons",
            scope=scope,
            target_id=target_id,
            is_hard=command.get("priority") == "hard",
            weight=int(command.get("weight") or 25),
            params={"slots": {str(day): [int(p) for p in periods]}},
            note=command.get("explanation"),
        )
        db.add(row)
        _audit(db, principal, "constraint", "constraint", None, command.get("explanation") or "Added a constraint")
        db.commit()
        db.refresh(row)
        return {"applied": True, "constraint_id": row.id, "requires_regeneration": True}

    if action in {"find_free", "find_room", "find_gaps", "explain"}:
        # These were questions: the answer was already computed at interpret
        # time from the stored timetable. Nothing needs to change.
        return {
            "applied": False,
            "message": "That was a question — the answer came from the current timetable, so nothing was changed.",
        }

    if action in {"set_weight", "rebalance", "improve"}:
        key = command.get("weight_key")
        if action == "rebalance":
            key = key or "workload_balance"
        if key:
            existing = (
                db.query(m.TtConstraint)
                .filter(
                    m.TtConstraint.school_id == principal.school_id,
                    m.TtConstraint.kind == "weight",
                    m.TtConstraint.params["key"].as_string() == key
                    if db.bind and db.bind.dialect.name == "postgresql"
                    else m.TtConstraint.note == key,
                )
                .first()
            )
            weight = int(command.get("weight") or 30)
            if existing:
                existing.weight = weight
            else:
                db.add(
                    m.TtConstraint(
                        school_id=principal.school_id,
                        kind="weight",
                        scope="school",
                        weight=weight,
                        params={"key": key},
                        note=key,
                    )
                )
            _audit(db, principal, "constraint", "constraint", None, f"Set {key} weight to {weight}")
            db.commit()
        return {"applied": True, "requires_regeneration": True}

    raise HTTPException(status.HTTP_400_BAD_REQUEST, "That command cannot be applied.")
