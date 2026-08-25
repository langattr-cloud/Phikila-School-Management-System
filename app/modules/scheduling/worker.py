"""Dedicated Render worker for durable timetable solver jobs."""
from __future__ import annotations
import os
import time
from sqlalchemy import text
from app.core.database import SessionLocal
from . import models as m
from .jobs import _run_job

POLL_SECONDS = float(os.getenv("SOLVER_POLL_SECONDS", "2"))


def main() -> None:
    while True:
        db = SessionLocal()
        try:
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
                db.commit()
                _run_job(job.id, job.school_id, 30.0, None)
                continue
        except Exception:
            db.rollback()
        finally:
            db.close()
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
