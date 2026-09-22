"""Scheduling API.

Every route is scoped to the caller's school. ``school_id`` is resolved
server-side from the verified Supabase token.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Callable
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.email.service import email_service
from . import copilot as ai
from . import jobs as job_queue
from . import models as m
from . import schemas as s
from .engine import DEFAULT_DAYS, _blockers, _name_lookup, assign_rooms_to_lessons, detect_conflicts, explain_move, load_calendar, suggest_slots
from .solver import ORTOOLS_AVAILABLE
from .tenancy import Principal, require_role, resolve_principal
router = APIRouter()
def _owned(db: Session, model, school_id: int, ident: int):
    row = db.query(model).filter(model.id == ident, model.school_id == school_id).first()
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return row
def _audit(db: Session, principal: Principal, action: str, entity: str, entity_id: int | None, summary: str, before: dict | None = None, after: dict | None = None) -> None:
    db.add(m.TtAuditEntry(school_id=principal.school_id, actor=principal.email or principal.user_id, action=action, entity=entity, entity_id=entity_id, summary=summary, before=before, after=after))
def _crud(path: str, model, schema_in, schema_out, entity: str, update_schema=None) -> None:
    update_schema = update_schema or schema_in
    def _list(db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
        return db.query(model).filter(model.school_id == principal.school_id).order_by(model.id).all()
    def _create(payload, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
        row = model(school_id=principal.school_id, **payload.model_dump()); db.add(row)
        try: db.commit()
        except Exception: db.rollback(); raise HTTPException(status.HTTP_409_CONFLICT, f"A {entity} with that code already exists.")
        db.refresh(row); _audit(db, principal, "create", entity, row.id, f"Created {entity} {getattr(row, 'name', row.id)}"); db.commit(); return row
    def _update(ident: int, payload, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
        row = _owned(db, model, principal.school_id, ident)
        for key, value in payload.model_dump(exclude_unset=True).items(): setattr(row, key, value)
        try: db.commit()
        except Exception: db.rollback(); raise HTTPException(status.HTTP_409_CONFLICT, f"A {entity} with that code already exists.")
        db.refresh(row); _audit(db, principal, "update", entity, row.id, f"Updated {entity} {getattr(row, 'name', row.id)}"); db.commit(); return row
    def _delete(ident: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
        row = _owned(db, model, principal.school_id, ident); name = getattr(row, "name", row.id); db.delete(row); _audit(db, principal, "delete", entity, ident, f"Deleted {entity} {name}"); db.commit()
    _create.__annotations__["payload"] = schema_in; _update.__annotations__["payload"] = update_schema
    for fn, suffix in ((_list, "list"), (_create, "create"), (_update, "update"), (_delete, "delete")): fn.__name__ = f"{suffix}_{entity}"
    router.get(f"/{path}", response_model=list[schema_out], name=f"list_{entity}")(_list); router.post(f"/{path}", response_model=schema_out, status_code=201, name=f"create_{entity}")(_create); router.put(f"/{path}/{{ident}}", response_model=schema_out, name=f"update_{entity}")(_update); router.delete(f"/{path}/{{ident}}", status_code=204, name=f"delete_{entity}")(_delete)
_crud("teachers", m.TtTeacher, s.TeacherIn, s.TeacherOut, "teacher")
_crud("subjects", m.TtSubject, s.SubjectIn, s.SubjectOut, "subject")
_crud("rooms", m.TtRoom, s.RoomIn, s.RoomOut, "room")
_crud("classes", m.TtClass, s.ClassIn, s.ClassOut, "class", update_schema=s.ClassUpdateIn)
@router.patch("/classes/{ident}/teacher", response_model=s.ClassOut, name="assign_class_teacher")
def assign_class_teacher(ident: int, payload: s.ClassTeacherAssignmentIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    row = _owned(db, m.TtClass, principal.school_id, ident); teacher = None
    if payload.teacher_id is not None:
        teacher = _owned(db, m.TtTeacher, principal.school_id, payload.teacher_id)
        if not teacher.is_active: raise HTTPException(status.HTTP_400_BAD_REQUEST, "The selected teacher is inactive.")
    previous_teacher_id = row.class_teacher_id; row.class_teacher_id = payload.teacher_id; db.commit(); db.refresh(row)
    _audit(db, principal, "assign_teacher", "class", row.id, f"Assigned class teacher for {row.name}", before={"class_teacher_id": previous_teacher_id}, after={"class_teacher_id": row.class_teacher_id, "teacher_id": teacher.id if teacher else None}); db.commit(); return row
@router.get("/classes/academic-streams", response_model=list[s.ClassOut], name="list_classes_with_academic_stream")
def list_classes_with_academic_stream(db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    from app.modules.academics.models import Stream
    rows = db.query(m.TtClass).filter(m.TtClass.school_id == principal.school_id).order_by(m.TtClass.id).all(); streams = {int(r.id): r for r in db.query(Stream).filter(Stream.school_id == principal.school_id).all()}; out=[]
    for row in rows:
        item=s.ClassOut.model_validate(row); stream=None
        if row.code and row.code.upper().startswith("STREAM-"):
            try: stream=streams.get(int(row.code.split("-",1)[1]))
            except ValueError: pass
        if stream:
            grade=stream.grade.code or stream.grade.name if stream.grade else ""; grade_num=''.join(ch for ch in str(grade) if ch.isdigit()); stream_code=(stream.code or "").strip(); stream_name=(stream.name or "").strip(); token=stream_code or (stream_name[:1] if stream_name else ""); item.academic_stream=f"{grade_num}{token.upper()}" if grade_num and token else (stream_name or None)
        out.append(item)
    return out
router.routes[:] = [r for r in router.routes if not (getattr(r, "path", "") == "/classes" and getattr(r, "methods", set()) == {"GET"})]
@router.get("/classes", response_model=list[s.ClassOut], name="list_classes_with_academic_setup")
def list_classes_with_academic_setup(db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    from app.modules.academics.models import SchoolClass
    rows = db.query(m.TtClass).filter(m.TtClass.school_id == principal.school_id).order_by(m.TtClass.id).all(); setup_rows = db.query(SchoolClass).filter(SchoolClass.school_id == principal.school_id).order_by(SchoolClass.id).all(); by_id = {int(r.id): r for r in setup_rows}; by_key = {}
    for r in setup_rows:
        code=str(r.code or '').strip().upper(); year=int(r.academic_year_id) if r.academic_year_id is not None else None; by_key.setdefault((code,year),r); by_key.setdefault((code,None),r)
    out=[]
    for row in rows:
        item=s.ClassOut.model_validate(row); setup=by_id.get(int(row.school_class_id)) if row.school_class_id is not None else None
        if setup is None:
            code=str(row.code or '').strip().upper(); year=int(row.academic_year_id) if row.academic_year_id is not None else None; setup=by_key.get((code,year)) or by_key.get((code,None))
        if setup is not None:
            if setup.level_id is not None: item.level_id=int(setup.level_id)
            if setup.academic_year_id is not None: item.academic_year_id=int(setup.academic_year_id)
            item.school_class_id=int(setup.id)
        out.append(item)
    return out
@router.get("/constraints",response_model=list[s.ConstraintOut])
def list_constraints(db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    return db.query(m.TtConstraint).filter(m.TtConstraint.school_id == principal.school_id).order_by(m.TtConstraint.id).all()

def _validate_constraint_target(db: Session, principal: Principal, payload):
    target_models = {"teacher": m.TtTeacher, "class": m.TtClass, "subject": m.TtSubject, "room": m.TtRoom}
    if payload.scope == "school":
        if payload.target_id is not None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "School constraints cannot have a target.")
    else:
        if payload.target_id is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{payload.scope} constraints require a target.")
        _owned(db, target_models[payload.scope], principal.school_id, payload.target_id)

@router.post("/constraints",response_model=s.ConstraintOut,status_code=201)
def create_constraint(payload:s.ConstraintIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    _validate_constraint_target(db, principal, payload)
    data=payload.model_dump()
    if data["is_hard"]: data["weight"]=0
    row=m.TtConstraint(school_id=principal.school_id,**data); db.add(row)
    db.commit(); db.refresh(row); _audit(db,principal,"create","constraint",row.id,f"Created constraint {row.kind}"); db.commit(); return row

@router.put("/constraints/{ident}",response_model=s.ConstraintOut)
def update_constraint(ident:int,payload:s.ConstraintUpdate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    row=_owned(db,m.TtConstraint,principal.school_id,ident)
    data=payload.model_dump(exclude_unset=True)
    merged={
        "kind": row.kind,
        "scope": row.scope,
        "target_id": row.target_id,
        "is_hard": row.is_hard,
        "weight": row.weight,
        "params": row.params,
        "enabled": row.enabled,
        "note": row.note,
    }
    merged.update(data)
    validation=s.ConstraintIn(**merged)
    _validate_constraint_target(db, principal, validation)
    if validation.is_hard:
        merged["weight"]=0
    for key,value in data.items(): setattr(row,key,value)
    if validation.is_hard:
        row.weight=0
    db.commit(); db.refresh(row); _audit(db,principal,"update","constraint",row.id,f"Updated constraint {row.kind}"); db.commit(); return row

@router.delete("/constraints/{ident}",status_code=204)
def delete_constraint(ident:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    row=_owned(db,m.TtConstraint,principal.school_id,ident); db.delete(row); _audit(db,principal,"delete","constraint",ident,f"Deleted constraint {row.kind}"); db.commit()
@router.get("/me")
def whoami(principal: Principal = Depends(resolve_principal)):
    return {"user_id":principal.user_id,"email":principal.email,"school_id":principal.school_id,"role":principal.role,"teacher_id":principal.teacher_id,"class_id":principal.class_id,"solver_available":ORTOOLS_AVAILABLE}
@router.get("/calendar")
def get_calendar(db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    calendar=load_calendar(db,principal.school_id); return {"days":[s.DayOut.model_validate(d).model_dump() for d in calendar.days],"periods":[s.PeriodOut.model_validate(p).model_dump() for p in calendar.periods]}
@router.put("/calendar")
def set_calendar(payload:s.CalendarIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    existing=db.query(m.TtLesson).filter(m.TtLesson.school_id==principal.school_id).count()
    if existing: raise HTTPException(status.HTTP_409_CONFLICT,"Delete the current timetable before changing the working week.")
    db.query(m.TtDay).filter(m.TtDay.school_id==principal.school_id).delete(); db.query(m.TtPeriod).filter(m.TtPeriod.school_id==principal.school_id).delete()
    for day in payload.days: db.add(m.TtDay(school_id=principal.school_id,**day.model_dump()))
    for period in payload.periods: db.add(m.TtPeriod(school_id=principal.school_id,**period.model_dump()))
    _audit(db,principal,"update","calendar",None,"Updated working days and periods"); db.commit(); return get_calendar(db,principal)
@router.get("/requirements",response_model=list[s.RequirementOut])
def list_requirements(db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    rows=db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id==principal.school_id).order_by(m.TtLessonRequirement.id).all(); out=[]
    for row in rows:
        item=s.RequirementOut.model_validate(row); item.class_name=row.tt_class.name if row.tt_class else None; item.subject_name=row.subject.name if row.subject else None; item.teacher_name=row.teacher.name if row.teacher else None; item.room_name=row.room.name if row.room else None; out.append(item)
    return out
@router.post("/requirements",response_model=s.RequirementOut,status_code=201)
def create_requirement(payload:s.RequirementIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    for model,ident in ((m.TtClass,payload.class_id),(m.TtSubject,payload.subject_id)): _owned(db,model,principal.school_id,ident)
    if payload.teacher_id: _owned(db,m.TtTeacher,principal.school_id,payload.teacher_id)
    if payload.room_id: _owned(db,m.TtRoom,principal.school_id,payload.room_id)
    row=m.TtLessonRequirement(school_id=principal.school_id,**payload.model_dump()); db.add(row); db.commit(); db.refresh(row); _audit(db,principal,"create","requirement",row.id,"Added a lesson requirement"); db.commit(); return s.RequirementOut.model_validate(row)
@router.delete("/requirements/{ident}",status_code=204)
def delete_requirement(ident:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    row=_owned(db,m.TtLessonRequirement,principal.school_id,ident); db.delete(row); _audit(db,principal,"delete","requirement",ident,"Removed a lesson requirement"); db.commit()
@router.post("/solver/generate",response_model=s.JobOut,status_code=202)
def generate(payload:s.GenerateIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    if not ORTOOLS_AVAILABLE: raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,"The scheduling engine is not available on this server.")
    running=db.query(m.TtSolverJob).filter(m.TtSolverJob.school_id==principal.school_id,m.TtSolverJob.status.in_(["queued","running","optimizing","validating"])).first()
    if running: raise HTTPException(status.HTTP_409_CONFLICT,"A timetable is already being generated.")
    job=job_queue.create_job(db,principal.school_id,principal.email); job_queue.enqueue(job.id,principal.school_id,payload.max_seconds); return job
@router.get("/solver/jobs/{job_id}",response_model=s.JobOut)
def job_status(job_id:int,db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)): return _owned(db,m.TtSolverJob,principal.school_id,job_id)
@router.post("/solver/jobs/{job_id}/cancel",response_model=s.JobOut)
def cancel_job(job_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    job=_owned(db,m.TtSolverJob,principal.school_id,job_id)
    if job.status in {"completed","failed","cancelled"}: return job
    job.cancel_requested=True; db.commit(); db.refresh(job); return job
@router.get("/versions",response_model=list[s.VersionOut])
def list_versions(db: Session = Depends(get_db),principal: Principal = Depends(resolve_principal)):
    query=db.query(m.TtVersion).filter(m.TtVersion.school_id==principal.school_id).order_by(m.TtVersion.id.desc())
    if not principal.at_least("scheduler"): query=query.filter(m.TtVersion.status=="published")
    return query.all()

@router.post("/versions/{version_id}/restore", response_model=s.VersionOut, name="restore_version")
def restore_version(version_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    source=_owned(db,m.TtVersion,principal.school_id,version_id)
    latest=db.query(m.TtVersion).filter(m.TtVersion.school_id==principal.school_id).order_by(m.TtVersion.id.desc()).first()
    if latest and latest.id==source.id:return source
    next_number=(latest.number+1) if latest and latest.number is not None else (source.number or 1)
    restored=m.TtVersion(school_id=principal.school_id,number=next_number,name=f"{source.name} (Restored)",label=f"{source.label or source.name} (Restored)",status="draft",quality=source.quality or {},stats=source.stats or {},created_by=principal.email,day_indexes=list(source.day_indexes or []),day_names=list(source.day_names or []),display_mode=source.display_mode,timetable_type_id=source.timetable_type_id,period_indexes=list(source.period_indexes or []))
    db.add(restored); db.flush()
    for lesson in db.query(m.TtLesson).filter(m.TtLesson.school_id==principal.school_id,m.TtLesson.version_id==source.id).all():
        db.add(m.TtLesson(school_id=principal.school_id,version_id=restored.id,requirement_id=lesson.requirement_id,class_id=lesson.class_id,subject_id=lesson.subject_id,teacher_id=lesson.teacher_id,room_id=lesson.room_id,day_index=lesson.day_index,period_index=lesson.period_index,duration=lesson.duration,is_locked=lesson.is_locked))
    _audit(db,principal,"restore","version",restored.id,f"Restored timetable version {source.number} into version {next_number}",before={"source_version_id":source.id},after={"version_id":restored.id})
    db.commit();db.refresh(restored);return restored

@router.post("/versions/{version_id}/duplicate", response_model=s.VersionOut, name="duplicate_version")
def duplicate_version(version_id: int, name: str | None = Query(default=None, max_length=160), db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    """Create a new editable timetable version from an existing version."""
    source = _owned(db, m.TtVersion, principal.school_id, version_id)
    latest = db.query(m.TtVersion).filter(m.TtVersion.school_id == principal.school_id).order_by(m.TtVersion.id.desc()).first()
    next_number = (latest.number + 1) if latest and latest.number is not None else (source.number or 1)
    requested_name = (name or "").strip()
    base_name = requested_name or source.name or f"Timetable {next_number}"
    duplicate = m.TtVersion(
        school_id=principal.school_id,
        project_id=source.project_id,
        number=next_number,
        name=base_name,
        label=base_name,
        status="draft",
        quality=source.quality or {},
        stats=source.stats or {},
        created_by=principal.email,
        day_indexes=list(source.day_indexes or []),
        day_names=list(source.day_names or []),
        display_mode=source.display_mode,
        timetable_type_id=source.timetable_type_id,
        period_indexes=list(source.period_indexes or []),
    )
    db.add(duplicate)
    db.flush()
    lessons = db.query(m.TtLesson).filter(
        m.TtLesson.school_id == principal.school_id,
        m.TtLesson.version_id == source.id,
    ).all()
    for lesson in lessons:
        db.add(m.TtLesson(
            school_id=principal.school_id,
            version_id=duplicate.id,
            requirement_id=lesson.requirement_id,
            class_id=lesson.class_id,
            subject_id=lesson.subject_id,
            teacher_id=lesson.teacher_id,
            room_id=lesson.room_id,
            day_index=lesson.day_index,
            period_index=lesson.period_index,
            duration=lesson.duration,
            is_locked=lesson.is_locked,
        ))
    _audit(db, principal, "duplicate", "version", duplicate.id, f"Duplicated timetable version {source.number} into version {next_number}", before={"source_version_id": source.id}, after={"version_id": duplicate.id})
    db.commit()
    db.refresh(duplicate)
    return duplicate

@router.delete("/versions/{version_id}",status_code=204,name="delete_version")
def delete_version(version_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    version=_owned(db,m.TtVersion,principal.school_id,version_id)
    if version.status=="published":raise HTTPException(status.HTTP_409_CONFLICT,"Published timetables cannot be deleted.")
    db.query(m.TtLesson).filter(m.TtLesson.version_id==version.id).delete(synchronize_session=False)
    _audit(db,principal,"delete","version",version.id,f"Deleted timetable version {version.number}")
    db.delete(version);db.commit()

@router.get("/versions/current",response_model=s.VersionOut|None)
def current_version(db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    return db.query(m.TtVersion).filter(m.TtVersion.school_id==principal.school_id).order_by(m.TtVersion.id.desc()).first()

@router.post("/versions/{version_id}/publish", response_model=s.VersionOut, name="publish_version")
def publish_version(version_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    """Validate and publish a generated timetable for the caller's school."""
    version = _owned(db, m.TtVersion, principal.school_id, version_id)
    conflicts = detect_conflicts(db, principal.school_id, version.id)
    hard_conflicts = [c for c in conflicts if getattr(c, "severity", None) == "hard"]
    if hard_conflicts:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot publish timetable: {len(hard_conflicts)} hard conflict(s) remain.")

    before = {"status": version.status, "published_at": version.published_at.isoformat() if version.published_at else None}
    now = datetime.utcnow()
    db.query(m.TtVersion).filter(
        m.TtVersion.school_id == principal.school_id,
        m.TtVersion.id != version.id,
        m.TtVersion.status == "published",
    ).update({"status": "draft"}, synchronize_session=False)
    version.status = "published"
    version.published_at = now
    if version.effective_from is None:
        version.effective_from = now

    if version.project_id is not None:
        project = db.query(m.TtProject).filter(
            m.TtProject.id == version.project_id,
            m.TtProject.school_id == principal.school_id,
        ).first()
        if project is not None:
            project.current_version_id = version.id
            project.status = "published"

    _audit(
        db,
        principal,
        "publish",
        "version",
        version.id,
        f"Published timetable version {version.number}",
        before=before,
        after={"status": "published", "published_at": now.isoformat(), "effective_from": version.effective_from.isoformat() if version.effective_from else None},
    )
    db.commit()
    db.refresh(version)
    return version

