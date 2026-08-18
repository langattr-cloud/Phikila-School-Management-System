from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional, Literal

StreamStatus = Literal["ACTIVE", "INACTIVE", "ARCHIVED"]

class AcademicYearCreate(BaseModel):
    name: str = Field(..., description="Academic year name, e.g., 2026")
    start_date: date
    end_date: date
    is_current: Optional[bool] = False
    status: Optional[str] = "ACTIVE"
class AcademicYearResponse(AcademicYearCreate):
    id: int; school_id: int; created_at: datetime; updated_at: Optional[datetime] = None
    class Config: from_attributes = True

class TermCreate(BaseModel):
    name: str; start_date: Optional[date] = None; end_date: Optional[date] = None; is_current: Optional[bool] = False; academic_year_id: int
class TermResponse(BaseModel):
    id: int; name: str; start_date: Optional[date] = None; end_date: Optional[date] = None; is_current: bool; academic_year_id: int; school_id: int
    class Config: from_attributes = True

class LevelBase(BaseModel):
    name: str; code: str; display_order: int; status: Optional[bool] = True
class LevelCreate(LevelBase): pass
class LevelResponse(LevelBase):
    id: int; school_id: int; created_at: datetime; updated_at: Optional[datetime] = None
    class Config: from_attributes = True

class StreamBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, max_length=30)
    capacity: Optional[int] = Field(default=None, ge=1)
    status: StreamStatus = "ACTIVE"
class StreamCreate(StreamBase): level_id: int
class StreamUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, max_length=30)
    capacity: Optional[int] = Field(default=None, ge=1)
    status: Optional[StreamStatus] = None
class StreamResponse(StreamBase):
    id: int; school_id: int; level_id: int; created_at: datetime; updated_at: Optional[datetime] = None
    class Config: from_attributes = True

class StreamStudentResponse(BaseModel):
    id: int; admission_number: str; first_name: str; middle_name: Optional[str] = None; last_name: str; current_class_id: Optional[int] = None; level_id: Optional[int] = None; stream_id: Optional[int] = None; status: str
    class Config: from_attributes = True
class StreamAssignment(BaseModel): student_id: int
