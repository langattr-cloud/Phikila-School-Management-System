"""Independent named timetable generation without changing the saved school calendar."""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
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
STALE_AFTER=timedelta(minutes=10)

def _utc(value):
    if value is None:return None
    if value.tzinfo is None:return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)

def _active_job(db:Session,school_id:int):
    job=db.query(m.TtSolverJob).filter(m.TtSolverJob.school_id==school_id,func.lower(m.TtSolverJob.status).in_(ACTIVE_STATUSES)).order_by(m.TtSolverJob.id.desc()).first()
    if not job:return None
    now=datetime.now(timezone.utc); heartbeat=_utc(job.updated_at or job.started_at)
    stale=(job.finished_at is not None or (job.progress or 0)>=100)
    if job.stage=="Completed" or (job.progress or 0)>=99:stale=True
    elif heartbeat and now-heartbeat>STALE_AFTER:stale=True
    if stale:
        job.status="completed" if job.result_version_id else "failed";job.stage="Completed" if job.result_version_id else "Failed"
        if job.finished_at is None:job.finished_at=now
        if not job.message and job.status=="failed":job.message="The solver worker stopped before recording a final result. The incomplete generation was released; start a new generation."
        db.commit();return None
    return job

def _job_out(job:m.TtSolverJob)->dict:
    return {"id":job.id,"status":job.status,"progress":job.progress or 0,"stage":job.stage,"checks":job.checks or [],"result_version_id":job.result_version_id,"quality":job.quality or {},"message":job.message}

def _config(db:Session, school_id:int, payload:s.GenerateProfileIn)->dict:
    type_row=None
    if payload.timetable_type_id is not None:
        type_row=db.query(m.TtTimetableType).filter(m.TtTimetableType.id==payload.timetable_type_id,m.TtTimetableType.school_id==school_id,m.TtTimetableType.is_active.is_(True)).first()
        if not type_row: raise HTTPException(status.HTTP_404_NOT_FOUND,'Timetable type not found.')
    day_indexes=sorted(set(payload.day_indexes if payload.day_indexes else (type_row.day_indexes if type_row else [])))
    if not day_indexes: day_indexes=[d.index for d in db.query(m.TtDay).filter(m.TtDay.school_id==school_id).order_by(m.TtDay.index).all()]
    configured={d.index for d in db.query(m.TtDay).filter(m.TtDay.school_id==school_id).all()}
    if not set(day_indexes).issubset(configured): raise HTTPException(status.HTTP_400_BAD_REQUEST,'One or more selected days are not configured.')
    day_names={str(k):str(v).strip() for k,v in (payload.day_names or {}).items() if str(v).strip()}
    invalid=set(int(k) for k in day_names if str(k).lstrip('-').isdigit())-set(range(7))
    if invalid: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,'Day labels must use day indexes from Monday (0) through Sunday (6).')
    return {'label':payload.label,'timetable_type_id':payload.timetable_type_id,'day_indexes':day_indexes,'day_names':day_names,'class_ids':payload.class_ids,'teacher_ids':payload.teacher_ids,'period_indexes':payload.period_indexes}

@router.post('/solver/generate-profile',response_model=s.JobOut,status_code=202)
def generate_profile(payload:s.GenerateProfileIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    if not ORTOOLS_AVAILABLE:raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,'The scheduling engine is not available on this server.')
    if not db.query(m.TtDay).filter(m.TtDay.school_id==principal.school_id).first():raise HTTPException(status.HTTP_400_BAD_REQUEST,'Configure the school working days first.')
    if _active_job(db,principal.school_id):raise HTTPException(status.HTTP_409_CONFLICT,'A timetable is already being generated.')
    config=_config(db,principal.school_id,payload); job=job_queue.create_job(db,principal.school_id,principal.email,config); job_queue.enqueue(job.id,principal.school_id,payload.max_seconds,config['day_indexes']); db.refresh(job); return job

@router.post('/solver/generate-async',response_model=s.JobOut,status_code=202)
def generate_async(payload:s.GenerateIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    if not ORTOOLS_AVAILABLE:raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,'The scheduling engine is not available on this server.')
    if _active_job(db,principal.school_id):raise HTTPException(status.HTTP_409_CONFLICT,'A timetable is already being generated.')
    profile=s.GenerateProfileIn(max_seconds=payload.max_seconds,timetable_type_id=payload.timetable_type_id,class_ids=payload.class_ids,teacher_ids=payload.teacher_ids,period_indexes=payload.period_indexes)
    config=_config(db,principal.school_id,profile); job=job_queue.create_job(db,principal.school_id,principal.email,config); job_queue.enqueue(job.id,principal.school_id,payload.max_seconds,config['day_indexes']); db.refresh(job); return job

@router.get('/solver/jobs/active',response_model=s.JobOut|None)
def active_job(db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    job=_active_job(db,principal.school_id); return _job_out(job) if job else None
