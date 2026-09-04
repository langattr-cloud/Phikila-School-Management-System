"""Student management API using canonical academic enrollment context."""
from __future__ import annotations
import math
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from . import models_v2 as m
from . import schemas_v2 as s

router = APIRouter()

def _get_student_or_404(db, school_id, student_id):
    student = db.query(m.Student).filter(m.Student.id == student_id, m.Student.school_id == school_id).first()
    if not student: raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    return student

def _audit(db, principal, action, entity, entity_id, summary, before=None, after=None):
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(school_id=principal.school_id, actor=principal.email or principal.user_id, action=action, entity=entity, entity_id=entity_id, summary=summary, before=before, after=after))

def _validate_academic_context(db, school_id, academic_year_id, term_id, level_id, grade_id, stream_id):
    from app.modules.academics.models import AcademicYear, Grade, Level, Stream, Term
    academic_year = db.query(AcademicYear).filter(AcademicYear.id == academic_year_id, AcademicYear.school_id == school_id).first()
    if not academic_year: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Academic year does not belong to this school.")
    if term_id is not None:
        term = db.query(Term).filter(Term.id == term_id, Term.school_id == school_id, Term.academic_year_id == academic_year_id).first()
        if not term: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Term does not belong to the selected Academic Year.")
    if not db.query(Level.id).filter(Level.id == level_id, Level.school_id == school_id).first(): raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Level does not belong to this school.")
    if not db.query(Grade.id).filter(Grade.id == grade_id, Grade.school_id == school_id, Grade.level_id == level_id).first(): raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Grade does not belong to the selected level.")
    stream = db.query(Stream).filter(Stream.id == stream_id, Stream.school_id == school_id, Stream.academic_year_id == academic_year_id, Stream.level_id == level_id, Stream.grade_id == grade_id).first()
    if not stream: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Stream does not belong to the selected Academic Year → Level → Grade.")
    return stream

