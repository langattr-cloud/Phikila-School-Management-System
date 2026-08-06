from sqlalchemy.orm import Session
from app.modules.subjects.repository import SubjectRepository
from app.modules.subjects.schemas import SubjectCreate, SubjectUpdate
from app.modules.subjects.models import Subject
from fastapi import HTTPException, status


class SubjectService:

  def _init_(self, db: Session):
    self.db = db
    self.repository = SubjectRepository(db)

  def get_subject_by_id(self, subject_id: int) -> Subject:
    """Retrieve a subject by ID or raise a 404 error if not found."""
    subject = self.repository.get_by_id(subject_id)
    if not subject:
      raise HTTPException(
          status_code=status.HTTP_404_NOT_FOUND,
          detail=f"Subject with ID {subject_id} not found."
      )
    return subject

  def get_all_subjects(self, skip: int = 0, limit: int = 100) -> list[Subject]:
    """Retrieve all subjects."""
    return self.repository.get_all(skip=skip, limit=limit)

  def create_subject(self, subject_data: SubjectCreate) -> Subject:
    """Create a new subject, ensuring the code is unique."""
    existing = self.repository.get_by_code(subject_data.code)
    if existing:
      raise HTTPException(
          status_code=status.HTTP_400_BAD_REQUEST,
          detail=f"Subject with code '{subject_data.code}' already exists."
      )
    return self.repository.create(subject_data)

  def update_subject(self, subject_id: int, subject_data: SubjectUpdate) -> Subject:
    """Update an existing subject."""
    subject = self.get_subject_by_id(subject_id)
    
    if subject_data.code and subject_data.code != subject.code:
      existing = self.repository.get_by_code(subject_data.code)
      if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subject with code '{subject_data.code}' already exists."
        )
        
    return self.repository.update(subject, subject_data)

  def delete_subject(self, subject_id: int) -> bool:
    """Delete a subject record."""
    subject = self.get_subject_by_id(subject_id)
    return self.repository.delete(subject)