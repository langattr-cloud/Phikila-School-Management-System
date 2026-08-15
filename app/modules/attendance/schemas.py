"""Attendance schemas."""

from __future__ import annotations

from datetime import date, datetime
from pydantic import BaseModel, Field


class AttendanceRecordCreate(BaseModel):
    student_id: int
    status: str = Field(default="present", pattern="^(present|absent|late|excused)$")
    reason: str | None = None


class AttendanceRecordUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(present|absent|late|excused)$")
    reason: str | None = None


class AttendanceRecordResponse(BaseModel):
    id: int
    session_id: int
    student_id: int
    status: str
    reason: str | None = None
    marked_by: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class AttendanceSessionCreate(BaseModel):
    class_id: int
    date: date
    academic_year_id: int | None = None
    term_id: int | None = None
    period_index: int | None = None


class AttendanceSessionResponse(BaseModel):
    id: int
    school_id: int
    class_id: int
    date: date
    period_index: int | None = None
    opened_by: str | None = None
    status: str
    records: list[AttendanceRecordResponse] = []
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class BulkMarkRequest(BaseModel):
    """Mark all students present in one call."""
    student_ids: list[int] = []
    status: str = Field(default="present", pattern="^(present|absent|late|excused)$")


class AttendanceSummary(BaseModel):
    student_id: int
    student_name: str
    total_days: int
    present: int
    absent: int
    late: int
    excused: int
    attendance_rate: float
