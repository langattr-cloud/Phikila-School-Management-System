from sqlalchemy.orm import Session
from . import models, schemas
from fastapi import HTTPException # Ensure this import is added

# Service to create a new Assessment Component linked to an Exam
def create_assessment_component(db: Session, component: schemas.AssessmentComponentCreate):
    # 1. Calculate current total weight for this exam
    existing_components = db.query(models.AssessmentComponent).filter(
        models.AssessmentComponent.exam_id == component.exam_id
    ).all()
    
    total_weight = sum(item.weight for item in existing_components)
    
    # 2. Check if adding the new component exceeds 100
    if total_weight + component.weight > 100:
        raise HTTPException(
            status_code=400, 
            detail=f"Adding this component would exceed 100% total weight. Current total: {total_weight}%"
        )
        
    # 3. Proceed with creation if weight is valid
    db_component = models.AssessmentComponent(
        exam_id=component.exam_id,
        name=component.name,
        weight=component.weight
    )
    db.add(db_component)
    db.commit()
    db.refresh(db_component)
    return db_component

def create_examination(db: Session, exam: schemas.ExaminationCreate):
    db_exam = models.Examination(
        name=exam.name,
        academic_year=exam.academic_year,
        term=exam.term
    )
    db.add(db_exam)
    db.commit()
    db.refresh(db_exam)
    return db_exam