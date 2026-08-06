from pydantic import BaseModel, Field


class SubjectBase(BaseModel):
  name: str = Field(..., min_string_length=2, max_length=100)
  code: str = Field(..., min_string_length=1, max_length=20)
  description: str | None = None
  is_active: bool = True


class SubjectCreate(SubjectBase):
  pass


class SubjectUpdate(BaseModel):
  name: str | None = Field(None, min_string_length=2, max_length=100)
  code: str | None = Field(None, min_string_length=1, max_length=20)
  description: str | None = None
  is_active: bool | None = None


class SubjectResponse(SubjectBase):
  id: int

  class Config:
    from_attributes = True