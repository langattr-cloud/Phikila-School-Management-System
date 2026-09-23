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
from .engine import DEFAULT_DAYS, _blockers, _name_lookup, assign_rooms_to_lessons, detect_conflicts, explain_move, load_calendar, normalize_period_scope, suggest_slots
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

def _owned_version(db: Session, principal: Principal, version_id: int):
    return _owned(db, m.TtVersion, principal.school_id, version_id)

def _owned_lesson(db: Session, principal: Principal, lesson_id: int):
    row = db.query(m.TtLesson).filter(
        m.TtLesson.id == lesson_id,
        m.TtLesson.school_id == principal.school_id,
    ).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
    return row

def _version_requirements(db: Session, version: m.TtVersion, school_id: int):
    """Return only lesson requirements applicable to this timetable version."""
    query = db.query(m.TtLessonRequirement).join(
        m.TtClass, m.TtClass.id == m.TtLessonRequirement.class_id
    ).filter(
        m.TtLessonRequirement.school_id == school_id,
        m.TtClass.school_id == school_id,
    )
    if version.project_id is not None:
        project = db.query(m.TtProject).filter(
            m.TtProject.id == version.project_id,
            m.TtProject.school_id == school_id,
        ).first()
        if project is not None and project.academic_year_id is not None:
            query = query.filter(m.TtClass.academic_year_id == project.academic_year_id)
    return query.all()

def _ensure_editable_version(version: m.TtVersion) -> None:
    if version.status == "published":
        raise HTTPException(status.HTTP_409_CONFLICT, "Published timetables are read-only. Restore the version as a draft before editing.")

def _duplicate_lesson(db: Session, principal: Principal, lesson: m.TtLesson) -> m.TtLesson:
    options = suggest_slots(db, principal.school_id, lesson, limit=1)
    if not options:
        raise HTTPException(status.HTTP_409_CONFLICT, "No available slot exists for this lesson.")
    target = options[0]
    copy = m.TtLesson(
        school_id=principal.school_id,
        version_id=lesson.version_id,
        requirement_id=lesson.requirement_id,
        class_id=lesson.class_id,
        subject_id=lesson.subject_id,
        teacher_id=lesson.teacher_id,
        room_id=lesson.room_id,
        day_index=target["day"],
        period_index=target["period"],
        duration=lesson.duration,
        is_locked=False,
    )
    db.add(copy)
    db.flush()
    _audit(
        db, principal, "duplicate", "lesson", copy.id,
        f"Duplicated lesson {lesson.id} to day {copy.day_index}, period {copy.period_index}",
        before={"source_id": lesson.id},
        after={"id": copy.id, "day_index": copy.day_index, "period_index": copy.period_index},
    )
    return copy

