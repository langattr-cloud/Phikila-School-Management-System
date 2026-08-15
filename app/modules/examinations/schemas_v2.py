"""Examination schemas."""

from __future__ import annotations

from datetime import date, datetime
from pydantic import BaseModel, Field


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
    model_config = {"from_attributes": True}


class StudentResult(BaseModel):
    student_id: int
    student_name: str
    admission_number: str
    subject_scores: list[dict]  # [{subject_id, score, grade}]
    total_score: float
    average: float
    position: int | None = None
    grade: str | None = None


class GradeScaleCreate(BaseModel):
    grade: str = Field(min_length=1, max_length=5)
    min_score: float
    max_score: float
    points: int | None = None
    description: str | None = None


class GradeScaleResponse(BaseModel):
    id: int
    school_id: int
    grade: str
    min_score: float
    max_score: float
    points: int | None = None
    description: str | None = None
    model_config = {"from_attributes": True}
