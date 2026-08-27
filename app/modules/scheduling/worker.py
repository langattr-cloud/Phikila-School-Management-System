"""Dedicated Render worker for durable timetable solver jobs."""
from __future__ import annotations

import logging
import multiprocessing as mp
import os
import time
from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal
from . import models as m
from .jobs import _run_job

logger = logging.getLogger(__name__)
POLL_SECONDS = float(os.getenv("SOLVER_POLL_SECONDS", "2"))
STALE_MINUTES = float(os.getenv("SOLVER_STALE_MINUTES", "5"))
DEFAULT_MAX_SECONDS = float(os.getenv("SOLVER_MAX_SECONDS", "30"))
WORKER_GRACE_SECONDS = float(os.getenv("SOLVER_WORKER_GRACE_SECONDS", "15"))


def utcnow() -> datetime:
    """Return a timezone-aware UTC datetime."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def recover_stale_jobs(db) -> int:
    """Fail jobs abandoned by a crashed/restarted worker instead of leaving them running forever."""
    cutoff = utcnow() - timedelta(minutes=STALE_MINUTES)
    rows = (
        db.query(m.TtSolverJob)
        .filter(m.TtSolverJob.status.in_(["running", "optimizing", "validating"]))
        .filter(m.TtSolverJob.started_at.isnot(None), m.TtSolverJob.started_at < cutoff)
        .all()
    )
    for job in rows:
        job.status = "failed"
        job.stage = "Failed"
        job.progress = min(max(job.progress or 0, 1), 99)
        job.finished_at = utcnow()
        job.message = "The solver worker stopped before recording a final result. Start a new generation."
        logger.error("Recovered stale solver job %s", job.id)
    if rows:
        db.commit()
    return len(rows)


def _run_job_isolated(job_id: int, school_id: int, max_seconds: float, day_indexes=None) -> None:
    """Run a solver job in a fresh process so a hung native solver/DB call is killable."""
    _run_job(job_id, school_id, max_seconds, day_indexes)


def _fail_job(job_id: int, message: str) -> None:
    db = SessionLocal()
    try:
        job = db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job_id).first()
        if job and job.status not in {"completed", "failed", "cancelled"}:
            job.status = "failed"
            job.stage = "Failed"
            job.finished_at = utcnow()
            job.message = message
            db.commit()
            logger.error("Solver job %s failed: %s", job_id, message)
    except Exception:
        db.rollback()
        logger.exception("Could not record solver job %s failure", job_id)
    finally:
        db.close()


def run_isolated(job_id: int, school_id: int, max_seconds: float, day_indexes=None) -> None:
    """Execute one job with a hard process-level wall-clock limit."""
    ctx = mp.get_context("spawn")
    process = ctx.Process(
        target=_run_job_isolated,
        args=(job_id, school_id, max_seconds, day_indexes),
        name=f"solver-job-{job_id}",
    )
    process.start()
    timeout = max(1.0, max_seconds) + max(1.0, WORKER_GRACE_SECONDS)
    logger.info("Solver job %s process started pid=%s timeout=%.1fs", job_id, process.pid, timeout)
    process.join(timeout)

    if process.is_alive():
        logger.error("Solver job %s exceeded hard worker timeout; terminating pid=%s", job_id, process.pid)
        process.terminate()
        process.join(5)
        if process.is_alive():
            logger.error("Solver job %s did not terminate cleanly; killing pid=%s", job_id, process.pid)
            process.kill()
            process.join(5)
        _fail_job(
            job_id,
            f"Solver exceeded the {max_seconds:g}-second generation limit and was stopped. Start a new generation.",
        )
        return

    if process.exitcode != 0:
        logger.error("Solver job %s worker process exited with code %s", job_id, process.exitcode)
        _fail_job(job_id, "The solver worker process stopped unexpectedly. Start a new generation.")
        return

    logger.info("Solver job %s worker process exited normally", job_id)


def main() -> None:
    # Spawn is deliberately selected because the worker already owns a SQLAlchemy
    # engine; fork would risk sharing pooled DB connections with the child.
    mp.set_start_method("spawn", force=True)
    while True:
        db = SessionLocal()
        try:
            recover_stale_jobs(db)
            job = (
                db.query(m.TtSolverJob)
                .filter(m.TtSolverJob.status == "queued")
                .order_by(m.TtSolverJob.id)
                .with_for_update(skip_locked=True)
                .first()
            )
            if job:
                job.status = "running"
                job.stage = "Worker claimed job"
                job.progress = max(job.progress or 0, 1)
                job.started_at = utcnow()
                db.commit()
                job_id, school_id = job.id, job.school_id
                logger.info("Claimed solver job %s for school %s", job_id, school_id)
                db.close()
                db = None
                try:
                    run_isolated(job_id, school_id, DEFAULT_MAX_SECONDS, None)
                except Exception:
                    logger.exception("Solver worker crashed while supervising job %s", job_id)
                    _fail_job(job_id, "The solver worker encountered an unexpected error. Start a new generation.")
                continue
        except Exception:
            logger.exception("Solver worker polling loop failed")
            db.rollback()
        finally:
            if db is not None:
                db.close()
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