@router.post("/lessons/{lesson_id}/duplicate", response_model=s.LessonOut, status_code=201, name="duplicate_lesson")
def duplicate_lesson(lesson_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    lesson = _owned_lesson(db, principal, lesson_id)
    version = _owned_version(db, principal, lesson.version_id)
    _ensure_editable_version(version)
    try:
        copy = _duplicate_lesson(db, principal, lesson)
        db.commit()
        db.refresh(copy)
        return copy
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Lesson could not be duplicated.")

@router.post("/lessons/{lesson_id}/delete", status_code=204, name="delete_lesson")
def delete_lesson(lesson_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    lesson = _owned_lesson(db, principal, lesson_id)
    version = _owned_version(db, principal, lesson.version_id)
    _ensure_editable_version(version)
    _audit(db, principal, "delete", "lesson", lesson.id, f"Deleted lesson {lesson.id}")
    db.delete(lesson)
    db.commit()

@router.post("/versions/{version_id}/lessons/bulk-duplicate", response_model=list[s.LessonOut], status_code=201, name="bulk_duplicate_lessons")
def bulk_duplicate_lessons(version_id: int, payload: s.BulkLessonIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    version = _owned_version(db, principal, version_id)
    _ensure_editable_version(version)
    ids = list(dict.fromkeys(int(i) for i in payload.lesson_ids))
    lessons = db.query(m.TtLesson).filter(
        m.TtLesson.school_id == principal.school_id,
        m.TtLesson.version_id == version.id,
        m.TtLesson.id.in_(ids),
    ).order_by(m.TtLesson.id).all()
    if len(lessons) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more selected lessons were not found in this timetable version.")
    try:
        copies = [_duplicate_lesson(db, principal, lesson) for lesson in lessons]
        db.commit()
        for copy in copies:
            db.refresh(copy)
        return copies
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Bulk lesson duplication failed; no changes were applied.")

@router.post("/versions/{version_id}/lessons/bulk-delete", status_code=204, name="bulk_delete_lessons")
def bulk_delete_lessons(version_id: int, payload: s.BulkLessonIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    version = _owned_version(db, principal, version_id)
    _ensure_editable_version(version)
    ids = list(dict.fromkeys(int(i) for i in payload.lesson_ids))
    lessons = db.query(m.TtLesson).filter(
        m.TtLesson.school_id == principal.school_id,
        m.TtLesson.version_id == version.id,
        m.TtLesson.id.in_(ids),
    ).all()
    if len(lessons) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more selected lessons were not found in this timetable version.")
    try:
        for lesson in lessons:
            _audit(db, principal, "delete", "lesson", lesson.id, f"Bulk deleted lesson {lesson.id}")
            db.delete(lesson)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Bulk lesson deletion failed; no changes were applied.")

@router.post("/versions/{version_id}/lessons/bulk-lock", status_code=204, name="bulk_lock_lessons")
def bulk_lock_lessons(version_id: int, payload: s.BulkLessonLockIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    version = _owned_version(db, principal, version_id)
    _ensure_editable_version(version)
    ids = list(dict.fromkeys(int(i) for i in payload.lesson_ids))
    lessons = db.query(m.TtLesson).filter(
        m.TtLesson.school_id == principal.school_id,
        m.TtLesson.version_id == version.id,
        m.TtLesson.id.in_(ids),
    ).all()
    if len(lessons) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more selected lessons were not found in this timetable version.")
    try:
        for lesson in lessons:
            previous = bool(lesson.is_locked)
            lesson.is_locked = payload.locked
            action = "lock" if payload.locked else "unlock"
            state = "locked" if payload.locked else "unlocked"
            _audit(db, principal, action, "lesson", lesson.id, f"Bulk {state} lesson {lesson.id}",
                   before={"is_locked": previous}, after={"is_locked": bool(payload.locked)})
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Bulk lesson lock update failed; no changes were applied.")

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
_crud("constraints", m.TtConstraint, s.ConstraintIn, s.ConstraintOut, "constraint")
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
    config=payload.model_dump(exclude_none=True)
    if payload.timetable_type_id is not None:
        timetable_type=_owned(db,m.TtTimetableType,principal.school_id,payload.timetable_type_id)
        if not timetable_type.is_active: raise HTTPException(status.HTTP_409_CONFLICT,"The selected timetable type is inactive.")
        calendar=load_calendar(db,principal.school_id)
        configured_days={d.index for d in calendar.days if d.is_active}
        requested_days=list(dict.fromkeys(int(i) for i in (timetable_type.day_indexes or [])))
        if not requested_days or any(i not in configured_days for i in requested_days):
            raise HTTPException(status.HTTP_409_CONFLICT,"The selected timetable type contains a day that is not active in the school calendar.")
        try:
            normalized_periods=normalize_period_scope(calendar,list(timetable_type.period_indexes or []))
        except ValueError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT,str(exc)) from exc
        config.setdefault("day_indexes", requested_days)
        config.setdefault("period_indexes", normalized_periods)
        config.setdefault("display_mode", timetable_type.display_mode or "day")
    if payload.project_id is not None: _owned(db,m.TtProject,principal.school_id,payload.project_id)
    for ids,model,label in ((payload.class_ids,m.TtClass,"class"),(payload.teacher_ids,m.TtTeacher,"teacher")):
        if ids:
            owned=db.query(model.id).filter(model.school_id==principal.school_id,model.id.in_(ids)).all()
            if len(owned)!=len(set(ids)): raise HTTPException(status.HTTP_404_NOT_FOUND,f"One or more selected {label}s were not found.")
    job=job_queue.create_job(db,principal.school_id,principal.email,config=config); job_queue.enqueue(job.id,principal.school_id,payload.max_seconds); return job
@router.get("/versions/{version_id}/validate",response_model=s.ValidationSummaryOut,name="validate_version")
def validate_version(version_id:int,db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    version=_owned_version(db,principal,version_id)
    conflicts=detect_conflicts(db,principal.school_id,version.id)
    hard=sum(1 for item in conflicts if item.severity=="hard")
    soft=len(conflicts)-hard
    requirements=_version_requirements(db, version, principal.school_id)
    placed=db.query(m.TtLesson).filter(m.TtLesson.school_id==principal.school_id,m.TtLesson.version_id==version.id).all()
    counts={}
    for lesson in placed:
        if lesson.requirement_id is not None: counts[int(lesson.requirement_id)]=counts.get(int(lesson.requirement_id),0)+1
    unassigned=sum(max(0,int(req.periods_per_week or 1)-counts.get(int(req.id),0)) for req in requirements)
    calendar=load_calendar(db,principal.school_id)
    selected_periods=set(calendar.teaching_indexes)
    missing_periods=sum(1 for req in requirements if (req.periods_per_week or 1)>0 and not selected_periods)
    valid=hard==0 and unassigned==0 and missing_periods==0
    message="Timetable is valid and ready for publication." if valid else f"Validation found {hard} hard conflict(s), {unassigned} unassigned lesson slot(s), and {missing_periods} missing period scope issue(s)."
    return {"valid":valid,"hard_conflicts":hard,"soft_conflicts":soft,"unassigned_requirements":unassigned,"missing_periods":missing_periods,"message":message}

@router.post("/versions/{version_id}/assign-rooms",response_model=dict,name="assign_rooms")
def assign_rooms(version_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    version=_owned_version(db,principal,version_id)
    _ensure_editable_version(version)
    room_count=db.query(m.TtRoom).filter(m.TtRoom.school_id==principal.school_id,m.TtRoom.is_active.is_(True)).count()
    if room_count==0:
        raise HTTPException(status.HTTP_409_CONFLICT,"No classrooms are configured. Add classrooms before assigning rooms.")
    assigned=assign_rooms_to_lessons(db,principal.school_id,version.id)
    _audit(db,principal,"assign_rooms","version",version.id,f"Assigned rooms to {assigned} lessons",after={"assigned":assigned,"room_count":room_count})
    db.commit()
    return {"assigned":assigned,"room_count":room_count}

@router.get("/versions/{version_id}/conflicts",response_model=s.ConflictSummaryOut,name="version_conflicts")
def version_conflicts(version_id:int,db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    version=_owned_version(db,principal,version_id)
    conflicts=detect_conflicts(db,principal.school_id,version.id)
    hard=sum(1 for item in conflicts if item.severity=="hard")
    return {"total":len(conflicts),"hard":hard,"soft":len(conflicts)-hard,"conflicts":[item.as_dict() for item in conflicts]}

@router.patch("/lessons/{lesson_id}",response_model=s.LessonOut,name="update_lesson")
def update_lesson(lesson_id:int,payload:s.LessonUpdateIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    lesson=_owned_lesson(db,principal,lesson_id)
    version=_owned_version(db,principal,lesson.version_id)
    _ensure_editable_version(version)
    if lesson.is_locked and (payload.day_index is not None or payload.period_index is not None or payload.duration is not None):
        raise HTTPException(status.HTTP_409_CONFLICT,"Locked lessons cannot be moved or resized. Unlock the lesson first.")
    day=lesson.day_index if payload.day_index is None else payload.day_index
    period=lesson.period_index if payload.period_index is None else payload.period_index
    duration=lesson.duration if payload.duration is None else payload.duration
    reasons=_blockers(db,principal.school_id,lesson,day,period,duration=duration)
    if reasons:
        raise HTTPException(status.HTTP_409_CONFLICT,detail={"message":"Lesson move or resize is blocked.","reasons":reasons})
    before={"day_index":lesson.day_index,"period_index":lesson.period_index,"duration":lesson.duration}
    lesson.day_index=day; lesson.period_index=period; lesson.duration=duration
    _audit(db,principal,"update","lesson",lesson.id,"Moved/resized lesson",before=before,after={"day_index":day,"period_index":period,"duration":duration})
    try:
        db.commit(); db.refresh(lesson); return lesson
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT,"Lesson update failed; no changes were applied.")

@router.post("/lessons/{lesson_id}/explain",response_model=s.Explanation,name="explain_lesson_move")
def explain_lesson_move(lesson_id:int,payload:s.ExplainIn,db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    lesson=_owned_lesson(db,principal,lesson_id)
    _owned_version(db,principal,lesson.version_id)
    return explain_move(db,principal.school_id,lesson.id,payload.day_index,payload.period_index)

@router.get("/solver/jobs/active",response_model=s.JobOut|None)
def active_job(db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    return db.query(m.TtSolverJob).filter(
        m.TtSolverJob.school_id==principal.school_id,
        m.TtSolverJob.status.in_(["queued","running","optimizing","validating"]),
    ).order_by(m.TtSolverJob.id.desc()).first()

@router.post("/solver/generate-async",response_model=s.JobOut,status_code=202)
def generate_async(payload:s.GenerateIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    return generate(payload,db,principal)

@router.post("/solver/generate-profile",response_model=s.JobOut,status_code=202)
def generate_profile(payload:s.GenerateProfileIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    return generate(payload,db,principal)

@router.get("/solver/jobs/{job_id}",response_model=s.JobOut)
def job_status(job_id:int,db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)): return _owned(db,m.TtSolverJob,principal.school_id,job_id)
@router.post("/solver/jobs/{job_id}/cancel",response_model=s.JobOut)
def cancel_job(job_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    job=_owned(db,m.TtSolverJob,principal.school_id,job_id)
    if job.status in {"completed","failed","cancelled"}: return job
    job.cancel_requested=True; db.commit(); db.refresh(job); return job
@router.get("/versions",response_model=list[s.VersionOut])
def list_versions(db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    query=db.query(m.TtVersion).filter(m.TtVersion.school_id==principal.school_id).order_by(m.TtVersion.id.desc())
    if not principal.at_least("scheduler"):
        query=query.filter(m.TtVersion.status=="published")
    return query.all()
@router.post("/versions/{version_id}/restore", response_model=s.VersionOut, name="restore_version")
def restore_version(version_id:int, db:Session=Depends(get_db), principal:Principal=Depends(require_role("admin","scheduler"))):
    version=_owned_version(db,principal,version_id)
    if version.status=="published":
        return version
    before={"status":version.status}
    version.status="draft"
    _audit(db,principal,"restore","version",version.id,f"Restored timetable version {version.number} as draft",before=before,after={"status":"draft"})
    db.commit(); db.refresh(version)
    return version

@router.delete("/versions/{version_id}", status_code=204, name="delete_version")
def delete_version(version_id:int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin","scheduler"))):
    version=_owned_version(db,principal,version_id)
    if version.status=="published":
        raise HTTPException(status.HTTP_409_CONFLICT,"Published timetables cannot be deleted.")
    if version.project_id is not None:
        project = db.query(m.TtProject).filter(
            m.TtProject.id == version.project_id,
            m.TtProject.school_id == principal.school_id,
        ).first()
        if project is not None and project.current_version_id == version.id:
            replacement = db.query(m.TtVersion).filter(
                m.TtVersion.school_id == principal.school_id,
                m.TtVersion.project_id == project.id,
                m.TtVersion.id != version.id,
            ).order_by(m.TtVersion.id.desc()).first()
            project.current_version_id = replacement.id if replacement else None
            if replacement is None:
                project.status = "draft"
    _audit(db,principal,"delete","version",version.id,f"Deleted timetable version {version.number}")
    db.delete(version); db.commit()

@router.get("/versions/current",response_model=s.VersionOut | None,name="current_version")
def current_version(db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    query=db.query(m.TtVersion).filter(m.TtVersion.school_id==principal.school_id)
    if not principal.at_least("scheduler"):
        query=query.filter(m.TtVersion.status=="published")
    return query.order_by(m.TtVersion.id.desc()).first()

@router.post("/versions/{version_id}/publish", response_model=s.VersionOut, name="publish_version")
def publish_version(version_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    """Validate and publish a generated timetable for the caller's school."""
    version = _owned(db, m.TtVersion, principal.school_id, version_id)
    if version.status == "published":
        raise HTTPException(status.HTTP_409_CONFLICT, "This timetable version is already published.")
    conflicts = detect_conflicts(db, principal.school_id, version.id)
    hard_conflicts = [c for c in conflicts if getattr(c, "severity", None) == "hard"]
    if hard_conflicts:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot publish timetable: {len(hard_conflicts)} hard conflict(s) remain.")
    requirements=_version_requirements(db, version, principal.school_id)
    placed=db.query(m.TtLesson).filter(m.TtLesson.school_id==principal.school_id,m.TtLesson.version_id==version.id).all()
    counts={}
    for lesson in placed:
        if lesson.requirement_id is not None:
            counts[int(lesson.requirement_id)]=counts.get(int(lesson.requirement_id),0)+1
    unassigned=sum(max(0,int(req.periods_per_week or 1)-counts.get(int(req.id),0)) for req in requirements)
    if unassigned:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot publish timetable: {unassigned} lesson slot(s) remain unassigned.")

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
