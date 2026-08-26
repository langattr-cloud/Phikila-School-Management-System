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
    out: set[tuple[int, int]] = set()
    if not isinstance(raw, dict): return out
    for day, periods in raw.items():
        try: day_index = int(day)
        except (TypeError, ValueError): continue
        if isinstance(periods, list):
            for period in periods:
                try: out.add((day_index, int(period)))
                except (TypeError, ValueError): continue
    return out

@dataclass
class SchoolCalendar:
    days: list[m.TtDay]
    periods: list[m.TtPeriod]
    @property
    def day_indexes(self) -> list[int]: return [d.index for d in self.days if d.is_active]
    @property
    def teaching_indexes(self) -> list[int]: return [p.index for p in self.periods if p.is_teaching]
    @property
    def morning_indexes(self) -> list[int]:
        result=[]
        for period in self.periods:
            if not period.is_teaching: continue
            try: hour=int(str(period.start_time).split(":")[0])
            except (ValueError, IndexError): continue
            if hour < 12: result.append(period.index)
        return result

def load_calendar(db: Session, school_id: int) -> SchoolCalendar:
    days=db.query(m.TtDay).filter(m.TtDay.school_id==school_id).order_by(m.TtDay.index).all()
    periods=db.query(m.TtPeriod).filter(m.TtPeriod.school_id==school_id).order_by(m.TtPeriod.index).all()
    return SchoolCalendar(days=days, periods=periods)

def build_input(db: Session, school_id: int, *, max_seconds: float = 30.0) -> SolverInput:
    calendar=load_calendar(db, school_id)
    teachers={t.id: TeacherSpec(id=t.id,name=t.name,max_per_day=t.max_lessons_per_day or 7,max_consecutive=t.max_consecutive or 4,unavailable=_slots_from_json(t.unavailable)) for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id==school_id,m.TtTeacher.is_active.is_(True))}
    rooms={r.id: RoomSpec(id=r.id,name=r.name,capacity=r.capacity or 40,room_type=r.room_type or "classroom",unavailable=_slots_from_json(r.unavailable)) for r in db.query(m.TtRoom).filter(m.TtRoom.school_id==school_id)}
    classes={c.id: ClassSpec(id=c.id,name=c.name,student_count=c.student_count or 40,unavailable=_slots_from_json(c.unavailable)) for c in db.query(m.TtClass).filter(m.TtClass.school_id==school_id)}
    subjects={s.id: SubjectSpec(id=s.id,name=s.name,prefers_morning=bool(s.prefers_morning),spread_across_week=bool(s.spread_across_week),required_room_type=s.required_room_type) for s in db.query(m.TtSubject).filter(m.TtSubject.school_id==school_id)}
    requirements=[RequirementSpec(id=r.id,class_id=r.class_id,subject_id=r.subject_id,teacher_id=r.teacher_id,room_id=r.room_id,periods_per_week=r.periods_per_week or 1,double_periods=r.double_periods or 0) for r in db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id==school_id)]
    weights,avoid_rules=load_constraints(db,school_id)
    return SolverInput(days=calendar.day_indexes,periods=[p.index for p in calendar.periods],teaching_periods=calendar.teaching_indexes,morning_periods=calendar.morning_indexes,teachers=teachers,rooms=rooms,classes=classes,subjects=subjects,requirements=requirements,weights=weights,avoid_rules=avoid_rules,max_seconds=max_seconds)

def load_constraints(db: Session, school_id: int) -> tuple[Weights,list[AvoidRule]]:
    weights=Weights(); avoid=[]
    rows=db.query(m.TtConstraint).filter(m.TtConstraint.school_id==school_id,m.TtConstraint.enabled.is_(True))
    for row in rows:
        params=row.params if isinstance(row.params,dict) else {}
        if row.kind=="weight":
            key=params.get("key")
            if key and hasattr(weights,key): setattr(weights,key,int(row.weight))
        elif row.kind=="avoid_lessons" and row.target_id:
            slots=_slots_from_json(params.get("slots"))
            if slots: avoid.append(AvoidRule(scope="teacher" if row.scope=="teacher" else "class",target_id=row.target_id,slots=slots,is_hard=bool(row.is_hard),weight=int(row.weight or 25),note=row.note or ""))
    return weights,avoid

