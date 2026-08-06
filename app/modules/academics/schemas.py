from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional

class AcademicYearCreate(BaseModel):
    name: str = Field(..., description="Academic year name, e.g., 2026")
    start_date: date
    end_date: date
    is_current: Optional[bool] = False
    status: Optional[str] = "ACTIVE"

class AcademicYearResponse(AcademicYearCreate):
    id: int
    school_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TermCreate(BaseModel):
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: Optional[bool] = False
    academic_year_id: int

class TermResponse(BaseModel):
    id: int
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: bool
    academic_year_id: int
    school_id: int

    class Config:
        from_attributes = True 

class LevelBase(BaseModel):
    name: str
    code: str
    display_order: int
    status: Optional[bool] = True

class LevelCreate(LevelBase):
    pass

class LevelResponse(LevelBase):
    id: int
    school_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class StreamBase(BaseModel):
    name: str
    capacity: Optional[int] = None
    status: Optional[bool] = True

class StreamCreate(StreamBase):
    level_id: int

class StreamResponse(StreamBase):
    id: int
    level_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True