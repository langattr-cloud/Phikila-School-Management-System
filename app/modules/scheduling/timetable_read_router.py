"""Read-side endpoints for the current timetable workspace."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models as m
from . import schemas as s
from .engine import detect_conflicts
from .tenancy import Principal, resolve_principal

router = APIRouter()

def _version(db, school_id, version_id):
    return db.query(m.TtVersion).filter(m.TtVersion.id == version_id, m.TtVersion.school_id == school_id).first()

def _current(db, school_id):
    current_type = db.query(m.TtTimetableType).filter(
        m.TtTimetableType.school_id == school_id,
        m.TtTimetableType.is_active.is_(True),
    ).order_by(m.TtTimetableType.id.desc()).first()
    if current_type is None:
        return None, None
    version = db.query(m.TtVersion).filter(
        m.TtVersion.school_id == school_id,
        m.TtVersion.status == 'published',
        m.TtVersion.timetable_type_id == current_type.id,
    ).order_by(m.TtVersion.number.desc(), m.TtVersion.id.desc()).first()
    return current_type, version

@router.get('/timetable/view')
def current_timetable_view(scope: str, target_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    if scope not in {'teacher', 'class', 'room'}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Invalid timetable scope.')
    timetable_type, version = _current(db, principal.school_id)
    if not version:
        return {'days': [], 'periods': [], 'lessons': [], 'target_name': None, 'version': None, 'timetable_type': timetable_type}

    days = db.query(m.TtDay).filter(
        m.TtDay.school_id == principal.school_id,
        m.TtDay.is_active.is_(True),
        m.TtDay.index.in_(list(timetable_type.day_indexes or [])),
    ).order_by(m.TtDay.index).all()
    period_indexes = set(int(i) for i in (getattr(timetable_type, 'period_indexes', None) or []))
    periods = db.query(m.TtPeriod).filter(m.TtPeriod.school_id == principal.school_id).order_by(m.TtPeriod.index).all()
    if period_indexes:
        periods = [p for p in periods if p.index in period_indexes]

    lessons = db.query(m.TtLesson).filter(
        m.TtLesson.school_id == principal.school_id,
        m.TtLesson.version_id == version.id,
    ).all()
    if scope == 'teacher': lessons = [x for x in lessons if x.teacher_id == target_id]
    elif scope == 'class': lessons = [x for x in lessons if x.class_id == target_id]
    else: lessons = [x for x in lessons if x.room_id == target_id]

    teacher_map = {x.id: x for x in db.query(m.TtTeacher).filter(m.TtTeacher.school_id == principal.school_id).all()}
    class_map = {x.id: x for x in db.query(m.TtClass).filter(m.TtClass.school_id == principal.school_id).all()}
    subject_map = {x.id: x for x in db.query(m.TtSubject).filter(m.TtSubject.school_id == principal.school_id).all()}
    room_map = {x.id: x for x in db.query(m.TtRoom).filter(m.TtRoom.school_id == principal.school_id).all()}
    target = teacher_map.get(target_id) if scope == 'teacher' else class_map.get(target_id) if scope == 'class' else room_map.get(target_id)
    return {
        'days': [{'index': d.index, 'name': d.name} for d in days],
        'periods': [{'index': p.index, 'name': p.name, 'start_time': p.start_time.strftime('%H:%M'), 'end_time': p.end_time.strftime('%H:%M'), 'is_teaching': p.is_teaching} for p in periods],
        'lessons': [{'day': x.day_index, 'period': x.period_index, 'subject': subject_map.get(x.subject_id).code if subject_map.get(x.subject_id) else 'Unknown subject', 'subject_colour': subject_map.get(x.subject_id).colour if subject_map.get(x.subject_id) else None, 'teacher': teacher_map.get(x.teacher_id).code if x.teacher_id and teacher_map.get(x.teacher_id) else None, 'class': class_map.get(x.class_id).code if class_map.get(x.class_id) else 'Unknown class'} for x in lessons],
        'target_name': target.name if target else None,
        'version': s.VersionOut.model_validate(version).model_dump(),
        'timetable_type': s.TimetableTypeOut.model_validate(timetable_type).model_dump(),
    }

@router.get('/versions/{version_id}/lessons', response_model=list[s.LessonOut])
def version_lessons(version_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    version = _version(db, principal.school_id, version_id)
    if not version: raise HTTPException(status.HTTP_404_NOT_FOUND, 'Timetable version not found')
    return db.query(m.TtLesson).filter(m.TtLesson.school_id == principal.school_id, m.TtLesson.version_id == version_id).order_by(m.TtLesson.day_index, m.TtLesson.period_index, m.TtLesson.id).all()

@router.get('/versions/{version_id}/conflicts')
def version_conflicts(version_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    version = _version(db, principal.school_id, version_id)
    if not version: raise HTTPException(status.HTTP_404_NOT_FOUND, 'Not found')
    return [{'severity': c.severity, 'kind': c.kind, 'message': c.message, 'lesson_ids': c.lesson_ids, 'day': getattr(c, 'day', None), 'period': getattr(c, 'period', None)} for c in detect_conflicts(db, principal.school_id, version.id)]

@router.get('/versions/{version_id}/unassigned')
def version_unassigned(version_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    version = _version(db, principal.school_id, version_id)
    if not version: raise HTTPException(status.HTTP_404_NOT_FOUND, 'Not found')
    requirements = db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id == principal.school_id).all()
    scheduled = db.query(m.TtLesson.requirement_id).filter(m.TtLesson.school_id == principal.school_id, m.TtLesson.version_id == version_id).all()
    counts = {}
    for (rid,) in scheduled: counts[rid] = counts.get(rid, 0) + 1
    result = []
    for r in requirements:
        remaining = max(0, int(r.periods_per_week or 0) - counts.get(r.id, 0))
        for _ in range(remaining): result.append({'requirement_id': r.id, 'subject_name': r.subject.name if r.subject else None, 'class_name': r.tt_class.name if r.tt_class else None, 'teacher_name': r.teacher.name if r.teacher else None, 'periods_per_week': r.periods_per_week, 'double_periods': r.double_periods})
    return result
