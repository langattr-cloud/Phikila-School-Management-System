"""Bridges database rows to the pure solver, and provides conflict analysis.

Keeping this translation layer separate means :mod:`solver` stays free of ORM
imports and can be unit-tested (or moved into a standalone worker) untouched.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from sqlalchemy.orm import Session

from . import models as m
from .solver import (
    AvoidRule,
    ClassSpec,
    Placement,
    RequirementSpec,
    RoomSpec,
    SolverInput,
    SubjectSpec,
    TeacherSpec,
    Weights,
    score,
)

DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]


def _slots_from_json(raw: dict | None) -> set[tuple[int, int]]:
    """Parse ``{"0": [3, 4]}`` into ``{(0, 3), (0, 4)}``."""
    out: set[tuple[int, int]] = set()
    if not isinstance(raw, dict):
        return out
    for day, periods in raw.items():
        try:
            day_index = int(day)
        except (TypeError, ValueError):
            continue
        if isinstance(periods, list):
            for period in periods:
                try:
                    out.add((day_index, int(period)))
                except (TypeError, ValueError):
                    continue
    return out


@dataclass
class SchoolCalendar:
    days: list[m.TtDay]
    periods: list[m.TtPeriod]

    @property
    def day_indexes(self) -> list[int]:
        return [d.index for d in self.days if d.is_active]

    @property
    def teaching_indexes(self) -> list[int]:
        return [p.index for p in self.periods if p.is_teaching]

    @property
    def morning_indexes(self) -> list[int]:
        """Teaching periods that start before midday."""
        result = []
        for period in self.periods:
            if not period.is_teaching:
                continue
            try:
                hour = int(str(period.start_time).split(":")[0])
            except (ValueError, IndexError):
                continue
            if hour < 12:
                result.append(period.index)
        return result


def load_calendar(db: Session, school_id: int) -> SchoolCalendar:
    days = (
        db.query(m.TtDay)
        .filter(m.TtDay.school_id == school_id)
        .order_by(m.TtDay.index)
        .all()
    )
    periods = (
        db.query(m.TtPeriod)
        .filter(m.TtPeriod.school_id == school_id)
        .order_by(m.TtPeriod.index)
        .all()
    )
    return SchoolCalendar(days=days, periods=periods)


def build_input(db: Session, school_id: int, *, max_seconds: float = 30.0) -> SolverInput:
    """Assemble everything the solver needs for one school."""
    calendar = load_calendar(db, school_id)

    teachers = {
        t.id: TeacherSpec(
            id=t.id,
            name=t.name,
            max_per_day=t.max_lessons_per_day or 7,
            max_consecutive=t.max_consecutive or 4,
            unavailable=_slots_from_json(t.unavailable),
        )
        for t in db.query(m.TtTeacher).filter(
            m.TtTeacher.school_id == school_id, m.TtTeacher.is_active.is_(True)
        )
    }
    rooms = {
        r.id: RoomSpec(
            id=r.id,
            name=r.name,
            capacity=r.capacity or 40,
            room_type=r.room_type or "classroom",
            unavailable=_slots_from_json(r.unavailable),
        )
        for r in db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id)
    }
    classes = {
        c.id: ClassSpec(
            id=c.id,
            name=c.name,
            student_count=c.student_count or 40,
            unavailable=_slots_from_json(c.unavailable),
        )
        for c in db.query(m.TtClass).filter(m.TtClass.school_id == school_id)
    }
    subjects = {
        s.id: SubjectSpec(
            id=s.id,
            name=s.name,
            prefers_morning=bool(s.prefers_morning),
            spread_across_week=bool(s.spread_across_week),
            required_room_type=s.required_room_type,
        )
        for s in db.query(m.TtSubject).filter(m.TtSubject.school_id == school_id)
    }
    requirements = [
        RequirementSpec(
            id=r.id,
            class_id=r.class_id,
            subject_id=r.subject_id,
            teacher_id=r.teacher_id,
            room_id=r.room_id,
            periods_per_week=r.periods_per_week or 1,
            double_periods=r.double_periods or 0,
        )
        for r in db.query(m.TtLessonRequirement).filter(
            m.TtLessonRequirement.school_id == school_id
        )
    ]

    weights, avoid_rules = load_constraints(db, school_id)

    return SolverInput(
        days=calendar.day_indexes,
        periods=[p.index for p in calendar.periods],
        teaching_periods=calendar.teaching_indexes,
        morning_periods=calendar.morning_indexes,
        teachers=teachers,
        rooms=rooms,
        classes=classes,
        subjects=subjects,
        requirements=requirements,
        weights=weights,
        avoid_rules=avoid_rules,
        max_seconds=max_seconds,
    )


def load_constraints(db: Session, school_id: int) -> tuple[Weights, list[AvoidRule]]:
    """Translate stored constraint rows into solver weights and avoid rules."""
    weights = Weights()
    avoid: list[AvoidRule] = []

    rows = db.query(m.TtConstraint).filter(
        m.TtConstraint.school_id == school_id, m.TtConstraint.enabled.is_(True)
    )
    for row in rows:
        params = row.params if isinstance(row.params, dict) else {}
        if row.kind == "weight":
            key = params.get("key")
            if key and hasattr(weights, key):
                setattr(weights, key, int(row.weight))
        elif row.kind == "avoid_lessons" and row.target_id:
            slots = _slots_from_json(params.get("slots"))
            if slots:
                avoid.append(
                    AvoidRule(
                        scope="teacher" if row.scope == "teacher" else "class",
                        target_id=row.target_id,
                        slots=slots,
                        is_hard=bool(row.is_hard),
                        weight=int(row.weight or 25),
                        note=row.note or "",
                    )
                )
    return weights, avoid


# --------------------------------------------------------------------------
# Conflict detection on a saved timetable
# --------------------------------------------------------------------------
@dataclass
class Conflict:
    severity: str  # "hard" | "soft"
    kind: str
    message: str
    lesson_ids: list[int]
    day: int | None = None
    period: int | None = None

    def as_dict(self) -> dict:
        return {
            "severity": self.severity,
            "kind": self.kind,
            "message": self.message,
            "lesson_ids": self.lesson_ids,
            "day": self.day,
            "period": self.period,
        }


def detect_conflicts(
    db: Session, school_id: int, version_id: int
) -> list[Conflict]:
    """Re-validate a stored timetable. Used after manual drag-and-drop edits."""
    lessons = (
        db.query(m.TtLesson)
        .filter(m.TtLesson.school_id == school_id, m.TtLesson.version_id == version_id)
        .all()
    )
    if not lessons:
        return []

    names = _name_lookup(db, school_id)
    conflicts: list[Conflict] = []

    def label(kind: str, ident: int | None) -> str:
        return names.get(kind, {}).get(ident, f"{kind.title()} {ident}")

    # Double bookings
    for key_name, attr in (("teacher", "teacher_id"), ("class", "class_id"), ("room", "room_id")):
        buckets: dict[tuple, list[m.TtLesson]] = {}
        for lesson in lessons:
            ident = getattr(lesson, attr)
            if ident is None:
                continue
            buckets.setdefault((ident, lesson.day_index, lesson.period_index), []).append(lesson)
        for (ident, day, period), group in buckets.items():
            if len(group) > 1:
                who = label(key_name, ident)
                others = ", ".join(sorted({label("class", l.class_id) for l in group}))
                conflicts.append(
                    Conflict(
                        "hard",
                        f"{key_name}_double_booked",
                        f"{who} is booked for {len(group)} lessons at the same time ({others}).",
                        [l.id for l in group],
                        day,
                        period,
                    )
                )

    # Availability violations
    teachers = {t.id: t for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id)}
    rooms = {r.id: r for r in db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id)}
    classes = {c.id: c for c in db.query(m.TtClass).filter(m.TtClass.school_id == school_id)}

    for lesson in lessons:
        slot = (lesson.day_index, lesson.period_index)
        teacher = teachers.get(lesson.teacher_id)
        if teacher and slot in _slots_from_json(teacher.unavailable):
            conflicts.append(
                Conflict("hard", "teacher_unavailable",
                         f"{teacher.name} is marked unavailable at this time.",
                         [lesson.id], *slot)
            )
        room = rooms.get(lesson.room_id)
        if room and slot in _slots_from_json(room.unavailable):
            conflicts.append(
                Conflict("hard", "room_unavailable",
                         f"{room.name} is not available at this time.",
                         [lesson.id], *slot)
            )
        klass = classes.get(lesson.class_id)
        if klass and slot in _slots_from_json(klass.unavailable):
            conflicts.append(
                Conflict("hard", "class_unavailable",
                         f"{klass.name} is not available at this time.",
                         [lesson.id], *slot)
            )
        # Room capacity
        if room and klass and klass.student_count and room.capacity:
            if klass.student_count > room.capacity:
                conflicts.append(
                    Conflict("hard", "room_capacity",
                             f"{klass.name} has {klass.student_count} students but "
                             f"{room.name} seats {room.capacity}.",
                             [lesson.id], *slot)
                )

    # Unmet weekly quotas
    requirements = db.query(m.TtLessonRequirement).filter(
        m.TtLessonRequirement.school_id == school_id
    ).all()
    placed: dict[int, int] = {}
    for lesson in lessons:
        if lesson.requirement_id:
            placed[lesson.requirement_id] = placed.get(lesson.requirement_id, 0) + 1
    for req in requirements:
        got = placed.get(req.id, 0)
        if got != (req.periods_per_week or 0):
            conflicts.append(
                Conflict(
                    "hard",
                    "quota_mismatch",
                    f"{label('subject', req.subject_id)} for {label('class', req.class_id)} "
                    f"has {got} of {req.periods_per_week} weekly lessons scheduled.",
                    [],
                )
            )

    # Soft: teacher gaps and same-subject clumping
    by_teacher_day: dict[tuple[int, int], list[m.TtLesson]] = {}
    for lesson in lessons:
        if lesson.teacher_id:
            by_teacher_day.setdefault((lesson.teacher_id, lesson.day_index), []).append(lesson)
    for (teacher_id, day), group in by_teacher_day.items():
        periods = sorted(l.period_index for l in group)
        gaps = (periods[-1] - periods[0] + 1) - len(periods) if len(periods) > 1 else 0
        if gaps >= 2:
            conflicts.append(
                Conflict("soft", "teacher_gaps",
                         f"{label('teacher', teacher_id)} has {gaps} free periods between "
                         f"lessons on this day.",
                         [l.id for l in group], day)
            )

    clumps: dict[tuple[int, int, int], list[m.TtLesson]] = {}
    for lesson in lessons:
        clumps.setdefault((lesson.class_id, lesson.subject_id, lesson.day_index), []).append(lesson)
    for (class_id, subject_id, day), group in clumps.items():
        if len(group) > 2:
            conflicts.append(
                Conflict("soft", "subject_clumped",
                         f"{label('class', class_id)} has {len(group)} "
                         f"{label('subject', subject_id)} lessons on one day.",
                         [l.id for l in group], day)
            )

    return conflicts


def _name_lookup(db: Session, school_id: int) -> dict[str, dict[int, str]]:
    return {
        "teacher": {t.id: t.name for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id)},
        "class": {c.id: c.name for c in db.query(m.TtClass).filter(m.TtClass.school_id == school_id)},
        "room": {r.id: r.name for r in db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id)},
        "subject": {s.id: s.name for s in db.query(m.TtSubject).filter(m.TtSubject.school_id == school_id)},
    }


# --------------------------------------------------------------------------
# Explainability: why can't this lesson move there?
# --------------------------------------------------------------------------
def explain_move(
    db: Session, school_id: int, lesson_id: int, day: int, period: int
) -> dict:
    """Answer "why can't this move here?" with concrete blocking reasons."""
    lesson = (
        db.query(m.TtLesson)
        .filter(m.TtLesson.id == lesson_id, m.TtLesson.school_id == school_id)
        .first()
    )
    if not lesson:
        return {"allowed": False, "reasons": [{"factor": "Lesson", "detail": "Lesson not found."}], "alternatives": []}

    reasons = _blockers(db, school_id, lesson, day, period)
    return {
        "allowed": not reasons,
        "reasons": reasons,
        "alternatives": suggest_slots(db, school_id, lesson, limit=3),
    }


def _blockers(
    db: Session, school_id: int, lesson: m.TtLesson, day: int, period: int
) -> list[dict]:
    """Every concrete reason a slot is unusable, in plain language."""
    reasons: list[dict] = []
    names = _name_lookup(db, school_id)
    slot = (day, period)

    calendar = load_calendar(db, school_id)
    teaching = set(calendar.teaching_indexes)
    if period not in teaching:
        period_row = next((p for p in calendar.periods if p.index == period), None)
        reasons.append({
            "factor": "Period",
            "detail": f"{period_row.name if period_row else 'This period'} is not a teaching period.",
        })

    others = (
        db.query(m.TtLesson)
        .filter(
            m.TtLesson.school_id == school_id,
            m.TtLesson.version_id == lesson.version_id,
            m.TtLesson.day_index == day,
            m.TtLesson.period_index == period,
            m.TtLesson.id != lesson.id,
        )
        .all()
    )

    for other in others:
        if other.class_id == lesson.class_id:
            reasons.append({
                "factor": names["class"].get(lesson.class_id, "The class"),
                "detail": f"Already has {names['subject'].get(other.subject_id, 'a lesson')} in this period.",
            })
        if lesson.teacher_id and other.teacher_id == lesson.teacher_id:
            reasons.append({
                "factor": names["teacher"].get(lesson.teacher_id, "The teacher"),
                "detail": f"Already teaching {names['class'].get(other.class_id, 'another class')} in this period.",
            })
        if lesson.room_id and other.room_id == lesson.room_id:
            reasons.append({
                "factor": names["room"].get(lesson.room_id, "The room"),
                "detail": f"Occupied by {names['class'].get(other.class_id, 'another class')}.",
            })

    teacher = db.query(m.TtTeacher).filter(m.TtTeacher.id == lesson.teacher_id).first()
    if teacher and slot in _slots_from_json(teacher.unavailable):
        reasons.append({"factor": teacher.name, "detail": "Marked unavailable at this time."})
    room = db.query(m.TtRoom).filter(m.TtRoom.id == lesson.room_id).first()
    if room and slot in _slots_from_json(room.unavailable):
        reasons.append({"factor": room.name, "detail": "Not available at this time."})
    klass = db.query(m.TtClass).filter(m.TtClass.id == lesson.class_id).first()
    if klass and slot in _slots_from_json(klass.unavailable):
        reasons.append({"factor": klass.name, "detail": "Not available at this time."})

    # Hard keep-free rules
    _, avoid_rules = load_constraints(db, school_id)
    for rule in avoid_rules:
        if not rule.is_hard or slot not in rule.slots:
            continue
        if rule.scope == "class" and rule.target_id == lesson.class_id:
            reasons.append({"factor": "Scheduling rule", "detail": rule.note or "This slot must stay free for the class."})
        if rule.scope == "teacher" and rule.target_id == lesson.teacher_id:
            reasons.append({"factor": "Scheduling rule", "detail": rule.note or "This slot must stay free for the teacher."})

    if teacher:
        same_day = (
            db.query(m.TtLesson)
            .filter(
                m.TtLesson.school_id == school_id,
                m.TtLesson.version_id == lesson.version_id,
                m.TtLesson.teacher_id == teacher.id,
                m.TtLesson.day_index == day,
                m.TtLesson.id != lesson.id,
            )
            .count()
        )
        if same_day >= (teacher.max_lessons_per_day or 7):
            reasons.append({
                "factor": teacher.name,
                "detail": f"Already at the daily limit of {teacher.max_lessons_per_day} lessons.",
            })

    # De-duplicate while keeping order
    seen, unique = set(), []
    for reason in reasons:
        key = (reason["factor"], reason["detail"])
        if key not in seen:
            seen.add(key)
            unique.append(reason)
    return unique


def suggest_slots(
    db: Session, school_id: int, lesson: m.TtLesson, limit: int = 3
) -> list[dict]:
    """Rank empty slots this lesson could legally move to."""
    calendar = load_calendar(db, school_id)
    subject = db.query(m.TtSubject).filter(m.TtSubject.id == lesson.subject_id).first()
    morning = set(calendar.morning_indexes)

    same_subject_days = {
        row.day_index
        for row in db.query(m.TtLesson).filter(
            m.TtLesson.school_id == school_id,
            m.TtLesson.version_id == lesson.version_id,
            m.TtLesson.class_id == lesson.class_id,
            m.TtLesson.subject_id == lesson.subject_id,
            m.TtLesson.id != lesson.id,
        )
    }

    options: list[tuple[int, dict]] = []
    for day in calendar.day_indexes:
        for period in calendar.teaching_indexes:
            if day == lesson.day_index and period == lesson.period_index:
                continue
            if _blockers(db, school_id, lesson, day, period):
                continue
            # Rank: prefer a new day, then the subject's time-of-day preference.
            rank = 0
            if day in same_subject_days:
                rank += 40
            if subject and subject.prefers_morning and period not in morning:
                rank += 20
            rank += period  # gently favour earlier periods
            options.append((rank, {
                "day": day,
                "period": period,
                "day_name": next((d.name for d in calendar.days if d.index == day), str(day)),
                "period_name": next((p.name for p in calendar.periods if p.index == period), str(period)),
            }))

    options.sort(key=lambda pair: pair[0])
    return [opt for _, opt in options[:limit]]
