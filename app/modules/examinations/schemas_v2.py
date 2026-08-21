"""Examination schemas using canonical academic context."""
from __future__ import annotations
from datetime import date, datetime
from pydantic import BaseModel, Field, field_validator, model_validator
from .grading import EDUCATION_LEVELS

class SeriesCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    academic_year_id: int | None = None
    term_id: int | None = None

class SeriesUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    academic_year_id: int | None = None
    term_id: int | None = None

class SeriesResponse(BaseModel):
    id: int; school_id: int; name: str; academic_year_id: int | None = None; term_id: int | None = None; status: str; created_at: datetime | None = None
    model_config = {"from_attributes": True}

class ExaminationCreate(BaseModel):
    series_id: int
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    exam_date: date | None = None
    total_marks: int = Field(default=100, ge=1)
    passing_marks: int = Field(default=50, ge=0)

    @model_validator(mode="after")
    def validate_marks(self):
        if self.passing_marks > self.total_marks:
            raise ValueError("Passing marks cannot be greater than total marks.")
        return self

class ExaminationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    exam_date: date | None = None
    total_marks: int | None = Field(default=None, ge=1)
    passing_marks: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_marks(self):
        if self.total_marks is not None and self.passing_marks is not None and self.passing_marks > self.total_marks:
            raise ValueError("Passing marks cannot be greater than total marks.")
        return self

class ExaminationResponse(BaseModel):
    id: int; school_id: int; series_id: int; name: str; description: str | None = None; exam_date: date | None = None; total_marks: int; passing_marks: int; status: str; created_at: datetime | None = None
    model_config = {"from_attributes": True}

class ExamSubjectCreate(BaseModel):
    subject_id: int; academic_year_id: int; level_id: int; grade_id: int; stream_id: int; total_marks: int = Field(default=100, ge=1); exam_date: date | None = None

class ExamSubjectResponse(BaseModel):
    id: int; exam_id: int; subject_id: int; academic_year_id: int; level_id: int; grade_id: int; stream_id: int; teacher_id: int | None = None; total_marks: int; exam_date: date | None = None
    model_config = {"from_attributes": True}

class ScoreEntry(BaseModel):
    student_id: int; subject_id: int; score: float = Field(ge=0); grade: str | None = None; position: int | None = Field(default=None, ge=1); remarks: str | None = None

class BulkScoreEntry(BaseModel): entries: list[ScoreEntry] = Field(min_length=1)

class ExamEntryResponse(BaseModel):
    id: int; exam_id: int; student_id: int; subject_id: int; score: float | None = None; grade: str | None = None; position: int | None = None; remarks: str | None = None; percentage: float | None = None
    model_config = {"from_attributes": True}

class StudentResult(BaseModel):
    student_id: int; student_name: str; admission_number: str; subject_scores: list[dict]; total_score: float; average: float; position: int | None = None; grade: str | None = None; education_level: str | None = None; percentage: float | None = None; band: str | None = None; band_label: str | None = None; deviation: float | None = None; progress: float | None = None

class SubjectAnalysis(BaseModel):
    subject_id: int; entries: int; mean_percentage: float | None = None; band_distribution: dict[str, int] = {}

class ResultsAnalysis(BaseModel):
    exam_id: int; exam_name: str; cohort_size: int; education_levels: dict[str, int] = {}; cohort_mean: float | None = None; band_distribution: dict[str, int] = {}; subject_analysis: list[SubjectAnalysis] = []; progress_summary: dict[str, int] = {}

class GradeScaleCreate(BaseModel):
    grade: str = Field(min_length=1, max_length=5); min_score: float; max_score: float; points: int | None = None; description: str | None = None; education_level: str | None = None
    @field_validator("education_level")
    @classmethod
    def _valid_level(cls, v: str | None) -> str | None:
        if v is not None and v not in EDUCATION_LEVELS: raise ValueError(f"education_level must be one of {EDUCATION_LEVELS}")
        return v
    @model_validator(mode="after")
    def validate_range(self):
        if self.min_score > self.max_score: raise ValueError("Minimum score cannot exceed maximum score.")
        return self

class GradeScaleResponse(BaseModel):
    id: int; school_id: int; grade: str; min_score: float; max_score: float; points: int | None = None; description: str | None = None; education_level: str | None = None
    model_config = {"from_attributes": True}

class StatusChange(BaseModel):
    status: str = Field(pattern=r"^(draft|active|published|locked)$")
