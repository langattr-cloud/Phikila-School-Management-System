from datetime import date, datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field

StreamStatus = Literal["ACTIVE", "INACTIVE", "ARCHIVED"]

class AcademicYearCreate(BaseModel):
    name: str = Field(..., min_length=4, max_length=20)
    start_date: date
    end_date: date
    is_current: Optional[bool] = False
    status: Optional[str] = "ACTIVE"
class AcademicYearUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=4, max_length=20)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: Optional[bool] = None
    status: Optional[str] = None
class AcademicYearResponse(AcademicYearCreate):
    id: int; school_id: int; created_at: datetime; updated_at: Optional[datetime] = None
    class Config: from_attributes = True

class TermCreate(BaseModel):
    name: str; start_date: Optional[date] = None; end_date: Optional[date] = None; is_current: Optional[bool] = False; academic_year_id: int
class TermUpdate(BaseModel):
    name: Optional[str] = None; start_date: Optional[date] = None; end_date: Optional[date] = None; is_current: Optional[bool] = None; academic_year_id: Optional[int] = None
class TermResponse(BaseModel):
    id: int; name: str; start_date: Optional[date] = None; end_date: Optional[date] = None; is_current: bool; academic_year_id: int; school_id: int
    class Config: from_attributes = True

class LevelBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=30)
    display_order: int = Field(ge=1)
    status: Optional[bool] = True
class LevelCreate(LevelBase): pass
class LevelUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, min_length=1, max_length=30)
    display_order: Optional[int] = Field(default=None, ge=1)
    status: Optional[bool] = None
class LevelResponse(LevelBase):
    id: int; school_id: int; created_at: datetime; updated_at: Optional[datetime] = None
    class Config: from_attributes = True

class GradeBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=30)
    display_order: int = Field(ge=1)
    status: Optional[bool] = True
class GradeCreate(GradeBase):
    level_id: int
class GradeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, min_length=1, max_length=30)
    display_order: Optional[int] = Field(default=None, ge=1)
    status: Optional[bool] = None
class GradeResponse(GradeBase):
    id: int; school_id: int; level_id: int; created_at: datetime; updated_at: Optional[datetime] = None
    class Config: from_attributes = True

class StreamBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, max_length=30)
    capacity: Optional[int] = Field(default=None, ge=1)
    status: StreamStatus = "ACTIVE"
class StreamCreate(StreamBase):
    academic_year_id: int
    level_id: int
    grade_id: int
class StreamUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, max_length=30)
    capacity: Optional[int] = Field(default=None, ge=1)
    status: Optional[StreamStatus] = None
    class_teacher_id: Optional[int] = None
class StreamResponse(StreamBase):
    id: int; school_id: int; academic_year_id: Optional[int] = None; level_id: int; grade_id: Optional[int] = None; class_teacher_id: Optional[int] = None; created_at: datetime; updated_at: Optional[datetime] = None
    class Config: from_attributes = True

class StreamStudentResponse(BaseModel):
    id: int; admission_number: str; first_name: str; middle_name: Optional[str] = None; last_name: str; current_class_id: Optional[int] = None; level_id: Optional[int] = None; stream_id: Optional[int] = None; status: str
    class Config: from_attributes = True
class StreamAssignment(BaseModel): student_id: int
