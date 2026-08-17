"""Results computation for examinations.

Implements the CBC / KPSEA / KJSEA grading flow while preserving the existing
result fields (total score, average, position) and the legacy Senior School
grade-scale behaviour:

    Raw Score → Percentage → Band (EE/ME/AE/BE) → Mean → Deviation → Progress → Analysis
"""

from __future__ import annotations

import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.modules.academics.models import Level
from app.modules.students.models_v2 import SchoolClass, Student

from .grading import (
    JUNIOR,
    PRIMARY,
    band_for_percentage,
    band_label,
    percentage_for,
)
from . import models_v2 as m


def resolve_student_education_level(db: Session, student: Student) -> tuple[str | None, str]:
    """Resolve a student's grade code and CBC education level.

    Resolution order: student level → current class → class grade.
    Returns ``(grade_code, education_level)`` where ``grade_code`` is the
    human-readable code (e.g. ``G5``) or None when unknown.
    """
    from .grading import education_level_for_grade_code

    def _level_row(level_id: int | None) -> Level | None:
        if not level_id:
            return None
        return db.query(Level).filter(Level.id == level_id).first()

    level = _level_row(student.level_id)
    cls: SchoolClass | None = None
    if level is None and student.current_class_id:
        cls = db.query(SchoolClass).filter(SchoolClass.id == student.current_class_id).first()
        if cls is not None:
            level = _level_row(cls.level_id)
            if level is None and cls.grade:
                return cls.grade, education_level_for_grade_code(cls.grade)
    if level is not None:
        code = level.code or level.name
        return code, education_level_for_grade_code(code)
    return None, education_level_for_grade_code(None)


def _subject_totals(db: Session, exam: m.ExaminationV2) -> dict[int, float]:
    """Map subject_id → its total marks for this exam.

    Falls back to the examination's ``total_marks`` when a subject has no
    explicit assignment (or assignments disagree across classes).
    """
    rows = (
        db.query(m.ExamSubject)
        .filter(m.ExamSubject.exam_id == exam.id, m.ExamSubject.school_id == exam.school_id)
        .all()
    )
    totals: dict[int, set[float]] = {}
    for row in rows:
        totals.setdefault(row.subject_id, set()).add(float(row.total_marks or 0) or exam.total_marks)
    return {
        subject_id: next(iter(values)) if len(values) == 1 else float(exam.total_marks or 0)
        for subject_id, values in totals.items()
    }


def _previous_exam_in_series(db: Session, exam: m.ExaminationV2) -> m.ExaminationV2 | None:
    """The most recent earlier exam in the same series, if any."""
    if exam.series_id is None:
        return None
    siblings = (
        db.query(m.ExaminationV2)
        .filter(m.ExaminationV2.series_id == exam.series_id, m.ExaminationV2.id != exam.id)
        .all()
    )
    ordered = sorted(
        siblings,
        key=lambda e: (e.exam_date if e.exam_date else datetime.date.max, e.id),
    )
    current_key = (exam.exam_date if exam.exam_date else datetime.date.max, exam.id)
    previous = None
    for candidate in ordered:
        if (candidate.exam_date if candidate.exam_date else datetime.date.max, candidate.id) < current_key:
            previous = candidate
        else:
            break
    return previous


def _student_mean_percentage(
    entries: list[m.ExamEntry],
    subject_totals: dict[int, float],
    default_total: float,
) -> tuple[float | None, list[dict[str, Any]]]:
    """Per-student mean percentage + per-subject breakdown (raw → % → band)."""
    subject_scores: list[dict[str, Any]] = []
    percentages: list[float] = []
    for entry in entries:
        total = subject_totals.get(entry.subject_id, default_total)
        pct = percentage_for(entry.score, total)
        if pct is not None:
            percentages.append(pct)
        subject_scores.append(
            {
                "subject_id": entry.subject_id,
                "score": entry.score,
                "grade": entry.grade,
                "percentage": pct,
                "band": None,
                "band_label": None,
            }
        )
    mean = round(sum(percentages) / len(percentages), 1) if percentages else None
    return mean, subject_scores


