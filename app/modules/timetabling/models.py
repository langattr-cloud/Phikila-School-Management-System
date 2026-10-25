"""Additive persistence model for the rebuilt timetable module."""
from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, JSON, String, Time, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class TimetableProject(Base):
    __tablename__ = "ttb_projects"
    __table_args__ = (CheckConstraint("ends_on >= starts_on", name="ck_ttb_project_date_range"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    school_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    academic_year_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    starts_on: Mapped[object] = mapped_column(Date, nullable=False)
    ends_on: Mapped[object] = mapped_column(Date, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Africa/Nairobi")
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class TimetablePeriod(Base):
    __tablename__ = "ttb_periods"
    __table_args__ = (UniqueConstraint("project_id", "day_of_week", "period_number", "week_pattern", name="uq_ttb_period_slot"), CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_ttb_period_day"), CheckConstraint("period_number BETWEEN 1 AND 32", name="ck_ttb_period_number"), CheckConstraint("ends_at > starts_at", name="ck_ttb_period_duration"))
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ttb_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    period_number: Mapped[int] = mapped_column(Integer, nullable=False)
    starts_at: Mapped[object] = mapped_column(Time, nullable=False)
    ends_at: Mapped[object] = mapped_column(Time, nullable=False)
    week_pattern: Mapped[str] = mapped_column(String(16), nullable=False, default="every_week")
    is_break: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    label: Mapped[str | None] = mapped_column(String(80))


class TimetableLessonRequirement(Base):
    __tablename__ = "ttb_lesson_requirements"
    __table_args__ = (CheckConstraint("lessons_per_week BETWEEN 1 AND 40", name="ck_ttb_requirement_frequency"), CheckConstraint("duration_periods BETWEEN 1 AND 8", name="ck_ttb_requirement_duration"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ttb_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    teacher_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    lessons_per_week: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_periods: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    room_type: Mapped[str | None] = mapped_column(String(80))
    fixed_day: Mapped[int | None] = mapped_column(Integer)
    fixed_period: Mapped[int | None] = mapped_column(Integer)
    locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    week_pattern: Mapped[str] = mapped_column(String(16), nullable=False, default="every_week")


class TimetableConstraint(Base):
    __tablename__ = "ttb_constraints"
    __table_args__ = (UniqueConstraint("project_id", "code", name="uq_ttb_constraint_code"), CheckConstraint("hardness IN ('hard', 'soft')", name="ck_ttb_constraint_hardness"), CheckConstraint("weight BETWEEN 1 AND 1000", name="ck_ttb_constraint_weight"))
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ttb_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    hardness: Mapped[str] = mapped_column(String(8), nullable=False)
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    parameters: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class TimetableVersion(Base):
    __tablename__ = "ttb_versions"
    __table_args__ = (UniqueConstraint("project_id", "version_number", name="uq_ttb_version_number"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ttb_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    placements: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    diagnostics: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    created_by: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
