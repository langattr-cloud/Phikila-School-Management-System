from sqlalchemy import Column, Integer, String, Boolean, Date, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class AcademicYear(Base):
    __tablename__ = "academic_years"
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("school_info.id"), nullable=False)
    name = Column(String, nullable=False, unique=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_current = Column(Boolean, default=False)
    status = Column(String, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    terms = relationship("Term", back_populates="academic_year", cascade="all, delete-orphan")

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
    status = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    streams = relationship("Stream", back_populates="level", cascade="all, delete-orphan")

class Stream(Base):
    __tablename__ = "streams"
    __table_args__ = (UniqueConstraint("school_id", "level_id", "name", name="uq_stream_school_level_name"),)
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("school_info.id"), nullable=False, index=True)
    level_id = Column(Integer, ForeignKey("levels.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    code = Column(String, nullable=True)
    capacity = Column(Integer, nullable=True)
    status = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    level = relationship("Level", back_populates="streams")
