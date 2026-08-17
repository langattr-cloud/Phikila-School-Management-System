"""Tests for the CBC / KPSEA / KJSEA grading amendment.

Covers:
* education-level classification (Primary G4–6, Junior G7–9, Senior rest)
* the four primary/junior performance bands and their boundaries
* Raw → Percentage → Band → Mean → Deviation → Progress → Analysis flow
* separation invariants (CBC bands never applied to Senior School, and the
  legacy raw-score GradeScale never applied to Primary/Junior)
"""

from __future__ import annotations

import datetime

import pytest
from sqlalchemy.orm import Session

from app.modules.academics.models import Level
from app.modules.examinations import models_v2 as m
from app.modules.examinations.grading import (
    JUNIOR,
    PRIMARY,
    SENIOR,
    band_for_percentage,
    band_label,
    compute_grade,
    education_level_for_grade_code,
    percentage_for,
)
from app.modules.examinations.results import build_results
from app.modules.students.models_v2 import SchoolClass, Student

# ---------------------------------------------------------------------------
# Education-level separation (amendment §1)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "code,expected",
    [
        ("G4", PRIMARY),
        ("G5", PRIMARY),
        ("G6", PRIMARY),
        ("Grade 5", PRIMARY),
        ("G7", JUNIOR),
        ("G8", JUNIOR),
        ("G9", JUNIOR),
        ("Grade 9", JUNIOR),
        ("G8A", JUNIOR),  # class code with stream suffix
        ("G10", SENIOR),
        ("G12", SENIOR),
        ("Form 1", SENIOR),
        ("PP1", SENIOR),
        ("", SENIOR),
        (None, SENIOR),
    ],
)
def test_education_level_classification(code, expected):
    assert education_level_for_grade_code(code) == expected


# ---------------------------------------------------------------------------
# Percentage + band mapping (amendment §2)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "score,total,expected",
    [
        (42, 50, 84.0),
        (100, 100, 100.0),
        (0, 100, 0.0),
        (39.9, 50, 79.8),
        (None, 50, None),
        (50, 0, None),
        (50, None, None),
    ],
)
def test_percentage_for(score, total, expected):
    assert percentage_for(score, total) == expected


@pytest.mark.parametrize(
    "pct,expected_code",
    [
        (100.0, "EE"),
        (80.0, "EE"),  # EE lower boundary (inclusive)
        (79.9, "ME"),
        (50.0, "ME"),  # ME lower boundary (inclusive)
        (49.9, "AE"),
        (40.0, "AE"),  # AE lower boundary (inclusive)
        (39.9, "BE"),
        (0.0, "BE"),  # BE lower boundary (inclusive)
    ],
)
def test_primary_band_boundaries(pct, expected_code):
    band = band_for_percentage(PRIMARY, pct)
    assert band is not None and band.code == expected_code


def test_junior_bands_match_primary_structure():
    from app.modules.examinations.grading import CBC_BANDS

    assert [b.code for b in CBC_BANDS[JUNIOR]] == ["EE", "ME", "AE", "BE"]
    for level in (PRIMARY, JUNIOR):
        ranges = [(b.min_percent, b.max_percent) for b in CBC_BANDS[level]]
        assert ranges == [(80.0, 100.0), (50.0, 79.0), (40.0, 49.0), (0.0, 39.0)]


def test_no_cbc_band_for_senior_or_missing_percentage():
    assert band_for_percentage(SENIOR, 85.0) is None
    assert band_for_percentage(PRIMARY, None) is None
    assert band_label(SENIOR, "EE") is None
    assert band_label(PRIMARY, "ME") == "Meeting Expectations"
    assert band_label(PRIMARY, "XX") is None


# ---------------------------------------------------------------------------
# Grade resolution — separation invariants
# ---------------------------------------------------------------------------


def _seed_legacy_scale(db: Session, school_id: int = 1):
    db.add_all(
        [
            m.GradeScale(school_id=school_id, grade="A", min_score=80, max_score=100, description="Distinction"),
            m.GradeScale(school_id=school_id, grade="B", min_score=60, max_score=79, description="Credit"),
            m.GradeScale(school_id=school_id, grade="D", min_score=0, max_score=39, description="Fail"),
        ]
    )
    db.commit()


def test_compute_grade_primary_uses_percentage_bands(db_session):
    # No grade-scale rows: built-in CBC bands, percentage based.
    assert compute_grade(db_session, 1, PRIMARY, 42, 50) == "EE"   # 84%
    assert compute_grade(db_session, 1, PRIMARY, 20, 50) == "AE"   # 40%
    assert compute_grade(db_session, 1, JUNIOR, 35, 50) == "ME"    # 70%


