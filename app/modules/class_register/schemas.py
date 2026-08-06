from pydantic import BaseModel, Field


class ClassRegisterBase(BaseModel):
  academic_year_id: int
  grade_form_id: int
  stream_id: int
  class_teacher_id: int | None = None
  room_id: str | None = None
  capacity: int = Field(default=45, ge=1)
  status: str = "Active"


class ClassRegisterCreate(ClassRegisterBase):
  pass


class ClassRegisterUpdate(BaseModel):
  class_teacher_id: int | None = None
  room_id: str | None = None
  capacity: int | None = Field(default=None, ge=1)
  status: str | None = None


class ClassRegisterResponse(ClassRegisterBase):
  id: int

  class Config:
    from_attributes = True