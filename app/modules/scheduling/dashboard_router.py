"""Scheduling dashboard summary endpoint."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models as m
from .engine import detect_conflicts
from .solver import ORTOOLS_AVAILABLE
from .tenancy import Principal, resolve_principal

router = APIRouter()

@router.get("/dashboard")
def scheduling_dashboard(db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    school_id = principal.school_id
    requirements = db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id == school_id).all()
    required = sum(max(0, int(row.periods_per_week or 0)) for row in requirements)
    teachers = db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id, m.TtTeacher.is_active.is_(True)).count()
    classes = db.query(m.TtClass).filter(m.TtClass.school_id == school_id).count()
    rooms = db.query(m.TtRoom).filter(m.TtRoom.school_id == school_id).count()
    version = db.query(m.TtVersion).filter(m.TtVersion.school_id == school_id, m.TtVersion.status == "published").order_by(m.TtVersion.number.desc()).first()
    if version is None and principal.at_least("scheduler"):
        version = db.query(m.TtVersion).filter(m.TtVersion.school_id == school_id).order_by(m.TtVersion.number.desc()).first()
    scheduled = hard = soft = 0
    quality: dict[str, Any] = {}
    if version:
        scheduled = db.query(m.TtLesson).filter(m.TtLesson.school_id == school_id, m.TtLesson.version_id == version.id).count()
        conflicts = detect_conflicts(db, school_id, version.id)
        hard = sum(1 for conflict in conflicts if conflict.severity == "hard")
        soft = sum(1 for conflict in conflicts if conflict.severity != "hard")
        quality = version.quality or {}
    recent_rows = db.query(m.TtAuditEntry).filter(m.TtAuditEntry.school_id == school_id).order_by(m.TtAuditEntry.at.desc()).limit(6).all()
    recent = [{"at": row.at.isoformat() if row.at else None, "actor": row.actor, "summary": row.summary or f"{row.action} {row.entity}"} for row in recent_rows]
    return {
        "counts": {"teachers": teachers, "classes": classes, "rooms": rooms},
        "conflicts": {"hard": hard, "soft": soft},
        "lessons": {"required": required, "scheduled": scheduled, "unassigned": max(0, required - scheduled)},
        "version": {"id": version.id, "number": version.number, "label": version.label, "status": version.status} if version else None,
        "solver_available": ORTOOLS_AVAILABLE,
        "quality": quality,
        "recent": recent,
    }
