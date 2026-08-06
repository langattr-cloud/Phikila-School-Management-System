from sqlalchemy.orm import Session
from app.modules.students.models import Student, Guardian
from app.modules.students.schemas import StudentCreate


def get_student_by_admission_number(db: Session, admission_number: str):
  return db.query(Student).filter(Student.admission_number == admission_number).first()


def get_students(db: Session, skip: int = 0, limit: int = 100):
  return db.query(Student).offset(skip).limit(limit).all()


def create_student_with_guardians(db: Session, student_data: StudentCreate):
  # Extract guardian data
  guardians_data = student_data.guardians
  student_dict = student_data.dict(exclude={"guardians"})

  # Create student instance
  db_student = Student(**student_dict)
  db.add(db_student)
  db.commit()
  db.refresh(db_student)

  # Create associated guardians
  for guardian in guardians_data:
    db_guardian = Guardian(**guardian.dict(), student_id=db_student.id)
    db.add(db_guardian)
  
  db.commit()
  db.refresh(db_student)
  return db_student