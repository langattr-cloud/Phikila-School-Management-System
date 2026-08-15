"""Attendance tracking models — school-scoped."""

from __future__ import annotations

from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class AttendanceSession(Base):
    """One attendance record for a class on a specific date."""

    __tablename__ = "attendance_sessions"
    __table_args__ = (
        UniqueConstraint("school_id", "class_id", "date", name="uq_attendance_session"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    class_id = Column(Integer, ForeignKey("school_classes.id"), nullable=False, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"))
    term_id = Column(Integer, ForeignKey("terms.id"))
    date = Column(Date, nullable=False)
    period_index = Column(Integer)  # which teaching period
    opened_by = Column(String(64))  # user_id of teacher
    status = Column(String(20), default="open", nullable=False)  # open, closed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")


class AttendanceRecord(Base):
    """Individual student attendance for one session."""

    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_attendance_record"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students_v2.id"), nullable=False, index=True)

    status = Column(String(20), nullable=False, default="present")
    # present, absent, late, excused
    reason = Column(Text)
    marked_by = Column(String(64))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    session = relationship("AttendanceSession", back_populates="records")
