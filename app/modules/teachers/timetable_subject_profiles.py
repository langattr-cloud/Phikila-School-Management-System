from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Integer, JSON, String, func
from sqlalchemy.orm import Session

from app.core.database import Base, get_db
from app.modules.authentication.supabase import get_supabase_claims


class TimetableSubjectProfile(Base):
    """Timetable subject specifications scoped to the signed-in account."""
    __tablename__ = "timetable_subject_profiles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(String(128), nullable=False, index=True)
    profile = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class SubjectProfileInput(BaseModel):
    profile: dict[str, Any] = Field(...)


router = APIRouter(tags=["Timetable subject profiles"])


def _owner(claims: dict[str, Any]) -> str:
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=401, detail="A valid signed-in account is required")
    return subject


def _serialize(row: TimetableSubjectProfile) -> dict[str, Any]:
    return {
        "id": row.id,
        "profile": row.profile,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("")
def list_timetable_subject_profiles(
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(TimetableSubjectProfile)
        .filter(TimetableSubjectProfile.owner_id == _owner(claims))
        .order_by(TimetableSubjectProfile.updated_at.desc(), TimetableSubjectProfile.id.desc())
        .all()
    )
    return [_serialize(row) for row in rows]


@router.post("", status_code=201)
def create_timetable_subject_profile(
    payload: SubjectProfileInput,
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    profile = payload.profile
    if not str(profile.get("title", "")).strip():
        raise HTTPException(status_code=422, detail="Subject title is required")
    row = TimetableSubjectProfile(owner_id=_owner(claims), profile=profile)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.put("/{profile_id}")
def update_timetable_subject_profile(
    profile_id: int,
    payload: SubjectProfileInput,
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    row = db.query(TimetableSubjectProfile).filter(
        TimetableSubjectProfile.id == profile_id,
        TimetableSubjectProfile.owner_id == _owner(claims),
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    profile = payload.profile
    if not str(profile.get("title", "")).strip():
        raise HTTPException(status_code=422, detail="Subject title is required")
    row.profile = profile
    row.updated_at = datetime.now().astimezone()
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.delete("/{profile_id}", status_code=204)
def delete_timetable_subject_profile(
    profile_id: int,
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    row = db.query(TimetableSubjectProfile).filter(
        TimetableSubjectProfile.id == profile_id,
        TimetableSubjectProfile.owner_id == _owner(claims),
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    db.delete(row)
    db.commit()
    return None
