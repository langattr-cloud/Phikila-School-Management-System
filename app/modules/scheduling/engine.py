"""Database-to-solver translation and timetable conflict analysis.

Scheduling periods are neutral: this module contains no time-of-day ranking or
preference logic.
"""
from __future__ import annotations

from dataclasses import dataclass
from sqlalchemy.orm import Session
from . import models as m
from .solver import AvoidRule, ClassSpec, Placement, RequirementSpec, RoomSpec, SolverInput, SubjectSpec, TeacherSpec, Weights, score

DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

def _slots_from_json(raw: dict | None) -> set[tuple[int, int]]:
    out: set[tuple[int, int]] = set()
    if not isinstance(raw, dict): return out
    for day, periods in raw.items():
        try: day_index = int(day)
        except (TypeError, ValueError): continue
        if isinstance(periods, list):
            for period in periods:
                try: out.add((day_index, int(period)))
                except (TypeError, ValueError): pass
    return out

@dataclass
class SchoolCalendar:
    days: list[m.TtDay]
    periods: list[m.TtPeriod]
    @property
    def day_indexes(self) -> list[int]: return [d.index for d in self.days if d.is_active]
    @property
    def teaching_indexes(self) -> list[int]: return [p.index for p in self.periods if p.is_teaching]

def load_calendar(db: Session, school_id: int) -> SchoolCalendar:
    days = db.query(m.TtDay).filter(m.TtDay.school_id == school_id).order_by(m.TtDay.index).all()
    periods = db.query(m.TtPeriod).filter(m.TtPeriod.school_id == school_id).order_by(m.TtPeriod.index).all()
    return SchoolCalendar(days=days, periods=periods)

def build_input(db: Session, school_id: int, *, max_seconds: float = 30.0) -> SolverInput:
    calendar = load_calendar(db, school_id)
    teachers = {t.id: TeacherSpec(t.id, t.name, t.max_lessons_per_day or 7, t.max_consecutive or 4, _slots_from_json(t.unavailable)) for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id, m.TtTeacher.is_active.is_(True))}
    rooms = {r.id: RoomSpec(r.id, r.name, r.capacity or 40, r.room_type or "classroom", _slots_from_json(r.unavailable)) for r in db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id)}
    classes = {c.id: ClassSpec(c.id, c.name, c.student_count or 40, _slots_from_json(c.unavailable)) for c in db.query(m.TtClass).filter(m.TtClass.school_id == school_id)}
    subjects = {s.id: SubjectSpec(s.id, s.name, bool(s.spread_across_week), s.required_room_type) for s in db.query(m.TtSubject).filter(m.TtSubject.school_id == school_id)}
    requirements = [RequirementSpec(r.id, r.class_id, r.subject_id, r.teacher_id, r.room_id, r.periods_per_week or 1, r.double_periods or 0) for r in db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id == school_id)]
    weights, avoid_rules = load_constraints(db, school_id)
    return SolverInput(days=calendar.day_indexes, periods=[p.index for p in calendar.periods], teaching_periods=calendar.teaching_indexes, teachers=teachers, rooms=rooms, classes=classes, subjects=subjects, requirements=requirements, weights=weights, avoid_rules=avoid_rules, max_seconds=max_seconds)

def load_constraints(db: Session, school_id: int) -> tuple[Weights, list[AvoidRule]]:
    weights = Weights(); avoid: list[AvoidRule] = []
    rows = db.query(m.TtConstraint).filter(m.TtConstraint.school_id == school_id, m.TtConstraint.enabled.is_(True))
    for row in rows:
        params = row.params if isinstance(row.params, dict) else {}
        if row.kind == "weight":
            key = params.get("key")
            if key and hasattr(weights, key): setattr(weights, key, int(row.weight))
        elif row.kind == "avoid_lessons" and row.target_id:
            slots = _slots_from_json(params.get("slots"))
            if slots: avoid.append(AvoidRule("teacher" if row.scope == "teacher" else "class", row.target_id, slots, bool(row.is_hard), int(row.weight or 25), row.note or ""))
    return weights, avoid

@dataclass
class Conflict:
    severity: str
    kind: str
    message: str
    lesson_ids: list[int]
    day: int | None = None
    period: int | None = None
    def as_dict(self) -> dict:
        return {"severity": self.severity, "kind": self.kind, "message": self.message, "lesson_ids": self.lesson_ids, "day": self.day, "period": self.period}

