"""Examination models — canonical academic context."""
from __future__ import annotations
from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class ExaminationSeries(Base):
    __tablename__ = "examination_series"; __table_args__ = {"extend_existing": True}
    id = Column(Integer, primary_key=True, index=True); school_id = Column(Integer, nullable=False, index=True); name = Column(String(100), nullable=False)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id")); term_id = Column(Integer, ForeignKey("terms.id")); status = Column(String(20), default="draft"); created_at = Column(DateTime(timezone=True), server_default=func.now())
    examinations = relationship("ExaminationV2", back_populates="series", cascade="all, delete-orphan")

class ExaminationV2(Base):
    __tablename__ = "examinations_v2"; __table_args__ = {"extend_existing": True}
    id = Column(Integer, primary_key=True, index=True); school_id = Column(Integer, nullable=False, index=True); series_id = Column(Integer, ForeignKey("examination_series.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False); description = Column(Text); exam_date = Column(Date); total_marks = Column(Integer, default=100); passing_marks = Column(Integer, default=50); status = Column(String(20), default="draft")
    created_at = Column(DateTime(timezone=True), server_default=func.now()); updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    series = relationship("ExaminationSeries", back_populates="examinations"); subjects = relationship("ExamSubject", back_populates="examination", cascade="all, delete-orphan"); entries = relationship("ExamEntry", back_populates="examination", cascade="all, delete-orphan")

class ExamSubject(Base):
    __tablename__ = "exam_subjects"
    __table_args__ = (UniqueConstraint("exam_id", "subject_id", "academic_year_id", "grade_id", "stream_id", name="uq_exam_subject_academic_context"), {"extend_existing": True})
    id = Column(Integer, primary_key=True, index=True); school_id = Column(Integer, nullable=False, index=True); exam_id = Column(Integer, ForeignKey("examinations_v2.id", ondelete="CASCADE"), nullable=False, index=True); subject_id = Column(Integer, nullable=False)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False, index=True); level_id = Column(Integer, ForeignKey("levels.id"), nullable=False); grade_id = Column(Integer, ForeignKey("grades.id"), nullable=False, index=True); stream_id = Column(Integer, ForeignKey("streams.id"), nullable=False, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True, index=True); total_marks = Column(Integer, default=100); exam_date = Column(Date)
    examination = relationship("ExaminationV2", back_populates="subjects")

class ExamEntry(Base):
    __tablename__ = "exam_entries"; __table_args__ = (UniqueConstraint("exam_id", "student_id", "subject_id", name="uq_exam_entry"), {"extend_existing": True})
    id = Column(Integer, primary_key=True, index=True); school_id = Column(Integer, nullable=False, index=True); exam_id = Column(Integer, ForeignKey("examinations_v2.id", ondelete="CASCADE"), nullable=False, index=True); student_id = Column(Integer, ForeignKey("students_v2.id"), nullable=False, index=True); subject_id = Column(Integer, nullable=False)
    score = Column(Float); grade = Column(String(5)); position = Column(Integer); remarks = Column(Text); entered_by = Column(String(64)); created_at = Column(DateTime(timezone=True), server_default=func.now()); updated_at = Column(DateTime(timezone=True, onupdate=func.now()))
    examination = relationship("ExaminationV2", back_populates="entries")

class GradeScale(Base):
    __tablename__ = "grade_scales"; __table_args__ = (UniqueConstraint("school_id", "grade", name="uq_grade_scale"), {"extend_existing": True})
    id = Column(Integer, primary_key=True, index=True); school_id = Column(Integer, nullable=False, index=True); grade = Column(String(5), nullable=False); min_score = Column(Float, nullable=False); max_score = Column(Float, nullable=False); points = Column(Integer); description = Column(String(100)); education_level = Column(String(20), nullable=True)