@router.get("/students", response_model=s.StudentListResponse)
def list_students(page:int=Query(1,ge=1), page_size:int=Query(20,ge=1,le=100), search:str|None=Query(None,max_length=200), status_filter:str|None=Query(None,alias="status"), academic_year_id:int|None=Query(None), level_id:int|None=Query(None), grade_id:int|None=Query(None), stream_id:int|None=Query(None), admission_number:str|None=Query(None), db:Session=Depends(get_db), principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    query=db.query(m.Student).filter(m.Student.school_id==principal.school_id)
    if search:
        pattern=f"%{search.strip().lower()}%";query=query.filter((func.lower(m.Student.first_name).like(pattern))|(func.lower(m.Student.last_name).like(pattern))|(func.lower(m.Student.admission_number).like(pattern))|(func.lower(m.Student.middle_name).like(pattern)))
    if status_filter:query=query.filter(m.Student.status==status_filter)
    if admission_number:query=query.filter(func.lower(m.Student.admission_number)==admission_number.strip().lower())
    filters=[]
    if academic_year_id is not None:filters.append(m.StudentEnrollment.academic_year_id==academic_year_id)
    if level_id is not None:filters.append(m.StudentEnrollment.level_id==level_id)
    if grade_id is not None:filters.append(m.StudentEnrollment.grade_id==grade_id)
    if stream_id is not None:filters.append(m.StudentEnrollment.stream_id==stream_id)
    if filters: filters.append(m.StudentEnrollment.status=="active");query=query.filter(m.Student.enrollments.any(*filters))
    total=query.count();pages=math.ceil(total/page_size) if total else 1
    items=query.options(joinedload(m.Student.guardians)).order_by(m.Student.last_name,m.Student.first_name).offset((page-1)*page_size).limit(page_size).all()
    return s.StudentListResponse(items=items,total=total,page=page,page_size=page_size,pages=pages)

@router.post("/students",response_model=s.StudentResponse,status_code=201)
def create_student(payload:s.StudentCreate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    existing=db.query(m.Student).filter(m.Student.school_id==principal.school_id,func.lower(m.Student.admission_number)==payload.admission_number.strip().lower()).first()
    if existing:raise HTTPException(status.HTTP_409_CONFLICT,f"Admission number '{payload.admission_number}' already exists.")
    stream=_validate_academic_context(db,principal.school_id,payload.academic_year_id,payload.term_id,payload.level_id,payload.grade_id,payload.stream_id)
    student=m.Student(school_id=principal.school_id,admission_number=payload.admission_number,first_name=payload.first_name,middle_name=payload.middle_name,last_name=payload.last_name,preferred_name=payload.preferred_name,date_of_birth=payload.date_of_birth,gender=payload.gender,email=payload.email,phone=payload.phone,address=payload.address,nationality=payload.nationality,national_id=payload.national_id,photo_url=payload.photo_url,admission_date=payload.admission_date,status=payload.status)
    db.add(student);db.flush()
    db.add(m.StudentEnrollment(school_id=principal.school_id,student_id=student.id,academic_year_id=payload.academic_year_id,term_id=payload.term_id,level_id=payload.level_id,grade_id=payload.grade_id,stream_id=stream.id,status="active",enrollment_date=payload.admission_date or date.today()))
    for guardian in payload.guardians:db.add(m.StudentGuardian(school_id=principal.school_id,student_id=student.id,**guardian.model_dump()))
    _audit(db,principal,"create","student",student.id,f"Admitted student {payload.first_name} {payload.last_name} ({payload.admission_number})");db.commit();db.refresh(student);return student

@router.get("/students/{student_id}",response_model=s.StudentResponse)
def get_student(student_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):return _get_student_or_404(db,principal.school_id,student_id)

@router.patch("/students/{student_id}",response_model=s.StudentResponse)
def update_student(student_id:int,payload:s.StudentUpdate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    student=_get_student_or_404(db,principal.school_id,student_id);before={c.name:getattr(student,c.name) for c in m.Student.__table__.columns if c.name!="updated_at"}
    for key,value in payload.model_dump(exclude_unset=True).items():setattr(student,key,value)
    after={c.name:getattr(student,c.name) for c in m.Student.__table__.columns if c.name!="updated_at"};_audit(db,principal,"update","student",student.id,f"Updated student {student.first_name} {student.last_name}",before,after);db.commit();db.refresh(student);return student

@router.delete("/students/{student_id}",status_code=204)
def delete_student(student_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin"))):
    student=_get_student_or_404(db,principal.school_id,student_id);_audit(db,principal,"delete","student",student.id,f"Deleted student {student.first_name} {student.last_name} ({student.admission_number})");db.delete(student);db.commit()

@router.get("/students/{student_id}/guardians",response_model=list[s.GuardianResponse])
def list_guardians(student_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    _get_student_or_404(db,principal.school_id,student_id);return db.query(m.StudentGuardian).filter(m.StudentGuardian.student_id==student_id,m.StudentGuardian.school_id==principal.school_id).all()

@router.post("/students/{student_id}/guardians",response_model=s.GuardianResponse,status_code=201)
def add_guardian(student_id:int,payload:s.GuardianCreate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    _get_student_or_404(db,principal.school_id,student_id);guardian=m.StudentGuardian(school_id=principal.school_id,student_id=student_id,**payload.model_dump());db.add(guardian);_audit(db,principal,"create","guardian",student_id,f"Added guardian {payload.full_name} for student #{student_id}");db.commit();db.refresh(guardian);return guardian

@router.get("/students/{student_id}/enrollment",response_model=list[s.EnrollmentResponse])
def list_enrollments(student_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    _get_student_or_404(db,principal.school_id,student_id);return db.query(m.StudentEnrollment).filter(m.StudentEnrollment.student_id==student_id,m.StudentEnrollment.school_id==principal.school_id).order_by(m.StudentEnrollment.created_at.desc()).all()

@router.get("/students/{student_id}/documents",response_model=list[s.DocumentResponse])
def list_documents(student_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    _get_student_or_404(db,principal.school_id,student_id);return db.query(m.StudentDocument).filter(m.StudentDocument.student_id==student_id,m.StudentDocument.school_id==principal.school_id).order_by(m.StudentDocument.created_at.desc()).all()

@router.post("/students/{student_id}/documents",response_model=s.DocumentResponse,status_code=201)
def add_document(student_id:int,payload:s.DocumentCreate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler","teacher"))):
    _get_student_or_404(db,principal.school_id,student_id);document=m.StudentDocument(school_id=principal.school_id,student_id=student_id,uploaded_by=principal.user_id,**payload.model_dump());db.add(document);_audit(db,principal,"create","document",student_id,f"Added document '{payload.title}' for student #{student_id}");db.commit();db.refresh(document);return document
