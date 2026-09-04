"""Database-backed timetable solver jobs."""
from __future__ import annotations
import logging, os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from . import models as m
from .engine import build_input, detect_conflicts
from .generation_rules import enforce_double_lessons
from .solver import ORTOOLS_AVAILABLE, preflight, solve
from .tenancy import TtMembership
logger=logging.getLogger(__name__)
CHECKS=[{"key":"teacher_conflicts","label":"Teacher conflicts","group":"hard"},{"key":"class_conflicts","label":"Class conflicts","group":"hard"},{"key":"room_conflicts","label":"Room conflicts","group":"hard"},{"key":"availability","label":"Availability","group":"hard"},{"key":"double_lessons","label":"Double lessons","group":"hard"},{"key":"workload","label":"Workload balance","group":"soft"},{"key":"distribution","label":"Subject distribution","group":"soft"}]
_EXECUTOR=ThreadPoolExecutor(max_workers=1,thread_name_prefix="timetable-solver")
def utcnow(): return datetime.now(timezone.utc).replace(tzinfo=None)
def initial_checks(): return [{**c,"state":"pending"} for c in CHECKS]
def create_job(db:Session,school_id:int,actor:str|None,config:dict|None=None):
    job=m.TtSolverJob(school_id=school_id,status="queued",stage="Queued",progress=0,checks=initial_checks(),created_by=actor,config=config or {}); db.add(job); db.commit(); db.refresh(job); return job
def enqueue(job_id:int,school_id:int,max_seconds:float=30.0,day_indexes:list[int]|None=None):
    if os.getenv("SOLVER_DEDICATED_WORKER")=="1": return job_id
    future=_EXECUTOR.submit(_run_job,job_id,school_id,max_seconds,day_indexes); future.add_done_callback(lambda f: logger.exception("Solver job %s background task failed",job_id) if f.exception() else None); return job_id
def _ensure_calendar(db,school_id):
    if db.query(m.TtDay).filter(m.TtDay.school_id==school_id).count()==0: raise RuntimeError('School timetable days are not configured.')
    if db.query(m.TtPeriod).filter(m.TtPeriod.school_id==school_id).count()==0: raise RuntimeError('School timetable periods are not configured.')
def _set_checks(checks,keys,state): return [{**c,"state":state} if c["key"] in keys else c for c in checks]
def _actor_uuid(db,school_id,actor):
    if not actor:return None
    membership=db.query(TtMembership).filter(TtMembership.school_id==school_id,TtMembership.user_id==actor,TtMembership.is_active.is_(True)).first()
    if membership:return membership.user_id
    membership=db.query(TtMembership).filter(TtMembership.school_id==school_id,TtMembership.email==actor,TtMembership.is_active.is_(True)).first()
    return membership.user_id if membership else None
