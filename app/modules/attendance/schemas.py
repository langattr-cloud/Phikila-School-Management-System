"""Attendance schemas."""
from __future__ import annotations
from datetime import date, datetime
from pydantic import BaseModel, Field, model_validator

class AttendanceRecordCreate(BaseModel):
    student_id: int
    status: str = Field(default="present", pattern="^(present|absent|late|excused)$")
    reason: str | None = None
class AttendanceRecordUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(present|absent|late|excused)$")
    reason: str | None = None
class AttendanceRecordResponse(BaseModel):
    id: int; session_id: int; student_id: int; status: str; reason: str | None = None; marked_by: str | None = None; created_at: datetime | None = None
    model_config = {"from_attributes": True}
class AttendanceSessionCreate(BaseModel):
    stream_id: int | None = None
    grade_id: int | None = None
    level_id: int | None = None
    class_id: int | None = None
    date: date
    academic_year_id: int | None = None
    term_id: int | None = None
    period_index: int | None = None
    @model_validator(mode="after")
    def require_academic_context(self):
        if not self.stream_id and not self.class_id:
            raise ValueError("stream_id is required for new attendance sessions; class_id is legacy compatibility")
        return self
class AttendanceSessionResponse(BaseModel):
    id: int; school_id: int; class_id: int | None = None; level_id: int | None = None; grade_id: int | None = None; stream_id: int | None = None; academic_year_id: int | None = None; date: date; period_index: int | None = None; opened_by: str | None = None; status: str; records: list[AttendanceRecordResponse] = []; created_at: datetime | None = None
    model_config = {"from_attributes": True}
class BulkMarkRequest(BaseModel):
    student_ids: list[int] = []; status: str = Field(default="present", pattern="^(present|absent|late|excused)$")
class AttendanceSummary(BaseModel):
    student_id: int; student_name: str; total_days: int; present: int; absent: int; late: int; excused: int; attendance_rate: float
