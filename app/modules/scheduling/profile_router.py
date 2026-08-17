"""Independent timetable profiles: named day sets without overwriting old timetables."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import jobs as job_queue
from . import models as m
from . import schemas as s
from .solver import ORTOOLS_AVAILABLE
from .tenancy import Principal, require_role

router = APIRouter()

@router.post('/solver/generate-profile', response_model=s.JobOut, status_code=202)
def generate_profile(payload: s.GenerateIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin','scheduler'))):
    if not ORTOOLS_AVAILABLE:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, 'The scheduling engine is not available on this server.')
    days = payload.day_indexes or [d.index for d in db.query(m.TtDay).filter(m.TtDay.school_id == principal.school_id, m.TtDay.is_active.is_(True)).order_by(m.TtDay.index)]
    if not days:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, 'Select at least one working day.')
    day_rows = {d.index: d for d in db.query(m.TtDay).filter(m.TtDay.school_id == principal.school_id).all()}
    if any(i not in day_rows for i in days):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, 'One or more selected days are not configured.')
    running = db.query(m.TtSolverJob).filter(m.TtSolverJob.school_id == principal.school_id, m.TtSolverJob.status.in_(['queued','running','optimizing','validating'])).first()
    if running:
        raise HTTPException(status.HTTP_409_CONFLICT, 'A timetable is already being generated.')
    original = {i: row.is_active for i, row in day_rows.items()}
    try:
        for i, row in day_rows.items(): row.is_active = i in days
        db.commit()
        job = job_queue.create_job(db, principal.school_id, principal.email)
        job_queue.enqueue(job.id, principal.school_id, payload.max_seconds)
        db.refresh(job)
        if job.result_version_id:
            version = db.query(m.TtVersion).filter(m.TtVersion.id == job.result_version_id, m.TtVersion.school_id == principal.school_id).first()
            if version:
                version.label = payload.label.strip()
                version.day_indexes = days
                version.day_names = [day_rows[i].name for i in days]
                db.commit()
        db.refresh(job)
        return job
    finally:
        for i, value in original.items(): day_rows[i].is_active = value
        db.commit()