def _teaching_slots(calendar: SchoolCalendar, day: int, period: int, duration: int) -> list[tuple[int, int]]:
    ordered = calendar.teaching_indexes
    try: start = ordered.index(period)
    except ValueError: return []
    if start + duration > len(ordered): return []
    return [(day, p) for p in ordered[start:start + duration]]

def _name_lookup(db: Session, school_id: int) -> dict[str, dict[int, str]]:
    return {"teacher": {t.id:t.name for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id)}, "class": {c.id:c.name for c in db.query(m.TtClass).filter(m.TtClass.school_id == school_id)}, "room": {r.id:r.name for r in db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id)}, "subject": {s.id:s.name for s in db.query(m.TtSubject).filter(m.TtSubject.school_id == school_id)}}

def detect_conflicts(db: Session, school_id: int, version_id: int) -> list[Conflict]:
    lessons = db.query(m.TtLesson).filter(m.TtLesson.school_id == school_id, m.TtLesson.version_id == version_id).all()
    if not lessons: return []
    calendar = load_calendar(db, school_id); names = _name_lookup(db, school_id); conflicts: list[Conflict] = []
    def label(kind, ident): return names.get(kind, {}).get(ident, f"{kind.title()} {ident}")
    def covered(lesson): return _teaching_slots(calendar, lesson.day_index, lesson.period_index, lesson.duration or 1)
    teachers = {t.id:t for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id)}
    rooms = {r.id:r for r in db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id)}
    classes = {c.id:c for c in db.query(m.TtClass).filter(m.TtClass.school_id == school_id)}
    subjects = {s.id:s for s in db.query(m.TtSubject).filter(m.TtSubject.school_id == school_id)}
    for kind, attr in (("teacher","teacher_id"),("class","class_id"),("room","room_id")):
        buckets: dict[tuple, list[m.TtLesson]] = {}
        for lesson in lessons:
            ident = getattr(lesson, attr)
            if ident is None: continue
            for day, period in covered(lesson): buckets.setdefault((ident,day,period), []).append(lesson)
        seen = set()
        for (ident,day,period), group in buckets.items():
            ids = tuple(sorted({l.id for l in group}))
            if len(ids) < 2 or (kind,ident,ids) in seen: continue
            seen.add((kind,ident,ids)); conflicts.append(Conflict("hard", f"{kind}_double_booked", f"{label(kind,ident)} is booked for multiple lessons at the same time.", list(ids), day, period))
    teaching = set(calendar.teaching_indexes)
    for lesson in lessons:
        slot = (lesson.day_index, lesson.period_index)
        if lesson.period_index not in teaching:
            conflicts.append(Conflict("hard","break_slot",f"{label('subject',lesson.subject_id)} is scheduled in a non-teaching period.",[lesson.id],*slot))
        elif not covered(lesson):
            conflicts.append(Conflict("hard","duration_overflow",f"The lesson runs beyond the available teaching periods.",[lesson.id],*slot))
        teacher = teachers.get(lesson.teacher_id)
        if teacher and any(s in _slots_from_json(teacher.unavailable) for s in covered(lesson)):
            conflicts.append(Conflict("hard","teacher_unavailable",f"{teacher.name} is unavailable at this time.",[lesson.id],*slot))
        room = rooms.get(lesson.room_id)
        if room and any(s in _slots_from_json(room.unavailable) for s in covered(lesson)):
            conflicts.append(Conflict("hard","room_unavailable",f"{room.name} is unavailable at this time.",[lesson.id],*slot))
        klass = classes.get(lesson.class_id)
        if klass and any(s in _slots_from_json(klass.unavailable) for s in covered(lesson)):
            conflicts.append(Conflict("hard","class_unavailable",f"{klass.name} is unavailable at this time.",[lesson.id],*slot))
        if lesson.room_id is None: conflicts.append(Conflict("soft","no_room",f"{label('subject',lesson.subject_id)} has no room assigned.",[lesson.id],*slot))
        if room and klass and klass.student_count > room.capacity: conflicts.append(Conflict("hard","room_capacity",f"{klass.name} exceeds the capacity of {room.name}.",[lesson.id],*slot))
        subject = subjects.get(lesson.subject_id)
        if subject and subject.required_room_type and room and room.room_type != subject.required_room_type: conflicts.append(Conflict("hard","room_type_mismatch",f"{subject.name} requires a {subject.required_room_type} room.",[lesson.id],*slot))
    by_teacher_day: dict[tuple[int,int], list[m.TtLesson]] = {}
    for lesson in lessons:
        if lesson.teacher_id: by_teacher_day.setdefault((lesson.teacher_id,lesson.day_index),[]).append(lesson)
    for (teacher_id,day), group in by_teacher_day.items():
        teacher = teachers.get(teacher_id)
        if teacher and len(group) > (teacher.max_lessons_per_day or 7): conflicts.append(Conflict("hard","teacher_daily_limit",f"{teacher.name} exceeds the daily lesson limit.",[l.id for l in group],day))
        periods = sorted(l.period_index for l in group)
        if len(periods) > 1:
            gaps = periods[-1]-periods[0]+1-len(periods)
            if gaps >= 2: conflicts.append(Conflict("soft","teacher_gaps",f"{label('teacher',teacher_id)} has {gaps} gaps on this day.",[l.id for l in group],day))
    requirements = db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id == school_id).all(); placed: dict[int,int] = {}
    for lesson in lessons:
        if lesson.requirement_id: placed[lesson.requirement_id] = placed.get(lesson.requirement_id,0)+1
    for req in requirements:
        got = placed.get(req.id,0)
        if got != (req.periods_per_week or 0): conflicts.append(Conflict("hard","quota_mismatch",f"{label('subject',req.subject_id)} has {got} of {req.periods_per_week} weekly lessons.",[]))
    return conflicts

