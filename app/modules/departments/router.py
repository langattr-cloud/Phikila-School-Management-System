from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models, schemas

router = APIRouter(prefix="/departments", tags=["Departments"])

@router.get("/", response_model=list[schemas.DepartmentResponse])
def list_departments(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Department).offset(skip).limit(limit).all()

@router.post("/", response_model=schemas.DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(dept: schemas.DepartmentCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Department).filter(models.Department.code == dept.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Department with this code already exists")
    
    new_dept = models.Department(**dept.dict())
    db.add(new_dept)
    db.commit()
    db.refresh(new_dept)
    return new_dept

@router.get("/{id}", response_model=schemas.DepartmentResponse)
def get_department(id: int, db: Session = Depends(get_db)):
    dept = db.query(models.Department).filter(models.Department.id == id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept

@router.post("/{id}/assign-hod")
def assign_hod(id: int, assignment: schemas.DepartmentMemberAssign, db: Session = Depends(get_db)):
    dept = db.query(models.Department).filter(models.Department.id == id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Set existing HODs in this department to false if a new HOD is being assigned
    if assignment.is_hod:
        db.query(models.DepartmentMember).filter(
            models.DepartmentMember.department_id == id
        ).update({"is_hod": False})

    member = models.DepartmentMember(
        department_id=id,
        teacher_id=assignment.teacher_id,
        position=assignment.position,
        is_hod=assignment.is_hod
    )
    db.add(member)
    db.commit()
    return {"message": "HOD and department member assigned successfully"}