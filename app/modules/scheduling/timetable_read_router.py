"""Read-side endpoints for published timetable views."""
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


def _current(db, school_id, timetable_type_id=None):
    query = db.query(m.TtVersion).filter(
        m.TtVersion.school_id == school_id,
        m.TtVersion.status == 'published',
    )
    if timetable_type_id is not None:
        timetable_type = db.query(m.TtTimetableType).filter(
            m.TtTimetableType.school_id == school_id,
            m.TtTimetableType.id == timetable_type_id,
            m.TtTimetableType.is_active.is_(True),
        ).first()
        if timetable_type is None:
            return None, None
        version = query.filter(m.TtVersion.timetable_type_id == timetable_type.id).order_by(
            m.TtVersion.published_at.desc(), m.TtVersion.id.desc()
        ).first()
        return timetable_type, version

    version = query.order_by(m.TtVersion.published_at.desc(), m.TtVersion.id.desc()).first()
    if version is None:
        return None, None
    timetable_type = db.query(m.TtTimetableType).filter(m.TtTimetableType.id == version.timetable_type_id).first()
    return timetable_type, version


def _assert_scope_access(db: Session, principal: Principal, scope: str, target_id: int) -> None:
    if principal.at_least('scheduler'):
        return
    if principal.role != 'teacher' or principal.teacher_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, 'You do not have access to this timetable view.')
    teacher_id = principal.teacher_id
    if scope == 'teacher' and target_id == teacher_id:
        return
    requirements = db.query(m.TtLessonRequirement).filter(
        m.TtLessonRequirement.school_id == principal.school_id,
        m.TtLessonRequirement.teacher_id == teacher_id,
    ).all()
    taught_class_ids = {int(row.class_id) for row in requirements}
    taught_subject_ids = {int(row.subject_id) for row in requirements}
    taught_room_ids = {int(row.room_id) for row in requirements if row.room_id is not None}
    if scope == 'class' and target_id in taught_class_ids:
        return
    if scope == 'subject' and target_id in taught_subject_ids:
        return
    if scope == 'room' and target_id in taught_room_ids:
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, 'This timetable view is outside your teaching assignment.')


@router.get('/timetable/view')
def current_timetable_view(
    scope: str,
    target_id: int,
    timetable_type_id: int | None = None,
    db: Session = Depends(get_db),
    principal: Principal = Depends(resolve_principal),
):
    if scope not in {'teacher', 'class', 'room', 'subject'}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Invalid timetable scope.')
    _assert_scope_access(db, principal, scope, target_id)
    timetable_type, version = _current(db, principal.school_id, timetable_type_id)
    if timetable_type_id is not None and timetable_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Timetable type not found.')
    if not version:
        return {'days': [], 'periods': [], 'lessons': [], 'target_name': None, 'version': None, 'timetable_type': timetable_type}

    configured_day_indexes = {int(i) for i in (version.day_indexes or [])}
    if not configured_day_indexes and timetable_type:
        configured_day_indexes = {int(i) for i in (timetable_type.day_indexes or [])}
    if not configured_day_indexes:
        configured_day_indexes = {int(d.index) for d in db.query(m.TtDay).filter(m.TtDay.school_id == principal.school_id, m.TtDay.is_active.is_(True)).all()}
    days = db.query(m.TtDay).filter(
        m.TtDay.school_id == principal.school_id,
        m.TtDay.is_active.is_(True),
        m.TtDay.index.in_(list(configured_day_indexes)),
    ).order_by(m.TtDay.index).all()

    configured_period_indexes = {int(i) for i in (timetable_type.period_indexes or [])} if timetable_type else set()
    periods = db.query(m.TtPeriod).filter(m.TtPeriod.school_id == principal.school_id).order_by(m.TtPeriod.index).all()
    if configured_period_indexes:
        periods = [p for p in periods if p.index in configured_period_indexes]

    day_indexes = [d.index for d in days]
    period_indexes = [p.index for p in periods]
    lesson_query = db.query(m.TtLesson).filter(m.TtLesson.school_id == principal.school_id, m.TtLesson.version_id == version.id)
    if day_indexes:
        lesson_query = lesson_query.filter(m.TtLesson.day_index.in_(day_indexes))
    if period_indexes:
        lesson_query = lesson_query.filter(m.TtLesson.period_index.in_(period_indexes))
    lessons = lesson_query.order_by(m.TtLesson.day_index, m.TtLesson.period_index, m.TtLesson.id).all()
    if scope == 'teacher': lessons = [x for x in lessons if x.teacher_id == target_id]
    elif scope == 'class': lessons = [x for x in lessons if x.class_id == target_id]
    elif scope == 'room': lessons = [x for x in lessons if x.room_id == target_id]
    else: lessons = [x for x in lessons if x.subject_id == target_id]

    teachers = db.query(m.TtTeacher).filter(m.TtTeacher.school_id == principal.school_id).all()
    classes = db.query(m.TtClass).filter(m.TtClass.school_id == principal.school_id).all()
    subjects = db.query(m.TtSubject).filter(m.TtSubject.school_id == principal.school_id).all()
    rooms = db.query(m.TtRoom).filter(m.TtRoom.school_id == principal.school_id).all()
    teacher_map = {x.id: x for x in teachers}; class_map = {x.id: x for x in classes}; subject_map = {x.id: x for x in subjects}; room_map = {x.id: x for x in rooms}
    target = teacher_map.get(target_id) if scope == 'teacher' else class_map.get(target_id) if scope == 'class' else room_map.get(target_id) if scope == 'room' else subject_map.get(target_id)
    return {
        'days': [{'index': d.index, 'name': d.name} for d in days],
        'periods': [{'index': p.index, 'name': p.name, 'start_time': p.start_time.strftime('%H:%M'), 'end_time': p.end_time.strftime('%H:%M'), 'is_teaching': p.is_teaching} for p in periods],
        'lessons': [{'day': x.day_index, 'period': x.period_index, 'subject': subject_map.get(x.subject_id).code if subject_map.get(x.subject_id) else 'Unknown subject', 'subject_colour': subject_map.get(x.subject_id).colour if subject_map.get(x.subject_id) else None, 'teacher': teacher_map.get(x.teacher_id).code if x.teacher_id and teacher_map.get(x.teacher_id) else None, 'class': class_map.get(x.class_id).code if class_map.get(x.class_id) else 'Unknown class', 'room': room_map.get(x.room_id).code if x.room_id and room_map.get(x.room_id) else None} for x in lessons],
        'target_name': target.name if target else None,
        'version': s.VersionOut.model_validate(version).model_dump(),
        'timetable_type': {'id': timetable_type.id, 'name': timetable_type.name, 'code': timetable_type.code, 'display_mode': timetable_type.display_mode, 'day_indexes': list(timetable_type.day_indexes or []), 'period_indexes': list(timetable_type.period_indexes or []), 'is_active': timetable_type.is_active, 'is_system': timetable_type.is_system} if timetable_type else None,
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
    for rid, in scheduled: counts[rid] = counts.get(rid, 0) + 1
    result = []
    for r in requirements:
        remaining = max(0, int(r.periods_per_week or 0) - counts.get(r.id, 0))
        for _ in range(remaining):
            result.append({'requirement_id': r.id, 'subject_name': r.subject.name if r.subject else None, 'class_name': r.tt_class.name if r.tt_class else None, 'teacher_name': r.teacher.name if r.teacher else None, 'periods_per_week': r.periods_per_week, 'double_periods': r.double_periods})
    return result
