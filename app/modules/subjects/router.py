from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.subjects.schemas import (
    SubjectCreate,
    SubjectUpdate,
    SubjectResponse,
)
from app.modules.subjects.services import SubjectService

router = APIRouter(prefix="/subjects", tags=["Subjects Module"])


def get_subject_service(db: Session = Depends(get_db)) -> SubjectService:
  return SubjectService(db)


@router.get("/", response_model=list[SubjectResponse], status_code=status.HTTP_200_OK)
def list_subjects(
    skip: int = 0,
    limit: int = 100,
    service: SubjectService = Depends(get_subject_service),
):
  """Retrieve a list of all subjects."""
  return service.get_all_subjects(skip=skip, limit=limit)


@router.get("/{subject_id}", response_model=SubjectResponse, status_code=status.HTTP_200_OK)
def get_subject(
    subject_id: int,
    service: SubjectService = Depends(get_subject_service),
):
  """Retrieve a specific subject by its ID."""
  return service.get_subject_by_id(subject_id)


@router.post("/", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
def create_subject(
    subject_data: SubjectCreate,
    service: SubjectService = Depends(get_subject_service),
):
  """Create a new subject."""
  return service.create_subject(subject_data)


@router.patch("/{subject_id}", response_model=SubjectResponse, status_code=status.HTTP_200_OK)
def update_subject(
    subject_id: int,
    subject_data: SubjectUpdate,
    service: SubjectService = Depends(get_subject_service),
):
  """Update an existing subject."""
  return service.update_subject(subject_id, subject_data)


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: int,
    service: SubjectService = Depends(get_subject_service),
):
  """Delete a subject record."""
  service.delete_subject(subject_id)
  return None