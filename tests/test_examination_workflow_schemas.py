import pytest
from pydantic import ValidationError

from app.modules.examinations.schemas_v2 import ExaminationCreate, ExaminationUpdate, GradeScaleCreate, SeriesUpdate, StatusChange


def test_examination_rejects_invalid_passing_marks():
    with pytest.raises(ValidationError):
        ExaminationCreate(series_id=1, name="Term 2", total_marks=50, passing_marks=60)


def test_examination_update_rejects_invalid_passing_marks():
    with pytest.raises(ValidationError):
        ExaminationUpdate(total_marks=40, passing_marks=50)


def test_examination_update_rejects_status_field():
    with pytest.raises(ValidationError):
        ExaminationUpdate(status="published")


def test_series_update_rejects_status_field():
    with pytest.raises(ValidationError):
        SeriesUpdate(status="published")


def test_grade_scale_rejects_reversed_range():
    with pytest.raises(ValidationError):
        GradeScaleCreate(grade="A", min_score=80, max_score=70)


def test_status_change_accepts_supported_statuses():
    assert StatusChange(status="published").status == "published"
