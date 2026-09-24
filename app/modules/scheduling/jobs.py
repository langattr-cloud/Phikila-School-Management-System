"""Database-backed timetable solver jobs."""
from __future__ import annotations
import logging, os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from . import models as m
from .engine import _teaching_slots, build_input, detect_conflicts, load_calendar
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
    db=SessionLocal()
    try:
        job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
        if not job or job.status not in {"queued","running"}: return
        config=job.config if isinstance(job.config,dict) else {}; job.status="running"; job.stage="Loading school data"; job.progress=max(job.progress or 0,4); job.started_at=job.started_at or utcnow(); db.commit()
        if not ORTOOLS_AVAILABLE:return _fail(db,job,"The scheduling engine is not available on this server.")
        _ensure_calendar(db,school_id)
        requested_days=list(dict.fromkeys(int(i) for i in (config.get('day_indexes') or day_indexes or []))) or None
        requested_periods=list(dict.fromkeys(int(i) for i in (config.get('period_indexes') or []))) or None
        requested_classes=list(dict.fromkeys(int(i) for i in (config.get("class_ids") or []))) or None
        requested_teachers=list(dict.fromkeys(int(i) for i in (config.get("teacher_ids") or []))) or None
        data=build_input(db,school_id,max_seconds=max_seconds,day_indexes=requested_days,period_indexes=requested_periods,class_ids=requested_classes,teacher_ids=requested_teachers)
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
        job.checks=_set_checks(job.checks or initial_checks(),["double_lessons"],"passed");db.commit();timetable=_persist(db,school_id,result,_actor_uuid(db,school_id,job.created_by),config)
        roomless=db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==timetable.id,m.TtLesson.room_id.is_(None)).count()
        if roomless:
            job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
            if job:
                job.checks=_set_checks(job.checks or initial_checks(),["room_conflicts"],"failed")
                job.result_version_id=timetable.id
                _fail(db,job,f"Generation produced {roomless} lesson(s) without a suitable classroom. Configure compatible active classrooms and generate again.")
            return
        job.checks=_set_checks(job.checks or initial_checks(),["room_conflicts"],"passed")
        db.commit()
        conflicts=detect_conflicts(db,school_id,timetable.id);hard_conflicts=[c for c in conflicts if c.severity=="hard"]
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
        db.close()
def _fail(db,job,message):job.status="failed";job.stage="Failed";job.message=message;job.finished_at=utcnow();db.commit();logger.error("Solver job %s failed: %s",job.id,message)
def _persist(db,school_id,result,actor,config):
    timetable_type_id=config.get('timetable_type_id')
    indexes=list(config.get('day_indexes') or []); names=config.get('day_names') or {}; display_mode=config.get('display_mode') or 'day'; period_indexes=list(config.get('period_indexes') or [])
    fallback={d.index:d.name for d in db.query(m.TtDay).filter(m.TtDay.school_id==school_id).all()}
    version=db.query(m.TtVersion).filter(m.TtVersion.school_id==school_id, m.TtVersion.status=="draft").order_by(m.TtVersion.id.desc()).first()
    if version is None:
        latest=db.query(m.TtVersion).filter(m.TtVersion.school_id==school_id).order_by(m.TtVersion.id.desc()).first()
        next_number=(latest.number+1) if latest and latest.number is not None else 1
        version=m.TtVersion(school_id=school_id,project_id=config.get('project_id'),number=next_number,name=config.get('label') or 'Timetable',label=config.get('label') or 'Current',status='draft',timetable_type_id=timetable_type_id)
        db.add(version); db.flush()
    existing_lessons=db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==version.id).all()
    selected_classes={int(i) for i in (config.get("class_ids") or [])}
    selected_teachers={int(i) for i in (config.get("teacher_ids") or [])}
    scoped=bool(selected_classes or selected_teachers)
    requirement_rows={int(r.id):r for r in db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id==school_id).all()}
    def lesson_in_scope(lesson):
        if not scoped: return True
        req=requirement_rows.get(int(lesson.requirement_id)) if lesson.requirement_id is not None else None
        return bool((lesson.class_id in selected_classes) or (lesson.teacher_id is not None and lesson.teacher_id in selected_teachers) or (req is not None and ((req.class_id in selected_classes) or (req.teacher_id is not None and req.teacher_id in selected_teachers))))
    preserved_meta={(lesson.requirement_id,lesson.day_index,lesson.period_index):{"duration":lesson.duration or 1,"room_id":lesson.room_id,"is_locked":bool(lesson.is_locked)} for lesson in existing_lessons if not scoped or not lesson_in_scope(lesson)}
    locked_meta={(lesson.requirement_id,lesson.day_index,lesson.period_index):{"duration":lesson.duration or 1,"room_id":lesson.room_id,"is_locked":True} for lesson in existing_lessons if lesson.is_locked}
    locked_meta.update(preserved_meta)
    calendar=load_calendar(db,school_id)
    locked_spans={}
    locked_occupied={}
    for lesson in existing_lessons:
        if not lesson.is_locked: continue
        duration=max(1,int(lesson.duration or 1))
        span=_teaching_slots(calendar,lesson.day_index,lesson.period_index,duration)
        if len(span)!=duration:
            raise ValueError(f"Locked lesson {lesson.id} no longer fits the current teaching calendar.")
        for slot in span:
            prior=locked_occupied.get(slot)
            if prior is not None and prior != lesson.id:
                raise ValueError(f"Locked lessons {prior} and {lesson.id} overlap at day {slot[0]}, period {slot[1]}.")
            locked_occupied[slot]=lesson.id
        locked_spans[lesson.id]=span
    db.query(m.TtLesson).filter(m.TtLesson.version_id==version.id).delete(synchronize_session=False)
    version.project_id=config.get('project_id'); version.name=config.get('label') or 'Timetable'; version.label=config.get('label') or 'Current'; version.status='draft'; version.quality=result.quality; version.stats=result.stats; version.created_by=actor; version.day_indexes=indexes; version.day_names=[str(names.get(i,fallback.get(i,str(i)))) for i in indexes]; version.display_mode=display_mode; version.timetable_type_id=timetable_type_id; version.published_at=None; version.effective_from=None
    for p in result.placements:
        locked=locked_meta.get((p.requirement_id,p.day,p.period))
        db.add(m.TtLesson(school_id=school_id,version_id=version.id,requirement_id=p.requirement_id,class_id=p.class_id,subject_id=p.subject_id,teacher_id=p.teacher_id,room_id=(locked["room_id"] if locked and locked["room_id"] is not None else p.room_id),day_index=p.day,period_index=p.period,duration=(locked["duration"] if locked else p.duration),is_locked=bool(locked and locked.get("is_locked",False))))
    db.commit();
    if version.project_id is not None:
        project=db.query(m.TtProject).filter(m.TtProject.id==version.project_id,m.TtProject.school_id==school_id).first()
        if project is not None: project.current_version_id=version.id
    db.commit()
    from .engine import assign_rooms_to_lessons
    assign_rooms_to_lessons(db, school_id, version.id)
    db.refresh(version)
    return version