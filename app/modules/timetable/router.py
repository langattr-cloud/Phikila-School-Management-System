"""Persistent, account-scoped timetable workspace and preflight validation API."""
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Session

from app.core.database import Base, get_db
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.subjects.models import Subject



class TimetableRibbonWorkspace(Base):
    __tablename__ = "tt_timetable_ribbon_workspaces"
    __table_args__ = (UniqueConstraint("owner_id", name="uq_tt_timetable_ribbon_workspace_owner"),)

    id = Column(Integer, primary_key=True)
    owner_id = Column(String(255), nullable=False, index=True)
    data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class WorkspaceInput(BaseModel):
    data: dict[str, Any] = Field(...)


router = APIRouter(tags=["Timetable workspace"])


def _owner(claims: dict[str, Any]) -> str:
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        raise HTTPException(status_code=401, detail="A valid signed-in account is required")
    return subject


def _get_row(db: Session, owner_id: str) -> TimetableRibbonWorkspace | None:
    return db.query(TimetableRibbonWorkspace).filter(TimetableRibbonWorkspace.owner_id == owner_id).first()


def _validate(data: dict[str, Any]) -> None:
    days, periods, lessons = data.get("days"), data.get("periods"), data.get("lessons")
    if not isinstance(days, list) or not 1 <= len(days) <= 7 or not all(isinstance(day, str) and day.strip() for day in days):
        raise HTTPException(status_code=422, detail="Workspace must contain 1–7 named days")
    if not isinstance(periods, list) or not 1 <= len(periods) <= 24:
        raise HTTPException(status_code=422, detail="Workspace must contain 1–24 periods")
    if not isinstance(lessons, list) or len(lessons) > 5000:
        raise HTTPException(status_code=422, detail="Lessons must be a list containing at most 5000 items")
    for index, period in enumerate(periods):
        if not isinstance(period, dict) or not str(period.get("name", "")).strip():
            raise HTTPException(status_code=422, detail="Period " + str(index + 1) + " needs a name")
        start, end = str(period.get("start", "")), str(period.get("end", ""))
        if start and end and start >= end:
            raise HTTPException(status_code=422, detail="Period " + str(index + 1) + " end time must follow start time")
    for index, lesson in enumerate(lessons):
        if not isinstance(lesson, dict):
            raise HTTPException(status_code=422, detail="Lesson " + str(index + 1) + " is invalid")
        # Lessons may intentionally remain assigned to a temporarily hidden day.
        # The UI only renders active days, but reducing the visible day count must
        # not erase saved lesson assignments; require a valid day label instead.
        if not isinstance(lesson.get("day"), str) or not lesson["day"].strip():
            raise HTTPException(status_code=422, detail="Lesson " + str(index + 1) + " needs a named day")
        period = lesson.get("period")
        if not isinstance(period, int) or isinstance(period, bool) or not 0 <= period < len(periods):
            raise HTTPException(status_code=422, detail="Lesson " + str(index + 1) + " has an invalid period")
        for key in ("className", "subject", "teacher"):
            if not isinstance(lesson.get(key), str) or not lesson[key].strip():
                raise HTTPException(status_code=422, detail="Lesson " + str(index + 1) + " needs " + key)


def _serialize(row: TimetableRibbonWorkspace | None) -> dict[str, Any]:
    return {"data": row.data, "updated_at": row.updated_at.isoformat() if row and row.updated_at else None} if row else {"data": None, "updated_at": None}




@router.get("/timetable/subjects/catalogue")
def list_subject_catalogue(claims: dict[str, Any] = Depends(get_supabase_claims), db: Session = Depends(get_db)):
    """Return the canonical subject catalogue for the signed-in timetable user."""
    _owner(claims)
    rows = db.query(Subject).filter(Subject.name.is_not(None)).order_by(Subject.name.asc()).all()
    return [{"id": row.id, "name": row.name, "code": row.code} for row in rows if str(row.name or "").strip()]

@router.get("/timetable/workspace")
def get_workspace(claims: dict[str, Any] = Depends(get_supabase_claims), db: Session = Depends(get_db)):
    return _serialize(_get_row(db, _owner(claims)))


@router.put("/timetable/workspace")
def save_workspace(payload: WorkspaceInput, claims: dict[str, Any] = Depends(get_supabase_claims), db: Session = Depends(get_db)):
    owner_id = _owner(claims)
    _validate(payload.data)
    row = _get_row(db, owner_id)
    if row is None:
        row = TimetableRibbonWorkspace(owner_id=owner_id, data=payload.data)
        db.add(row)
    else:
        row.data = payload.data
        row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.post("/timetable/test")
def test_workspace(payload: WorkspaceInput, claims: dict[str, Any] = Depends(get_supabase_claims)):
    _owner(claims)
    _validate(payload.data)
    data = payload.data
    conflicts: list[dict[str, Any]] = []
    lessons, periods = data["lessons"], data["periods"]
    for index, first in enumerate(lessons):
        for second in lessons[index + 1:]:
            if first["day"] != second["day"] or first["period"] != second["period"]:
                continue
            resources = [
                ("class", first["className"], second["className"]),
                ("teacher", first["teacher"], second["teacher"]),
                ("room", str(first.get("room", "")).strip(), str(second.get("room", "")).strip()),
            ]
            for kind, left, right in resources:
                if left and left == right:
                    conflicts.append({
                        "type": kind,
                        "day": first["day"],
                        "period": first["period"],
                        "period_name": periods[first["period"]]["name"],
                        "resource": left,
                        "lesson_ids": [first.get("id"), second.get("id")],
                        "message": first["day"] + " · " + periods[first["period"]]["name"] + ": " + left + " is double-booked (" + kind + ")",
                    })
    return {"valid": not conflicts, "days_checked": len(data["days"]), "lessons_checked": len(lessons), "conflicts": conflicts}
