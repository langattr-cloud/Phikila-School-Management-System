"""End-to-end API tests for the CBC / KPSEA / KJSEA grading amendment.

Runs the real FastAPI routes (score entry → results → analysis) against an
in-memory SQLite database, with the Supabase auth dependency overridden by a
local admin principal.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.modules.authentication.supabase as supabase_module
from app.core.database import get_db
from app.main import app
from app.modules.academics.models import Level
from app.modules.examinations import models_v2 as m
from app.modules.students.models_v2 import SchoolClass, Student


@pytest.fixture()
def client(db_session):
    def _get_db():
        yield db_session

    def _claims():
        return {"sub": "u-admin", "email": "admin@phikila.com"}

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[supabase_module.get_supabase_claims] = _claims
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _seed(db_session):
    g5 = Level(school_id=1, name="Grade 5", code="G5", display_order=5)
    db_session.add(g5)
    db_session.flush()
    cls = SchoolClass(school_id=1, name="Grade 5 East", code="G5E", level_id=g5.id)
    db_session.add(cls)
    db_session.flush()
    students = [
        Student(school_id=1, admission_number="ADM/001", first_name="Amina", last_name="K", level_id=g5.id, current_class_id=cls.id),
        Student(school_id=1, admission_number="ADM/002", first_name="Brian", last_name="O", level_id=g5.id, current_class_id=cls.id),
    ]
    db_session.add_all(students)
    db_session.commit()
    return g5, cls, students


def test_score_entry_results_and_analysis_flow(client, db_session):
    g5, cls, students = _seed(db_session)
    s1, s2 = students

    # Create series + exam through the API.
    series = client.post("/api/v1/examinations/series", json={"name": "2026 Term 1"})
    assert series.status_code == 201, series.text
    series_id = series.json()["id"]

    exam = client.post("/api/v1/examinations", json={
        "series_id": series_id, "name": "Term 1 Assessment", "total_marks": 100, "passing_marks": 50,
    })
    assert exam.status_code == 201, exam.text
    exam_id = exam.json()["id"]

    # Subject assignment: Mathematics, total 50 marks.
    assign = client.post(f"/api/v1/examinations/{exam_id}/subjects", json={
        "subject_id": 1, "class_id": cls.id, "total_marks": 50,
    })
    assert assign.status_code == 201, assign.text

    # Score entry: CBC bands are computed from percentages, raw scores retained.
    entered = client.post(f"/api/v1/examinations/{exam_id}/entries", json={"entries": [
        {"student_id": s1.id, "subject_id": 1, "score": 40},   # 80% → EE
        {"student_id": s2.id, "subject_id": 1, "score": 20},   # 40% → AE
    ]})
    assert entered.status_code == 201, entered.text
    assert entered.json() == {"created": 2, "updated": 0}

    entries = client.get(f"/api/v1/examinations/{exam_id}/entries").json()
    by_student = {e["student_id"]: e for e in entries}
    assert by_student[s1.id]["grade"] == "EE"
    assert by_student[s1.id]["score"] == 40
    assert by_student[s1.id]["percentage"] == 80.0
    assert by_student[s2.id]["grade"] == "AE"
    assert by_student[s2.id]["percentage"] == 40.0

    # Results: full CBC flow fields present.
    results = client.get(f"/api/v1/examinations/{exam_id}/results").json()
    assert len(results) == 2
    top = results[0]
    assert top["position"] == 1
    assert top["band"] == "EE"
    assert top["band_label"] == "Exceeding Expectations"
    assert top["education_level"] == "primary"
    assert top["percentage"] == 80.0
    assert top["deviation"] == 20.0  # 80 vs cohort mean 60
    assert top["progress"] is None  # first exam in series
    assert top["subject_scores"][0]["score"] == 40  # raw score retained

    # Analysis endpoint.
    analysis = client.get(f"/api/v1/examinations/{exam_id}/results/analysis").json()
    assert analysis["exam_id"] == exam_id
    assert analysis["cohort_size"] == 2
    assert analysis["cohort_mean"] == 60.0
    assert analysis["band_distribution"] == {"EE": 1, "AE": 1}
    assert analysis["education_levels"] == {"primary": 2}
    assert analysis["progress_summary"]["not_available"] == 2

    # Grade-scale API accepts the new education_level scope.
    gs = client.post("/api/v1/examinations/grade-scale", json={
        "grade": "PM", "min_score": 60, "max_score": 100,
        "education_level": "primary", "description": "School primary band",
    })
    assert gs.status_code == 201, gs.text
    assert gs.json()["education_level"] == "primary"

    # Invalid education levels are rejected.
    bad = client.post("/api/v1/examinations/grade-scale", json={
        "grade": "XX", "min_score": 0, "max_score": 100, "education_level": "kindergarten",
    })
    assert bad.status_code == 422
