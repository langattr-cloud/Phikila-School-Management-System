"""Database-backed solver job execution.

Long optimisation runs must not block an HTTP request, so ``enqueue`` persists
a job row and executes it during the active serverless invocation. The API only
ever reads job rows, which means the execution backend can later be swapped for
a durable worker without changing the endpoint contract.
"""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.database import SessionLocal

from . import models as m
from .engine import build_input
from .solver import ORTOOLS_AVAILABLE, preflight, solve

logger = logging.getLogger(__name__)

CHECKS = [
    {"key": "teacher_conflicts", "label": "Teacher conflicts", "group": "hard"},
    {"key": "class_conflicts", "label": "Class conflicts", "group": "hard"},
    {"key": "room_conflicts", "label": "Room conflicts", "group": "hard"},
    {"key": "availability", "label": "Availability", "group": "hard"},
    {"key": "workload", "label": "Workload balance", "group": "soft"},
    {"key": "distribution", "label": "Subject distribution", "group": "soft"},
    {"key": "preferences", "label": "Time preferences", "group": "soft"},
]

DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
DEFAULT_PERIODS = [
    (0, "P1", "08:00", "08:45", True),
    (1, "P2", "08:45", "09:30", True),
    (2, "P3", "09:30", "10:15", True),
    (3, "Break", "10:15", "10:45", False),
    (4, "P4", "10:45", "11:30", True),
    (5, "P5", "11:30", "12:15", True),
    (6, "P6", "12:15", "13:00", True),
    (7, "Lunch", "13:00", "14:00", False),
    (8, "P7", "14:00", "14:45", True),
    (9, "P8", "14:45", "15:30", True),
]


def initial_checks() -> list[dict]:
    return [{**check, "state": "pending"} for check in CHECKS]


