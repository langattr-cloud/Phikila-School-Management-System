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
    db: Session, school_id: int, version_id: int | m.TtVersion
) -> list[Conflict]:
    """Re-validate a stored timetable.

    Accept either a version id or a loaded TtVersion for compatibility with
    older callers. SQLAlchemy filters must receive the scalar primary-key
    value, never the model instance itself.
    """
    if isinstance(version_id, m.TtVersion):
        version_id = version_id.id
    elif hasattr(version_id, "id") and not isinstance(version_id, int):
        version_id = getattr(version_id, "id")
    if version_id is None:
        return []

    lessons = (
        db.query(m.TtLesson)
        .filter(m.TtLesson.school_id == school_id, m.TtLesson.version_id == int(version_id))
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
                continue
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

    # --- Teacher availability ----------------------------------------------
    availability = _availability_lookup(db, school_id)
    for lesson in lessons:
        for day, period in covered(lesson):
            teacher_rules = availability.get(("teacher", lesson.teacher_id), set())
            class_rules = availability.get(("class", lesson.class_id), set())
            if (day, period) in teacher_rules:
                conflicts.append(Conflict("hard", "teacher_unavailable", f"{label('teacher', lesson.teacher_id)} is unavailable at this time.", [lesson.id], day, period))
            if (day, period) in class_rules:
                conflicts.append(Conflict("hard", "class_unavailable", f"{label('class', lesson.class_id)} is unavailable at this time.", [lesson.id], day, period))

    # --- Subject/class consistency -----------------------------------------
    for lesson in lessons:
        if lesson.class_id not in classes:
            conflicts.append(Conflict("hard", "missing_class", "A scheduled lesson references a missing class.", [lesson.id], lesson.day_index, lesson.period_index))
        if lesson.subject_id not in subjects:
            conflicts.append(Conflict("hard", "missing_subject", "A scheduled lesson references a missing subject.", [lesson.id], lesson.day_index, lesson.period_index))
        if lesson.teacher_id not in teachers:
            conflicts.append(Conflict("hard", "missing_teacher", "A scheduled lesson references a missing teacher.", [lesson.id], lesson.day_index, lesson.period_index))
        if lesson.room_id is not None and lesson.room_id not in rooms:
            conflicts.append(Conflict("hard", "missing_room", "A scheduled lesson references a missing room.", [lesson.id], lesson.day_index, lesson.period_index))

    return conflicts
