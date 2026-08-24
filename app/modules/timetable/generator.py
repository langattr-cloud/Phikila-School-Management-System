"""Compatibility wrapper for the production scheduling engine.

The active timetable generator lives in ``app.modules.scheduling.jobs`` and
uses the CP-SAT solver.  This module remains for legacy timetable routes.
"""
from sqlalchemy.orm import Session
from app.modules.scheduling import jobs as scheduling_jobs
from app.modules.scheduling import models as m


class TimetableGenerator:
    def __init__(self, db: Session):
        self.db = db

    def generate_for_class(self, class_register_id: int, academic_year_id: int) -> dict:
        """Generate through the production school-wide solver and report the result.

        The old implementation was a success-returning placeholder.  Class-level
        generation now uses the same constraint-aware engine as the Generate page
        so it cannot claim success without actually producing lessons.
        """
        school_id = (
            self.db.query(m.TtClass.school_id)
            .filter(m.TtClass.id == class_register_id)
            .scalar()
        )
        if school_id is None:
            raise ValueError(f"Class ID {class_register_id} was not found.")

        job = scheduling_jobs.create_job(self.db, school_id, "legacy-timetable-route")
        scheduling_jobs.enqueue(job.id, school_id, 30.0)
        self.db.expire_all()
        job = self.db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job.id).first()
        if job is None:
            raise RuntimeError("Timetable generation job disappeared.")
        if job.status != "completed":
            raise RuntimeError(job.message or "Timetable generation failed.")
        return {
            "class_register_id": class_register_id,
            "status": "Generated",
            "message": "Timetable generated successfully.",
            "job_id": job.id,
            "version_id": job.result_version_id,
        }

    def generate_school_wide(self, academic_year_id: int) -> list[dict]:
        """Generate a real school-wide timetable using the production solver."""
        class_row = self.db.query(m.TtClass.school_id).first()
        if class_row is None:
            return []
        school_id = class_row[0]
        job = scheduling_jobs.create_job(self.db, school_id, "legacy-timetable-route")
        scheduling_jobs.enqueue(job.id, school_id, 30.0)
        self.db.expire_all()
        job = self.db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job.id).first()
        if job is None or job.status != "completed":
            raise RuntimeError((job.message if job else None) or "Timetable generation failed.")
        return [{
            "status": "Generated",
            "message": "Timetable generated successfully.",
            "job_id": job.id,
            "version_id": job.result_version_id,
        }]
