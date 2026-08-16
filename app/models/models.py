from app.core.database import Base
from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship


class WorkingDay(Base):
    __tablename__ = "working_days"
    id = Column(Integer, primary_key=True, index=True)
    day_name = Column(String, nullable=False)  # e.g., "Monday"


class LessonPeriod(Base):
    __tablename__ = "lesson_periods"
    id = Column(Integer, primary_key=True, index=True)
    period_name = Column(String, nullable=False)  # e.g., "Period 1"
    start_time = Column(String)  # Consider using Time type for better validation
    end_time = Column(String)


class Timetable(Base):
    __tablename__ = "timetables"
    id = Column(Integer, primary_key=True, index=True)

    # Foreign Key relationships
    day_id = Column(Integer, ForeignKey("working_days.id"))
    period_id = Column(Integer, ForeignKey("lesson_periods.id"))

    # Relationships for easier access
    working_day = relationship("WorkingDay")
    lesson_period = relationship("LessonPeriod")
