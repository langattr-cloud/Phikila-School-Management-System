"""CBC examination result computation using canonical academic enrollment context."""
from __future__ import annotations

import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.modules.academics.models import Level
from app.modules.students.models_v2 import Student, StudentEnrollment

from .grading import JUNIOR, PRIMARY, band_for_percentage, band_label, percentage_for
from . import models_v2 as m


def resolve_student_education_level(
    db: Session, student: Student, academic_year_id: int | None = None
) -> tuple[str | None, str]:
    """Resolve academic level from the student's canonical enrollment.

    Legacy current_class_id is deliberately not used as an academic source of
    truth. A missing enrollment returns an unknown level instead of guessing.
    """
    from .grading import education_level_for_grade_code

    query = db.query(StudentEnrollment).filter(
        StudentEnrollment.student_id == student.id,
        StudentEnrollment.school_id == student.school_id,
    )
    if academic_year_id is not None:
        query = query.filter(StudentEnrollment.academic_year_id == academic_year_id)
    enrollment = (
        query.filter(StudentEnrollment.status == "active")
        .order_by(StudentEnrollment.enrollment_date.desc(), StudentEnrollment.id.desc())
        .first()
    )
    if enrollment is None:
        return None, education_level_for_grade_code(None)

    level = None
    if enrollment.level_id:
        level = db.query(Level).filter(
            Level.id == enrollment.level_id,
            Level.school_id == student.school_id,
        ).first()
    if level is None:
        return None, education_level_for_grade_code(None)
    code = level.code or level.name
    return code, education_level_for_grade_code(code)


def _subject_totals(db: Session, exam: m.ExaminationV2) -> dict[int, float]:
    rows = db.query(m.ExamSubject).filter(
        m.ExamSubject.exam_id == exam.id,
        m.ExamSubject.school_id == exam.school_id,
    ).all()
    totals: dict[int, set[float]] = {}
    for row in rows:
        totals.setdefault(row.subject_id, set()).add(float(row.total_marks or 0) or float(exam.total_marks or 0))
    return {
        subject_id: next(iter(values)) if len(values) == 1 else float(exam.total_marks or 0)
        for subject_id, values in totals.items()
    }


def _previous_exam_in_series(db: Session, exam: m.ExaminationV2) -> m.ExaminationV2 | None:
    if exam.series_id is None:
        return None
    siblings = db.query(m.ExaminationV2).filter(
        m.ExaminationV2.series_id == exam.series_id,
        m.ExaminationV2.id != exam.id,
    ).all()
    ordered = sorted(siblings, key=lambda e: (e.exam_date or datetime.date.max, e.id))
    current_key = (exam.exam_date or datetime.date.max, exam.id)
    previous = None
    for candidate in ordered:
        if (candidate.exam_date or datetime.date.max, candidate.id) < current_key:
            previous = candidate
        else:
            break
    return previous


def _student_mean_percentage(
    entries: list[m.ExamEntry], subject_totals: dict[int, float], default_total: float,
) -> tuple[float | None, list[dict[str, Any]]]:
    scores: list[dict[str, Any]] = []
    percentages: list[float] = []
    for entry in entries:
        pct = percentage_for(entry.score, subject_totals.get(entry.subject_id, default_total))
        if pct is not None:
            percentages.append(pct)
        scores.append({
            "subject_id": entry.subject_id,
            "score": entry.score,
            "grade": entry.grade,
            "percentage": pct,
            "band": None,
            "band_label": None,
        })
    mean = round(sum(percentages) / len(percentages), 1) if percentages else None
    return mean, scores


