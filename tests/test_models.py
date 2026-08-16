"""Unit tests for the Timetable, WorkingDay, and LessonPeriod models."""

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


def test_models_have_tablename():
    """All models must have __tablename__ set (regression for the _tablename_ bug)."""
    from app.models.models import LessonPeriod, WorkingDay, Timetable

    for model in [WorkingDay, LessonPeriod, Timetable]:
        assert hasattr(model, "__tablename__"), f"{model.__name__} missing __tablename__"
        assert isinstance(model.__tablename__, str)
        assert model.__tablename__


def test_model_columns():
    """Models have the expected columns."""
    from app.models.models import LessonPeriod, WorkingDay

    assert hasattr(WorkingDay.__table__.c, "day_name")
    assert hasattr(LessonPeriod.__table__.c, "period_name")
    assert hasattr(LessonPeriod.__table__.c, "start_time")
    assert hasattr(LessonPeriod.__table__.c, "end_time")


def test_timetable_foreign_keys():
    """Timetable has the expected foreign key relationships."""
    from app.models.models import Timetable

    fks = {fk.target_fullname for fk in Timetable.__table__.foreign_keys}
    assert "working_days.id" in fks
    assert "lesson_periods.id" in fks
