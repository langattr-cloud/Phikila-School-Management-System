"""Bridges database rows to the pure solver, and provides conflict analysis."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Iterable, Sequence
from sqlalchemy.orm import Session
from . import models as m
from .solver import AvoidRule, ClassSpec, Placement, RequirementSpec, RoomSpec, SolverInput, SubjectSpec, TeacherSpec, Weights, score
DEFAULT_DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday"]
def _slots_from_json(raw:dict|None)->set[tuple[int,int]]:
    out=set()
    if not isinstance(raw,dict):return out
    for day,periods in raw.items():
        try: day_index=int(day)
        except (TypeError,ValueError):continue
        if isinstance(periods,list):
            for period in periods:
                try:out.add((day_index,int(period)))
                except (TypeError,ValueError):continue
    return out
@dataclass
class SchoolCalendar:
    days:list[m.TtDay]; periods:list[m.TtPeriod]
    @property
    def day_indexes(self):return[d.index for d in self.days if d.is_active]
    @property
    def teaching_indexes(self):return[p.index for p in self.periods if p.is_teaching]
    @property
    def morning_indexes(self):
        result=[]
        for period in self.periods:
            if not period.is_teaching:continue
            try:hour=int(str(period.start_time).split(":")[0])
            except (ValueError,IndexError):continue
            if hour<12:result.append(period.index)
        return result
def load_calendar(db:Session,school_id:int)->SchoolCalendar:
    days=db.query(m.TtDay).filter(m.TtDay.school_id==school_id).order_by(m.TtDay.index).all();periods=db.query(m.TtPeriod).filter(m.TtPeriod.school_id==school_id).order_by(m.TtPeriod.index).all();return SchoolCalendar(days=days,periods=periods)
def build_input(db:Session,school_id:int,*,max_seconds:float=30.0)->SolverInput:
    calendar=load_calendar(db,school_id);teachers={t.id:TeacherSpec(id=t.id,name=t.name,max_per_day=t.max_lessons_per_day or 7,max_consecutive=t.max_consecutive or 4,unavailable=_slots_from_json(t.unavailable)) for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id==school_id,m.TtTeacher.is_active.is_(True))};rooms={r.id:RoomSpec(id=r.id,name=r.name,capacity=r.capacity or 40,room_type=r.room_type or "classroom",unavailable=_slots_from_json(r.unavailable)) for r in db.query(m.TtRoom).filter(m.TtRoom.school_id==school_id)};classes={c.id:ClassSpec(id=c.id,name=c.name,student_count=c.student_count or 40,unavailable=_slots_from_json(c.unavailable)) for c in db.query(m.TtClass).filter(m.TtClass.school_id==school_id)};subjects={s.id:SubjectSpec(id=s.id,name=s.name,prefers_morning=bool(s.prefers_morning),spread_across_week=bool(s.spread_across_week),required_room_type=s.required_room_type) for s in db.query(m.TtSubject).filter(m.TtSubject.school_id==school_id)};requirements=[RequirementSpec(id=r.id,class_id=r.class_id,subject_id=r.subject_id,teacher_id=r.teacher_id,room_id=r.room_id,periods_per_week=r.periods_per_week or 1,double_periods=r.double_periods or 0) for r in db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id==school_id)];weights,avoid_rules=load_constraints(db,school_id);return SolverInput(days=calendar.day_indexes,periods=[p.index for p in calendar.periods],teaching_periods=calendar.teaching_indexes,morning_periods=calendar.morning_indexes,teachers=teachers,rooms=rooms,classes=classes,subjects=subjects,requirements=requirements,weights=weights,avoid_rules=avoid_rules,max_seconds=max_seconds,workers=2)
def load_constraints(db:Session,school_id:int):
    weights=Weights();avoid=[]
    for row in db.query(m.TtConstraint).filter(m.TtConstraint.school_id==school_id,m.TtConstraint.enabled.is_(True)):
        params=row.params if isinstance(row.params,dict) else {}
        if row.kind=="weight":
            key=params.get("key")
            if key and hasattr(weights,key):setattr(weights,key,int(row.weight))
        elif row.kind=="avoid_lessons" and row.target_id:
            slots=_slots_from_json(params.get("slots"))
            if slots:avoid.append(AvoidRule(scope=row.scope if row.scope in {"class","teacher","subject"} else "class",target_id=row.target_id,slots=slots,is_hard=bool(row.is_hard),weight=int(row.weight or 25),note=row.note or ""))
    return weights,avoid
@dataclass
class Conflict:
    severity:str;kind:str;message:str;lesson_ids:list[int];day:int|None=None;period:int|None=None
    def as_dict(self):return{"severity":self.severity,"kind":self.kind,"message":self.message,"lesson_ids":self.lesson_ids,"day":self.day,"period":self.period}
def detect_conflicts(db:Session,school_id:int,version_id:int|m.TtVersion):
    if isinstance(version_id,m.TtVersion):version_id=version_id.id
    elif hasattr(version_id,"id") and not isinstance(version_id,int):version_id=getattr(version_id,"id")
    if version_id is None:return []
    lessons=db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==int(version_id)).all()
    if not lessons:return []
    names=_name_lookup(db,school_id);calendar=load_calendar(db,school_id);conflicts=[]
    def label(kind,ident):return names.get(kind,{}).get(ident,f"{kind.title()} {ident}")
    def covered(lesson):return _teaching_slots(calendar,lesson.day_index,lesson.period_index,lesson.duration or 1)
    teachers={t.id:t for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id==school_id)};rooms={r.id:r for r in db.query(m.TtRoom).filter(m.TtRoom.school_id==school_id)};classes={c.id:c for c in db.query(m.TtClass).filter(m.TtClass.school_id==school_id)};subjects={s.id:s for s in db.query(m.TtSubject).filter(m.TtSubject.school_id==school_id)}
    for key_name,attr in (("teacher","teacher_id"),("class","class_id"),("room","room_id")):
        buckets={}
        for lesson in lessons:
            ident=getattr(lesson,attr)
            if ident is None:continue
            for slot in covered(lesson):buckets.setdefault((ident,slot[0],slot[1]),[]).append(lesson)
        reported=set()
        for (ident,day,period),group in buckets.items():
            unique={l.id for l in group}
            if len(unique)<2:continue
            pair=(key_name,ident,tuple(sorted(unique)))
            if pair in reported:continue
            reported.add(pair);who=label(key_name,ident);others=", ".join(sorted({label("class",l.class_id) for l in group}));conflicts.append(Conflict("hard",f"{key_name}_double_booked",f"{who} is booked for {len(unique)} lessons at the same time ({others}).",sorted(unique),day,period))
    teaching_indexes=set(calendar.teaching_indexes)
    for lesson in lessons:
        slot=(lesson.day_index,lesson.period_index)
        if lesson.period_index not in teaching_indexes:
            period_row=next((p for p in calendar.periods if p.index==lesson.period_index),None);conflicts.append(Conflict("hard","break_slot",f"{label('subject',lesson.subject_id)} is scheduled in {period_row.name if period_row else 'a non-teaching period'}, which cannot hold lessons.",[lesson.id],*slot))
        elif not covered(lesson):conflicts.append(Conflict("hard","duration_overflow",f"The {lesson.duration}-period {label('subject',lesson.subject_id)} lesson runs into a break or past the end of the teaching day.",[lesson.id],*slot))
        teacher=teachers.get(lesson.teacher_id)
        if teacher and any(occupied in _slots_from_json(teacher.unavailable) for occupied in covered(lesson)):conflicts.append(Conflict("hard","teacher_unavailable",f"{teacher.name} is marked unavailable at this time.",[lesson.id],*slot))
        room=rooms.get(lesson.room_id)
        if room and any(occupied in _slots_from_json(room.unavailable) for occupied in covered(lesson)):conflicts.append(Conflict("hard","room_unavailable",f"{room.name} is not available at this time.",[lesson.id],*slot))
        klass=classes.get(lesson.class_id)
        if klass and any(occupied in _slots_from_json(klass.unavailable) for occupied in covered(lesson)):conflicts.append(Conflict("hard","class_unavailable",f"{klass.name} is not available at this time.",[lesson.id],*slot))
        if lesson.room_id is None:conflicts.append(Conflict("soft","no_room",f"{label('subject',lesson.subject_id)} for {label('class',lesson.class_id)} has no room assigned.",[lesson.id],*slot))
        if room and klass and klass.student_count and room.capacity and klass.student_count>room.capacity:conflicts.append(Conflict("hard","room_capacity",f"{klass.name} has {klass.student_count} students but {room.name} seats {room.capacity}.",[lesson.id],*slot))
        subject=subjects.get(lesson.subject_id)
        if subject and subject.required_room_type and room and room.room_type!=subject.required_room_type:conflicts.append(Conflict("hard","room_type_mismatch",f"{subject.name} requires a '{subject.required_room_type}' room; {room.name} is a {room.room_type}.",[lesson.id],*slot))
    return conflicts

def assign_rooms_to_lessons(db:Session,school_id:int,version_id:int)->int:
    lessons=db.query(m.TtLesson).filter(m.TtLesson.school_id==school_id,m.TtLesson.version_id==version_id).order_by(m.TtLesson.duration.desc(),m.TtLesson.day_index,m.TtLesson.period_index,m.TtLesson.class_id).all();calendar=load_calendar(db,school_id);rooms=db.query(m.TtRoom).filter(m.TtRoom.school_id==school_id).order_by(m.TtRoom.id).all();classes={c.id:c for c in db.query(m.TtClass).filter(m.TtClass.school_id==school_id)};subjects={s.id:s for s in db.query(m.TtSubject).filter(m.TtSubject.school_id==school_id)};occupied={};usage={room.id:0 for room in rooms};assigned=0
    def covered(lesson):return _teaching_slots(calendar,lesson.day_index,lesson.period_index,lesson.duration or 1)
    for lesson in lessons:
        if lesson.room_id:
            for slot in covered(lesson):occupied[(lesson.room_id,slot[0],slot[1])]=lesson.id
            usage[lesson.room_id]=usage.get(lesson.room_id,0)+1
    for lesson in lessons:
        if lesson.room_id or lesson.is_locked:continue
        slots=covered(lesson)
        if not slots:continue
        subject=subjects.get(lesson.subject_id);klass=classes.get(lesson.class_id);required_type=subject.required_room_type if subject else None
        def compatible(room):
            if required_type is not None and room.room_type!=required_type:return False
            if required_type is None and room.room_type not in ("classroom","hall"):return False
            if any((room.id,d,p) in occupied for d,p in slots):return False
            if any((d,p) in _slots_from_json(room.unavailable) for d,p in slots):return False
            return True
        def fits(room):return klass is None or not klass.student_count or not room.capacity or room.capacity>=klass.student_count
        candidates=[room for room in rooms if compatible(room) and fits(room)]
        if not candidates:candidates=[room for room in rooms if fits(room) and not any((room.id,d,p) in occupied for d,p in slots)]
        if not candidates:candidates=[room for room in rooms if compatible(room)]
        if not candidates:continue
        candidates.sort(key=lambda room:(usage.get(room.id,0),room.id));chosen=candidates[0];lesson.room_id=chosen.id;usage[chosen.id]=usage.get(chosen.id,0)+1
        for slot in slots:occupied[(chosen.id,slot[0],slot[1])]=lesson.id
        assigned+=1
    db.commit();return assigned

def _name_lookup(db:Session,school_id:int):return{"teacher":{t.id:t.name for t in db.query(m.TtTeacher).filter(m.TtTeacher.school_id==school_id)},"class":{c.id:c.name for c in db.query(m.TtClass).filter(m.TtClass.school_id==school_id)},"room":{r.id:r.name for r in db.query(m.TtRoom).filter(m.TtRoom.school_id==school_id)},"subject":{s.id:s.name for s in db.query(m.TtSubject).filter(m.TtSubject.school_id==school_id)}}
def _teaching_slots(calendar:SchoolCalendar,day:int,period:int,duration:int):
    ordered=[p.index for p in calendar.periods if p.is_teaching]
    try:start=ordered.index(period)
    except ValueError:return []
    if start+duration>len(ordered):return []
    return[(day,p) for p in ordered[start:start+duration]]