@router.post("/lessons/swap", response_model=list[s.LessonOut], name="swap_lessons")
def swap_lessons(payload: s.LessonSwapIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    if payload.lesson_id_a == payload.lesson_id_b:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select two different lessons to swap.")
    ids = [payload.lesson_id_a, payload.lesson_id_b]
    lessons = db.query(m.TtLesson).filter(m.TtLesson.school_id == principal.school_id, m.TtLesson.id.in_(ids)).all()
    by_id = {lesson.id: lesson for lesson in lessons}
    if len(by_id) != 2:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or both selected lessons were not found.")
    first, second = by_id[payload.lesson_id_a], by_id[payload.lesson_id_b]
    if first.is_locked or second.is_locked:
        raise HTTPException(status.HTTP_409_CONFLICT, "Locked lessons cannot be swapped.")
    if first.version_id != second.version_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Selected lessons must belong to the same timetable version.")
    version_id = first.version_id
    calendar = load_calendar(db, principal.school_id)
    active_days = {day.index for day in calendar.days if day.is_active}
    teaching = set(calendar.teaching_indexes)
    original = ((first, first.day_index, first.period_index), (second, second.day_index, second.period_index))
    try:
        with db.no_autoflush:
            before = detect_conflicts(db, principal.school_id, version_id)
            first.day_index, second.day_index = second.day_index, first.day_index
            first.period_index, second.period_index = second.period_index, first.period_index
            if ((first.day_index not in active_days or first.period_index not in teaching) or
                (second.day_index not in active_days or second.period_index not in teaching)):
                raise HTTPException(status.HTTP_409_CONFLICT, "The swap leaves the active timetable or teaching periods.")
            after = detect_conflicts(db, principal.school_id, version_id)
            before_hard = {(c.kind, tuple(c.lesson_ids), c.day, c.period) for c in before if c.severity == "hard"}
            new_hard = [c for c in after if c.severity == "hard" and (c.kind, tuple(c.lesson_ids), c.day, c.period) not in before_hard]
            if new_hard:
                raise HTTPException(status.HTTP_409_CONFLICT, new_hard[0].message)
            for lesson, old_day, old_period in original:
                _audit(db, principal, "swap", "lesson", lesson.id, f"Swapped lesson with {second.id if lesson.id == first.id else first.id}", before={"day_index": old_day, "period_index": old_period}, after={"day_index": lesson.day_index, "period_index": lesson.period_index})
            db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    db.refresh(first)
    db.refresh(second)
    return [first, second]

@router.post("/lessons/bulk-move", response_model=list[s.LessonOut], name="bulk_move_lessons")
def bulk_move_lessons(payload: s.BulkLessonMoveIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    ids = list(dict.fromkeys(payload.lesson_ids))
    lessons = db.query(m.TtLesson).filter(m.TtLesson.school_id == principal.school_id, m.TtLesson.id.in_(ids)).all()
    if len(lessons) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more selected lessons were not found.")
    if any(lesson.is_locked for lesson in lessons):
        raise HTTPException(status.HTTP_409_CONFLICT, "Locked lessons cannot be moved.")
    version_ids = {lesson.version_id for lesson in lessons}
    if len(version_ids) != 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "Selected lessons must belong to the same timetable version.")
    version_id = next(iter(version_ids))
    calendar = load_calendar(db, principal.school_id)
    active_days = {day.index for day in calendar.days if day.is_active}
    teaching = set(calendar.teaching_indexes)
    original = [(lesson, lesson.day_index, lesson.period_index) for lesson in lessons]
    try:
        with db.no_autoflush:
            before = detect_conflicts(db, principal.school_id, version_id)
            for lesson in lessons:
                lesson.day_index += payload.day_delta
                lesson.period_index += payload.period_delta
                if lesson.day_index not in active_days or lesson.period_index not in teaching:
                    raise HTTPException(status.HTTP_409_CONFLICT, "The grouped move leaves the active timetable or teaching periods.")
            after = detect_conflicts(db, principal.school_id, version_id)
            before_hard = {(c.kind, tuple(c.lesson_ids), c.day, c.period) for c in before if c.severity == "hard"}
            new_hard = [c for c in after if c.severity == "hard" and (c.kind, tuple(c.lesson_ids), c.day, c.period) not in before_hard]
            if new_hard:
                raise HTTPException(status.HTTP_409_CONFLICT, new_hard[0].message)
            for lesson in lessons:
                before_row = next(row for row, day, period in original if row.id == lesson.id)
                _audit(db, principal, "move", "lesson", lesson.id, f"Moved lesson by ({payload.day_delta}, {payload.period_delta})", before={"day_index": before_row.day_index, "period_index": before_row.period_index}, after={"day_index": lesson.day_index, "period_index": lesson.period_index})
            db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    for lesson in lessons:
        db.refresh(lesson)
    return lessons

@router.post("/lessons/{lesson_id}/explain", name="explain_lesson_move")
def explain_lesson_move(lesson_id: int, day_index: int, period_index: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    lesson = _owned(db, m.TtLesson, principal.school_id, lesson_id)
    return explain_move(db, principal.school_id, lesson.id, day_index, period_index)


@router.get("/lessons/{lesson_id}/suggestions", name="lesson_suggestions")
def lesson_suggestions(lesson_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    lesson = _owned(db, m.TtLesson, principal.school_id, lesson_id)
    return suggest_slots(db, principal.school_id, lesson, limit=8)
