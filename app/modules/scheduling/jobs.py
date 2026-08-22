"""Database-backed solver job execution."""
from __future__ import annotations
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from . import models as m
from .engine import build_input, detect_conflicts
from .generation_rules import enforce_double_lessons
from .solver import ORTOOLS_AVAILABLE, preflight, solve
logger=logging.getLogger(__name__)
CHECKS=[{"key":"teacher_conflicts","label":"Teacher conflicts","group":"hard"},{"key":"class_conflicts","label":"Class conflicts","group":"hard"},{"key":"room_conflicts","label":"Room conflicts","group":"hard"},{"key":"availability","label":"Availability","group":"hard"},{"key":"double_lessons","label":"Double lessons","group":"hard"},{"key":"workload","label":"Workload balance","group":"soft"},{"key":"distribution","label":"Subject distribution","group":"soft"},{"key":"preferences","label":"Time preferences","group":"soft"}]
DEFAULT_DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday"]
DEFAULT_PERIODS=[(0,"P1","08:00","08:45",True),(1,"P2","08:45","09:30",True),(2,"P3","09:30","10:15",True),(3,"Break","10:15","10:45",False),(4,"P4","10:45","11:30",True),(5,"P5","11:30","12:15",True),(6,"P6","12:15","13:00",True),(7,"Lunch","13:00","14:00",False),(8,"P7","14:00","14:45",True),(9,"P8","14:45","15:30",True)]
def initial_checks(): return [{**c,"state":"pending"} for c in CHECKS]
def create_job(db:Session,school_id:int,actor:str|None):
    job=m.TtSolverJob(school_id=school_id,status="queued",stage="Queued",progress=0,checks=initial_checks(),created_by=actor);db.add(job);db.commit();db.refresh(job);return job
def enqueue(job_id:int,school_id:int,max_seconds:float=30.0): _run_job(job_id,school_id,max_seconds)
def _ensure_calendar(db:Session,school_id:int):
    if db.query(m.TtDay).filter(m.TtDay.school_id==school_id).count()==0: db.add_all([m.TtDay(school_id=school_id,index=i,name=n,is_active=True) for i,n in enumerate(DEFAULT_DAYS)])
    if db.query(m.TtPeriod).filter(m.TtPeriod.school_id==school_id).count()==0: db.add_all([m.TtPeriod(school_id=school_id,index=i,name=n,start_time=s,end_time=e,is_teaching=t) for i,n,s,e,t in DEFAULT_PERIODS])
    db.commit()
def _set_checks(checks,keys,state): return [{**c,"state":state} if c["key"] in keys else c for c in checks]
def _run_job(job_id,school_id,max_seconds):
    db=SessionLocal()
    try:
        job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
        if not job:return
        job.status="running";job.stage="Loading school data";job.progress=4;job.started_at=datetime.utcnow();db.commit()
        if not ORTOOLS_AVAILABLE:return _fail(db,job,"The scheduling engine is not available on this server.")
        _ensure_calendar(db,school_id);data=build_input(db,school_id,max_seconds=max_seconds)
        problems=preflight(data)
        if problems:return _fail(db,job," ".join(problems))
        def cancelled():
            db.expire_all();row=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first();return bool(row and row.cancel_requested)
        def report(pct,stage):
            row=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
            if not row:return
            row.progress=max(row.progress or 0,min(99,pct));row.stage=stage;checks=row.checks or initial_checks()
            if pct>=26:checks=_set_checks(checks,["teacher_conflicts","class_conflicts","room_conflicts","availability"],"passed");row.status="running"
            if pct>=40:row.status="optimizing"
            if pct>=60:checks=_set_checks(checks,["workload","distribution"],"passed")
            if pct>=84:row.status="validating"
            row.checks=checks;db.commit()
        result=solve(data,on_progress=report,should_cancel=cancelled)
        if result.status=="cancelled" or cancelled():
            job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
            if job:job.status="cancelled";job.stage="Cancelled";job.finished_at=datetime.utcnow();job.message="Generation was cancelled.";db.commit()
            return
        job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
        if not job:return
        if not result.solved:return _fail(db,job," ".join(result.messages) or "No feasible timetable was found.")
        double_problems=enforce_double_lessons(data,result.placements)
        if double_problems:
            checks=_set_checks(job.checks or initial_checks(),["double_lessons"],"failed");job.checks=checks;db.commit()
            return _fail(db,job," ".join(double_problems))
        checks=_set_checks(job.checks or initial_checks(),["double_lessons"],"passed");job.checks=checks;db.commit()
        version=_persist(db,school_id,result,job.created_by)
        conflicts=detect_conflicts(db,school_id,version.id)
        hard_conflicts=[c for c in conflicts if c.severity=="hard"]
        if hard_conflicts:
            job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
            if job:
                job.checks=_set_checks(job.checks or initial_checks(),["teacher_conflicts","class_conflicts","room_conflicts","availability"],"failed")
                job.message=f"Generation completed but {len(hard_conflicts)} hard conflict(s) prevented automatic publication."
                db.commit()
                _fail(db,job,job.message)
            return
        db.query(m.TtVersion).filter(m.TtVersion.school_id==school_id,m.TtVersion.status=="published").update({"status":"archived"})
        version.status="published"
        version.published_at=datetime.utcnow()
        breakdown=result.quality.get("breakdown",{});checks=job.checks or initial_checks();checks=_set_checks(checks,["teacher_conflicts","class_conflicts","room_conflicts","availability"],"passed");checks=_set_checks(checks,["workload","distribution"],"passed");checks=_set_checks(checks,["preferences"],"passed" if breakdown.get("morning_preference",100)>=90 else "warning")
        job.checks=checks;job.status="completed";job.stage="Completed";job.progress=100;job.result_version_id=version.id;job.quality=result.quality;job.finished_at=datetime.utcnow();db.commit()
        db.add(m.TtAuditEntry(school_id=school_id,actor=job.created_by,action="generate",entity="version",entity_id=version.id,summary=f"Generated and published timetable v{version.number} ({version.label or 'Generated'})"));db.commit()
    except Exception:
        logger.exception("Solver job %s failed",job_id)
        try:
            job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
            if job:_fail(db,job,"The scheduling engine hit an unexpected problem.")
        except Exception:pass
    finally:db.close()
def _fail(db,job,message):job.status="failed";job.stage="Failed";job.message=message;job.finished_at=datetime.utcnow();db.commit()
def _persist(db,school_id,result,actor):
    last=db.query(m.TtVersion).filter(m.TtVersion.school_id==school_id).order_by(m.TtVersion.number.desc()).first()
    active=db.query(m.TtDay).filter(m.TtDay.school_id==school_id,m.TtDay.is_active.is_(True)).order_by(m.TtDay.index).all()
    version=m.TtVersion(school_id=school_id,number=(last.number+1) if last else 1,label="Generated",status="draft",quality=result.quality,stats=result.stats,created_by=actor,day_indexes=[d.index for d in active],day_names=[d.name for d in active])
    db.add(version);db.flush()
    for p in result.placements:db.add(m.TtLesson(school_id=school_id,version_id=version.id,requirement_id=p.requirement_id,class_id=p.class_id,subject_id=p.subject_id,teacher_id=p.teacher_id,room_id=p.room_id,day_index=p.day,period_index=p.period,duration=p.duration))
    db.commit()
    from .engine import assign_rooms_to_lessons
    assign_rooms_to_lessons(db,school_id,version.id);db.refresh(version);return version
