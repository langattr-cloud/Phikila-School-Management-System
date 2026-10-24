from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Integer, JSON, String, func
from sqlalchemy.orm import Session

from app.core.database import Base, get_db
from app.modules.authentication.supabase import get_supabase_claims


class TimetableWorkspace(Base):
    """Persistent timetable workspace owned by the authenticated account."""
    __tablename__ = "timetable_workspaces"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(String(128), nullable=False, unique=True, index=True)
    data = Column(JSON, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class WorkspaceInput(BaseModel):
    data: dict[str, Any] = Field(...)


router = APIRouter(tags=["Timetable workspace"])


def _owner(claims: dict[str, Any]) -> str:
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=401, detail="A valid signed-in account is required")
    return subject


@router.get("")
def get_workspace(claims: dict[str, Any] = Depends(get_supabase_claims), db: Session = Depends(get_db)):
    row = db.query(TimetableWorkspace).filter(TimetableWorkspace.owner_id == _owner(claims)).first()
    return {"data": row.data, "updated_at": row.updated_at.isoformat() if row and row.updated_at else None} if row else {"data": None, "updated_at": None}


@router.put("")
def save_workspace(payload: WorkspaceInput, claims: dict[str, Any] = Depends(get_supabase_claims), db: Session = Depends(get_db)):
    owner_id = _owner(claims)
    row = db.query(TimetableWorkspace).filter(TimetableWorkspace.owner_id == owner_id).first()
    if row is None:
        row = TimetableWorkspace(owner_id=owner_id, data=payload.data)
        db.add(row)
    else:
        row.data = payload.data
        row.updated_at = datetime.now().astimezone()
    db.commit()
    db.refresh(row)
    return {"data": row.data, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
