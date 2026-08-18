"""Attendance tracking models — school-scoped and academic-context aware."""
from __future__ import annotations
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"
    __table_args__ = (UniqueConstraint("school_id", "class_id", "date", name="uq_attendance_session"), {"extend_existing": True})
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    # Legacy compatibility. New sessions should use stream_id/grade_id.
    class_id = Column(Integer, ForeignKey("school_classes.id"), nullable=True, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"))
    term_id = Column(Integer, ForeignKey("terms.id"))
    level_id = Column(Integer, ForeignKey("levels.id"))
    grade_id = Column(Integer, ForeignKey("grades.id"), index=True)
    stream_id = Column(Integer, ForeignKey("streams.id"), index=True)
    date = Column(Date, nullable=False)
    period_index = Column(Integer)
    opened_by = Column(String(64))
    status = Column(String(20), default="open", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("session_id", "student_id", name="uq_attendance_record"), {"extend_existing": True})
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students_v2.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="present")
    reason = Column(Text)
    marked_by = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    session = relationship("AttendanceSession", back_populates="records")
