"""Independent named timetable generation without changing the saved school calendar."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import jobs as job_queue
from . import models as m
from . import schemas as s
from .jobs import _ensure_calendar
from .solver import ORTOOLS_AVAILABLE
from .tenancy import Principal, require_role
router=APIRouter()
@router.post('/solver/generate-profile',response_model=s.JobOut,status_code=202)
def generate_profile(payload:s.GenerateProfileIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    if not ORTOOLS_AVAILABLE: raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,'The scheduling engine is not available on this server.')
    _ensure_calendar(db,principal.school_id)
    rows=db.query(m.TtDay).filter(m.TtDay.school_id==principal.school_id).order_by(m.TtDay.index).all()
    by_index={d.index:d for d in rows}
    if any(i not in by_index for i in payload.day_indexes): raise HTTPException(status.HTTP_400_BAD_REQUEST,'One or more selected days are not configured.')
    requirement_count=db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id==principal.school_id).count()
    if requirement_count==0: raise HTTPException(status.HTTP_400_BAD_REQUEST,'Add at least one teaching allocation before generating a timetable.')
    if db.query(m.TtSolverJob).filter(m.TtSolverJob.school_id==principal.school_id,m.TtSolverJob.status.in_(['queued','running','optimizing','validating'])).first(): raise HTTPException(status.HTTP_409_CONFLICT,'A timetable is already being generated.')
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