def assign_rooms_to_lessons(db: Session, school_id: int, version_id: int) -> int:
    lessons = db.query(m.TtLesson).filter(m.TtLesson.school_id == school_id, m.TtLesson.version_id == version_id).order_by(m.TtLesson.duration.desc(),m.TtLesson.day_index,m.TtLesson.period_index,m.TtLesson.class_id).all()
    calendar = load_calendar(db, school_id); rooms = db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id).order_by(m.TtRoom.id).all(); classes={c.id:c for c in db.query(m.TtClass).filter(m.TtClass.school_id==school_id)}; subjects={s.id:s for s in db.query(m.TtSubject).filter(m.TtSubject.school_id==school_id)}
    occupied: dict[tuple[int,int,int],int] = {}; usage={r.id:0 for r in rooms}; assigned=0
    def covered(l): return _teaching_slots(calendar,l.day_index,l.period_index,l.duration or 1)
    for l in lessons:
        if l.room_id:
            for d,p in covered(l): occupied[(l.room_id,d,p)] = l.id
            usage[l.room_id]=usage.get(l.room_id,0)+1
    for l in lessons:
        if l.room_id: continue
        slots=covered(l)
        if not slots: continue
        subject=subjects.get(l.subject_id); klass=classes.get(l.class_id); required=subject.required_room_type if subject else None
        def free(room): return all((room.id,d,p) not in occupied for d,p in slots) and all((d,p) not in _slots_from_json(room.unavailable) for d,p in slots)
        def fits(room): return not klass or not klass.student_count or not room.capacity or room.capacity >= klass.student_count
        candidates=[r for r in rooms if free(r) and fits(r) and (required is None or r.room_type==required) and (required is not None or r.room_type in ("classroom","hall"))]
        if not candidates: candidates=[r for r in rooms if free(r) and fits(r)]
        if not candidates: continue
        chosen=min(candidates,key=lambda r:(usage.get(r.id,0),r.id)); l.room_id=chosen.id; usage[chosen.id]=usage.get(chosen.id,0)+1
        for d,p in slots: occupied[(chosen.id,d,p)]=l.id
        assigned+=1
    db.commit(); return assigned

def explain_move(db: Session, school_id: int, lesson_id: int, day: int, period: int) -> dict:
    lesson=db.query(m.TtLesson).filter(m.TtLesson.id==lesson_id,m.TtLesson.school_id==school_id).first()
    if not lesson: return {"allowed":False,"reasons":[{"factor":"Lesson","detail":"Lesson not found."}],"alternatives":[]}
    reasons=_blockers(db,school_id,lesson,day,period); return {"allowed":not reasons,"reasons":reasons,"alternatives":suggest_slots(db,school_id,lesson,3)}

