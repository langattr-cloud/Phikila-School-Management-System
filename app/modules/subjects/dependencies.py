from fastapi import Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.subjects.services import SubjectService


def get_subject_service(db: Session = Depends(get_db)) -> SubjectService:
  """Dependency provider for SubjectService."""
  return SubjectService(db)