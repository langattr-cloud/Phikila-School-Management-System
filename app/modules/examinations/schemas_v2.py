"""Examination schemas."""

from __future__ import annotations

from datetime import date, datetime
from pydantic import BaseModel, Field, field_validator

from .grading import EDUCATION_LEVELS


class SeriesCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    academic_year_id: int | None = None
    term_id: int | None = None


class SeriesResponse(BaseModel):
    id: int
    school_id: int
    name: str
    academic_year_id: int | None = None
    term_id: int | None = None
    status: str
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class ExaminationCreate(BaseModel):
    series_id: int
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    exam_date: date | None = None
    total_marks: int = 100
    passing_marks: int = 50


class ExaminationResponse(BaseModel):
    id: int
    school_id: int
    series_id: int
    name: str
    description: str | None = None
    exam_date: date | None = None
    total_marks: int
    passing_marks: int
    status: str
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class ExamSubjectCreate(BaseModel):
    subject_id: int
    class_id: int
    total_marks: int = 100
    exam_date: date | None = None


class ExamSubjectResponse(BaseModel):
    id: int
    exam_id: int
    subject_id: int
    class_id: int
    total_marks: int
    model_config = {"from_attributes": True}


class ScoreEntry(BaseModel):
    student_id: int
    subject_id: int
    score: float = Field(ge=0)
    grade: str | None = None
    position: int | None = None
    remarks: str | None = None


class BulkScoreEntry(BaseModel):
    entries: list[ScoreEntry]


class ExamEntryResponse(BaseModel):
    id: int
    exam_id: int
    student_id: int
    subject_id: int
    score: float | None = None
    grade: str | None = None
    position: int | None = None
    remarks: str | None = None
    percentage: float | None = None  # CBC amendment: raw score retained + percentage
    model_config = {"from_attributes": True}


class StudentResult(BaseModel):
    student_id: int
    student_name: str
    admission_number: str
    subject_scores: list[dict]  # [{subject_id, score, grade, percentage, band, band_label}]
    total_score: float
    average: float
    position: int | None = None
    grade: str | None = None
    # --- CBC / KPSEA / KJSEA amendment fields (additive, optional) ---
    education_level: str | None = None  # primary | junior | senior
    percentage: float | None = None     # mean percentage (Mean / Average stage)
    band: str | None = None             # band code for the mean percentage
    band_label: str | None = None       # e.g. "Meeting Expectations"
    deviation: float | None = None      # student mean − cohort mean
    progress: float | None = None       # Δ mean vs previous exam in the series


class SubjectAnalysis(BaseModel):
    subject_id: int
    entries: int
    mean_percentage: float | None = None
    band_distribution: dict[str, int] = {}


class ResultsAnalysis(BaseModel):
    exam_id: int
    exam_name: str
    cohort_size: int
    education_levels: dict[str, int] = {}   # e.g. {"primary": 2, "junior": 1, "senior": 3}
    cohort_mean: float | None = None        # mean of student mean percentages
    band_distribution: dict[str, int] = {}  # overall CBC band counts
    subject_analysis: list[SubjectAnalysis] = []
    progress_summary: dict[str, int] = {}   # {"improved": n, "declined": n, ...}


class GradeScaleCreate(BaseModel):
    grade: str = Field(min_length=1, max_length=5)
    min_score: float
    max_score: float
    points: int | None = None
    description: str | None = None
    education_level: str | None = None  # primary | junior | senior | None (legacy)

    @field_validator("education_level")
    @classmethod
    def _valid_level(cls, v: str | None) -> str | None:
        if v is not None and v not in EDUCATION_LEVELS:
            raise ValueError(f"education_level must be one of {EDUCATION_LEVELS}")
        return v


class GradeScaleResponse(BaseModel):
    id: int
    school_id: int
    grade: str
    min_score: float
    max_score: float
    points: int | None = None
    description: str | None = None
    education_level: str | None = None
    model_config = {"from_attributes": True}