@dataclass
class Conflict:
    severity: str
    kind: str
    message: str
    lesson_ids: list[int]
    day: int|None=None
    period: int|None=None
    def as_dict(self)->dict: return {"severity":self.severity,"kind":self.kind,"message":self.message,"lesson_ids":self.lesson_ids,"day":self.day,"period":self.period}

def detect_conflicts(db: Session, school_id: int, version_id: int|m.TtVersion) -> list[Conflict]:
    if isinstance(version_id,m.TtVersion): version_id=version_id.id
    elif hasattr(version_id,"id") and not isinstance(version_id,int): version_id=getattr(version_id,"id")
    if version_id is None: return []
    lessons=db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==int(version_id)).all()
    if not lessons: return []
    names=_name_lookup(db,school_id); calendar=load_calendar(db,school_id); conflicts=[]
    def label(kind,ident): return names.get(kind,{}).get(ident,f"{kind.title()} {ident}")
    def covered(lesson): return _teaching_slots(calendar,lesson.day_index,lesson.period_index,lesson.duration or 1)
    teachers={t.id:t for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id==school_id)}
    rooms={r.id:r for r in db.query(m.TtRoom).filter(m.TtRoom.school_id==school_id)}
    classes={c.id:c for c in db.query(m.TtClass).filter(m.TtClass.school_id==school_id)}
    subjects={s.id:s for s in db.query(m.TtSubject).filter(m.TtSubject.school_id==school_id)}
    for key_name,attr in (("teacher","teacher_id"),("class","class_id"),("room","room_id")):
        buckets={}
        for lesson in lessons:
            ident=getattr(lesson,attr)
            if ident is None: continue
            for slot in covered(lesson): buckets.setdefault((ident,slot[0],slot[1]),[]).append(lesson)
        reported=set()
        for (ident,day,period),group in buckets.items():
            unique={l.id for l in group}
            if len(unique)<2: continue
            pair=(key_name,ident,tuple(sorted(unique)))
            if pair in reported: continue
            reported.add(pair); who=label(key_name,ident); others=", ".join(sorted({label("class",l.class_id) for l in group}))
            conflicts.append(Conflict("hard",f"{key_name}_double_booked",f"{who} is booked for {len(unique)} lessons at the same time ({others}).",sorted(unique),day,period))
    teaching_indexes=set(calendar.teaching_indexes)
    for lesson in lessons:
        slot=(lesson.day_index,lesson.period_index)
        if lesson.period_index not in teaching_indexes:
            period_row=next((p for p in calendar.periods if p.index==lesson.period_index),None)
            conflicts.append(Conflict("hard","break_slot",f"{label('subject',lesson.subject_id)} is scheduled in {period_row.name if period_row else 'a non-teaching period'}, which cannot hold lessons.",[lesson.id],*slot))
        elif not covered(lesson): conflicts.append(Conflict("hard","duration_overflow",f"The {lesson.duration}-period {label('subject',lesson.subject_id)} lesson runs into a break or past the end of the teaching day.",[lesson.id],*slot))
        teacher=teachers.get(lesson.teacher_id)
        if teacher and any(occupied in _slots_from_json(teacher.unavailable) for occupied in covered(lesson)): conflicts.append(Conflict("hard","teacher_unavailable",f"{teacher.name} is marked unavailable at this time.",[lesson.id],*slot))
        room=rooms.get(lesson.room_id)
        if room and any(occupied in _slots_from_json(room.unavailable) for occupied in covered(lesson)): conflicts.append(Conflict("hard","room_unavailable",f"{room.name} is not available at this time.",[lesson.id],*slot))
        klass=classes.get(lesson.class_id)
        if klass and any(occupied in _slots_from_json(klass.unavailable) for occupied in covered(lesson)): conflicts.append(Conflict("hard","class_unavailable",f"{klass.name} is not available at this time.",[lesson.id],*slot))
        if lesson.room_id is None: conflicts.append(Conflict("soft","no_room",f"{label('subject',lesson.subject_id)} for {label('class',lesson.class_id)} has no room assigned.",[lesson.id],*slot))
        if room and klass and klass.student_count and room.capacity and klass.student_count>room.capacity: conflicts.append(Conflict("hard","room_capacity",f"{klass.name} has {klass.student_count} students but {room.name} seats {room.capacity}.",[lesson.id],*slot))
        subject=subjects.get(lesson.subject_id)
        if subject and subject.required_room_type and room and room.room_type!=subject.required_room_type: conflicts.append(Conflict("hard","room_type_mismatch",f"{subject.name} requires a '{subject.required_room_type}' room; {room.name} is a {room.room_type}.",[lesson.id],*slot))
    by_teacher_day={}
    for lesson in lessons:
        if lesson.teacher_id: by_teacher_day.setdefault((lesson.teacher_id,lesson.day_index),[]).append(lesson)
    for (teacher_id,day),group in by_teacher_day.items():
        teacher=teachers.get(teacher_id)
        if teacher and teacher.max_lessons_per_day and len(group)>teacher.max_lessons_per_day: conflicts.append(Conflict("hard","teacher_daily_limit",f"{label('teacher',teacher_id)} teaches {len(group)} lessons on this day, above the limit of {teacher.max_lessons_per_day}.",[l.id for l in group],day))
        periods=sorted(l.period_index for l in group); gaps=(periods[-1]-periods[0]+1)-len(periods) if len(periods)>1 else 0
        if gaps>=2: conflicts.append(Conflict("soft","teacher_gaps",f"{label('teacher',teacher_id)} has {gaps} free periods between lessons on this day.",[l.id for l in group],day))
        if teacher and teacher.max_consecutive and len(periods)>1:
            run=longest=1
            for current,previous in zip(periods[1:],periods): run=run+1 if current==previous+1 else 1; longest=max(longest,run)
            if longest>teacher.max_consecutive: conflicts.append(Conflict("hard","teacher_consecutive",f"{label('teacher',teacher_id)} has {longest} consecutive lessons on this day, above the limit of {teacher.max_consecutive}.",[l.id for l in group],day))
    requirements=db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id==school_id).all(); placed={}
    for lesson in lessons:
        if lesson.requirement_id: placed[lesson.requirement_id]=placed.get(lesson.requirement_id,0)+1
    for req in requirements:
        got=placed.get(req.id,0)
        if got!=(req.periods_per_week or 0): conflicts.append(Conflict("hard","quota_mismatch",f"{label('subject',req.subject_id)} for {label('class',req.class_id)} has {got} of {req.periods_per_week} weekly lessons scheduled.",[]))
    clumps={}
    for lesson in lessons: clumps.setdefault((lesson.class_id,lesson.subject_id,lesson.day_index),[]).append(lesson)
    for (class_id,subject_id,day),group in clumps.items():
        if len(group)>2: conflicts.append(Conflict("soft","subject_clumped",f"{label('class',class_id)} has {len(group)} {label('subject',subject_id)} lessons on one day.",[l.id for l in group],day))
    return conflicts


