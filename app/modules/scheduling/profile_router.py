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
router=APIRouter(); ACTIVE_STATUSES=("queued","running","optimizing","validating"); RECENT_RESULT_WINDOW=timedelta(minutes=30)
def _utc(value):
    if value is None:return None
    if value.tzinfo is None:return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
def _active_job(db,school_id):
    now=datetime.now(timezone.utc)
    job=db.query(m.TtSolverJob).filter(m.TtSolverJob.school_id==school_id,func.lower(m.TtSolverJob.status).in_(ACTIVE_STATUSES)).order_by(m.TtSolverJob.id.desc()).first()
    if job:
        heartbeat=_utc(job.updated_at or job.started_at); stale=job.finished_at is not None or (job.progress or 0)>=99 or job.stage=="Completed" or bool(heartbeat and now-heartbeat>timedelta(minutes=10))
        if stale:
            job.status="completed" if job.result_version_id else "failed";job.stage="Completed" if job.result_version_id else "Failed";job.finished_at=job.finished_at or datetime.now(timezone.utc);db.commit();return None
        return job
    # Keep the latest result available briefly so the UI can fetch it after the
    # worker has finished. Previously the active endpoint returned null as soon
    # as a job completed, which made the frontend lose successful candidates.
    recent=db.query(m.TtSolverJob).filter(m.TtSolverJob.school_id==school_id,m.TtSolverJob.status.in_(["completed","failed","cancelled"])).order_by(m.TtSolverJob.id.desc()).first()
    if recent:
        finished=_utc(recent.finished_at or recent.updated_at or recent.created_at)
        if finished and now-finished<=RECENT_RESULT_WINDOW:return recent
    return None
def _job_out(job): return {"id":job.id,"status":job.status,"progress":job.progress or 0,"stage":job.stage,"checks":job.checks or [],"result_version_id":job.result_version_id,"quality":job.quality or {},"message":job.message}
def _config(db,school_id,payload):
    type_row=None
    if payload.timetable_type_id is not None:
        type_row=db.query(m.TtTimetableType).filter(m.TtTimetableType.id==payload.timetable_type_id,m.TtTimetableType.school_id==school_id,m.TtTimetableType.is_active.is_(True)).first()
        if not type_row:raise HTTPException(status.HTTP_404_NOT_FOUND,'Timetable type not found.')
    mode=type_row.display_mode if type_row else 'day'
    day_indexes=sorted(set(payload.day_indexes if payload.day_indexes is not None else (type_row.day_indexes if type_row else [])))
    if not day_indexes:raise HTTPException(status.HTTP_400_BAD_REQUEST,'Select at least one schedule day.')
    configured_days={d.index for d in db.query(m.TtDay).filter(m.TtDay.school_id==school_id).all()}
    if not set(day_indexes).issubset(configured_days):raise HTTPException(status.HTTP_400_BAD_REQUEST,'One or more selected days are not configured.')
    configured_periods={p.index for p in db.query(m.TtPeriod).filter(m.TtPeriod.school_id==school_id,m.TtPeriod.is_teaching.is_(True)).all()}
    period_indexes=sorted(set(int(i) for i in (payload.period_indexes or [])))
    if not period_indexes:raise HTTPException(status.HTTP_400_BAD_REQUEST,'Select at least one teaching period.')
    if not set(period_indexes).issubset(configured_periods):raise HTTPException(status.HTTP_400_BAD_REQUEST,'One or more selected teaching periods are not configured or are not teaching periods.')
    day_names={int(k):str(v).strip() for k,v in (payload.day_names or {}).items() if str(v).strip()}
    if mode=='date' and not all(day_names.get(i) for i in day_indexes):raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,'Date-based timetables require a display date for every selected day.')
    return {'label':payload.label,'timetable_type_id':payload.timetable_type_id,'display_mode':mode,'day_indexes':day_indexes,'day_names':day_names,'class_ids':payload.class_ids,'teacher_ids':payload.teacher_ids,'period_indexes':period_indexes}
@router.post('/solver/generate-profile',response_model=s.JobOut,status_code=202)
def generate_profile(payload:s.GenerateProfileIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    if not ORTOOLS_AVAILABLE:raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,'The scheduling engine is not available on this server.')
    current=_active_job(db,principal.school_id)
    if current and current.status in ACTIVE_STATUSES:raise HTTPException(status.HTTP_409_CONFLICT,'A timetable is already being generated.')
    config=_config(db,principal.school_id,payload);job=job_queue.create_job(db,principal.school_id,principal.email,config);job_queue.enqueue(job.id,principal.school_id,payload.max_seconds,config['day_indexes']);db.refresh(job);return job
@router.post('/solver/generate-async',response_model=s.JobOut,status_code=202)
def generate_async(payload:s.GenerateIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    if not ORTOOLS_AVAILABLE:raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,'The scheduling engine is not available on this server.')
    current=_active_job(db,principal.school_id)
    if current and current.status in ACTIVE_STATUSES:raise HTTPException(status.HTTP_409_CONFLICT,'A timetable is already being generated.')
    config=_config(db,principal.school_id,s.GenerateProfileIn(max_seconds=payload.max_seconds,timetable_type_id=payload.timetable_type_id,class_ids=payload.class_ids,teacher_ids=payload.teacher_ids,period_indexes=payload.period_indexes));job=job_queue.create_job(db,principal.school_id,principal.email,config);job_queue.enqueue(job.id,principal.school_id,payload.max_seconds,config['day_indexes']);db.refresh(job);return job
@router.get('/solver/jobs/active',response_model=s.JobOut|None)
def active_job(db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    job=_active_job(db,principal.school_id);return _job_out(job) if job else None
