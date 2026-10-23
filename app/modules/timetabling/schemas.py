"""API contracts for the new timetable module (no legacy-table dependencies)."""
from datetime import date, time
from enum import Enum
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ScheduleState(str, Enum):
    DRAFT = "draft"
    VALIDATED = "validated"
    APPROVED = "approved"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class WeekPattern(str, Enum):
    EVERY_WEEK = "every_week"
    WEEK_A = "week_a"
    WEEK_B = "week_b"


class TimetableProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    academic_year_id: int = Field(gt=0)
    starts_on: date
    ends_on: date
    timezone: str = Field(default="Africa/Nairobi", min_length=1, max_length=64)

    @model_validator(mode="after")
    def dates_are_ordered(self):
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on must be on or after starts_on")
        return self


class PeriodCreate(BaseModel):
    day_of_week: int = Field(ge=0, le=6, description="Monday=0, Sunday=6")
    period_number: int = Field(ge=1, le=32)
    starts_at: time
    ends_at: time
    week_pattern: WeekPattern = WeekPattern.EVERY_WEEK
    is_break: bool = False
    label: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def period_has_positive_duration(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at")
        return self


class LessonRequirementCreate(BaseModel):
    class_id: int = Field(gt=0)
    subject_id: int = Field(gt=0)
    teacher_ids: list[int] = Field(min_length=1, max_length=8)
    lessons_per_week: int = Field(ge=1, le=40)
    duration_periods: int = Field(default=1, ge=1, le=8)
    room_type: str | None = Field(default=None, max_length=80)
    fixed_day: int | None = Field(default=None, ge=0, le=6)
    fixed_period: int | None = Field(default=None, ge=1, le=32)
    locked: bool = False
    week_pattern: WeekPattern = WeekPattern.EVERY_WEEK

    @model_validator(mode="after")
    def fixed_slot_is_complete(self):
        if (self.fixed_day is None) != (self.fixed_period is None):
            raise ValueError("fixed_day and fixed_period must be provided together")
        if len(set(self.teacher_ids)) != len(self.teacher_ids):
            raise ValueError("teacher_ids must not contain duplicates")
        return self


class ConstraintCreate(BaseModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    hardness: Literal["hard", "soft"]
    weight: int = Field(default=1, ge=1, le=1000)
    enabled: bool = True
    parameters: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @model_validator(mode="after")
    def hard_constraints_have_no_soft_weight(self):
        if self.hardness == "hard" and self.weight != 1:
            raise ValueError("hard constraints use weight=1; weights apply to soft constraints")
        return self


class TimetableProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    school_id: int
    name: str
    academic_year_id: int
    starts_on: date
    ends_on: date
    timezone: str
    state: ScheduleState