def assign_rooms_to_lessons(db: Session, school_id: int, version_id: int) -> int:
    lessons=db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==version_id).order_by(m.TtLesson.duration.desc(),m.TtLesson.day_index,m.TtLesson.period_index,m.TtLesson.class_id).all()
    calendar=load_calendar(db,school_id); rooms=db.query(m.TtRoom).filter(m.TtRoom.school_id==school_id).order_by(m.TtRoom.id).all(); classes={c.id:c for c in db.query(m.TtClass).filter(m.TtClass.school_id==school_id)}; subjects={s.id:s for s in db.query(m.TtSubject).filter(m.TtSubject.school_id==school_id)}
    occupied={}; usage={room.id:0 for room in rooms}; assigned=0
    def covered(lesson): return _teaching_slots(calendar,lesson.day_index,lesson.period_index,lesson.duration or 1)
    for lesson in lessons:
        if lesson.room_id:
            for slot in covered(lesson): occupied[(lesson.room_id,slot[0],slot[1])]=lesson.id
            usage[lesson.room_id]=usage.get(lesson.room_id,0)+1
    for lesson in lessons:
        if lesson.room_id: continue
        slots=covered(lesson)
        if not slots: continue
        subject=subjects.get(lesson.subject_id); klass=classes.get(lesson.class_id); required_type=subject.required_room_type if subject else None
        def compatible(room):
            if required_type is not None and room.room_type!=required_type: return False
            if required_type is None and room.room_type not in ("classroom","hall"): return False
            if any((room.id,d,p) in occupied for d,p in slots): return False
            if any((d,p) in _slots_from_json(room.unavailable) for d,p in slots): return False
            return True
        def fits(room): return klass is None or not klass.student_count or not room.capacity or room.capacity>=klass.student_count
        candidates=[room for room in rooms if compatible(room) and fits(room)]
        if not candidates: candidates=[room for room in rooms if fits(room) and not any((room.id,d,p) in occupied for d,p in slots)]
        if not candidates: candidates=[room for room in rooms if compatible(room)]
        if not candidates: continue
        candidates.sort(key=lambda room:(usage.get(room.id,0),room.id)); chosen=candidates[0]; lesson.room_id=chosen.id; usage[chosen.id]=usage.get(chosen.id,0)+1
        for slot in slots: occupied[(chosen.id,slot[0],slot[1])]=lesson.id
        assigned+=1
    db.commit(); return assigned