def test_compute_grade_senior_keeps_legacy_raw_score_lookup(db_session):
    _seed_legacy_scale(db_session)
    assert compute_grade(db_session, 1, SENIOR, 85, 100) == "A"
    assert compute_grade(db_session, 1, SENIOR, 30, 50) == "D"


def test_legacy_scale_never_applies_to_cbc_levels(db_session):
    _seed_legacy_scale(db_session)
    # Raw 85 would be legacy "A"; CBC must band by percentage instead.
    assert compute_grade(db_session, 1, PRIMARY, 85, 100) == "EE"  # 85%
    assert compute_grade(db_session, 1, JUNIOR, 42, 50) == "EE"    # 84%
    # And the legacy scale still applies to senior.
    assert compute_grade(db_session, 1, SENIOR, 85, 100) == "A"


def test_school_level_specific_scale_overrides_builtin_bands(db_session):
    db_session.add(
        m.GradeScale(
            school_id=1, grade="PM", min_score=60, max_score=100,
            education_level=PRIMARY, description="School primary scale",
        )
    )
    db_session.commit()
    assert compute_grade(db_session, 1, PRIMARY, 70, 100) == "PM"  # 70% → override
    assert compute_grade(db_session, 1, PRIMARY, 55, 100) is None  # below override floor
    assert compute_grade(db_session, 1, JUNIOR, 70, 100) == "ME"   # junior unaffected


# ---------------------------------------------------------------------------
# Full results flow — Raw → % → Band → Mean → Deviation → Progress → Analysis
# ---------------------------------------------------------------------------


def _seed_school(db: Session) -> dict:
    """Seed one school with G5 (primary), G8 (junior), Form 1 (senior) classes."""
    g5 = Level(school_id=1, name="Grade 5", code="G5", display_order=5)
    g8 = Level(school_id=1, name="Grade 8", code="G8", display_order=8)
    form1 = Level(school_id=1, name="Form 1", code="F1", display_order=10)
    db.add_all([g5, g8, form1])
    db.flush()

    c1 = SchoolClass(school_id=1, name="Grade 5 East", code="G5E", level_id=g5.id)
    c2 = SchoolClass(school_id=1, name="Form 1 West", code="F1W", level_id=form1.id)
    db.add_all([c1, c2])
    db.flush()

    students = [
        Student(school_id=1, admission_number="ADM/001", first_name="Amina", last_name="K", level_id=g5.id, current_class_id=c1.id),
        Student(school_id=1, admission_number="ADM/002", first_name="Brian", last_name="O", level_id=g5.id, current_class_id=c1.id),
        Student(school_id=1, admission_number="ADM/003", first_name="Ciku", last_name="M", level_id=g5.id, current_class_id=c1.id),
        Student(school_id=1, admission_number="ADM/004", first_name="Dan", last_name="W", level_id=form1.id, current_class_id=c2.id),
    ]
    db.add_all(students)
    db.flush()

    series = m.ExaminationSeries(school_id=1, name="2026 Term 1")
    exam = m.ExaminationV2(school_id=1, series_id=None, name="Term 1 Assessment", total_marks=100)
    db.add(series)
    db.flush()
    exam.series_id = series.id
    db.add(exam)
    db.flush()

    db.add_all(
        [
            m.ExamSubject(school_id=1, exam_id=exam.id, subject_id=1, class_id=c1.id, total_marks=50),   # Math
            m.ExamSubject(school_id=1, exam_id=exam.id, subject_id=2, class_id=c1.id, total_marks=100),  # English
        ]
    )
    db.flush()
    return {"g5": g5, "g8": g8, "form1": form1, "c1": c1, "c2": c2,
            "students": students, "series": series, "exam": exam}


def _add_entries(db: Session, exam_id: int, rows):
    for sid, subject_id, score in rows:
        db.add(m.ExamEntry(school_id=1, exam_id=exam_id, student_id=sid, subject_id=subject_id, score=score))
    db.commit()


