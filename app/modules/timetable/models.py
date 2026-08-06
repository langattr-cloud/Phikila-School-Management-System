from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from app.core.database import Base


class GeneratedTimetable(Base):
  __tablename__ = "timetables"
  # Removed _table_args_ schema configuration for SQLite compatibility

  id = Column(Integer, primary_key=True, index=True)
  term_id = Column(Integer, index=True)
  generated_at = Column(DateTime, default=datetime.utcnow)
  status = Column(String, default="Active")

  allocations = relationship(
      "TimetableAllocation", back_populates="timetable", cascade="all, delete"
  )


Timetable = GeneratedTimetable


class TimetableAllocation(Base):
  __tablename__ = "timetable_allocations"
  # Removed _table_args_ schema configuration

  id = Column(Integer, primary_key=True, index=True)
  # Fixed the foreign key reference to drop the schema prefix dot notation
  timetable_id = Column(Integer, ForeignKey("timetables.id"))
  class_name = Column(String)
  subject = Column(String)
  teacher_id = Column(Integer)
  day_of_week = Column(String)
  period_number = Column(Integer)

  timetable = relationship("GeneratedTimetable", back_populates="allocations")


class WorkingDay(Base):
  __tablename__ = "working_days"
  # Removed _table_args_ schema configuration

  id = Column(Integer, primary_key=True, index=True)
  day_name = Column(String, unique=True, index=True)
  is_active = Column(String, default="True")


class LessonPeriod(Base):
  __tablename__ = "lesson_periods"
  # Removed _table_args_ schema configuration

  id = Column(Integer, primary_key=True, index=True)
  period_number = Column(Integer)
  start_time = Column(String)
  end_time = Column(String)

  from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class TimetableEntry(Base):
  __tablename__ = "timetable_entries"

  id = Column(Integer, primary_key=True, index=True)
  class_register_id = Column(Integer, index=True, nullable=False)
  teacher_id = Column(Integer, index=True, nullable=False)
  subject_id = Column(Integer, index=True, nullable=False)
  day_of_week = Column(String, index=True, nullable=False)  # e.g., Monday, Tuesday
  period_id = Column(Integer, index=True, nullable=False)
  room_id = Column(String, nullable=True)
  academic_year_id = Column(Integer, index=True, nullable=False)