def create_job(db: Session, school_id: int, actor: str | None) -> m.TtSolverJob:
    job = m.TtSolverJob(
        school_id=school_id,
        status="queued",
        stage="Queued",
        progress=0,
        checks=initial_checks(),
        created_by=actor,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def enqueue(job_id: int, school_id: int, max_seconds: float = 30.0) -> None:
    """Run the solver while the serverless invocation is still alive.

    Vercel does not guarantee that daemon/background threads continue after an
    HTTP response finishes. The old implementation could therefore return a
    queued job and then have its worker terminated before it generated a
    timetable. Running the job synchronously keeps the database lifecycle
    deterministic and ensures the returned job is already completed or failed.
    """
    _run_job(job_id, school_id, max_seconds)


def _ensure_calendar(db: Session, school_id: int) -> None:
    """Provision a default working week when a school has no calendar rows.

    School bootstrap creates the scheduling tables but may not create rows for
    days and periods. The solver cannot place lessons without those rows, so
    generation must repair that empty state instead of silently producing an
    unusable timetable.
    """
    existing_days = db.query(m.TtDay).filter(m.TtDay.school_id == school_id).count()
    existing_periods = db.query(m.TtPeriod).filter(m.TtPeriod.school_id == school_id).count()

    if existing_days == 0:
        db.add_all(
            [
                m.TtDay(school_id=school_id, index=index, name=name, is_active=True)
                for index, name in enumerate(DEFAULT_DAYS)
            ]
        )

    if existing_periods == 0:
        db.add_all(
            [
                m.TtPeriod(
                    school_id=school_id,
                    index=index,
                    name=name,
                    start_time=start,
                    end_time=end,
                    is_teaching=is_teaching,
                )
                for index, name, start, end, is_teaching in DEFAULT_PERIODS
            ]
        )

    if existing_days == 0 or existing_periods == 0:
        db.commit()


def _set_checks(checks: list[dict], keys: list[str], state: str) -> list[dict]:
    return [
        {**check, "state": state} if check["key"] in keys else check for check in checks
    ]


def _run_job(job_id: int, school_id: int, max_seconds: float) -> None:
    db = SessionLocal()
    try:
        job = db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job_id).first()
        if not job:
            return

        job.status = "running"
        job.stage = "Loading school data"
        job.progress = 4
        job.started_at = datetime.utcnow()
        db.commit()

        if not ORTOOLS_AVAILABLE:
            _fail(db, job, "The scheduling engine is not available on this server.")
            return

        _ensure_calendar(db, school_id)
        data = build_input(db, school_id, max_seconds=max_seconds)

        problems = preflight(data)
        if problems:
            job.checks = _set_checks(job.checks or initial_checks(), ["availability"], "failed")
            _fail(db, job, " ".join(problems))
            return

        def cancelled() -> bool:
            db.expire_all()
            row = db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job_id).first()
            return bool(row and row.cancel_requested)

        def report(pct: int, stage: str) -> None:
            row = db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job_id).first()
            if not row:
                return
            row.progress = max(row.progress or 0, min(99, pct))
            row.stage = stage
            checks = row.checks or initial_checks()
            if pct >= 26:
                checks = _set_checks(checks, ["teacher_conflicts", "class_conflicts", "room_conflicts", "availability"], "passed")
                row.status = "running"
            if pct >= 40:
                row.status = "optimizing"
            if pct >= 60:
                checks = _set_checks(checks, ["workload", "distribution"], "passed")
            if pct >= 84:
                row.status = "validating"
            row.checks = checks
            db.commit()

        result = solve(data, on_progress=report, should_cancel=cancelled)

        if result.status == "cancelled" or cancelled():
            job = db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job_id).first()
            if job:
                job.status = "cancelled"
                job.stage = "Cancelled"
                job.finished_at = datetime.utcnow()
                job.message = "Generation was cancelled."
                db.commit()
            return

        job = db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job_id).first()
        if not job:
            return

        if not result.solved:
            job.checks = _set_checks(job.checks or initial_checks(), ["availability"], "failed")
            _fail(db, job, " ".join(result.messages) or "No feasible timetable was found.")
            return

        version = _persist(db, school_id, result, job.created_by)
        breakdown = result.quality.get("breakdown", {})
        checks = job.checks or initial_checks()
        checks = _set_checks(checks, ["teacher_conflicts", "class_conflicts", "room_conflicts", "availability"], "passed")
        checks = _set_checks(checks, ["workload", "distribution"], "passed")
        checks = _set_checks(checks, ["preferences"], "passed" if breakdown.get("morning_preference", 100) >= 90 else "warning")

        job.checks = checks
        job.status = "completed"
        job.stage = "Completed"
        job.progress = 100
        job.result_version_id = version.id
        job.quality = result.quality
        job.finished_at = datetime.utcnow()
        db.commit()

        db.add(
            m.TtAuditEntry(
                school_id=school_id,
                actor=job.created_by,
                action="generate",
                entity="version",
                entity_id=version.id,
                summary=f"Generated timetable v{version.number} ({result.stats.get('placed', 0)} lessons, quality {result.quality.get('overall', 0)}/100)",
            )
        )
        db.commit()
    except Exception:
        logger.exception("Solver job %s failed", job_id)
        try:
            job = db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job_id).first()
            if job:
                _fail(db, job, "The scheduling engine hit an unexpected problem.")
        except Exception:
            pass
    finally:
        db.close()


def _fail(db: Session, job: m.TtSolverJob, message: str) -> None:
    job.status = "failed"
    job.stage = "Failed"
    job.message = message
    job.finished_at = datetime.utcnow()
    db.commit()


def _persist(db: Session, school_id: int, result, actor: str | None) -> m.TtVersion:
    last = db.query(m.TtVersion).filter(m.TtVersion.school_id == school_id).order_by(m.TtVersion.number.desc()).first()
    version = m.TtVersion(
        school_id=school_id,
        number=(last.number + 1) if last else 1,
        label="Generated",
        status="draft",
        quality=result.quality,
        stats=result.stats,
        created_by=actor,
    )
    db.add(version)
    db.flush()
    for placement in result.placements:
        db.add(
            m.TtLesson(
                school_id=school_id,
                version_id=version.id,
                requirement_id=placement.requirement_id,
                class_id=placement.class_id,
                subject_id=placement.subject_id,
                teacher_id=placement.teacher_id,
                room_id=placement.room_id,
                day_index=placement.day,
                period_index=placement.period,
                duration=placement.duration,
            )
        )
    db.commit()
    from .engine import assign_rooms_to_lessons
    assign_rooms_to_lessons(db, school_id, version.id)
    db.refresh(version)
    return version
