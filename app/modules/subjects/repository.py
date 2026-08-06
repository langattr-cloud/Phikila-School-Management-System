from sqlalchemy.orm import Session
from app.modules.subjects.models import Subject
from app.modules.subjects.schemas import SubjectCreate, SubjectUpdate


class SubjectRepository:

  def _init_(self, db: Session):
    self.db = db

  def get_by_id(self, subject_id: int) -> Subject | None:
    """Fetch a single subject by its ID."""
    return self.db.query(Subject).filter(Subject.id == subject_id).first()

  def get_by_code(self, code: str) -> Subject | None:
    """Fetch a single subject by its unique code."""
    return self.db.query(Subject).filter(Subject.code == code).first()

  def get_all(self, skip: int = 0, limit: int = 100) -> list[Subject]:
    """Retrieve a list of subjects with pagination support."""
    return self.db.query(Subject).offset(skip).limit(limit).all()

  def create(self, subject_data: SubjectCreate) -> Subject:
    """Persist a new subject into the database."""
    db_subject = Subject(**subject_data.dict())
    self.db.add(db_subject)
    self.db.commit()
    self.db.refresh(db_subject)
    return db_subject

  def update(self, db_subject: Subject, subject_data: SubjectUpdate) -> Subject:
    """Update an existing subject record."""
    update_data = subject_data.dict(exclude_unset=True)
    for key, value in update_data.items():
      setattr(db_subject, key, value)
    
    self.db.commit()
    self.db.refresh(db_subject)
    return db_subject

  def delete(self, db_subject: Subject) -> bool:
    """Delete a subject record from the database."""
    self.db.delete(db_subject)
    self.db.commit()
    return True