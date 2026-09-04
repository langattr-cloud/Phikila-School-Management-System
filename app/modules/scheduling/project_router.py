"""Generic timetable project management over shared school resources."""
from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import jobs as job_queue
from . import models as m
from . import schemas as s
from .solver import ORTOOLS_AVAILABLE
from .tenancy import Principal, require_role, resolve_principal

router = APIRouter()

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    academic_year_id: int | None = None
    term_id: int | None = None

class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = None
    academic_year_id: int | None = None
    term_id: int | None = None
    status: str | None = None

class ProjectGenerate(BaseModel):
    max_seconds: float = Field(default=30, ge=1, le=180)
    timetable_type_id: int | None = None
    class_ids: list[int] | None = None
    teacher_ids: list[int] | None = None
    period_indexes: list[int] | None = None
    label: str | None = None


def _owned(db, principal, ident):
    row = db.query(m.TtProject).filter(m.TtProject.id == ident, m.TtProject.school_id == principal.school_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Timetable project not found.")
    return row

@router.get("/projects", response_model=list[s.ProjectOut])
def list_projects(db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    return db.query(m.TtProject).filter(m.TtProject.school_id == principal.school_id).order_by(m.TtProject.updated_at.desc(), m.TtProject.id.desc()).all()

@router.post("/projects", response_model=s.ProjectOut, status_code=201)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    row = m.TtProject(school_id=principal.school_id, created_by=principal.email or principal.user_id, **payload.model_dump())
    db.add(row)
    try: db.commit()
    except Exception:
        db.rollback(); raise HTTPException(status.HTTP_409_CONFLICT, "A timetable project with that name already exists.")
    db.refresh(row)
    return row

@router.get("/projects/{project_id}", response_model=s.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    return _owned(db, principal, project_id)

@router.put("/projects/{project_id}", response_model=s.ProjectOut)
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    row = _owned(db, principal, project_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "status" and value not in {"draft", "published", "archived"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid project status.")
        setattr(row, key, value)
    try: db.commit()
    except Exception:
        db.rollback(); raise HTTPException(status.HTTP_409_CONFLICT, "A timetable project with that name already exists.")
    db.refresh(row); return row

@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    row = _owned(db, principal, project_id)
    db.delete(row); db.commit()

@router.post("/projects/{project_id}/clone", response_model=s.ProjectOut, status_code=201)
def clone_project(project_id: int, payload: ProjectCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    source = _owned(db, principal, project_id)
    target = m.TtProject(school_id=principal.school_id, name=payload.name, description=payload.description if payload.description is not None else source.description, academic_year_id=payload.academic_year_id if payload.academic_year_id is not None else source.academic_year_id, term_id=payload.term_id if payload.term_id is not None else source.term_id, created_by=principal.email or principal.user_id)
    db.add(target); db.flush()
    source_version = None
    if source.current_version_id:
        source_version = db.query(m.TtVersion).filter(m.TtVersion.id == source.current_version_id, m.TtVersion.school_id == principal.school_id).first()
    if source_version:
        new_version = m.TtVersion(school_id=principal.school_id, project_id=target.id, number=1, name=source_version.name, label=source_version.label, status="draft", quality=source_version.quality or {}, stats=source_version.stats or {}, created_by=principal.email or principal.user_id, day_indexes=source_version.day_indexes or [], day_names=source_version.day_names or [], display_mode=source_version.display_mode, timetable_type_id=source_version.timetable_type_id)
        db.add(new_version); db.flush()
        for lesson in source_version.lessons:
            db.add(m.TtLesson(school_id=principal.school_id, version_id=new_version.id, requirement_id=lesson.requirement_id, class_id=lesson.class_id, subject_id=lesson.subject_id, teacher_id=lesson.teacher_id, room_id=lesson.room_id, day_index=lesson.day_index, period_index=lesson.period_index, duration=lesson.duration, is_locked=lesson.is_locked))
        target.current_version_id = new_version.id
    db.commit(); db.refresh(target); return target

@router.get("/projects/{project_id}/versions", response_model=list[s.VersionOut])
def project_versions(project_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    _owned(db, principal, project_id)
    return db.query(m.TtVersion).filter(m.TtVersion.school_id == principal.school_id, m.TtVersion.project_id == project_id).order_by(m.TtVersion.number.desc(), m.TtVersion.id.desc()).all()

@router.get("/projects/{project_id}/current", response_model=s.VersionOut | None)
def project_current(project_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    project = _owned(db, principal, project_id)
    if project.current_version_id:
        return db.query(m.TtVersion).filter(m.TtVersion.id == project.current_version_id, m.TtVersion.school_id == principal.school_id).first()
    return db.query(m.TtVersion).filter(m.TtVersion.project_id == project_id, m.TtVersion.school_id == principal.school_id).order_by(m.TtVersion.id.desc()).first()

@router.post("/projects/{project_id}/generate", response_model=s.JobOut, status_code=202)
def project_generate(project_id: int, payload: ProjectGenerate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    project = _owned(db, principal, project_id)
    if project.status == "archived": raise HTTPException(status.HTTP_409_CONFLICT, "Archived timetable projects cannot be generated.")
    if not ORTOOLS_AVAILABLE: raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The scheduling engine is not available on this server.")
    active = db.query(m.TtSolverJob).filter(m.TtSolverJob.school_id == principal.school_id, m.TtSolverJob.status.in_(["queued","running","optimizing","validating"])).first()
    if active: raise HTTPException(status.HTTP_409_CONFLICT, "A timetable is already being generated.")
    tt = None
    if payload.timetable_type_id:
        tt = db.query(m.TtTimetableType).filter(m.TtTimetableType.id == payload.timetable_type_id, m.TtTimetableType.school_id == principal.school_id).first()
    if tt is None:
        tt = db.query(m.TtTimetableType).filter(m.TtTimetableType.school_id == principal.school_id, m.TtTimetableType.is_active.is_(True)).order_by(m.TtTimetableType.id.desc()).first()
    if tt is None: raise HTTPException(status.HTTP_400_BAD_REQUEST, "Configure a timetable type before generating.")
    days = sorted(set(int(i) for i in (tt.day_indexes or []))); periods = sorted(set(int(i) for i in (tt.period_indexes or [])))
    if not days or not periods: raise HTTPException(status.HTTP_400_BAD_REQUEST, "The timetable configuration must contain at least one day and period.")
    day_names = {int(d.index): str(d.name) for d in db.query(m.TtDay).filter(m.TtDay.school_id == principal.school_id).all() if int(d.index) in days}
    config = {"project_id": project.id, "label": payload.label or project.name, "timetable_type_id": tt.id, "display_mode": tt.display_mode, "day_indexes": days, "day_names": day_names, "class_ids": payload.class_ids, "teacher_ids": payload.teacher_ids, "period_indexes": periods}
    job = job_queue.create_job(db, principal.school_id, principal.email, config); job_queue.enqueue(job.id, principal.school_id, payload.max_seconds, days); db.refresh(job); return job