def build_results(
    db: Session,
    exam: m.ExaminationV2,
    class_id: int | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Compute the full CBC result flow for one exam.

    Returns ``(rows, analysis)`` where ``rows`` contains one dict per student
    (hydrating ``StudentResult``) and ``analysis`` hydrates
    ``ResultsAnalysis``.
    """
    school_id = exam.school_id
    entries = (
        db.query(m.ExamEntry)
        .filter(m.ExamEntry.exam_id == exam.id, m.ExamEntry.school_id == school_id)
        .all()
    )
    if not entries:
        return [], {
            "exam_id": exam.id, "exam_name": exam.name, "cohort_size": 0,
            "education_levels": {}, "cohort_mean": None,
            "band_distribution": {}, "subject_analysis": [], "progress_summary": {},
        }

    student_ids = list({e.student_id for e in entries})
    students = db.query(Student).filter(Student.id.in_(student_ids), Student.school_id == school_id).all()
    if class_id is not None:
        students = [st for st in students if st.current_class_id == class_id]
    student_map = {st.id: st for st in students}

    student_entries: dict[int, list[m.ExamEntry]] = {}
    for e in entries:
        if e.student_id in student_map:
            student_entries.setdefault(e.student_id, []).append(e)

    subject_totals = _subject_totals(db, exam)
    previous = _previous_exam_in_series(db, exam)
    previous_means: dict[int, float] = {}
    if previous is not None:
        prev_entries = (
            db.query(m.ExamEntry)
            .filter(m.ExamEntry.exam_id == previous.id, m.ExamEntry.school_id == school_id)
            .all()
        )
        prev_by_student: dict[int, list[m.ExamEntry]] = {}
        for e in prev_entries:
            prev_by_student.setdefault(e.student_id, []).append(e)
        prev_totals = _subject_totals(db, previous)
        prev_default_total = float(previous.total_marks or 0)
        for sid, ents in prev_by_student.items():
            mean, _ = _student_mean_percentage(ents, prev_totals, prev_default_total)
            if mean is not None:
                previous_means[sid] = mean

    rows: list[dict[str, Any]] = []
    cohort_percentages: list[float] = []
    level_counts: dict[str, int] = {}
    band_counts: dict[str, int] = {}

    for sid, ents in student_entries.items():
        st = student_map[sid]
        level_code, education_level = resolve_student_education_level(db, st)
        total = sum(e.score or 0 for e in ents)
        avg = round(total / len(ents), 1) if ents else 0.0
        mean_pct, subject_scores = _student_mean_percentage(
            ents, subject_totals, float(exam.total_marks or 0)
        )

        if education_level in (PRIMARY, JUNIOR):
            for row in subject_scores:
                band = band_for_percentage(education_level, row["percentage"])
                if band is not None:
                    row["band"] = band.code
                    row["band_label"] = band.label

        band = band_for_percentage(education_level, mean_pct)
        band_code = band.code if band else None

        if mean_pct is not None:
            cohort_percentages.append(mean_pct)
        if band_code:
            band_counts[band_code] = band_counts.get(band_code, 0) + 1
        level_counts[education_level] = level_counts.get(education_level, 0) + 1

        rows.append(
            {
                "student_id": sid,
                "student_name": f"{st.first_name} {st.last_name}".strip(),
                "admission_number": st.admission_number,
                "subject_scores": subject_scores,
                "total_score": total,
                "average": avg,
                "position": None,
                "grade": None,
                "education_level": education_level,
                "percentage": mean_pct,
                "band": band_code,
                "band_label": band_label(education_level, band_code) if band_code else None,
                "deviation": None,
                "progress": None,
                "_level_code": level_code,
            }
        )

    cohort_mean = round(sum(cohort_percentages) / len(cohort_percentages), 1) if cohort_percentages else None

    progress_summary = {"improved": 0, "declined": 0, "unchanged": 0, "not_available": 0}
    for row in rows:
        if row["percentage"] is not None and cohort_mean is not None:
            row["deviation"] = round(row["percentage"] - cohort_mean, 1)
        if row["student_id"] in previous_means and row["percentage"] is not None:
            delta = round(row["percentage"] - previous_means[row["student_id"]], 1)
            row["progress"] = delta
            if delta > 0:
                progress_summary["improved"] += 1
            elif delta < 0:
                progress_summary["declined"] += 1
            else:
                progress_summary["unchanged"] += 1
        else:
            progress_summary["not_available"] += 1

    # Subject-level analysis across the cohort.
    subject_stats: dict[int, dict[str, Any]] = {}
    for sid, ents in student_entries.items():
        for e in ents:
            total = subject_totals.get(e.subject_id, float(exam.total_marks or 0))
            pct = percentage_for(e.score, total)
            stats = subject_stats.setdefault(
                e.subject_id, {"percentages": [], "bands": {}}
            )
            if pct is not None:
                stats["percentages"].append(pct)
    subject_analysis = []
    for subject_id, stats in sorted(subject_stats.items()):
        pcts = stats["percentages"]
        mean = round(sum(pcts) / len(pcts), 1) if pcts else None
        band_dist: dict[str, int] = {}
        # Band each subject percentage at the cohort's dominant education level.
        dominant_level = max(level_counts, key=level_counts.get) if level_counts else None
        if dominant_level in (PRIMARY, JUNIOR):
            for pct in pcts:
                band = band_for_percentage(dominant_level, pct)
                if band is not None:
                    band_dist[band.code] = band_dist.get(band.code, 0) + 1
        subject_analysis.append(
            {
                "subject_id": subject_id,
                "entries": len(pcts),
                "mean_percentage": mean,
                "band_distribution": band_dist,
            }
        )

    analysis = {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "cohort_size": len(rows),
        "education_levels": level_counts,
        "cohort_mean": cohort_mean,
        "band_distribution": band_counts,
        "subject_analysis": subject_analysis,
        "progress_summary": progress_summary,
    }
    return rows, analysis
