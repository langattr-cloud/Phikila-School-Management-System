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
    """Re-validate a stored timetable. Used after manual drag-and-drop edits
    and before publishing. Every check runs against the *covered* teaching
    slots of each lesson so multi-period lessons are validated correctly."""
    lessons = (
        db.query(m.TtLesson)
        .filter(m.TtLesson.school_id == school_id, m.TtLesson.version_id == version_id)
        .all()
    )
    if not lessons:
        return []

    names = _name_lookup(db, school_id)
    calendar = load_calendar(db, school_id)
    conflicts: list[Conflict] = []

    def label(kind: str, ident: int | None) -> str:
        return names.get(kind, {}).get(ident, f"{kind.title()} {ident}")

    def covered(lesson: m.TtLesson) -> list[tuple[int, int]]:
        return _teaching_slots(calendar, lesson.day_index, lesson.period_index, lesson.duration or 1)

    teachers = {t.id: t for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id)}
    rooms = {r.id: r for r in db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id)}
    classes = {c.id: c for c in db.query(m.TtClass).filter(m.TtClass.school_id == school_id)}
    subjects = {s.id: s for s in db.query(m.TtSubject).filter(m.TtSubject.school_id == school_id)}

    # --- Double bookings (interval aware) ----------------------------------
    for key_name, attr in (("teacher", "teacher_id"), ("class", "class_id"), ("room", "room_id")):
        buckets: dict[tuple, list[m.TtLesson]] = {}
        for lesson in lessons:
            ident = getattr(lesson, attr)
            if ident is None:
                continue
            for slot in covered(lesson):
                buckets.setdefault((ident, slot[0], slot[1]), []).append(lesson)
        reported_pairs: set[tuple] = set()
        for (ident, day, period), group in buckets.items():
            unique = {l.id for l in group}
            if len(unique) < 2:
                continue
            pair_key = (key_name, ident, tuple(sorted(unique)))
            if pair_key in reported_pairs:
                continue  # already reported for an earlier overlapping slot
            reported_pairs.add(pair_key)
            who = label(key_name, ident)
            others = ", ".join(sorted({label("class", l.class_id) for l in group}))
            conflicts.append(
                Conflict(
                    "hard",
                    f"{key_name}_double_booked",
                    f"{who} is booked for {len(unique)} lessons at the same time ({others}).",
                    sorted(unique),
                    day,
                    period,
                )
            )

    # --- Per-lesson validity ------------------------------------------------
    teaching_indexes = set(calendar.teaching_indexes)
    for lesson in lessons:
        slot = (lesson.day_index, lesson.period_index)

        if lesson.period_index not in teaching_indexes:
            period_row = next((p for p in calendar.periods if p.index == lesson.period_index), None)
            conflicts.append(
                Conflict(
                    "hard",
                    "break_slot",
                    f"{label('subject', lesson.subject_id)} is scheduled in "
                    f"{period_row.name if period_row else 'a non-teaching period'}, which cannot hold lessons.",
                    [lesson.id],
                    *slot,
                )
            )
        elif not covered(lesson):
            conflicts.append(
                Conflict(
                    "hard",
                    "duration_overflow",
                    f"The {lesson.duration}-period {label('subject', lesson.subject_id)} lesson "
                    "runs into a break or past the end of the teaching day.",
                    [lesson.id],
                    *slot,
                )
            )

        teacher = teachers.get(lesson.teacher_id)
        if teacher:
            for occupied in covered(lesson):
                if occupied in _slots_from_json(teacher.unavailable):
                    conflicts.append(
                        Conflict("hard", "teacher_unavailable",
                                 f"{teacher.name} is marked unavailable at this time.",
                                 [lesson.id], *slot)
                    )
                    break
        room = rooms.get(lesson.room_id)
        if room:
            for occupied in covered(lesson):
                if occupied in _slots_from_json(room.unavailable):
                    conflicts.append(
                        Conflict("hard", "room_unavailable",
                                 f"{room.name} is not available at this time.",
                                 [lesson.id], *slot)
                    )
                    break
        klass = classes.get(lesson.class_id)
        if klass:
            for occupied in covered(lesson):
                if occupied in _slots_from_json(klass.unavailable):
                    conflicts.append(
                        Conflict("hard", "class_unavailable",
                                 f"{klass.name} is not available at this time.",
                                 [lesson.id], *slot)
                    )
                    break
        # A lesson without a room shows up in analytics and the fix-it list.
        if lesson.room_id is None:
            conflicts.append(
                Conflict("soft", "no_room",
                         f"{label('subject', lesson.subject_id)} for "
                         f"{label('class', lesson.class_id)} has no room assigned.",
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
        # Subject-specific room requirements
        subject = subjects.get(lesson.subject_id)
        if subject and subject.required_room_type and room and room.room_type != subject.required_room_type:
            conflicts.append(
                Conflict("hard", "room_type_mismatch",
                         f"{subject.name} requires a '{subject.required_room_type}' room; "
                         f"{room.name} is a {room.room_type}.",
                         [lesson.id], *slot)
            )

    # --- Teacher daily limits and consecutive runs ---------------------------
    by_teacher_day: dict[tuple[int, int], list[m.TtLesson]] = {}
    for lesson in lessons:
        if lesson.teacher_id:
            by_teacher_day.setdefault((lesson.teacher_id, lesson.day_index), []).append(lesson)
    for (teacher_id, day), group in by_teacher_day.items():
        teacher = teachers.get(teacher_id)
        if teacher and teacher.max_lessons_per_day and len(group) > teacher.max_lessons_per_day:
            conflicts.append(
                Conflict("hard", "teacher_daily_limit",
                         f"{label('teacher', teacher_id)} teaches {len(group)} lessons on this "
                         f"day, above the limit of {teacher.max_lessons_per_day}.",
                         [l.id for l in group], day)
            )
        periods = sorted(l.period_index for l in group)
        gaps = (periods[-1] - periods[0] + 1) - len(periods) if len(periods) > 1 else 0
        if gaps >= 2:
            conflicts.append(
                Conflict("soft", "teacher_gaps",
                         f"{label('teacher', teacher_id)} has {gaps} free periods between "
                         f"lessons on this day.",
                         [l.id for l in group], day)
            )
        if teacher and teacher.max_consecutive and len(periods) > 1:
            run = 1
            longest = 1
            for current, previous in zip(periods[1:], periods):
                run = run + 1 if current == previous + 1 else 1
                longest = max(longest, run)
            if longest > teacher.max_consecutive:
                conflicts.append(
                    Conflict("hard", "teacher_consecutive",
                             f"{label('teacher', teacher_id)} has {longest} consecutive lessons "
                             f"on this day, above the limit of {teacher.max_consecutive}.",
                             [l.id for l in group], day)
                )

    # --- Unmet weekly quotas -------------------------------------------------
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

    # --- Soft: same-subject clumping -----------------------------------------
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


def assign_rooms_to_lessons(
    db: Session, school_id: int, version_id: int
) -> int:
    """Greedily assign rooms to lessons that have none.

    Deterministic and conflict-free by construction: for each lesson (sorted
    by slot, then class) the first compatible room that is free in every
    covered slot wins. Compatibility means the subject's required room type
    (when set) and enough seats for the class; the room must also be free in
    the lesson's slot. Lessons that cannot be housed anywhere are left
    unassigned so the conflict engine can report them.

    Returns the number of lessons assigned.
    """
    lessons = (
        db.query(m.TtLesson)
        .filter(m.TtLesson.school_id == school_id, m.TtLesson.version_id == version_id)
        .order_by(
            m.TtLesson.duration.desc(),  # doubles first: harder to place
            m.TtLesson.day_index,
            m.TtLesson.period_index,
            m.TtLesson.class_id,
        )
        .all()
    )
    calendar = load_calendar(db, school_id)
    rooms = (
        db.query(m.TtRoom)
        .filter(m.TtRoom.school_id == school_id)
        .order_by(m.TtRoom.id)
        .all()
    )
    classes = {c.id: c for c in db.query(m.TtClass).filter(m.TtClass.school_id == school_id)}
    subjects = {s.id: s for s in db.query(m.TtSubject).filter(m.TtSubject.school_id == school_id)}

    occupied: dict[tuple[int, int, int], int] = {}  # (room_id, day, period) -> lesson_id
    usage: dict[int, int] = {room.id: 0 for room in rooms}
    assigned = 0

    def covered(lesson: m.TtLesson) -> list[tuple[int, int]]:
        return _teaching_slots(calendar, lesson.day_index, lesson.period_index, lesson.duration or 1)

    # Count rooms already pinned by other lessons so the allocator does not
    # double-book them, and seed usage counts.
    for lesson in lessons:
        if lesson.room_id:
            for slot in covered(lesson):
                occupied[(lesson.room_id, slot[0], slot[1])] = lesson.id
            usage[lesson.room_id] = usage.get(lesson.room_id, 0) + 1

    for lesson in lessons:
        if lesson.room_id:
            continue
        slots = covered(lesson)
        if not slots:
            continue
        subject = subjects.get(lesson.subject_id)
        klass = classes.get(lesson.class_id)
        required_type = subject.required_room_type if subject else None
        unavailable = set()

        def compatible(room: m.TtRoom) -> bool:
            if required_type is not None:
                # Special rooms (labs, computer rooms) are reserved for the
                # subjects that require them.
                if room.room_type != required_type:
                    return False
            else:
                # Ordinary lessons prefer ordinary classrooms so special
                # rooms stay available for the subjects that need them.
                if room.room_type not in ("classroom", "hall"):
                    return False
            if any((room.id, d, p) in occupied for d, p in slots):
                return False
            if any((d, p) in _slots_from_json(room.unavailable) for d, p in slots):
                return False
            return True

        def fits(room: m.TtRoom) -> bool:
            return (
                klass is None
                or not klass.student_count
                or not room.capacity
                or room.capacity >= klass.student_count
            )

        # Strict pass: type + capacity + free. Fallback passes relax the
        # type restriction and finally the capacity, because any room beats
        # no room — and the conflict engine reports the mismatches.
        candidates = [room for room in rooms if compatible(room) and fits(room)]
        if not candidates:
            candidates = [room for room in rooms if fits(room) and not any(
                (room.id, d, p) in occupied for d, p in slots
            )]
        if not candidates:
            candidates = [room for room in rooms if compatible(room)]
        if not candidates:
            continue
        # Least-used first, then lowest id, keeps the result deterministic.
        candidates.sort(key=lambda room: (usage.get(room.id, 0), room.id))
        chosen = candidates[0]
        lesson.room_id = chosen.id
        usage[chosen.id] = usage.get(chosen.id, 0) + 1
        for slot in slots:
            occupied[(chosen.id, slot[0], slot[1])] = lesson.id
        assigned += 1

    db.commit()
    return assigned


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
def _teaching_slots(calendar: SchoolCalendar, day: int, period: int, duration: int) -> list[tuple[int, int]]:
    """The teaching slots a lesson occupying (day, period) for ``duration``
    periods actually covers. Returns an empty list when any part of the span
    falls outside the teaching day (breaks, lunch, or past the last period).
    """
    ordered = [p.index for p in calendar.periods if p.is_teaching]
    try:
        start = ordered.index(period)
    except ValueError:
        return []
    if start + duration > len(ordered):
        return []
    return [(day, p) for p in ordered[start : start + duration]]


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
    db: Session,
    school_id: int,
    lesson: m.TtLesson,
    day: int,
    period: int,
    *,
    teacher_id: int | None = None,
    class_id: int | None = None,
    room_id: int | None = None,
    subject_id: int | None = None,
    duration: int | None = None,
) -> list[dict]:
    """Every concrete reason a slot is unusable, in plain language.

    The optional keyword arguments let callers validate a hypothetical edit
    (new teacher/class/room/duration) before it is applied.
    """
    reasons: list[dict] = []
    names = _name_lookup(db, school_id)
    candidate_teacher = lesson.teacher_id if teacher_id is None else teacher_id
    candidate_class = lesson.class_id if class_id is None else class_id
    candidate_room = lesson.room_id if room_id is None else room_id
    candidate_duration = (lesson.duration or 1) if duration is None else duration

    calendar = load_calendar(db, school_id)
    teaching = set(calendar.teaching_indexes)
    if period not in teaching:
        period_row = next((p for p in calendar.periods if p.index == period), None)
        reasons.append({
            "factor": "Period",
            "detail": f"{period_row.name if period_row else 'This period'} is not a teaching period.",
        })

    span = _teaching_slots(calendar, day, period, candidate_duration)
    if not span:
        reasons.append({
            "factor": "Duration",
            "detail": (
                f"A {candidate_duration}-period lesson starting here would run into a "
                "break or past the end of the teaching day."
            ),
        })

    # Lessons overlapping any part of the candidate span. A duration-1 lesson
    # at (day, period) covers only that slot, keeping this backward compatible.
    span_set = set(span) if span else {(day, period)}
    candidates = (
        db.query(m.TtLesson)
        .filter(
            m.TtLesson.school_id == school_id,
            m.TtLesson.version_id == lesson.version_id,
            m.TtLesson.day_index == day,
            m.TtLesson.id != lesson.id,
        )
        .all()
    )
    others = []
    for other in candidates:
        other_span = set(
            _teaching_slots(calendar, other.day_index, other.period_index, other.duration or 1)
        ) or {(other.day_index, other.period_index)}
        if span_set & other_span:
            others.append(other)

    for other in others:
        if other.class_id == candidate_class:
            reasons.append({
                "factor": names["class"].get(candidate_class, "The class"),
                "detail": f"Already has {names['subject'].get(other.subject_id, 'a lesson')} in this period.",
            })
        if candidate_teacher and other.teacher_id == candidate_teacher:
            reasons.append({
                "factor": names["teacher"].get(candidate_teacher, "The teacher"),
                "detail": f"Already teaching {names['class'].get(other.class_id, 'another class')} in this period.",
            })
        if candidate_room and other.room_id == candidate_room:
            reasons.append({
                "factor": names["room"].get(candidate_room, "The room"),
                "detail": f"Occupied by {names['class'].get(other.class_id, 'another class')}.",
            })

    teacher = db.query(m.TtTeacher).filter(m.TtTeacher.id == candidate_teacher).first()
    if teacher:
        for occupied in span:
            if occupied in _slots_from_json(teacher.unavailable):
                reasons.append({"factor": teacher.name, "detail": "Marked unavailable at this time."})
                break
    room = db.query(m.TtRoom).filter(m.TtRoom.id == candidate_room).first()
    if room:
        for occupied in span:
            if occupied in _slots_from_json(room.unavailable):
                reasons.append({"factor": room.name, "detail": "Not available at this time."})
                break
    klass = db.query(m.TtClass).filter(m.TtClass.id == candidate_class).first()
    if klass:
        for occupied in span:
            if occupied in _slots_from_json(klass.unavailable):
                reasons.append({"factor": klass.name, "detail": "Not available at this time."})
                break

    # Subject-specific room requirements (e.g. Physics needs a lab).
    candidate_subject = lesson.subject_id if subject_id is None else subject_id
    subject = db.query(m.TtSubject).filter(m.TtSubject.id == candidate_subject).first()
    if subject and subject.required_room_type and room:
        if room.room_type != subject.required_room_type:
            reasons.append({
                "factor": subject.name,
                "detail": f"Requires a '{subject.required_room_type}' room; {room.name} is a {room.room_type}.",
            })
    if room and klass and klass.student_count and room.capacity and klass.student_count > room.capacity:
        reasons.append({
            "factor": room.name,
            "detail": f"Seats {room.capacity}, but {klass.name} has {klass.student_count} students.",
        })

    # Hard keep-free rules
    _, avoid_rules = load_constraints(db, school_id)
    for rule in avoid_rules:
        if not rule.is_hard or not (set(rule.slots) & span_set):
            continue
        if rule.scope == "class" and rule.target_id == candidate_class:
            reasons.append({"factor": "Scheduling rule", "detail": rule.note or "This slot must stay free for the class."})
        if rule.scope == "teacher" and rule.target_id == candidate_teacher:
            reasons.append({"factor": "Scheduling rule", "detail": rule.note or "This slot must stay free for the teacher."})

    if teacher:
        same_day_lessons = (
            db.query(m.TtLesson)
            .filter(
                m.TtLesson.school_id == school_id,
                m.TtLesson.version_id == lesson.version_id,
                m.TtLesson.teacher_id == teacher.id,
                m.TtLesson.day_index == day,
                m.TtLesson.id != lesson.id,
            )
            .all()
        )
        if len(same_day_lessons) >= (teacher.max_lessons_per_day or 7):
            reasons.append({
                "factor": teacher.name,
                "detail": f"Already at the daily limit of {teacher.max_lessons_per_day} lessons.",
            })
        # Consecutive-limit check against the candidate span.
        limit = teacher.max_consecutive or 4
        ordered = [p.index for p in calendar.periods if p.is_teaching]
        occupied_indexes = set(span_set)
        occupied_indexes.update(
            (other.day_index, other.period_index) for other in same_day_lessons
        )
        day_slots = sorted({p for d, p in occupied_indexes if d == day})
        if day_slots and limit:
            run = 1
            longest = 1
            for current, previous in zip(day_slots[1:], day_slots):
                run = run + 1 if current == previous + 1 else 1
                longest = max(longest, run)
            if longest > limit:
                reasons.append({
                    "factor": teacher.name,
                    "detail": f"This would mean {longest} consecutive lessons, above the limit of {limit}.",
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
