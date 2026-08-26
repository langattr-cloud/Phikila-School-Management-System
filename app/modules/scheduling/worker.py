"""Dedicated Render worker for durable timetable solver jobs."""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta

from app.core.database import SessionLocal
from . import models as m
from .jobs import _run_job

logger = logging.getLogger(__name__)
POLL_SECONDS = float(os.getenv("SOLVER_POLL_SECONDS", "2"))
STALE_MINUTES = float(os.getenv("SOLVER_STALE_MINUTES", "5"))


def recover_stale_jobs(db) -> int:
    """Fail jobs abandoned by a crashed/restarted worker instead of leaving them running forever."""
    cutoff = datetime.utcnow() - timedelta(minutes=STALE_MINUTES)
    rows = (
        db.query(m.TtSolverJob)
        .filter(m.TtSolverJob.status.in_(["running", "optimizing", "validating"]))
        .filter(m.TtSolverJob.started_at.isnot(None), m.TtSolverJob.started_at < cutoff)
        .all()
    )
    for job in rows:
        job.status = "failed"
        job.stage = "Failed"
        job.finished_at = datetime.utcnow()
        job.message = "The solver worker stopped before recording a final result. Start a new generation."
    if rows:
        db.commit()
    return len(rows)


def main() -> None:
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
                job.started_at = datetime.utcnow()
                db.commit()
                try:
                    _run_job(job.id, job.school_id, float(os.getenv("SOLVER_MAX_SECONDS", "30")), None)
                except Exception:
                    logger.exception("Solver worker crashed while processing job %s", job.id)
                    db.rollback()
                    failed = db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job.id).first()
                    if failed and failed.status not in {"completed", "failed", "cancelled"}:
                        failed.status = "failed"
                        failed.stage = "Failed"
                        failed.finished_at = datetime.utcnow()
                        failed.message = "The solver worker encountered an unexpected error. Start a new generation."
                        db.commit()
                continue
        except Exception:
            logger.exception("Solver worker polling loop failed")
            db.rollback()
        finally:
            db.close()
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
