"""Database-backed timetable solver jobs."""
from __future__ import annotations
import logging, os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from . import models as m
from .engine import build_input, detect_conflicts
from .generation_rules import enforce_double_lessons, relax_next_rule
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

def _diagnose_infeasibility(data):
    """Return actionable aSc-style explanations for a solver infeasibility."""
    diagnostics=[]; slots=[(d,p) for d in data.days for p in data.teaching_periods]
    for r in data.requirements:
        available=[]; blocked_class=blocked_teacher=blocked_room=blocked_rule=0
        for d,p in slots:
            c=data.classes.get(r.class_id)
            if c and (d,p) in c.unavailable: blocked_class+=1; continue
            if r.teacher_id and data.teachers.get(r.teacher_id) and (d,p) in data.teachers[r.teacher_id].unavailable: blocked_teacher+=1; continue
            if r.room_id and data.rooms.get(r.room_id) and (d,p) in data.rooms[r.room_id].unavailable: blocked_room+=1; continue
            denied=False
            for rule in data.avoid_rules:
                match=(rule.scope=="class" and rule.target_id==r.class_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id) or (rule.scope=="subject" and r.subject_id==rule.target_id)
                if rule.is_hard and match and (d,p) in rule.slots: blocked_rule+=1; denied=True; break
            if not denied: available.append((d,p))
        if len(available)<r.periods_per_week:
            diagnostics.append(f"Requirement {r.id} needs {r.periods_per_week} slot(s) but only {len(available)} are available after hard constraints.")
            if blocked_class: diagnostics.append(f"Requirement {r.id}: {blocked_class} slot(s) are blocked by class availability.")
            if blocked_teacher: diagnostics.append(f"Requirement {r.id}: {blocked_teacher} slot(s) are blocked by teacher availability.")
            if blocked_room: diagnostics.append(f"Requirement {r.id}: {blocked_room} slot(s) are blocked by room availability.")
            if blocked_rule: diagnostics.append(f"Requirement {r.id}: {blocked_rule} slot(s) are blocked by hard avoid constraints.")
    if not diagnostics:
        class_counts={}; teacher_counts={}
        for r in data.requirements:
            class_counts[r.class_id]=class_counts.get(r.class_id,0)+r.periods_per_week
            if r.teacher_id: teacher_counts[r.teacher_id]=teacher_counts.get(r.teacher_id,0)+r.periods_per_week
        capacity=len(slots)
        for cid,total in class_counts.items():
            if total>capacity: diagnostics.append(f"Class {cid} requires {total} lessons but the calendar provides only {capacity} teaching slots.")
        for tid,total in teacher_counts.items():
            spec=data.teachers.get(tid)
            if spec and total>spec.max_per_day*len(data.days): diagnostics.append(f"Teacher {spec.name} requires {total} lessons but the configured daily limit provides at most {spec.max_per_day*len(data.days)} slots.")
    return diagnostics

def _solve_with_relaxation(data, mode, on_progress, should_cancel):
    """Strict first; in Allow Relaxation mode relax one lowest-priority hard avoid rule per failed solve."""
    relaxed=[]
    while True:
        if should_cancel(): return None, relaxed, "cancelled"
        problems=preflight(data)
        if problems and mode in {'strict','relax'}:
            if mode!='relax': return None, relaxed, "preflight: " + " ".join(problems)
            rule=relax_next_rule(data.avoid_rules)
            if rule is None: return None, relaxed, "preflight: " + " ".join(problems)
            relaxed.append(rule.note or f"{rule.scope} {rule.target_id} avoid constraint")
            continue
        result=solve(data,on_progress=on_progress,should_cancel=should_cancel)
        if result.status=="cancelled" or should_cancel(): return result, relaxed, "cancelled"
        if result.solved or mode!='relax': return result, relaxed, None
        rule=relax_next_rule(data.avoid_rules)
        if rule is None:return result, relaxed, None
        relaxed.append(rule.note or f"{rule.scope} {rule.target_id} avoid constraint")

