"""Attendance management API — canonical academic context."""
from __future__ import annotations
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from app.modules.students.models_v2 import Student, StudentEnrollment
from . import models as m
from . import schemas as s
router=APIRouter()
def _audit(db,principal,action,entity,entity_id,summary):
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(school_id=principal.school_id,actor=principal.email or principal.user_id,action=action,entity=entity,entity_id=entity_id,summary=summary))
def _validate_stream_context(db,principal,academic_year_id,level_id,grade_id,stream_id):
    from app.modules.academics.models import AcademicYear,Grade,Level,Stream
    year=db.query(AcademicYear).filter(AcademicYear.id==academic_year_id,AcademicYear.school_id==principal.school_id).first();level=db.query(Level).filter(Level.id==level_id,Level.school_id==principal.school_id).first();grade=db.query(Grade).filter(Grade.id==grade_id,Grade.school_id==principal.school_id,Grade.level_id==level_id).first();stream=db.query(Stream).filter(Stream.id==stream_id,Stream.school_id==principal.school_id,Stream.academic_year_id==academic_year_id,Stream.grade_id==grade_id,Stream.level_id==level_id).first()
    if not year or not level or not grade or not stream:raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,"Invalid Academic Year → Level → Grade → Stream context.")
    return stream
@router.post("/attendance/sessions",response_model=s.AttendanceSessionResponse,status_code=201)
def open_attendance_session(payload:s.AttendanceSessionCreate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler","teacher"))):
    stream=_validate_stream_context(db,principal,payload.academic_year_id,payload.level_id,payload.grade_id,payload.stream_id)
    if db.query(m.AttendanceSession).filter(m.AttendanceSession.school_id==principal.school_id,m.AttendanceSession.academic_year_id==payload.academic_year_id,m.AttendanceSession.stream_id==payload.stream_id,m.AttendanceSession.date==payload.date).first():raise HTTPException(status.HTTP_409_CONFLICT,"Attendance session already exists for this stream/date.")
    session=m.AttendanceSession(school_id=principal.school_id,opened_by=principal.user_id,academic_year_id=payload.academic_year_id,level_id=payload.level_id,grade_id=payload.grade_id,stream_id=payload.stream_id,term_id=payload.term_id,period_index=payload.period_index,date=payload.date);db.add(session);_audit(db,principal,"create","attendance_session",0,f"Opened attendance for {stream.name} on {payload.date}");db.commit();db.refresh(session);return session
@router.get("/attendance/sessions",response_model=list[s.AttendanceSessionResponse])
def list_attendance_sessions(academic_year_id:int|None=Query(None),level_id:int|None=Query(None),grade_id:int|None=Query(None),stream_id:int|None=Query(None),date_from:date|None=Query(None),date_to:date|None=Query(None),db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    q=db.query(m.AttendanceSession).filter(m.AttendanceSession.school_id==principal.school_id)
    if academic_year_id:q=q.filter(m.AttendanceSession.academic_year_id==academic_year_id)
    if level_id:q=q.filter(m.AttendanceSession.level_id==level_id)
    if grade_id:q=q.filter(m.AttendanceSession.grade_id==grade_id)
    if stream_id:q=q.filter(m.AttendanceSession.stream_id==stream_id)
    if date_from:q=q.filter(m.AttendanceSession.date>=date_from)
    if date_to:q=q.filter(m.AttendanceSession.date<=date_to)
    return q.order_by(m.AttendanceSession.date.desc()).limit(100).all()
@router.post("/attendance/sessions/{session_id}/records",response_model=s.AttendanceRecordResponse,status_code=201)
def mark_attendance(session_id:int,payload:s.AttendanceRecordCreate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler","teacher"))):
    session=db.query(m.AttendanceSession).filter(m.AttendanceSession.id==session_id,m.AttendanceSession.school_id==principal.school_id).first()
    if not session:raise HTTPException(status.HTTP_404_NOT_FOUND,"Attendance session not found.")
    if session.status=="closed":raise HTTPException(status.HTTP_409_CONFLICT,"This attendance session is closed.")
    enrollment=db.query(StudentEnrollment).filter(StudentEnrollment.student_id==payload.student_id,StudentEnrollment.school_id==principal.school_id,StudentEnrollment.academic_year_id==session.academic_year_id,StudentEnrollment.level_id==session.level_id,StudentEnrollment.grade_id==session.grade_id,StudentEnrollment.stream_id==session.stream_id,StudentEnrollment.status=="active").first()
    if enrollment is None:raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,"Student is not actively enrolled in this academic stream.")
    existing=db.query(m.AttendanceRecord).filter(m.AttendanceRecord.session_id==session_id,m.AttendanceRecord.student_id==payload.student_id).first()
    if existing:existing.status=payload.status;existing.reason=payload.reason;existing.marked_by=principal.user_id;db.commit();db.refresh(existing);return existing
    record=m.AttendanceRecord(school_id=principal.school_id,session_id=session_id,student_id=payload.student_id,status=payload.status,reason=payload.reason,marked_by=principal.user_id);db.add(record);db.commit();db.refresh(record);return record
@router.post("/attendance/sessions/{session_id}/bulk",response_model=dict)
def bulk_mark(session_id:int,payload:s.BulkMarkRequest,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler","teacher"))):
    session=db.query(m.AttendanceSession).filter(m.AttendanceSession.id==session_id,m.AttendanceSession.school_id==principal.school_id).first()
    if not session:raise HTTPException(status.HTTP_404_NOT_FOUND,"Attendance session not found.")
    count=0
    for sid in payload.student_ids:
        enrollment=db.query(StudentEnrollment).filter(StudentEnrollment.student_id==sid,StudentEnrollment.school_id==principal.school_id,StudentEnrollment.academic_year_id==session.academic_year_id,StudentEnrollment.level_id==session.level_id,StudentEnrollment.grade_id==session.grade_id,StudentEnrollment.stream_id==session.stream_id,StudentEnrollment.status=="active").first()
        if enrollment is None:continue
        existing=db.query(m.AttendanceRecord).filter(m.AttendanceRecord.session_id==session_id,m.AttendanceRecord.student_id==sid).first()
        if existing:existing.status=payload.status;existing.marked_by=principal.user_id
        else:db.add(m.AttendanceRecord(school_id=principal.school_id,session_id=session_id,student_id=sid,status=payload.status,marked_by=principal.user_id))
        count+=1
    db.commit();return {"marked":count,"status":payload.status}
@router.patch("/attendance/records/{record_id}",response_model=s.AttendanceRecordResponse)
def update_record(record_id:int,payload:s.AttendanceRecordUpdate,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler","teacher"))):
    record=db.query(m.AttendanceRecord).filter(m.AttendanceRecord.id==record_id,m.AttendanceRecord.school_id==principal.school_id).first()
    if not record:raise HTTPException(status.HTTP_404_NOT_FOUND,"Record not found.")
    for key,value in payload.model_dump(exclude_unset=True).items():setattr(record,key,value)
    record.marked_by=principal.user_id;db.commit();db.refresh(record);return record
@router.get("/attendance/students/{student_id}/summary",response_model=s.AttendanceSummary)
def student_attendance_summary(student_id:int,academic_year_id:int|None=Query(None),db:Session=Depends(get_db),principal:Principal=Depends(require_role("viewer","teacher","admin"))):
    student=db.query(Student).filter(Student.id==student_id,Student.school_id==principal.school_id).first()
    if not student:raise HTTPException(status.HTTP_404_NOT_FOUND,"Student not found.")
    q=db.query(m.AttendanceSession).filter(m.AttendanceSession.school_id==principal.school_id)
    if academic_year_id:q=q.filter(m.AttendanceSession.academic_year_id==academic_year_id)
    ids=[r.id for r in q.all()]
    if not ids:return s.AttendanceSummary(student_id=student_id,student_name=f"{student.first_name} {student.last_name}",total_days=0,present=0,absent=0,late=0,excused=0,attendance_rate=0)
    records=db.query(m.AttendanceRecord).filter(m.AttendanceRecord.student_id==student_id,m.AttendanceRecord.session_id.in_(ids)).all();total=len(records);present=sum(r.status=="present" for r in records);absent=sum(r.status=="absent" for r in records);late=sum(r.status=="late" for r in records);excused=sum(r.status=="excused" for r in records);rate=(present+late)/total*100 if total else 0
    return s.AttendanceSummary(student_id=student_id,student_name=f"{student.first_name} {student.last_name}",total_days=total,present=present,absent=absent,late=late,excused=excused,attendance_rate=round(rate,1))
