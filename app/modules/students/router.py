from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.students.schemas import StudentCreate, StudentResponse
from app.modules.students import services, repository

router = APIRouter(prefix="/students", tags=["Students"])


@router.post("/", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
def admit_student(student_data: StudentCreate, db: Session = Depends(get_db)):
  return services.admit_new_student(db=db, student_data=student_data)


@router.get("/", response_model=List[StudentResponse])
def list_students(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
  return repository.get_students(db=db, skip=skip, limit=limit)