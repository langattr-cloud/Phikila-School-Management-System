from pydantic import BaseModel, field_validator
from typing import Optional

# Schema for creating an examination
class ExaminationCreate(BaseModel):
    name: str
    academic_year: str
    term: str

# Schema for the examination (includes ID)
class Examination(ExaminationCreate):
    id: int

    class Config:
        from_attributes = True

# Schema for creating an assessment component
class AssessmentComponentCreate(BaseModel):
    exam_id: int
    name: str
    weight: int

    # Validation logic to ensure weight is between 1 and 100
    @field_validator('weight')
    @classmethod
    def weight_must_be_positive(cls, v: int) -> int:
        if v < 1 or v > 100:
            raise ValueError('Weight must be between 1 and 100')
        return v

# Schema for the assessment component (includes ID)
class AssessmentComponent(AssessmentComponentCreate):
    id: int

    class Config:
        from_attributes = True