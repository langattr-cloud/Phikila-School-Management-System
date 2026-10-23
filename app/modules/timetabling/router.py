"""School-scoped CRUD for the rebuilt timetable module.

Every read/write resolves the caller's school from verified membership, never from
request input. Child resources are reachable only through an owned project.
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.platform.tenancy import Principal, require_role
from app.modules.academics.models import AcademicYear, SchoolClass
from app.modules.timetabling.models import (
    TimetableProject, TimetablePeriod, TimetableLessonRequirement, TimetableConstraint,
)
from app.modules.timetabling.schemas import (
    TimetableProjectCreate, TimetableProjectUpdate, TimetableProjectRead,
    PeriodCreate, PeriodUpdate, PeriodRead,
    LessonRequirementCreate, LessonRequirementUpdate, LessonRequirementRead,
    ConstraintCreate, ConstraintUpdate, ConstraintRead,
)

router = APIRouter(prefix="/api/timetabling", tags=["timetabling"])
READ_ROLES = ("viewer", "teacher", "scheduler", "admin", "super_admin")
WRITE_ROLES = ("scheduler", "admin", "super_admin")


def _project(db: Session, school_id: int, project_id: int) -> TimetableProject:
    row = db.query(TimetableProject).filter(
        TimetableProject.id == project_id,
        TimetableProject.school_id == school_id,
    ).first()
    if row is None:
        # Same response for missing and other-school IDs prevents tenant probing.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Timetable project not found.")
    return row


def _child(db: Session, model, school_id: int, project_id: int, child_id: int):
    _project(db, school_id, project_id)
    row = db.query(model).filter(model.id == child_id, model.project_id == project_id).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Timetable resource not found.")
    return row


def _validate_project_context(db: Session, school_id: int, academic_year_id: int):
    year = db.query(AcademicYear).filter(
        AcademicYear.id == academic_year_id,
        AcademicYear.school_id == school_id,
    ).first()
    if year is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Academic year does not belong to this school.")


def _validate_class_context(db: Session, school_id: int, class_id: int, academic_year_id: int):
    school_class = db.query(SchoolClass).filter(
        SchoolClass.id == class_id,
        SchoolClass.school_id == school_id,
        SchoolClass.academic_year_id == academic_year_id,
    ).first()
    if school_class is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Class does not belong to this school and academic year.")


def _values(payload):
    return payload.model_dump(exclude_unset=True, exclude_none=True)


@router.get("/contract")
def get_timetabling_contract(principal: Principal = Depends(require_role(*READ_ROLES))):
    return {
        "module": "timetabling", "phase": 2,
        "persistence_ready": True, "generation_ready": False,
        "supported_contracts": ["project", "period", "lesson_requirement", "constraint"],
        "schedule_states": ["draft", "validated", "approved", "published", "archived"],
    }


@router.post("/projects", response_model=TimetableProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: TimetableProjectCreate, db: Session = Depends(get_db),
                   principal: Principal = Depends(require_role(*WRITE_ROLES))):
    _validate_project_context(db, principal.school_id, payload.academic_year_id)
    row = TimetableProject(school_id=principal.school_id, **_values(payload))
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.get("/projects", response_model=list[TimetableProjectRead])
def list_projects(db: Session = Depends(get_db),
                  principal: Principal = Depends(require_role(*READ_ROLES))):
    return db.query(TimetableProject).filter(
        TimetableProject.school_id == principal.school_id
    ).order_by(TimetableProject.id.desc()).all()


@router.get("/projects/{project_id}", response_model=TimetableProjectRead)
def get_project(project_id: int, db: Session = Depends(get_db),
                principal: Principal = Depends(require_role(*READ_ROLES))):
    return _project(db, principal.school_id, project_id)


@router.patch("/projects/{project_id}", response_model=TimetableProjectRead)
def update_project(project_id: int, payload: TimetableProjectUpdate, db: Session = Depends(get_db),
                   principal: Principal = Depends(require_role(*WRITE_ROLES))):
    row = _project(db, principal.school_id, project_id)
    values = _values(payload)
    year_id = values.get("academic_year_id", row.academic_year_id)
    _validate_project_context(db, principal.school_id, year_id)
    for key, value in values.items():
        setattr(row, key, value)
    if row.ends_on < row.starts_on:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "ends_on must be on or after starts_on.")
    db.commit(); db.refresh(row)
    return row


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db),
                   principal: Principal = Depends(require_role(*WRITE_ROLES))):
    row = _project(db, principal.school_id, project_id)
    db.delete(row); db.commit()


@router.post("/projects/{project_id}/periods", response_model=PeriodRead, status_code=201)
def create_period(project_id: int, payload: PeriodCreate, db: Session = Depends(get_db),
                  principal: Principal = Depends(require_role(*WRITE_ROLES))):
    _project(db, principal.school_id, project_id)
    row = TimetablePeriod(project_id=project_id, **_values(payload))
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.get("/projects/{project_id}/periods", response_model=list[PeriodRead])
def list_periods(project_id: int, db: Session = Depends(get_db),
                 principal: Principal = Depends(require_role(*READ_ROLES))):
    _project(db, principal.school_id, project_id)
    return db.query(TimetablePeriod).filter(TimetablePeriod.project_id == project_id).order_by(
        TimetablePeriod.day_of_week, TimetablePeriod.period_number).all()


@router.patch("/projects/{project_id}/periods/{item_id}", response_model=PeriodRead)
def update_period(project_id: int, item_id: int, payload: PeriodUpdate, db: Session = Depends(get_db),
                  principal: Principal = Depends(require_role(*WRITE_ROLES))):
    row = _child(db, TimetablePeriod, principal.school_id, project_id, item_id)
    for key, value in _values(payload).items(): setattr(row, key, value)
    if row.ends_at <= row.starts_at:
        raise HTTPException(422, "ends_at must be later than starts_at.")
    db.commit(); db.refresh(row)
    return row


@router.delete("/projects/{project_id}/periods/{item_id}", status_code=204)
def delete_period(project_id: int, item_id: int, db: Session = Depends(get_db),
                  principal: Principal = Depends(require_role(*WRITE_ROLES))):
    row = _child(db, TimetablePeriod, principal.school_id, project_id, item_id)
    db.delete(row); db.commit()


@router.post("/projects/{project_id}/requirements", response_model=LessonRequirementRead, status_code=201)
def create_requirement(project_id: int, payload: LessonRequirementCreate, db: Session = Depends(get_db),
                       principal: Principal = Depends(require_role(*WRITE_ROLES))):
    project = _project(db, principal.school_id, project_id)
    _validate_class_context(db, principal.school_id, payload.class_id, project.academic_year_id)
    row = TimetableLessonRequirement(project_id=project_id, **_values(payload))
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.get("/projects/{project_id}/requirements", response_model=list[LessonRequirementRead])
def list_requirements(project_id: int, db: Session = Depends(get_db),
                      principal: Principal = Depends(require_role(*READ_ROLES))):
    _project(db, principal.school_id, project_id)
    return db.query(TimetableLessonRequirement).filter(
        TimetableLessonRequirement.project_id == project_id
    ).order_by(TimetableLessonRequirement.id).all()


@router.patch("/projects/{project_id}/requirements/{item_id}", response_model=LessonRequirementRead)
def update_requirement(project_id: int, item_id: int, payload: LessonRequirementUpdate,
                       db: Session = Depends(get_db), principal: Principal = Depends(require_role(*WRITE_ROLES))):
    project = _project(db, principal.school_id, project_id)
    row = _child(db, TimetableLessonRequirement, principal.school_id, project_id, item_id)
    values = _values(payload)
    _validate_class_context(db, principal.school_id, values.get("class_id", row.class_id), project.academic_year_id)
    merged = {
        "fixed_day": values.get("fixed_day", row.fixed_day),
        "fixed_period": values.get("fixed_period", row.fixed_period),
        "teacher_ids": values.get("teacher_ids", row.teacher_ids),
    }
    if (merged["fixed_day"] is None) != (merged["fixed_period"] is None):
        raise HTTPException(422, "fixed_day and fixed_period must be provided together.")
    if len(set(merged["teacher_ids"])) != len(merged["teacher_ids"]):
        raise HTTPException(422, "teacher_ids must not contain duplicates.")
    for key, value in values.items(): setattr(row, key, value)
    db.commit(); db.refresh(row)
    return row


@router.delete("/projects/{project_id}/requirements/{item_id}", status_code=204)
def delete_requirement(project_id: int, item_id: int, db: Session = Depends(get_db),
                       principal: Principal = Depends(require_role(*WRITE_ROLES))):
    row = _child(db, TimetableLessonRequirement, principal.school_id, project_id, item_id)
    db.delete(row); db.commit()


@router.post("/projects/{project_id}/constraints", response_model=ConstraintRead, status_code=201)
def create_constraint(project_id: int, payload: ConstraintCreate, db: Session = Depends(get_db),
                      principal: Principal = Depends(require_role(*WRITE_ROLES))):
    _project(db, principal.school_id, project_id)
    row = TimetableConstraint(project_id=project_id, **_values(payload))
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.get("/projects/{project_id}/constraints", response_model=list[ConstraintRead])
def list_constraints(project_id: int, db: Session = Depends(get_db),
                     principal: Principal = Depends(require_role(*READ_ROLES))):
    _project(db, principal.school_id, project_id)
    return db.query(TimetableConstraint).filter(
        TimetableConstraint.project_id == project_id
    ).order_by(TimetableConstraint.code).all()


@router.patch("/projects/{project_id}/constraints/{item_id}", response_model=ConstraintRead)
def update_constraint(project_id: int, item_id: int, payload: ConstraintUpdate, db: Session = Depends(get_db),
                      principal: Principal = Depends(require_role(*WRITE_ROLES))):
    row = _child(db, TimetableConstraint, principal.school_id, project_id, item_id)
    values = _values(payload)
    hardness = values.get("hardness", row.hardness)
    weight = values.get("weight", row.weight)
    if hardness == "hard" and weight != 1:
        raise HTTPException(422, "Hard constraints use weight=1; weights apply to soft constraints.")
    for key, value in values.items(): setattr(row, key, value)
    db.commit(); db.refresh(row)
    return row


@router.delete("/projects/{project_id}/constraints/{item_id}", status_code=204)
def delete_constraint(project_id: int, item_id: int, db: Session = Depends(get_db),
                      principal: Principal = Depends(require_role(*WRITE_ROLES))):
    row = _child(db, TimetableConstraint, principal.school_id, project_id, item_id)
    db.delete(row); db.commit()
