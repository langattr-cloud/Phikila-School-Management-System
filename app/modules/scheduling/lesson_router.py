"""Manual lesson placement and move endpoints."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models as m
from . import schemas as s
from .engine import explain_move, suggest_slots
from .tenancy import Principal, require_role, resolve_principal

router = APIRouter()

def _lesson(db: Session, school_id: int, lesson_id: int) -> m.TtLesson:
    lesson = db.query(m.TtLesson).filter(m.TtLesson.id == lesson_id, m.TtLesson.school_id == school_id).first()
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
    return lesson

def _editable_version(lesson: m.TtLesson) -> None:
    if lesson.version.status != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, "Published timetable versions are read-only. Restore the version as a draft before changing it.")

def _conflict(explanation: dict, message: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, detail={"message": message, "reasons": explanation["reasons"], "alternatives": explanation["alternatives"]})

@router.patch("/lessons/{lesson_id}", response_model=s.LessonOut)
def move_lesson(lesson_id: int, payload: s.LessonMoveIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    lesson = _lesson(db, principal.school_id, lesson_id); _editable_version(lesson)
    explanation = explain_move(db, principal.school_id, lesson.version_id, lesson.id, payload.day_index, payload.period_index, lesson.duration, payload.room_id)
    if not explanation["allowed"]: raise _conflict(explanation, "The lesson cannot be placed in the requested slot.")
    lesson.day_index = payload.day_index; lesson.period_index = payload.period_index
    if payload.room_id is not None: lesson.room_id = payload.room_id
    db.commit(); db.refresh(lesson); return lesson

@router.patch("/lessons/{lesson_id}/duration", response_model=s.LessonOut)
def resize_lesson(lesson_id: int, duration: int = 1, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    lesson = _lesson(db, principal.school_id, lesson_id); _editable_version(lesson)
    if duration < 1 or duration > 10:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Lesson duration must be between 1 and 10 periods.")
    explanation = explain_move(db, principal.school_id, lesson.version_id, lesson.id, lesson.day_index, lesson.period_index, duration, lesson.room_id)
    if not explanation["allowed"]: raise _conflict(explanation, "The lesson cannot be extended to the requested duration.")
    lesson.duration = duration
    db.commit(); db.refresh(lesson); return lesson

@router.post("/lessons/{lesson_id}/explain", response_model=s.Explanation)
def explain_lesson_move(lesson_id: int, day_index: int, period_index: int, room_id: int | None = None, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    lesson = _lesson(db, principal.school_id, lesson_id)
    return explain_move(db, principal.school_id, lesson.version_id, lesson.id, day_index, period_index, lesson.duration, room_id)

@router.get("/lessons/{lesson_id}/suggestions", response_model=list[s.Alternative])
def lesson_suggestions(lesson_id: int, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    lesson = _lesson(db, principal.school_id, lesson_id)
    return suggest_slots(db, principal.school_id, lesson.version_id, lesson.id, lesson.duration, lesson.room_id, limit=8)