def build_results(
    db: Session,
    exam: m.ExaminationV2,
    class_id: int | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Compute results using StudentEnrollment as the canonical placement.

    ``class_id`` is retained in the function signature for API compatibility,
    but it is no longer used to determine or filter a student's academic
    placement. Callers should use the exam/enrollment academic context.
    """
    school_id = exam.school_id
    entries = db.query(m.ExamEntry).filter(
        m.ExamEntry.exam_id == exam.id,
        m.ExamEntry.school_id == school_id,
    ).all()
    empty = {
        "exam_id": exam.id, "exam_name": exam.name, "cohort_size": 0,
        "education_levels": {}, "cohort_mean": None,
        "band_distribution": {}, "subject_analysis": [], "progress_summary": {},
    }
    if not entries:
        return [], empty

    student_ids = list({e.student_id for e in entries})
    students = db.query(Student).filter(
        Student.id.in_(student_ids), Student.school_id == school_id,
    ).all()
    student_map = {st.id: st for st in students}

    student_entries: dict[int, list[m.ExamEntry]] = {}
    for entry in entries:
        if entry.student_id in student_map:
            student_entries.setdefault(entry.student_id, []).append(entry)

    subject_totals = _subject_totals(db, exam)
    previous = _previous_exam_in_series(db, exam)
    previous_means: dict[int, float] = {}
    if previous is not None:
        prev_entries = db.query(m.ExamEntry).filter(
            m.ExamEntry.exam_id == previous.id,
            m.ExamEntry.school_id == school_id,
        ).all()
        prev_by_student: dict[int, list[m.ExamEntry]] = {}
        for entry in prev_entries:
            prev_by_student.setdefault(entry.student_id, []).append(entry)
        prev_totals = _subject_totals(db, previous)
        for sid, student_entries_prev in prev_by_student.items():
            mean, _ = _student_mean_percentage(
                student_entries_prev, prev_totals, float(previous.total_marks or 0)
            )
            if mean is not None:
                previous_means[sid] = mean

    rows: list[dict[str, Any]] = []
    cohort_percentages: list[float] = []
    level_counts: dict[str, int] = {}
    band_counts: dict[str, int] = {}

    for sid, student_exam_entries in student_entries.items():
        student = student_map[sid]
        level_code, education_level = resolve_student_education_level(
            db, student, getattr(exam, "academic_year_id", None)
        )
        total = sum(entry.score or 0 for entry in student_exam_entries)
        average = round(total / len(student_exam_entries), 1) if student_exam_entries else 0.0
        mean_pct, subject_scores = _student_mean_percentage(
            student_exam_entries, subject_totals, float(exam.total_marks or 0)
        )

        if education_level in (PRIMARY, JUNIOR):
            for subject_score in subject_scores:
                band = band_for_percentage(education_level, subject_score["percentage"])
                if band:
                    subject_score["band"] = band.code
                    subject_score["band_label"] = band.label

        band = band_for_percentage(education_level, mean_pct)
        band_code = band.code if band else None
        if mean_pct is not None:
            cohort_percentages.append(mean_pct)
        if band_code:
            band_counts[band_code] = band_counts.get(band_code, 0) + 1
        level_counts[education_level] = level_counts.get(education_level, 0) + 1

        rows.append({
            "student_id": sid,
            "student_name": f"{student.first_name} {student.last_name}".strip(),
            "admission_number": student.admission_number,
            "subject_scores": subject_scores,
            "total_score": total,
            "average": average,
            "position": None,
            "grade": None,
            "education_level": education_level,
            "percentage": mean_pct,
            "band": band_code,
            "band_label": band_label(education_level, band_code) if band_code else None,
            "deviation": None,
            "progress": None,
            "_level_code": level_code,
        })

    cohort_mean = round(sum(cohort_percentages) / len(cohort_percentages), 1) if cohort_percentages else None
    progress_summary = {"improved": 0, "declined": 0, "unchanged": 0, "not_available": 0}
    for row in rows:
        if row["percentage"] is not None and cohort_mean is not None:
            row["deviation"] = round(row["percentage"] - cohort_mean, 1)
        previous_mean = previous_means.get(row["student_id"])
        if previous_mean is not None and row["percentage"] is not None:
            delta = round(row["percentage"] - previous_mean, 1)
            row["progress"] = delta
            key = "improved" if delta > 0 else "declined" if delta < 0 else "unchanged"
            progress_summary[key] += 1
        else:
            progress_summary["not_available"] += 1

    subject_stats: dict[int, list[float]] = {}
    for student_exam_entries in student_entries.values():
        for entry in student_exam_entries:
            pct = percentage_for(
                entry.score,
                subject_totals.get(entry.subject_id, float(exam.total_marks or 0)),
            )
            if pct is not None:
                subject_stats.setdefault(entry.subject_id, []).append(pct)

    subject_analysis = []
    dominant_level = max(level_counts, key=level_counts.get) if level_counts else None
    for subject_id, percentages in sorted(subject_stats.items()):
        mean = round(sum(percentages) / len(percentages), 1) if percentages else None
        distribution: dict[str, int] = {}
        if dominant_level in (PRIMARY, JUNIOR):
            for pct in percentages:
                band = band_for_percentage(dominant_level, pct)
                if band:
                    distribution[band.code] = distribution.get(band.code, 0) + 1
        subject_analysis.append({
            "subject_id": subject_id,
            "entries": len(percentages),
            "mean_percentage": mean,
            "band_distribution": distribution,
        })

    return rows, {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "cohort_size": len(rows),
        "education_levels": level_counts,
        "cohort_mean": cohort_mean,
        "band_distribution": band_counts,
        "subject_analysis": subject_analysis,
        "progress_summary": progress_summary,
    }
