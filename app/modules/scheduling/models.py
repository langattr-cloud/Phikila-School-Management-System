"""Multi-tenant timetable scheduling models.

Every table is namespaced ``tt_*`` so it can live alongside the existing legacy
modules without colliding, and every school-owned row carries ``school_id`` so
the schema is multi-tenant from the start (see docs/rls.sql for the matching
PostgreSQL Row Level Security policies).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class TenantMixin:
    """Shared tenancy + audit columns."""

    school_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# --------------------------------------------------------------------------
# Calendar shape
# --------------------------------------------------------------------------
class TtPeriod(TenantMixin, Base):
    """A row in the daily grid: a teaching period, break or lunch."""

    __tablename__ = "tt_periods"
    __table_args__ = (
        UniqueConstraint("school_id", "index", name="uq_tt_period_slot"),
    )

    id = Column(Integer, primary_key=True)
    index = Column(Integer, nullable=False)  # ordering within a day
    name = Column(String(40), nullable=False)  # "P1", "Break"
    start_time = Column(String(5), nullable=False)  # "08:00"
    end_time = Column(String(5), nullable=False)
    # Breaks occupy a grid row but can never hold a lesson.
    is_teaching = Column(Boolean, default=True, nullable=False)


class TtDay(TenantMixin, Base):
    """A working day. Kept as data so schools can run Mon-Sat or custom weeks."""

    __tablename__ = "tt_days"
    __table_args__ = (UniqueConstraint("school_id", "index", name="uq_tt_day"),)

    id = Column(Integer, primary_key=True)
    index = Column(Integer, nullable=False)  # 0 = first working day
    name = Column(String(20), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


# --------------------------------------------------------------------------
# Resources
# --------------------------------------------------------------------------
class TtTeacher(TenantMixin, Base):
    __tablename__ = "tt_teachers"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_tt_teacher_code"),
    )

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    code = Column(String(30), nullable=False)  # employee id / initials
    email = Column(String(160))
    department = Column(String(80))
    max_lessons_per_day = Column(Integer, default=7, nullable=False)
    max_consecutive = Column(Integer, default=4, nullable=False)
    workload_target = Column(Integer)  # target lessons/week, informational
    # {"<day_index>": [period_index, ...]} periods the teacher cannot teach.
    unavailable = Column(JSON, default=dict, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


class TtSubject(TenantMixin, Base):
    __tablename__ = "tt_subjects"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_tt_subject_code"),
    )

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    code = Column(String(30), nullable=False)
    colour = Column(String(9), default="#0F2A47")
    # Scheduling shape
    prefers_morning = Column(Boolean, default=False, nullable=False)
    prefers_double = Column(Boolean, default=False, nullable=False)
    spread_across_week = Column(Boolean, default=True, nullable=False)
    required_room_type = Column(String(40))  # e.g. "lab", "computer"


class TtRoom(TenantMixin, Base):
    __tablename__ = "tt_rooms"
    __table_args__ = (UniqueConstraint("school_id", "code", name="uq_tt_room_code"),)

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    code = Column(String(30), nullable=False)
    building = Column(String(80))
    capacity = Column(Integer, default=40, nullable=False)
    room_type = Column(String(40), default="classroom", nullable=False)
    is_accessible = Column(Boolean, default=True, nullable=False)
    unavailable = Column(JSON, default=dict, nullable=False)


class TtClass(TenantMixin, Base):
    """A teaching group that cannot be in two places at once."""

    __tablename__ = "tt_classes"
    __table_args__ = (UniqueConstraint("school_id", "code", name="uq_tt_class_code"),)

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    code = Column(String(30), nullable=False)
    grade = Column(String(40))  # "Form 2" — groups streams together
    student_count = Column(Integer, default=40, nullable=False)
    home_room_id = Column(Integer, ForeignKey("tt_rooms.id", ondelete="SET NULL"))
    unavailable = Column(JSON, default=dict, nullable=False)


# --------------------------------------------------------------------------
# Lesson requirements — what must be scheduled
# --------------------------------------------------------------------------
class TtLessonRequirement(TenantMixin, Base):
    """"Class X studies Subject Y with Teacher Z, N times a week"."""

    __tablename__ = "tt_lesson_requirements"

    id = Column(Integer, primary_key=True)
    class_id = Column(Integer, ForeignKey("tt_classes.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("tt_subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    teacher_id = Column(Integer, ForeignKey("tt_teachers.id", ondelete="SET NULL"), index=True)
    room_id = Column(Integer, ForeignKey("tt_rooms.id", ondelete="SET NULL"))
    periods_per_week = Column(Integer, default=1, nullable=False)
    double_periods = Column(Integer, default=0, nullable=False)

    tt_class = relationship("TtClass")
    subject = relationship("TtSubject")
    teacher = relationship("TtTeacher")
    room = relationship("TtRoom")


# --------------------------------------------------------------------------
# Constraints
# --------------------------------------------------------------------------
class TtConstraint(TenantMixin, Base):
    """A configurable hard rule or weighted soft preference."""

    __tablename__ = "tt_constraints"

    id = Column(Integer, primary_key=True)
    kind = Column(String(60), nullable=False)  # see scheduling/constraints.py
    scope = Column(String(30), default="school", nullable=False)  # school|teacher|class|subject|room
    target_id = Column(Integer)  # id within the scope, null = whole school
    is_hard = Column(Boolean, default=False, nullable=False)
    weight = Column(Integer, default=10, nullable=False)
    params = Column(JSON, default=dict, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    # Free-text provenance, e.g. the natural-language command that created it.
    note = Column(Text)


# --------------------------------------------------------------------------
# Timetable versions and placements
# --------------------------------------------------------------------------
class TtVersion(TenantMixin, Base):
    __tablename__ = "tt_versions"

    id = Column(Integer, primary_key=True)
    number = Column(Integer, nullable=False)
    label = Column(String(120))
    status = Column(String(20), default="draft", nullable=False)  # draft|published|archived
    quality = Column(JSON, default=dict, nullable=False)
    stats = Column(JSON, default=dict, nullable=False)
    created_by = Column(String(160))
    published_at = Column(DateTime)

    lessons = relationship(
        "TtLesson", back_populates="version", cascade="all, delete-orphan"
    )


class TtLesson(TenantMixin, Base):
    """One placed lesson: a requirement pinned to a day and period."""

    __tablename__ = "tt_lessons"
    __table_args__ = (
        Index("ix_tt_lesson_slot", "version_id", "day_index", "period_index"),
    )

    id = Column(Integer, primary_key=True)
    version_id = Column(Integer, ForeignKey("tt_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    requirement_id = Column(Integer, ForeignKey("tt_lesson_requirements.id", ondelete="CASCADE"), index=True)
    class_id = Column(Integer, nullable=False, index=True)
    subject_id = Column(Integer, nullable=False, index=True)
    teacher_id = Column(Integer, index=True)
    room_id = Column(Integer, index=True)
    day_index = Column(Integer, nullable=False)
    period_index = Column(Integer, nullable=False)
    duration = Column(Integer, default=1, nullable=False)  # in periods
    # Locked lessons are preserved verbatim by re-generation.
    is_locked = Column(Boolean, default=False, nullable=False)

    version = relationship("TtVersion", back_populates="lessons")


# --------------------------------------------------------------------------
# Solver jobs
# --------------------------------------------------------------------------
class TtSolverJob(TenantMixin, Base):
    """A queued optimisation run.

    Jobs are persisted rather than held in memory so progress survives the
    request that created them, and so a dedicated worker (or Redis/Celery)
    can pick them up later without any API change.
    """

    __tablename__ = "tt_solver_jobs"

    id = Column(Integer, primary_key=True)
    status = Column(String(20), default="queued", nullable=False)
    # queued|running|optimizing|validating|completed|failed|cancelled
    progress = Column(Integer, default=0, nullable=False)
    stage = Column(String(60), default="Queued")
    checks = Column(JSON, default=list, nullable=False)  # live constraint checklist
    result_version_id = Column(Integer)
    quality = Column(JSON, default=dict, nullable=False)
    message = Column(Text)
    cancel_requested = Column(Boolean, default=False, nullable=False)
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    created_by = Column(String(160))


# --------------------------------------------------------------------------
# Audit
# --------------------------------------------------------------------------
class TtAuditEntry(TenantMixin, Base):
    __tablename__ = "tt_audit"

    id = Column(Integer, primary_key=True)
    actor = Column(String(160))
    action = Column(String(80), nullable=False)
    entity = Column(String(80))
    entity_id = Column(Integer)
    summary = Column(Text)
    before = Column(JSON)
    after = Column(JSON)
    at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
