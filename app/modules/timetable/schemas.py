from pydantic import BaseModel, Field


class TimetableEntryBase(BaseModel):
  class_register_id: int
  teacher_id: int
  subject_id: int
  day_of_week: str
  period_id: int
  room_id: str | None = None
  academic_year_id: int


class TimetableEntryCreate(TimetableEntryBase):
  pass


class TimetableEntryResponse(TimetableEntryBase):
  id: int

  class Config:
    from_attributes = True


class TimetableMoveRequest(BaseModel):
  new_day: str
  new_period_id: int


class TimetableSwapRequest(BaseModel):
  entry_id_1: int
  entry_id_2: int