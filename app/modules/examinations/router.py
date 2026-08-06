from app.core.database import get_db
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from . import models, schemas, services

router = APIRouter(tags=["Examinations"])


@router.post("/create", response_model=schemas.Examination)
def create_exam(exam: schemas.ExaminationCreate, db: Session = Depends(get_db)):
  return services.create_examination(db, exam)


@router.post("/components/create", response_model=schemas.AssessmentComponent)
def create_component(
    component: schemas.AssessmentComponentCreate, db: Session = Depends(get_db)
):
  return services.create_assessment_component(db, component)


@router.get("/", response_model=list[schemas.Examination])
def read_exams(db: Session = Depends(get_db)):
  return services.get_examinations(db)