from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.modules.students.schemas import StudentCreate
from app.modules.students import repository


def admit_new_student(db: Session, student_data: StudentCreate):
  existing_student = repository.get_student_by_admission_number(
      db, student_data.admission_number
  )
  if existing_student:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Student with admission number {student_data.admission_number} already exists.",
    )
  return repository.create_student_with_guardians(db, student_data)