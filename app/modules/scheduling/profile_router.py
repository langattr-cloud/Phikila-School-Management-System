"""Independent named timetable generation without changing the saved school calendar."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import jobs as job_queue
from . import models as m
from . import schemas as s
from .solver import ORTOOLS_AVAILABLE
from .tenancy import Principal, require_role, resolve_principal

router=APIRouter()
ACTIVE_STATUSES=("queued","running","optimizing","validating")


def _active_job(db:Session, school_id:int):
    """Return a genuinely active job and repair terminal-looking stale rows."""
    job=db.query(m.TtSolverJob).filter(
        m.TtSolverJob.school_id==school_id,
        func.lower(m.TtSolverJob.status).in_(ACTIVE_STATUSES),
    ).order_by(m.TtSolverJob.id.desc()).first()
    if not job:
        return None
    if job.finished_at is not None or (job.progress or 0) >= 100:
        job.status="completed" if job.result_version_id else "failed"
        job.stage="Completed" if job.result_version_id else "Failed"
        if job.finished_at is None:
            from datetime import datetime
            job.finished_at=datetime.utcnow()
        if not job.message and job.status=="failed":
            job.message="The previous generation ended before its final status was recorded."
        db.commit()
        return None
    return job


@router.post('/solver/generate-profile',response_model=s.JobOut,status_code=202)
def generate_profile(payload:s.GenerateProfileIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    if not ORTOOLS_AVAILABLE: raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,'The scheduling engine is not available on this server.')
    rows=db.query(m.TtDay).filter(m.TtDay.school_id==principal.school_id).order_by(m.TtDay.index).all()
    if not rows: raise HTTPException(status.HTTP_400_BAD_REQUEST,'Configure the school working days first.')
    by_index={d.index:d for d in rows}
    if any(i not in by_index for i in payload.day_indexes): raise HTTPException(status.HTTP_400_BAD_REQUEST,'One or more selected days are not configured.')
    if _active_job(db,principal.school_id): raise HTTPException(status.HTTP_409_CONFLICT,'A timetable is already being generated.')
    original={d.index:d.is_active for d in rows}
    try:
        for d in rows:d.is_active=d.index in payload.day_indexes
        db.commit()
        job=job_queue.create_job(db,principal.school_id,principal.email)
        job_queue.enqueue(job.id,principal.school_id,payload.max_seconds)
        db.refresh(job)
        if job.result_version_id:
            version=db.query(m.TtVersion).filter(m.TtVersion.id==job.result_version_id,m.TtVersion.school_id==principal.school_id).first()
            if version:
                version.label=payload.label.strip();version.day_indexes=payload.day_indexes;version.day_names=[by_index[i].name for i in payload.day_indexes];db.commit()
        db.refresh(job);return job
    finally:
        for d in rows:d.is_active=original[d.index]
        db.commit()

@router.post('/solver/generate-async',response_model=s.JobOut,status_code=202)
def generate_async(payload:s.GenerateIn,background_tasks:BackgroundTasks,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    """Create a solver job and return immediately while generation runs in the background."""
    if not ORTOOLS_AVAILABLE: raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,'The scheduling engine is not available on this server.')
    running=_active_job(db,principal.school_id)
    if running: raise HTTPException(status.HTTP_409_CONFLICT,'A timetable is already being generated.')
    job=job_queue.create_job(db,principal.school_id,principal.email)
    background_tasks.add_task(job_queue.enqueue,job.id,principal.school_id,payload.max_seconds)
    db.refresh(job)
    return job

@router.get('/solver/jobs/active',response_model=s.JobOut|None)
def active_job(db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    """Return the current solver job for this school, if generation is active."""
    return _active_job(db,principal.school_id)
