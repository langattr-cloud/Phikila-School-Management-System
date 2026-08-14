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
def move_lesson(
    lesson_id: int,
    payload: s.LessonMoveIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    """Move a lesson. Hard conflicts are rejected with the reasons why."""
    lesson = _owned(db, m.TtLesson, principal.school_id, lesson_id)
    version = _owned(db, m.TtVersion, principal.school_id, lesson.version_id)
    if version.status == "published":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Published timetables are immutable. Create a new draft to make changes.",
        )

    verdict = explain_move(db, principal.school_id, lesson_id, payload.day_index, payload.period_index)
    if not verdict["allowed"]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "That move breaks a hard constraint.",
                "reasons": verdict["reasons"],
                "alternatives": verdict["alternatives"],
            },
        )

    before = {"day_index": lesson.day_index, "period_index": lesson.period_index}
    lesson.day_index = payload.day_index
    lesson.period_index = payload.period_index
    if payload.room_id is not None:
        _owned(db, m.TtRoom, principal.school_id, payload.room_id)
        lesson.room_id = payload.room_id
    after = {"day_index": lesson.day_index, "period_index": lesson.period_index}

    calendar = load_calendar(db, principal.school_id)
    day_name = next((d.name for d in calendar.days if d.index == payload.day_index), payload.day_index)
    period_name = next((p.name for p in calendar.periods if p.index == payload.period_index), payload.period_index)
    _audit(
        db, principal, "move", "lesson", lesson.id,
        f"Moved a lesson to {day_name} {period_name}", before, after,
    )
    db.commit()
    db.refresh(lesson)
    return lesson


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
        periods=[
            {"index": p.index, "name": p.name, "start_time": p.start_time, "is_teaching": p.is_teaching}
            for p in calendar.periods
        ],
        days=[{"index": d.index, "name": d.name} for d in calendar.days],
    )


@router.post("/copilot/interpret")
def copilot_interpret(
    payload: s.CopilotIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    """Turn a sentence into a structured command. Never applies it."""
    parser = ai.get_parser()
    command = parser.parse(payload.text, _vocabulary(db, principal.school_id))
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
