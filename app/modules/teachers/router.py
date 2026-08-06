from typing import List
from app.core.database import get_db
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from . import crud, schemas

# Removed prefix="/teachers" to prevent double-prefix duplication with main.py
router = APIRouter(tags=["Teachers"])


@router.post("/", response_model=schemas.Teacher)
def create_teacher(teacher: schemas.TeacherCreate, db: Session = Depends(get_db)):
  return crud.create_teacher(db=db, teacher=teacher)


@router.get("/", response_model=List[schemas.Teacher])
def read_teachers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
  teachers = crud.get_teachers(db, skip=skip, limit=limit)
  return teachers


@router.get("/{teacher_id}", response_model=schemas.Teacher)
def read_teacher(teacher_id: int, db: Session = Depends(get_db)):
  if (
      db_teacher := crud.get_teacher(db, teacher_id=teacher_id)
  ) is None:
    raise HTTPException(status_code=404, detail="Teacher not found")
  return db_teacher


@router.put(
    "/{teacher_id}",
    response_model=schemas.Teacher,
    operation_id="update_teacher_by_id",
)
def update_teacher(
    teacher_id: int, teacher: schemas.TeacherCreate, db: Session = Depends(get_db)
):
  db_teacher = crud.update_teacher(db=db, teacher_id=teacher_id, teacher=teacher)
  if db_teacher is None:
    raise HTTPException(status_code=404, detail="Teacher not found")
  return db_teacher


@router.delete(
    "/{teacher_id}",
    response_model=schemas.Teacher,
    operation_id="delete_teacher_by_id",
)
def delete_teacher(teacher_id: int, db: Session = Depends(get_db)):
  db_teacher = crud.delete_teacher(db=db, teacher_id=teacher_id)
  if db_teacher is None:
    raise HTTPException(status_code=404, detail="Teacher not found")
  return db_teacher


@router.post(
    "/{teacher_id}/qualifications",
    response_model=schemas.Qualification,
    operation_id="create_teacher_qualification",
)
def create_qualification(
    teacher_id: int,
    qualification: schemas.QualificationCreate,
    db: Session = Depends(get_db),
):
  if crud.get_teacher(db, teacher_id=teacher_id) is None:
    raise HTTPException(status_code=404, detail="Teacher not found")
  return crud.create_teacher_qualification(
      db=db, qualification=qualification, teacher_id=teacher_id
  )


@router.get(
    "/{teacher_id}/qualifications",
    response_model=List[schemas.Qualification],
    operation_id="read_teacher_qualifications",
)
def read_qualifications(teacher_id: int, db: Session = Depends(get_db)):
  if crud.get_teacher(db, teacher_id=teacher_id) is None:
    raise HTTPException(status_code=404, detail="Teacher not found")
  return crud.get_teacher_qualifications(db=db, teacher_id=teacher_id)


@router.post(
    "/{teacher_id}/availabilities",
    response_model=schemas.Availability,
    operation_id="create_teacher_availability",
)
def create_availability(
    teacher_id: int,
    availability: schemas.AvailabilityCreate,
    db: Session = Depends(get_db),
):
  if crud.get_teacher(db, teacher_id=teacher_id) is None:
    raise HTTPException(status_code=404, detail="Teacher not found")
  return crud.create_teacher_availability(
      db=db, availability=availability, teacher_id=teacher_id
  )


@router.get(
    "/{teacher_id}/availabilities",
    response_model=List[schemas.Availability],
    operation_id="read_teacher_availabilities",
)
def read_availabilities(teacher_id: int, db: Session = Depends(get_db)):
  if crud.get_teacher(db, teacher_id=teacher_id) is None:
    raise HTTPException(status_code=404, detail="Teacher not found")
  return crud.get_teacher_availabilities(db=db, teacher_id=teacher_id)