def _run_job(job_id,school_id,max_seconds,day_indexes=None):
    db=SessionLocal(); original_days=None
    try:
        job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
        if not job or job.status not in {"queued","running"}: return
        config=job.config if isinstance(job.config,dict) else {}; mode=str(config.get('generation_mode') or config.get('mode') or 'strict').lower(); complexity=str(config.get('generation_complexity') or config.get('complexity') or 'balanced').lower()
        job.status="running"; job.stage="Testing constraints" if config.get('test_first',True) else "Loading school data"; job.progress=max(job.progress or 0,4); job.started_at=job.started_at or utcnow(); db.commit()
        if not ORTOOLS_AVAILABLE:return _fail(db,job,"The scheduling engine is not available on this server.")
        _ensure_calendar(db,school_id)
        requested_days=set(int(i) for i in (config.get('day_indexes') or day_indexes or []))
        if requested_days:
            days=db.query(m.TtDay).filter(m.TtDay.school_id==school_id).all(); original_days={d.id:d.is_active for d in days}
            for d in days:d.is_active=d.index in requested_days
            db.commit()
        data=build_input(db,school_id,max_seconds=max_seconds)
        problems=preflight(data)
        if problems and mode=='draft':
            data.avoid_rules=[]
            problems=preflight(data)
            job.message="Draft mode: constraint preferences are disabled for the draft test."; db.commit()
        if problems and mode=='strict': return _fail(db,job,"Test failed: " + " ".join(problems))
        job.checks=_set_checks(job.checks or initial_checks(),["teacher_conflicts","class_conflicts","room_conflicts","availability"],"passed" if not problems else "failed"); job.stage="Generating draft" if mode=='draft' else "Generating timetable"; job.progress=max(job.progress,18); db.commit()
        def cancelled():
            try:
                db.expire_all(); row=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first(); return bool(row and row.cancel_requested)
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
        result, relaxed, failure=_solve_with_relaxation(data,mode,report,cancelled)
        job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
        if not job:return
        if relaxed:
            job.message=f"Allow Relaxation: {len(relaxed)} constraint(s) relaxed: " + "; ".join(relaxed[:8]) + ("; …" if len(relaxed)>8 else ""); db.commit()
        if failure=="cancelled" or (result and result.status=="cancelled") or cancelled():
            job.status="cancelled";job.stage="Cancelled";job.finished_at=utcnow();job.message="Generation was cancelled.";db.commit();return
        if result is None or not result.solved:
            diagnostics=_diagnose_infeasibility(data); message=" ".join((result.messages if result else []) or [failure or "No feasible timetable was found."])
            if diagnostics: message += " Diagnostics: " + " ".join(diagnostics)
            job.checks=_set_checks(job.checks or initial_checks(),["teacher_conflicts","class_conflicts","room_conflicts","availability"],"failed")
            return _fail(db,job,message)
        double_problems=enforce_double_lessons(data,result.placements)
        if double_problems:
            job.checks=_set_checks(job.checks or initial_checks(),["double_lessons"],"failed"); db.commit()
            if mode in {'strict','relax'}: return _fail(db,job," ".join(double_problems))
        job.checks=_set_checks(job.checks or initial_checks(),["double_lessons"],"passed"); db.commit(); timetable=_persist(db,school_id,result,_actor_uuid(db,school_id,job.created_by),config); conflicts=detect_conflicts(db,school_id,timetable.id); hard_conflicts=[c for c in conflicts if c.severity=="hard"]
        if hard_conflicts and mode=='strict':
            job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
            if job:job.result_version_id=timetable.id;job.message=f"Generation completed but {len(hard_conflicts)} hard conflict(s) remain. Strict mode will not put this timetable into force.";db.commit();_fail(db,job,job.message)
            return
        job=db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job_id).first()
        if job:
            job.checks=_set_checks(job.checks or initial_checks(),["teacher_conflicts","class_conflicts","room_conflicts","availability","double_lessons","workload","distribution"],"passed" if not hard_conflicts else "failed")
            job.status="completed" if not hard_conflicts or mode=='draft' else "failed"; job.stage="Ready to save" if not hard_conflicts else "Draft with unresolved conflicts"; job.progress=100; job.result_version_id=timetable.id; job.quality=result.quality; job.finished_at=utcnow()
            base="Timetable generated successfully." if not hard_conflicts else f"Draft generated with {len(hard_conflicts)} unresolved hard conflict(s)."
            prefix={'strict':'Strict generation.','draft':'Draft generation.','relax':'Allow Relaxation generation.'}.get(mode,'Strict generation.')
            job.message=(prefix+' '+base+' It is not in force until you save this generated timetable.') if not job.message else job.message+' '+base
            db.commit()
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
    timetable_type_id=config.get('timetable_type_id'); indexes=list(config.get('day_indexes') or []); names=config.get('day_names') or {}; display_mode=config.get('display_mode') or 'day'; fallback={d.index:d.name for d in db.query(m.TtDay).filter(m.TtDay.school_id==school_id).all()}
    version=db.query(m.TtVersion).filter(m.TtVersion.school_id==school_id).order_by(m.TtVersion.id.desc()).first()
    if version is None:
        version=m.TtVersion(school_id=school_id,number=1,name=config.get('label') or 'Timetable',label=config.get('label') or 'Current',status='draft',timetable_type_id=timetable_type_id); db.add(version); db.flush()
    db.query(m.TtLesson).filter(m.TtLesson.version_id==version.id).delete(synchronize_session=False)
    version.number=1; version.name=config.get('label') or 'Timetable'; version.label=config.get('label') or 'Current'; version.status='draft'; version.quality=result.quality; version.stats=result.stats; version.created_by=actor; version.day_indexes=indexes; version.day_names=[str(names.get(i,fallback.get(i,str(i)))) for i in indexes]; version.display_mode=display_mode; version.timetable_type_id=timetable_type_id
    db.query(m.TtVersion).filter(m.TtVersion.school_id==school_id,m.TtVersion.id!=version.id).delete(synchronize_session=False)
    for p in result.placements:db.add(m.TtLesson(school_id=school_id,version_id=version.id,requirement_id=p.requirement_id,class_id=p.class_id,subject_id=p.subject_id,teacher_id=p.teacher_id,room_id=p.room_id,day_index=p.day,period_index=p.period,duration=p.duration))
    db.commit();from .engine import assign_rooms_to_lessons;assign_rooms_to_lessons(db,school_id,version.id);db.refresh(version);return version