def _blockers(db: Session, school_id: int, lesson: m.TtLesson, day: int, period: int, *, teacher_id=None, class_id=None, room_id=None, subject_id=None, duration=None) -> list[dict]:
    reasons=[]; calendar=load_calendar(db,school_id); candidate_teacher=lesson.teacher_id if teacher_id is None else teacher_id; candidate_class=lesson.class_id if class_id is None else class_id; candidate_room=lesson.room_id if room_id is None else room_id; span=_teaching_slots(calendar,day,period,(lesson.duration or 1) if duration is None else duration)
    if period not in set(calendar.teaching_indexes): reasons.append({"factor":"Period","detail":"This is not a teaching period."})
    if not span: reasons.append({"factor":"Duration","detail":"The lesson would run beyond the available teaching periods."})
    span_set=set(span); others=db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==lesson.version_id,m.TtLesson.id!=lesson.id).all()
    names=_name_lookup(db,school_id)
    for other in others:
        other_span=set(_teaching_slots(calendar,other.day_index,other.period_index,other.duration or 1))
        if not span_set & other_span: continue
        if other.class_id==candidate_class: reasons.append({"factor":names['class'].get(candidate_class,'Class'),"detail":f"Already has {names['subject'].get(other.subject_id,'a lesson')} in this period."})
        if candidate_teacher and other.teacher_id==candidate_teacher: reasons.append({"factor":names['teacher'].get(candidate_teacher,'Teacher'),"detail":"Already teaching another class in this period."})
        if candidate_room and other.room_id==candidate_room: reasons.append({"factor":names['room'].get(candidate_room,'Room'),"detail":"Already occupied in this period."})
    teacher=db.query(m.TtTeacher).filter(m.TtTeacher.id==candidate_teacher).first(); room=db.query(m.TtRoom).filter(m.TtRoom.id==candidate_room).first(); klass=db.query(m.TtClass).filter(m.TtClass.id==candidate_class).first(); subject=db.query(m.TtSubject).filter(m.TtSubject.id==(lesson.subject_id if subject_id is None else subject_id)).first()
    if teacher and any(s in _slots_from_json(teacher.unavailable) for s in span): reasons.append({"factor":teacher.name,"detail":"Marked unavailable at this time."})
    if room and any(s in _slots_from_json(room.unavailable) for s in span): reasons.append({"factor":room.name,"detail":"Not available at this time."})
    if klass and any(s in _slots_from_json(klass.unavailable) for s in span): reasons.append({"factor":klass.name,"detail":"Not available at this time."})
    if subject and subject.required_room_type and room and room.room_type != subject.required_room_type: reasons.append({"factor":subject.name,"detail":f"Requires a {subject.required_room_type} room."})
    if room and klass and klass.student_count > room.capacity: reasons.append({"factor":room.name,"detail":f"Capacity {room.capacity} is below the class size {klass.student_count}."})
    _, rules=load_constraints(db,school_id)
    for rule in rules:
        if rule.is_hard and rule.slots & span_set and ((rule.scope=='class' and rule.target_id==candidate_class) or (rule.scope=='teacher' and rule.target_id==candidate_teacher)): reasons.append({"factor":"Scheduling rule","detail":rule.note or "This slot is blocked."})
    if teacher:
        same_day=db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==lesson.version_id,m.TtLesson.teacher_id==teacher.id,m.TtLesson.day_index==day,m.TtLesson.id!=lesson.id).count()
        if same_day >= (teacher.max_lessons_per_day or 7): reasons.append({"factor":teacher.name,"detail":f"Already at the daily limit of {teacher.max_lessons_per_day} lessons."})
    unique=[]; seen=set()
    for r in reasons:
        key=(r['factor'],r['detail'])
        if key not in seen: seen.add(key); unique.append(r)
    return unique

def suggest_slots(db: Session, school_id: int, lesson: m.TtLesson, limit: int = 3) -> list[dict]:
    calendar=load_calendar(db,school_id); options=[]
    for day in calendar.day_indexes:
        for period in calendar.teaching_indexes:
            if day==lesson.day_index and period==lesson.period_index: continue
            if _blockers(db,school_id,lesson,day,period): continue
            options.append({"day":day,"period":period,"day_name":next((d.name for d in calendar.days if d.index==day),str(day)),"period_name":next((p.name for p in calendar.periods if p.index==period),str(period))})
    return options[:limit]