def test_build_results_full_cbc_flow(db_session):
    seed = _seed_school(db_session)
    s1, s2, s3, s4 = seed["students"]
    exam = seed["exam"]

    # Primary CBC entries (Math /50, English /100).
    _add_entries(db_session, exam.id, [
        (s1.id, 1, 40), (s1.id, 2, 90),   # 80% EE, 90% EE → mean 85 EE
        (s2.id, 1, 25), (s2.id, 2, 50),   # 50% ME, 50% ME → mean 50 ME
        (s3.id, 1, 20), (s3.id, 2, 39),   # 40% AE, 39% BE → mean 39.5 BE
        (s4.id, 1, 42), (s4.id, 2, 84),   # senior student (Form 1): 84%, 84%
    ])

    rows, analysis = build_results(db_session, exam)
    by_student = {r["student_id"]: r for r in rows}

    # Raw scores and percentages are both retained.
    assert by_student[s1.id]["subject_scores"][0]["score"] == 40
    assert by_student[s1.id]["subject_scores"][0]["percentage"] == 80.0
    assert by_student[s1.id]["subject_scores"][0]["band"] == "EE"
    assert by_student[s1.id]["subject_scores"][0]["band_label"] == "Exceeding Expectations"

    # Mean → Band stage.
    assert by_student[s1.id]["percentage"] == 85.0 and by_student[s1.id]["band"] == "EE"
    assert by_student[s2.id]["percentage"] == 50.0 and by_student[s2.id]["band"] == "ME"
    assert by_student[s3.id]["percentage"] == 39.5 and by_student[s3.id]["band"] == "BE"
    assert by_student[s1.id]["education_level"] == PRIMARY

    # Senior student: no CBC band, level reported as senior.
    assert by_student[s4.id]["education_level"] == SENIOR
    assert by_student[s4.id]["band"] is None
    assert by_student[s4.id]["percentage"] == 84.0

    # Cohort mean + deviation stage.
    assert analysis["cohort_mean"] == pytest.approx(64.6, abs=0.1)  # (85+50+39.5+84)/4
    assert by_student[s1.id]["deviation"] == pytest.approx(20.4, abs=0.1)
    assert by_student[s3.id]["deviation"] == pytest.approx(-25.1, abs=0.1)
    assert sum(r["deviation"] or 0 for r in rows) == pytest.approx(0.0, abs=0.5)

    # Progress stage: no previous exam in the series yet.
    assert all(r["progress"] is None for r in rows)
    assert analysis["progress_summary"] == {"improved": 0, "declined": 0, "unchanged": 0, "not_available": 4}

    # Analysis stage.
    assert analysis["education_levels"] == {PRIMARY: 3, SENIOR: 1}
    assert analysis["band_distribution"] == {"EE": 1, "ME": 1, "BE": 1}
    subject_means = {sa["subject_id"]: sa["mean_percentage"] for sa in analysis["subject_analysis"]}
    assert subject_means[1] == pytest.approx(63.5, abs=0.1)  # (80+50+40+84)/4
    assert subject_means[2] == pytest.approx(65.8, abs=0.1)  # (90+50+39+84)/4


def test_build_results_progress_across_exams(db_session):
    seed = _seed_school(db_session)
    s1, s2 = seed["students"][:2]
    series = seed["series"]

    exam1 = seed["exam"]
    exam1.exam_date = datetime.date(2026, 2, 10)
    db_session.add(m.ExaminationV2(
        school_id=1, series_id=series.id, name="Term 2 Assessment",
        total_marks=100, exam_date=datetime.date(2026, 4, 10),
    ))
    db_session.commit()
    exam2 = db_session.query(m.ExaminationV2).filter_by(name="Term 2 Assessment").one()
    # Subject assignment for the second exam (Mathematics /50), like production.
    db_session.add(m.ExamSubject(school_id=1, exam_id=exam2.id, subject_id=1, class_id=seed["c1"].id, total_marks=50))
    db_session.commit()

    _add_entries(db_session, exam1.id, [(s1.id, 1, 40), (s2.id, 1, 25)])  # 80%, 50%
    _add_entries(db_session, exam2.id, [(s1.id, 1, 35), (s2.id, 1, 35)])  # 70%, 70%

    rows2, analysis2 = build_results(db_session, exam2)
    by_student = {r["student_id"]: r for r in rows2}
    assert by_student[s1.id]["progress"] == -10.0
    assert by_student[s2.id]["progress"] == 20.0
    assert analysis2["progress_summary"] == {"improved": 1, "declined": 1, "unchanged": 0, "not_available": 0}


def test_build_results_empty(db_session):
    series = m.ExaminationSeries(school_id=1, name="Empty Series")
    db_session.add(series)
    db_session.flush()
    exam = m.ExaminationV2(school_id=1, series_id=series.id, name="Empty", total_marks=100)
    db_session.add(exam)
    db_session.commit()
    rows, analysis = build_results(db_session, exam)
    assert rows == []
    assert analysis["cohort_size"] == 0