def _run_job(job_id,school_id,max_seconds,day_indexes=None):
    db=SessionLocal(); original_days=None
    try:
        job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
        if not job or job.status not in {"queued","running"}: return
        config=job.config if isinstance(job.config,dict) else {}; job.status="running"; job.stage="Loading school data"; job.progress=max(job.progress or 0,4); job.started_at=job.started_at or utcnow(); db.commit()
        if not ORTOOLS_AVAILABLE:return _fail(db,job,"The scheduling engine is not available on this server.")
        _ensure_calendar(db,school_id)
        requested_days=set(int(i) for i in (config.get('day_indexes') or day_indexes or []))
        if requested_days:
            days=db.query(m.TtDay).filter(m.TtDay.school_id==school_id).all(); original_days={d.id:d.is_active for d in days}
            for d in days:d.is_active=d.index in requested_days
            db.commit()
        data=build_input(db,school_id,max_seconds=max_seconds,class_ids=config.get('class_ids'),teacher_ids=config.get('teacher_ids'),period_indexes=config.get('period_indexes'))
        problems=preflight(data)
        if problems:return _fail(db,job," ".join(problems))
        def cancelled():
            try: db.expire_all(); row=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first(); return bool(row and row.cancel_requested)
            except Exception: db.rollback(); return False
        def report(pct,stage):
            try:
                row=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
                if not row:return
                row.progress=max(row.progress or 0,min(99,pct)); row.stage=stage
                if pct>=26:row.checks=_set_checks(row.checks or initial_checks(),["teacher_conflicts","class_conflicts","room_conflicts","availability"],"passed")
                if pct>=40:row.status="optimizing"
                if pct>=60:row.checks=_set_checks(row.checks or initial_checks(),["workload","distribution"],"passed")
                if pct>=84:row.status="validating"
                db.commit()
            except Exception:db.rollback()
        result=solve(data,on_progress=report,should_cancel=cancelled)
        if result.status=="cancelled" or cancelled():
            job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
            if job:job.status="cancelled";job.stage="Cancelled";job.finished_at=utcnow();job.message="Generation was cancelled.";db.commit()
            return
        job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
        if not job:return
        if not result.solved:return _fail(db,job," ".join(result.messages) or "No feasible timetable was found.")
        double_problems=enforce_double_lessons(data,result.placements)
        if double_problems:job.checks=_set_checks(job.checks or initial_checks(),["double_lessons"],"failed");db.commit();return _fail(db,job," ".join(double_problems))
        job.checks=_set_checks(job.checks or initial_checks(),["double_lessons"],"passed");db.commit();timetable=_persist(db,school_id,result,_actor_uuid(db,school_id,job.created_by),config);conflicts=detect_conflicts(db,school_id,timetable.id);hard_conflicts=[c for c in conflicts if c.severity=="hard"]
        if hard_conflicts:
            job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
            if job:job.result_version_id=timetable.id;job.message=f"Generation completed but {len(hard_conflicts)} hard conflict(s) remain. The timetable was saved as a draft and cannot be put into force.";db.commit();_fail(db,job,job.message)
            return
        job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
        if job:job.checks=_set_checks(job.checks or initial_checks(),["teacher_conflicts","class_conflicts","room_conflicts","availability","double_lessons","workload","distribution"],"passed");job.status="completed";job.stage="Ready to save";job.progress=100;job.result_version_id=timetable.id;job.quality=result.quality;job.finished_at=utcnow();job.message="Timetable generated successfully. It is not in force until you save this generated timetable.";db.commit()
    except Exception as exc:
        logger.exception("Solver job %s failed",job_id)
        try:
            db.rollback();job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
            if job:_fail(db,job,str(exc) or "The scheduling engine hit an unexpected problem.")
        except Exception:logger.exception("Could not record solver job %s failure",job_id)
    finally:
        if original_days is not None:
            try:
                for ident,active in original_days.items():
                    row=db.query(m.TtDay).filter(m.TtDay.id==ident).first()
                    if row:row.is_active=active
                db.commit()
            except Exception:db.rollback()
        db.close()
def _fail(db,job,message):job.status="failed";job.stage="Failed";job.message=message;job.finished_at=utcnow();db.commit();logger.error("Solver job %s failed: %s",job.id,message)
def _persist(db,school_id,result,actor,config):
    timetable_type_id=config.get('timetable_type_id')
    indexes=list(config.get('day_indexes') or []); names=config.get('day_names') or {}; display_mode=config.get('display_mode') or 'day'
    fallback={d.index:d.name for d in db.query(m.TtDay).filter(m.TtDay.school_id==school_id).all()}
    version=db.query(m.TtVersion).filter(m.TtVersion.school_id==school_id).order_by(m.TtVersion.id.desc()).first()
    if version is None:
        version=m.TtVersion(school_id=school_id,number=1,name=config.get('label') or 'Timetable',label=config.get('label') or 'Current',status='draft',timetable_type_id=timetable_type_id)
        db.add(version); db.flush()
    db.query(m.TtLesson).filter(m.TtLesson.version_id==version.id).delete(synchronize_session=False)
    version.number=1; version.name=config.get('label') or 'Timetable'; version.label=config.get('label') or 'Current'; version.status='draft'; version.quality=result.quality; version.stats=result.stats; version.created_by=actor; version.day_indexes=indexes; version.day_names=[str(names.get(i,fallback.get(i,str(i)))) for i in indexes]; version.display_mode=display_mode; version.timetable_type_id=timetable_type_id
    db.query(m.TtVersion).filter(m.TtVersion.school_id==school_id,m.TtVersion.id!=version.id).delete(synchronize_session=False)
    for p in result.placements:db.add(m.TtLesson(school_id=school_id,version_id=version.id,requirement_id=p.requirement_id,class_id=p.class_id,subject_id=p.subject_id,teacher_id=p.teacher_id,room_id=p.room_id,day_index=p.day,period_index=p.period,duration=p.duration))
    db.commit();from .engine import assign_rooms_to_lessons;assign_rooms_to_lessons(db,school_id,version.id);db.refresh(version);return version