def _name_lookup(db: Session, school_id: int) -> dict[str,dict[int,str]]:
    return {"teacher":{t.id:t.name for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id==school_id)},"class":{c.id:c.name for c in db.query(m.TtClass).filter(m.TtClass.school_id==school_id)},"room":{r.id:r.name for r in db.query(m.TtRoom).filter(m.TtRoom.school_id==school_id)},"subject":{s.id:s.name for s in db.query(m.TtSubject).filter(m.TtSubject.school_id==school_id)}}

def _teaching_slots(calendar: SchoolCalendar, day: int, period: int, duration: int) -> list[tuple[int,int]]:
    ordered=[p.index for p in calendar.periods if p.is_teaching]
    try: start=ordered.index(period)
    except ValueError: return []
    if start+duration>len(ordered): return []
    return [(day,p) for p in ordered[start:start+duration]]

def explain_move(db: Session, school_id: int, lesson_id: int, day: int, period: int) -> dict:
    lesson=db.query(m.TtLesson).filter(m.TtLesson.id==lesson_id,m.TtLesson.school_id==school_id).first()
    if not lesson: return {"allowed":False,"reasons":[{"factor":"Lesson","detail":"Lesson not found."}],"alternatives":[]}
    reasons=_blockers(db,school_id,lesson,day,period)
    return {"allowed":not reasons,"reasons":reasons,"alternatives":suggest_slots(db,school_id,lesson,limit=3)}

