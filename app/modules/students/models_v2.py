"""Student management models — enrollment is the academic source of truth."""
from __future__ import annotations
from sqlalchemy import Boolean, Column, Date, DateTime, Integer, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship as orm_relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Student(Base):
    __tablename__ = "students_v2"
    __table_args__ = (UniqueConstraint("school_id", "admission_number", name="uq_student_admission"), {"extend_existing": True})
    id = Column(Integer, primary_key=True, index=True); school_id = Column(Integer, nullable=False, index=True)
    admission_number = Column(String(50), nullable=False, index=True); first_name = Column(String(100), nullable=False)
    middle_name = Column(String(100)); last_name = Column(String(100), nullable=False); preferred_name = Column(String(100))
    date_of_birth = Column(Date); gender = Column(String(20)); email = Column(String(200)); phone = Column(String(30)); address = Column(Text)
    nationality = Column(String(60), default="Kenyan"); national_id = Column(String(50)); photo_url = Column(String(500)); admission_date = Column(Date)
    status = Column(String(20), default="active", nullable=False, index=True); status_reason = Column(Text); status_date = Column(Date)
    # Retained for compatibility with existing academic/scheduling integrations. Enrollment is canonical.
    level_id = Column(Integer, ForeignKey("levels.id"), nullable=True, index=True)
    grade_id = Column(Integer, ForeignKey("grades.id"), nullable=True, index=True)
    stream_id = Column(Integer, ForeignKey("streams.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now()); updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    guardians = orm_relationship("StudentGuardian", back_populates="student", cascade="all, delete-orphan")
    enrollments = orm_relationship("StudentEnrollment", cascade="all, delete-orphan")
    documents = orm_relationship("StudentDocument", cascade="all, delete-orphan")

class StudentGuardian(Base):
    __tablename__ = "student_guardians"; __table_args__ = {"extend_existing": True}
    id = Column(Integer, primary_key=True, index=True); school_id = Column(Integer, nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students_v2.id", ondelete="CASCADE"), nullable=False, index=True)
    full_name = Column(String(200), nullable=False); relationship = Column(String(50), nullable=False); phone = Column(String(30), nullable=False)
    alt_phone = Column(String(30)); email = Column(String(200)); address = Column(Text); occupation = Column(String(100)); is_emergency_contact = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now()); updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    student = orm_relationship("Student", back_populates="guardians")

class StudentEnrollment(Base):
    __tablename__ = "student_enrollments"
    __table_args__ = (UniqueConstraint("school_id", "student_id", "academic_year_id", name="uq_enrollment_year"), {"extend_existing": True})
    id = Column(Integer, primary_key=True, index=True); school_id = Column(Integer, nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students_v2.id", ondelete="CASCADE"), nullable=False, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False); term_id = Column(Integer, ForeignKey("terms.id"))
    level_id = Column(Integer, ForeignKey("levels.id"), nullable=False); class_id = Column(Integer, ForeignKey("school_classes.id", ondelete="SET NULL"), nullable=True, index=True)
    grade_id = Column(Integer, ForeignKey("grades.id"), nullable=True); stream_id = Column(Integer, ForeignKey("streams.id"), nullable=True)
    status = Column(String(20), default="active", nullable=False); enrollment_date = Column(Date); created_at = Column(DateTime(timezone=True), server_default=func.now())

class StudentDocument(Base):
    __tablename__ = "student_documents"; __table_args__ = {"extend_existing": True}
    id = Column(Integer, primary_key=True, index=True); school_id = Column(Integer, nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students_v2.id", ondelete="CASCADE"), nullable=False, index=True)
    document_type = Column(String(50), nullable=False); title = Column(String(200), nullable=False); description = Column(Text); file_url = Column(String(500)); file_size = Column(Integer); mime_type = Column(String(100)); ocr_scan_id = Column(Integer); uploaded_by = Column(String(64)); created_at = Column(DateTime(timezone=True), server_default=func.now())