"""Multi-tenant timetable scheduling models.

Every school-owned scheduling row carries school_id. Timetable versions also
snapshot their selected days so one timetable can be weekdays while another
is weekend-only without changing or losing existing timetable data.
"""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from app.core.database import Base

class TenantMixin:
    school_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class TtPeriod(TenantMixin, Base):
    __tablename__='tt_periods'; __table_args__=(UniqueConstraint('school_id','index',name='uq_tt_period_slot'),)
    id=Column(Integer,primary_key=True); index=Column(Integer,nullable=False); name=Column(String(40),nullable=False); start_time=Column(String(5),nullable=False); end_time=Column(String(5),nullable=False); is_teaching=Column(Boolean,default=True,nullable=False)
class TtDay(TenantMixin, Base):
    __tablename__='tt_days'; __table_args__=(UniqueConstraint('school_id','index',name='uq_tt_day'),)
    id=Column(Integer,primary_key=True); index=Column(Integer,nullable=False); name=Column(String(20),nullable=False); is_active=Column(Boolean,default=True,nullable=False)
class TtTeacher(TenantMixin, Base):
    __tablename__='tt_teachers'; __table_args__=(UniqueConstraint('school_id','code',name='uq_tt_teacher_code'),)
    id=Column(Integer,primary_key=True); name=Column(String(120),nullable=False); code=Column(String(30),nullable=False); email=Column(String(160)); department=Column(String(80)); max_lessons_per_day=Column(Integer,default=7,nullable=False); max_consecutive=Column(Integer,default=4,nullable=False); workload_target=Column(Integer); unavailable=Column(JSON,default=dict,nullable=False); is_active=Column(Boolean,default=True,nullable=False)
class TtSubject(TenantMixin, Base):
    __tablename__='tt_subjects'; __table_args__=(UniqueConstraint('school_id','code',name='uq_tt_subject_code'),)
    id=Column(Integer,primary_key=True); name=Column(String(120),nullable=False); code=Column(String(30),nullable=False); colour=Column(String(9),default='#0F2A47'); prefers_morning=Column(Boolean,default=False,nullable=False); prefers_double=Column(Boolean,default=False,nullable=False); spread_across_week=Column(Boolean,default=True,nullable=False); required_room_type=Column(String(40))
class TtRoom(TenantMixin, Base):
    __tablename__='tt_rooms'; __table_args__=(UniqueConstraint('school_id','code',name='uq_tt_room_code'),)
    id=Column(Integer,primary_key=True); name=Column(String(120),nullable=False); code=Column(String(30),nullable=False); building=Column(String(80)); capacity=Column(Integer,default=40,nullable=False); room_type=Column(String(40),default='classroom',nullable=False); is_accessible=Column(Boolean,default=True,nullable=False); unavailable=Column(JSON,default=dict,nullable=False)
class TtClass(TenantMixin, Base):
    __tablename__='tt_classes'; __table_args__=(UniqueConstraint('school_id','code',name='uq_tt_class_code'),)
    id=Column(Integer,primary_key=True); name=Column(String(120),nullable=False); code=Column(String(30),nullable=False); grade=Column(String(40)); student_count=Column(Integer,default=40,nullable=False); home_room_id=Column(Integer,ForeignKey('tt_rooms.id',ondelete='SET NULL')); unavailable=Column(JSON,default=dict,nullable=False)
class TtLessonRequirement(TenantMixin, Base):
    __tablename__='tt_lesson_requirements'; id=Column(Integer,primary_key=True); class_id=Column(Integer,ForeignKey('tt_classes.id',ondelete='CASCADE'),nullable=False,index=True); subject_id=Column(Integer,ForeignKey('tt_subjects.id',ondelete='CASCADE'),nullable=False,index=True); teacher_id=Column(Integer,ForeignKey('tt_teachers.id',ondelete='SET NULL'),index=True); room_id=Column(Integer,ForeignKey('tt_rooms.id',ondelete='SET NULL')); periods_per_week=Column(Integer,default=1,nullable=False); double_periods=Column(Integer,default=0,nullable=False); tt_class=relationship('TtClass'); subject=relationship('TtSubject'); teacher=relationship('TtTeacher'); room=relationship('TtRoom')
class TtConstraint(TenantMixin, Base):
    __tablename__='tt_constraints'; id=Column(Integer,primary_key=True); kind=Column(String(60),nullable=False); scope=Column(String(30),default='school',nullable=False); target_id=Column(Integer); is_hard=Column(Boolean,default=False,nullable=False); weight=Column(Integer,default=10,nullable=False); params=Column(JSON,default=dict,nullable=False); enabled=Column(Boolean,default=True,nullable=False); note=Column(Text)
class TtVersion(TenantMixin, Base):
    __tablename__='tt_versions'
    id=Column(Integer,primary_key=True); number=Column(Integer,nullable=False); label=Column(String(120)); status=Column(String(20),default='draft',nullable=False); quality=Column(JSON,default=dict,nullable=False); stats=Column(JSON,default=dict,nullable=False); created_by=Column(String(160)); published_at=Column(DateTime)
    day_indexes=Column(JSON,default=list,nullable=False); day_names=Column(JSON,default=list,nullable=False)
    lessons=relationship('TtLesson',back_populates='version',cascade='all, delete-orphan')
class TtLesson(TenantMixin, Base):
    __tablename__='tt_lessons'; __table_args__=(Index('ix_tt_lesson_slot','version_id','day_index','period_index'),)
    id=Column(Integer,primary_key=True); version_id=Column(Integer,ForeignKey('tt_versions.id',ondelete='CASCADE'),nullable=False,index=True); requirement_id=Column(Integer,ForeignKey('tt_lesson_requirements.id',ondelete='CASCADE'),index=True); class_id=Column(Integer,nullable=False,index=True); subject_id=Column(Integer,nullable=False,index=True); teacher_id=Column(Integer,index=True); room_id=Column(Integer,index=True); day_index=Column(Integer,nullable=False); period_index=Column(Integer,nullable=False); duration=Column(Integer,default=1,nullable=False); is_locked=Column(Boolean,default=False,nullable=False); version=relationship('TtVersion',back_populates='lessons')
class TtSolverJob(TenantMixin, Base):
    __tablename__='tt_solver_jobs'; id=Column(Integer,primary_key=True); status=Column(String(20),default='queued',nullable=False); progress=Column(Integer,default=0,nullable=False); stage=Column(String(60),default='Queued'); checks=Column(JSON,default=list,nullable=False); result_version_id=Column(Integer); quality=Column(JSON,default=dict,nullable=False); message=Column(Text); cancel_requested=Column(Boolean,default=False,nullable=False); started_at=Column(DateTime); finished_at=Column(DateTime); created_by=Column(String(160)); profile_label=Column(String(120)); profile_day_indexes=Column(JSON,default=list,nullable=False)
class TtAuditEntry(TenantMixin, Base):
    __tablename__='tt_audit'; id=Column(Integer,primary_key=True); actor=Column(String(160)); action=Column(String(80),nullable=False); entity=Column(String(80)); entity_id=Column(Integer); summary=Column(Text); before=Column(JSON); after=Column(JSON); at=Column(DateTime,default=datetime.utcnow,nullable=False,index=True)
