from sqlalchemy import Column, Integer, String, Boolean, Date, ForeignKey, DateTime, UniqueConstraint, BigInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from app.core.database import Base

StatusEnum = PgEnum("ACTIVE", "INACTIVE", "ARCHIVED", name="statusenum", create_type=False)

class AcademicYear(Base):
    __tablename__ = "academic_years"
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("school_info.id"), nullable=False)
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_current = Column(Boolean, default=False)
    status = Column(String, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    terms = relationship("Term", back_populates="academic_year", cascade="all, delete-orphan")
    streams = relationship("Stream", back_populates="academic_year")

class Term(Base):
    __tablename__ = "terms"
    id = Column(Integer, primary_key=True, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False)
    school_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    is_current = Column(Boolean, default=False)
    status = Column(String, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    academic_year = relationship("AcademicYear", back_populates="terms")

class Level(Base):
    __tablename__ = "levels"
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("school_info.id"), nullable=False)
    name = Column(String, nullable=False)
    code = Column(String, nullable=False, index=True)
    display_order = Column(Integer, nullable=False)
    status = Column(StatusEnum, default="ACTIVE", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    grades = relationship("Grade", back_populates="level", cascade="all, delete-orphan")
    streams = relationship("Stream", back_populates="level")

class Grade(Base):
    """Education year within a level, e.g. Grade 4 or PP1."""
    __tablename__ = "grades"
    __table_args__ = (UniqueConstraint("school_id", "level_id", "code", name="uq_grade_school_level_code"),)
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("school_info.id"), nullable=False, index=True)
    level_id = Column(Integer, ForeignKey("levels.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(30), nullable=False)
    status = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    level = relationship("Level", back_populates="grades")
    streams = relationship("Stream", back_populates="grade", cascade="all, delete-orphan")

class Stream(Base):
    """A named student group within a grade for a specific academic year."""
    __tablename__ = "streams"
    __table_args__ = (UniqueConstraint("school_id", "academic_year_id", "grade_id", "name", name="uq_stream_school_year_grade_name"),)
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(BigInteger, ForeignKey("school_info.id"), nullable=False, index=True)
    academic_year_id = Column(BigInteger, ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=False, index=True)
    level_id = Column(BigInteger, ForeignKey("levels.id"), nullable=False, index=True)
    grade_id = Column(BigInteger, ForeignKey("grades.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(30), nullable=True)
    capacity = Column(Integer, nullable=True)
    class_teacher_id = Column(Integer, nullable=True)
    status = Column(String(20), default="ACTIVE", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    level = relationship("Level", back_populates="streams")
    grade = relationship("Grade", back_populates="streams")
    academic_year = relationship("AcademicYear", back_populates="streams")
