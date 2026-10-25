from datetime import date, time
import pytest
from pydantic import ValidationError
from app.modules.timetabling.schemas import (
    ConstraintCreate, LessonRequirementCreate, PeriodCreate, TimetableProjectCreate, WeekPattern,
)
from app.modules.timetabling.validation import Placement, find_placement_conflicts


def test_project_requires_ordered_dates():
    with pytest.raises(ValidationError):
        TimetableProjectCreate(name="Term 1", academic_year_id=1, starts_on=date(2026, 2, 1),
                               ends_on=date(2026, 1, 1))


def test_period_requires_positive_duration():
    with pytest.raises(ValidationError):
        PeriodCreate(day_of_week=0, period_number=1, starts_at=time(9), ends_at=time(9))


def test_fixed_lesson_slot_requires_day_and_period_together():
    with pytest.raises(ValidationError):
        LessonRequirementCreate(class_id=1, subject_id=2, teacher_ids=[3], lessons_per_week=3, fixed_day=1)


def test_duplicate_teacher_ids_are_rejected():
    with pytest.raises(ValidationError):
        LessonRequirementCreate(class_id=1, subject_id=2, teacher_ids=[3, 3], lessons_per_week=3)


def test_hard_constraint_weight_is_fixed():
    with pytest.raises(ValidationError):
        ConstraintCreate(code="teacher_unavailable", hardness="hard", weight=10)


def test_overlapping_shared_teacher_is_reported():
    placements = [
        Placement(1, 0, 2, 2, 10, (7,), 100),
        Placement(2, 0, 3, 1, 11, (7,), 101),
    ]
    conflicts = find_placement_conflicts(placements)
    assert len(conflicts) == 1
    assert conflicts[0]["resources"] == ["teacher"]


def test_non_overlapping_and_alternating_weeks_do_not_conflict():
    placements = [
        Placement(1, 0, 1, 1, 10, (7,), 100, "week_a"),
        Placement(2, 0, 1, 1, 11, (7,), 101, "week_b"),
        Placement(3, 0, 2, 1, 12, (8,), 102, "every_week"),
    ]
    assert find_placement_conflicts(placements) == []
