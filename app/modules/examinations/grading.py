"""CBC / KPSEA / KJSEA grading amendment.

Implements the education-level separation and the four-band CBC performance
scale for Phikila, while leaving the existing (legacy) ``GradeScale`` behaviour
for Senior School completely untouched.

Education-level separation (see docs/examinations-cbc-grading.md):

* **Primary** — Grade 4, 5, 6 (CBC/CBA, SBA, KPSEA)
* **Junior**  — Grade 7, 8, 9 (CBC/CBE, SBA, KJSEA)
* **Senior**  — everything else; keeps the existing configurable per-school
  ``GradeScale`` structure. CBC/KPSEA/KJSEA bands are *never* applied here.

Primary School CBC / KPSEA performance bands (percentage based):

+------+---------------------------+----------+
| Code | Performance level         | Range    |
+======+===========================+==========+
| EE   | Exceeding Expectations    | 80–100%  |
+------+---------------------------+----------+
| ME   | Meeting Expectations      | 50–79%   |
+------+---------------------------+----------+
| AE   | Approaching Expectations  | 40–49%   |
+------+---------------------------+----------+
| BE   | Below Expectations        | 0–39%    |
+------+---------------------------+----------+

The raw numerical score/percentage is always retained alongside the band.
"""

from __future__ import annotations

import re
from typing import NamedTuple

from sqlalchemy.orm import Session

from .models_v2 import GradeScale

PRIMARY = "primary"
JUNIOR = "junior"
SENIOR = "senior"

EDUCATION_LEVELS = (PRIMARY, JUNIOR, SENIOR)

# Grade span for each CBC education level (inclusive). Everything else is
# treated as Senior School and keeps the legacy configurable grade scale.
PRIMARY_GRADES = (4, 5, 6)
JUNIOR_GRADES = (7, 8, 9)


class CbcBand(NamedTuple):
    """One CBC performance band (percentage boundaries, inclusive)."""

    code: str
    label: str
    min_percent: float
    max_percent: float


# Built-in CBC performance bands. The Junior School (KJSEA) uses the same
# four performance levels and ranges as Primary (KPSEA) per KNEC guidance;
# they are kept as separate, per-level definitions so each level's scale can
# be amended independently if a school's policy requires it.
CBC_BANDS: dict[str, list[CbcBand]] = {
    PRIMARY: [
        CbcBand("EE", "Exceeding Expectations", 80.0, 100.0),
        CbcBand("ME", "Meeting Expectations", 50.0, 79.0),
        CbcBand("AE", "Approaching Expectations", 40.0, 49.0),
        CbcBand("BE", "Below Expectations", 0.0, 39.0),
    ],
    JUNIOR: [
        CbcBand("EE", "Exceeding Expectations", 80.0, 100.0),
        CbcBand("ME", "Meeting Expectations", 50.0, 79.0),
        CbcBand("AE", "Approaching Expectations", 40.0, 49.0),
        CbcBand("BE", "Below Expectations", 0.0, 39.0),
    ],
}

_GRADE_NUMBER = re.compile(r"(\d+)")


def education_level_for_grade_code(code: str | None) -> str:
    """Classify a level/class code into a CBC education level.

    ``code`` may be a ``Level`` code such as ``G5``/``Grade 8`` or a class
    code such as ``G8A``. The first integer found in the string is the grade
    number: 4–6 → primary, 7–9 → junior, anything else → senior.
    """
    if not code:
        return SENIOR
    match = _GRADE_NUMBER.search(str(code))
    if not match:
        return SENIOR
    grade = int(match.group(1))
    if PRIMARY_GRADES[0] <= grade <= PRIMARY_GRADES[-1]:
        return PRIMARY
    if JUNIOR_GRADES[0] <= grade <= JUNIOR_GRADES[-1]:
        return JUNIOR
    return SENIOR


def percentage_for(score: float | None, total: float | None) -> float | None:
    """Raw score → percentage. Returns ``None`` when it cannot be computed."""
    if score is None or total is None or total <= 0:
        return None
    return round((float(score) / float(total)) * 100.0, 1)


def band_for_percentage(education_level: str, percentage: float | None) -> CbcBand | None:
    """Percentage → CBC performance band (primary/junior only).

    Bands are continuous thresholds ordered highest-first (EE ≥ 80, ME ≥ 50,
    AE ≥ 40, otherwise BE), so every percentage maps to exactly one band.
    """
    if percentage is None or education_level not in (PRIMARY, JUNIOR):
        return None
    for band in CBC_BANDS[education_level]:
        if percentage >= band.min_percent:
            return band
    return None


def band_label(education_level: str, code: str | None) -> str | None:
    """Human-readable label for a band code (e.g. ``ME`` → Meeting Expectations)."""
    if not code or education_level not in (PRIMARY, JUNIOR):
        return None
    for band in CBC_BANDS[education_level]:
        if band.code == code:
            return band.label
    return None


def cbc_scale_for_school(db: Session, school_id: int, education_level: str) -> list[GradeScale]:
    """School-level CBC band overrides (``grade_scales.education_level`` rows).

    When a school has configured its own rows for a CBC level, they override
    the built-in bands; otherwise the built-in KNEC bands apply.
    """
    return (
        db.query(GradeScale)
        .filter(
            GradeScale.school_id == school_id,
            GradeScale.education_level == education_level,
        )
        .order_by(GradeScale.min_score.desc())
        .all()
    )


def senior_scale_for_school(db: Session, school_id: int) -> list[GradeScale]:
    """Legacy (Senior School) grade-scale rows.

    Existing rows have ``education_level`` NULL; rows explicitly scoped to
    ``senior`` are also honoured. This preserves the current behaviour
    exactly for schools that never touch the new column.
    """
    return (
        db.query(GradeScale)
        .filter(
            GradeScale.school_id == school_id,
            (GradeScale.education_level.is_(None)) | (GradeScale.education_level == SENIOR),
        )
        .order_by(GradeScale.min_score.desc())
        .all()
    )


def compute_grade(
    db: Session,
    school_id: int,
    education_level: str,
    score: float | None,
    total: float | None,
) -> str | None:
    """Resolve the grade/band code for one score.

    * Primary/Junior: percentage-based CBC bands (built-in, or school-scoped
      ``GradeScale`` rows for that education level).
    * Senior: the legacy raw-score ``GradeScale`` lookup — unchanged.
    """
    if score is None:
        return None
    if education_level in (PRIMARY, JUNIOR):
        percentage = percentage_for(score, total)
        if percentage is None:
            return None
        rows = cbc_scale_for_school(db, school_id, education_level)
        if rows:
            for gs in rows:  # ordered min_score desc → first matching floor wins
                if percentage >= gs.min_score:
                    return gs.grade
            return None
        band = band_for_percentage(education_level, percentage)
        return band.code if band else None
    # Senior / legacy behaviour.
    rows = senior_scale_for_school(db, school_id)
    for gs in rows:
        if gs.min_score <= float(score) <= gs.max_score:
            return gs.grade
    return None
