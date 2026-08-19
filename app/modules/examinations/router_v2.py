"""Examination management API using canonical academic enrollment context."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from app.modules.students.models_v2 import Student, StudentEnrollment
from app.modules.teachers.models import Teacher
from . import models_v2 as m
from . import schemas_v2 as s
from .grading import compute_grade, percentage_for
from .results import build_results, resolve_student_education_level
router=APIRouter()
class ExamSubjectAssignment(BaseModel):
    subject_id:int; academic_year_id:int; level_id:int; grade_id:int; stream_id:int; teacher_id:int|None=Field(default=None); total_marks:int=Field(default=100,ge=0)
def _exam(db,school_id,exam_id):
    row=db.query(m.ExaminationV2).filter(m.ExaminationV2.id==exam_id,m.ExaminationV2.school_id==school_id).first()
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND,"Examination not found.")
    return row
def _context(db,school_id,year,level,grade,stream):
    from app.modules.academics.models import AcademicYear,Grade,Level,Stream
    if not db.query(AcademicYear.id).filter(AcademicYear.id==year,AcademicYear.school_id==school_id).first(): raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,"Academic year does not belong to this school.")
    if not db.query(Level.id).filter(Level.id==level,Level.school_id==school_id).first(): raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,"Level does not belong to this school.")
    if not db.query(Grade.id).filter(Grade.id==grade,Grade.school_id==school_id,Grade.level_id==level).first(): raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,"Grade does not belong to the selected level.")
    if not db.query(Stream.id).filter(Stream.id==stream,Stream.school_id==school_id,Stream.academic_year_id==year,Stream.level_id==level,Stream.grade_id==grade).first(): raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,"Stream does not belong to the selected academic context.")
def _assignment(db,school,exam,subject,year,grade,stream):
    return db.query(m.ExamSubject).filter(m.ExamSubject.school_id==school,m.ExamSubject.exam_id==exam,m.ExamSubject.subject_id==subject,m.ExamSubject.academic_year_id==year,m.ExamSubject.grade_id==grade,m.ExamSubject.stream_id==stream).first()
def _teacher(db,teacher_id):
    if teacher_id is not None and not db.query(Teacher.id).filter(Teacher.id==teacher_id).first(): raise HTTPException(status.HTTP_400_BAD_REQUEST,"Assigned teacher does not exist.")
def _audit(db,p,a,e,i,s):
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(school_id=p.school_id,actor=p.email or p.user_id,action=a,entity=e,entity_id=i,summary=s))
def _can_enter(db,p,exam,subject,student):
    if p.at_least("scheduler"): return True
    if p.role!="teacher" or p.teacher_id is None:return False
    en=db.query(StudentEnrollment).filter(StudentEnrollment.student_id==student,StudentEnrollment.school_id==p.school_id,StudentEnrollment.status=="active").order_by(StudentEnrollment.enrollment_date.desc(),StudentEnrollment.id.desc()).first()
    if not en:return False
    row=_assignment(db,p.school_id,exam,subject,en.academic_year_id,en.grade_id,en.stream_id)
    return bool(row and row.teacher_id==p.teacher_id)
@router.get("/examinations/series",response_model=list[s.SeriesResponse])
def list_series(db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))): return db.query(m.ExaminationSeries).filter(m.ExaminationSeries.school_id==principal.school_id).order_by(m.ExaminationSeries.created_at.desc()).all()
@router.post("/examinations/series",response_model=s.SeriesResponse,status_code=201)
def create_series(payload:s.SeriesCreate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin"))):
    x=m.ExaminationSeries(school_id=principal.school_id,**payload.model_dump());db.add(x);db.commit();db.refresh(x);return x
@router.get("/examinations",response_model=list[s.ExaminationResponse])
def list_examinations(series_id:int|None=Query(default=None),db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    q=db.query(m.ExaminationV2).filter(m.ExaminationV2.school_id==principal.school_id)
    if series_id:q=q.filter(m.ExaminationV2.series_id==series_id)
    return q.order_by(m.ExaminationV2.created_at.desc()).all()
@router.post("/examinations",response_model=s.ExaminationResponse,status_code=201)
def create_examination(payload:s.ExaminationCreate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin"))):
    x=m.ExaminationV2(school_id=principal.school_id,**payload.model_dump());db.add(x);db.commit();db.refresh(x);return x
@router.get("/examinations/{exam_id}",response_model=s.ExaminationResponse)
def get_examination(exam_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))): return _exam(db,principal.school_id,exam_id)
@router.delete("/examinations/{exam_id}",status_code=204)
def delete_examination(exam_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin"))):
    x=_exam(db,principal.school_id,exam_id);db.delete(x);db.commit()
@router.get("/examinations/{exam_id}/subjects")
def list_exam_subjects(exam_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    _exam(db,principal.school_id,exam_id);return [{"id":r.id,"exam_id":r.exam_id,"subject_id":r.subject_id,"academic_year_id":r.academic_year_id,"level_id":r.level_id,"grade_id":r.grade_id,"stream_id":r.stream_id,"teacher_id":r.teacher_id,"total_marks":r.total_marks} for r in db.query(m.ExamSubject).filter(m.ExamSubject.school_id==principal.school_id,m.ExamSubject.exam_id==exam_id).all()]
@router.post("/examinations/{exam_id}/subjects",status_code=201)
def assign_exam_subject(exam_id:int,payload:ExamSubjectAssignment,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    _exam(db,principal.school_id,exam_id);_context(db,principal.school_id,payload.academic_year_id,payload.level_id,payload.grade_id,payload.stream_id);_teacher(db,payload.teacher_id)
    if _assignment(db,principal.school_id,exam_id,payload.subject_id,payload.academic_year_id,payload.grade_id,payload.stream_id):raise HTTPException(status.HTTP_409_CONFLICT,"That subject is already assigned to this examination stream.")
    x=m.ExamSubject(school_id=principal.school_id,exam_id=exam_id,**payload.model_dump());db.add(x);db.commit();db.refresh(x);return x
@router.patch("/examinations/{exam_id}/subjects/{assignment_id}")
def update_exam_subject_assignment(exam_id:int,assignment_id:int,payload:ExamSubjectAssignment,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
    _exam(db,principal.school_id,exam_id);x=db.query(m.ExamSubject).filter(m.ExamSubject.id==assignment_id,m.ExamSubject.exam_id==exam_id,m.ExamSubject.school_id==principal.school_id).first()
    if not x:raise HTTPException(status.HTTP_404_NOT_FOUND,"Examination subject assignment not found.")
    _context(db,principal.school_id,payload.academic_year_id,payload.level_id,payload.grade_id,payload.stream_id);_teacher(db,payload.teacher_id)
    d=_assignment(db,principal.school_id,exam_id,payload.subject_id,payload.academic_year_id,payload.grade_id,payload.stream_id)
    if d and d.id!=assignment_id:raise HTTPException(status.HTTP_409_CONFLICT,"That subject is already assigned to this examination stream.")
    for k,v in payload.model_dump().items():setattr(x,k,v)
    db.commit();db.refresh(x);return x
@router.post("/examinations/{exam_id}/entries",response_model=dict,status_code=201)
def enter_scores(exam_id:int,payload:s.BulkScoreEntry,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler","teacher"))):
    exam=_exam(db,principal.school_id,exam_id)
    if principal.role=="teacher" and any(not _can_enter(db,principal,exam_id,e.subject_id,e.student_id) for e in payload.entries):raise HTTPException(status.HTTP_403_FORBIDDEN,"You can only load marks for your assigned stream and subject.")
    totals={r.subject_id:float(r.total_marks or 0) or float(exam.total_marks or 0) for r in db.query(m.ExamSubject).filter(m.ExamSubject.exam_id==exam_id,m.ExamSubject.school_id==principal.school_id).all()};created=updated=0
    for e in payload.entries:
        student=db.query(Student).filter(Student.id==e.student_id,Student.school_id==principal.school_id).first()
        if not student:raise HTTPException(status.HTTP_404_NOT_FOUND,f"Student {e.student_id} not found.")
        grade=e.grade
        if not grade:
            _,level=resolve_student_education_level(db,student,getattr(exam.series,"academic_year_id",None));grade=compute_grade(db,principal.school_id,level,e.score,totals.get(e.subject_id,float(exam.total_marks or 0)))
        row=db.query(m.ExamEntry).filter(m.ExamEntry.exam_id==exam_id,m.ExamEntry.student_id==e.student_id,m.ExamEntry.subject_id==e.subject_id).first()
        if row:row.score,row.grade,row.position,row.remarks,row.entered_by=e.score,grade,e.position,e.remarks,principal.email or principal.user_id;updated+=1
        else:db.add(m.ExamEntry(school_id=principal.school_id,exam_id=exam_id,student_id=e.student_id,subject_id=e.subject_id,score=e.score,grade=grade,position=e.position,remarks=e.remarks,entered_by=principal.email or principal.user_id));created+=1
    db.commit();return {"created":created,"updated":updated}
@router.get("/examinations/{exam_id}/entries",response_model=list[s.ExamEntryResponse])
def list_entries(exam_id:int,subject_id:int|None=Query(default=None),student_id:int|None=Query(default=None),db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    _exam(db,principal.school_id,exam_id);q=db.query(m.ExamEntry).filter(m.ExamEntry.exam_id==exam_id,m.ExamEntry.school_id==principal.school_id)
    if subject_id:q=q.filter(m.ExamEntry.subject_id==subject_id)
    if student_id:q=q.filter(m.ExamEntry.student_id==student_id)
    return q.all()
@router.get("/examinations/{exam_id}/results",response_model=list[s.StudentResult])
def generate_results(exam_id:int,academic_year_id:int|None=Query(default=None),level_id:int|None=Query(default=None),grade_id:int|None=Query(default=None),stream_id:int|None=Query(default=None),db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    exam=_exam(db,principal.school_id,exam_id);rows,_=build_results(db,exam)
    q=db.query(StudentEnrollment.student_id).filter(StudentEnrollment.school_id==principal.school_id,StudentEnrollment.status=="active")
    if academic_year_id is not None:q=q.filter(StudentEnrollment.academic_year_id==academic_year_id)
    if level_id is not None:q=q.filter(StudentEnrollment.level_id==level_id)
    if grade_id is not None:q=q.filter(StudentEnrollment.grade_id==grade_id)
    if stream_id is not None:q=q.filter(StudentEnrollment.stream_id==stream_id)
    if any(v is not None for v in (academic_year_id,level_id,grade_id,stream_id)):allowed={r[0] for r in q.all()};rows=[r for r in rows if r["student_id"] in allowed]
    out=[s.StudentResult(**{k:v for k,v in r.items() if k!="_level_code"}) for r in rows];out.sort(key=lambda r:r.total_score,reverse=True)
    for i,r in enumerate(out):r.position=i+1
    return out
@router.get("/examinations/{exam_id}/results/analysis",response_model=s.ResultsAnalysis)
def results_analysis(exam_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    exam=_exam(db,principal.school_id,exam_id);_,analysis=build_results(db,exam);return s.ResultsAnalysis(**analysis)
@router.get("/examinations/grade-scale",response_model=list[s.GradeScaleResponse])
def list_grade_scale(db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):return db.query(m.GradeScale).filter(m.GradeScale.school_id==principal.school_id).order_by(m.GradeScale.education_level.desc(),m.GradeScale.min_score.desc()).all()
@router.post("/examinations/grade-scale",response_model=s.GradeScaleResponse,status_code=201)
def create_grade_scale(payload:s.GradeScaleCreate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin"))):x=m.GradeScale(school_id=principal.school_id,**payload.model_dump());db.add(x);db.commit();db.refresh(x);return x