def _blockers(db: Session, school_id: int, lesson: m.TtLesson, day: int, period: int, *, teacher_id: int|None=None, class_id: int|None=None, room_id: int|None=None, subject_id: int|None=None, duration: int|None=None) -> list[dict]:
    reasons=[]; names=_name_lookup(db,school_id); candidate_teacher=lesson.teacher_id if teacher_id is None else teacher_id; candidate_class=lesson.class_id if class_id is None else class_id; candidate_room=lesson.room_id if room_id is None else room_id; candidate_duration=(lesson.duration or 1) if duration is None else duration; calendar=load_calendar(db,school_id); teaching=set(calendar.teaching_indexes)
    if period not in teaching:
        period_row=next((p for p in calendar.periods if p.index==period),None); reasons.append({"factor":"Period","detail":f"{period_row.name if period_row else 'This period'} is not a teaching period."})
    span=_teaching_slots(calendar,day,period,candidate_duration)
    if not span: reasons.append({"factor":"Duration","detail":f"A {candidate_duration}-period lesson starting here would run into a break or past the end of the teaching day."})
    candidates=db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==lesson.version_id,m.TtLesson.day_index==day,m.TtLesson.id!=lesson.id).all(); span_set=set(span) if span else {(day,period)}; others=[]
    for other in candidates:
        other_span=set(_teaching_slots(calendar,other.day_index,other.period_index,other.duration or 1)) or {(other.day_index,other.period_index)}
        if span_set & other_span: others.append(other)
    for other in others:
        if other.class_id==candidate_class: reasons.append({"factor":names["class"].get(candidate_class,"The class"),"detail":f"Already has {names['subject'].get(other.subject_id,'a lesson')} in this period."})
        if candidate_teacher and other.teacher_id==candidate_teacher: reasons.append({"factor":names["teacher"].get(candidate_teacher,"The teacher"),"detail":f"Already teaching {names['class'].get(other.class_id,'another class')} in this period."})
        if candidate_room and other.room_id==candidate_room: reasons.append({"factor":names["room"].get(candidate_room,"The room"),"detail":f"Occupied by {names['class'].get(other.class_id,'another class')}."})
    teacher=db.query(m.TtTeacher).filter(m.TtTeacher.id==candidate_teacher).first()
    if teacher:
        for occupied in span:
            if occupied in _slots_from_json(teacher.unavailable): reasons.append({"factor":teacher.name,"detail":"Marked unavailable at this time."}); break
    room=db.query(m.TtRoom).filter(m.TtRoom.id==candidate_room).first()
    if room:
        for occupied in span:
            if occupied in _slots_from_json(room.unavailable): reasons.append({"factor":room.name,"detail":"Not available at this time."}); break
    klass=db.query(m.TtClass).filter(m.TtClass.id==candidate_class).first()
    if klass:
        for occupied in span:
            if occupied in _slots_from_json(klass.unavailable): reasons.append({"factor":klass.name,"detail":"Not available at this time."}); break
    candidate_subject=lesson.subject_id if subject_id is None else subject_id; subject=db.query(m.TtSubject).filter(m.TtSubject.id==candidate_subject).first()
    if subject and subject.required_room_type and room and room.room_type!=subject.required_room_type: reasons.append({"factor":subject.name,"detail":f"Requires a '{subject.required_room_type}' room; {room.name} is a {room.room_type}."})
    if room and klass and klass.student_count and room.capacity and klass.student_count>room.capacity: reasons.append({"factor":room.name,"detail":f"Seats {room.capacity}, but {klass.name} has {klass.student_count} students."})
    _,avoid_rules=load_constraints(db,school_id)
    for rule in avoid_rules:
        if not rule.is_hard or not (set(rule.slots)&span_set): continue
        if rule.scope=="class" and rule.target_id==candidate_class: reasons.append({"factor":"Scheduling rule","detail":rule.note or "This slot must stay free for the class."})
        if rule.scope=="teacher" and rule.target_id==candidate_teacher: reasons.append({"factor":"Scheduling rule","detail":rule.note or "This slot must stay free for the teacher."})
    if teacher:
        same_day_lessons=db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==lesson.version_id,m.TtLesson.teacher_id==teacher.id,m.TtLesson.day_index==day,m.TtLesson.id!=lesson.id).all()
        if len(same_day_lessons)>=(teacher.max_lessons_per_day or 7): reasons.append({"factor":teacher.name,"detail":f"Already at the daily limit of {teacher.max_lessons_per_day} lessons."})
        limit=teacher.max_consecutive or 4; occupied_indexes=set(span_set); occupied_indexes.update((other.day_index,other.period_index) for other in same_day_lessons); day_slots=sorted({p for d,p in occupied_indexes if d==day})
        if day_slots and limit:
            run=longest=1
            for current,previous in zip(day_slots[1:],day_slots): run=run+1 if current==previous+1 else 1; longest=max(longest,run)
            if longest>limit: reasons.append({"factor":teacher.name,"detail":f"This would mean {longest} consecutive lessons, above the limit of {limit}."})
    seen=set(); unique=[]
    for reason in reasons:
        key=(reason["factor"],reason["detail"])
        if key not in seen: seen.add(key); unique.append(reason)
    return unique

def suggest_slots(db: Session, school_id: int, lesson: m.TtLesson, limit: int=3) -> list[dict]:
    calendar=load_calendar(db,school_id); subject=db.query(m.TtSubject).filter(m.TtSubject.id==lesson.subject_id).first(); morning=set(calendar.morning_indexes); same_subject_days={row.day_index for row in db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==lesson.version_id,m.TtLesson.class_id==lesson.class_id,m.TtLesson.subject_id==lesson.subject_id,m.TtLesson.id!=lesson.id)}; options=[]
    for day in calendar.day_indexes:
        for period in calendar.teaching_indexes:
            if day==lesson.day_index and period==lesson.period_index: continue
            if _blockers(db,school_id,lesson,day,period): continue
            rank=(40 if day in same_subject_days else 0)+(20 if subject and subject.prefers_morning and period not in morning else 0)+period
            options.append((rank,{"day":day,"period":period,"day_name":next((d.name for d in calendar.days if d.index==day),str(day)),"period_name":next((p.name for p in calendar.periods if p.index==period),str(period))}))
    options.sort(key=lambda pair:pair[0]); return [opt for _,opt in options[:limit]]
