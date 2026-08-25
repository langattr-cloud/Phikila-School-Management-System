"""Read-side compatibility endpoints for the timetable workspace."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models as m
from .engine import detect_conflicts
from .tenancy import Principal, resolve_principal

router = APIRouter()

def _version(db, school_id, version_id):
    return db.query(m.TtVersion).filter(m.TtVersion.id == version_id, m.TtVersion.school_id == school_id).first()

@router.get('/versions/{version_id}/conflicts')
def version_conflicts(version_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    version = _version(db, principal.school_id, version_id)
    if not version:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Not found')
    return [
        {
            'severity': c.severity,
            'kind': c.kind,
            'message': c.message,
            'lesson_ids': c.lesson_ids,
            'day': getattr(c, 'day', None),
            'period': getattr(c, 'period', None),
        }
        for c in detect_conflicts(db, principal.school_id, version.id)
    ]

@router.get('/versions/{version_id}/unassigned')
def version_unassigned(version_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    version = _version(db, principal.school_id, version_id)
    if not version:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Not found')
    requirements = db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id == principal.school_id).all()
    scheduled = db.query(m.TtLesson.requirement_id).filter(m.TtLesson.school_id == principal.school_id, m.TtLesson.version_id == version_id).all()
    counts = {}
    for (rid,) in scheduled:
        counts[rid] = counts.get(rid, 0) + 1
    result = []
    for r in requirements:
        remaining = max(0, int(r.periods_per_week or 0) - counts.get(r.id, 0))
        for _ in range(remaining):
            result.append({
                'requirement_id': r.id,
                'subject_name': r.subject.name if r.subject else None,
                'class_name': r.tt_class.name if r.tt_class else None,
                'teacher_name': r.teacher.name if r.teacher else None,
                'periods_per_week': r.periods_per_week,
                'double_periods': r.double_periods,
            })
    return result
