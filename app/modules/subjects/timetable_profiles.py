from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Integer, JSON, String, func
from sqlalchemy.orm import Session

from app.core.database import Base, get_db
from app.modules.authentication.supabase import get_supabase_claims


class TimetableSubjectProfile(Base):
    """Subject profile stored persistently and isolated by signed-in account."""
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


@router.get("/subjects")
def list_subject_profiles(
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


@router.post("/subjects", status_code=status.HTTP_201_CREATED)
def create_subject_profile(
    payload: SubjectProfileInput,
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    profile = dict(payload.profile)
    if not str(profile.get("title", "")).strip() or not str(profile.get("short", profile.get("code", ""))).strip():
        raise HTTPException(status_code=422, detail="Subject name and code are required")
    row = TimetableSubjectProfile(owner_id=_owner(claims), profile=profile)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.put("/subjects/{subject_id}")
def update_subject_profile(
    subject_id: int,
    payload: SubjectProfileInput,
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    row = db.query(TimetableSubjectProfile).filter(
        TimetableSubjectProfile.id == subject_id,
        TimetableSubjectProfile.owner_id == _owner(claims),
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    profile = dict(payload.profile)
    if not str(profile.get("title", "")).strip() or not str(profile.get("short", profile.get("code", ""))).strip():
        raise HTTPException(status_code=422, detail="Subject name and code are required")
    row.profile = profile
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject_profile(
    subject_id: int,
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    row = db.query(TimetableSubjectProfile).filter(
        TimetableSubjectProfile.id == subject_id,
        TimetableSubjectProfile.owner_id == _owner(claims),
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    db.delete(row)
    db.commit()
    return None


class TimetableTeacherProfile(Base):
    """Teacher profile used by timetable and school setup, isolated per signed-in account."""
    __tablename__ = "timetable_teacher_profiles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(String(128), nullable=False, index=True)
    profile = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


def _serialize_teacher(row: TimetableTeacherProfile) -> dict[str, Any]:
    return {
        "id": row.id,
        "profile": row.profile,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _validate_teacher_profile(profile: dict[str, Any]) -> dict[str, Any]:
    clean = dict(profile)
    first_name = str(clean.get("firstName", clean.get("first_name", ""))).strip()
    last_name = str(clean.get("lastName", clean.get("last_name", ""))).strip()
    name = str(clean.get("name", "")).strip()
    short = str(clean.get("short", clean.get("code", ""))).strip()
    if not (name or first_name or last_name):
        raise HTTPException(status_code=422, detail="Teacher name is required")
    if not short:
        raise HTTPException(status_code=422, detail="Teacher short code is required")
    clean["firstName"] = first_name
    clean["lastName"] = last_name
    clean["short"] = short
    clean["name"] = name or " ".join(part for part in (first_name, last_name) if part).strip()
    return clean


@router.get("/teachers")
def list_teacher_profiles(
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(TimetableTeacherProfile)
        .filter(TimetableTeacherProfile.owner_id == _owner(claims))
        .order_by(TimetableTeacherProfile.updated_at.desc(), TimetableTeacherProfile.id.desc())
        .all()
    )
    return [_serialize_teacher(row) for row in rows]


@router.post("/teachers", status_code=status.HTTP_201_CREATED)
def create_teacher_profile(
    payload: SubjectProfileInput,
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    owner_id = _owner(claims)
    profile = _validate_teacher_profile(payload.profile)
    short = profile["short"].casefold()
    duplicate = db.query(TimetableTeacherProfile).filter(
        TimetableTeacherProfile.owner_id == owner_id
    ).all()
    if any(str((row.profile or {}).get("short", (row.profile or {}).get("code", ""))).strip().casefold() == short for row in duplicate):
        raise HTTPException(status_code=409, detail="That teacher short code is already in use")
    row = TimetableTeacherProfile(owner_id=owner_id, profile=profile)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_teacher(row)


@router.put("/teachers/{teacher_id}")
def update_teacher_profile(
    teacher_id: int,
    payload: SubjectProfileInput,
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    owner_id = _owner(claims)
    row = db.query(TimetableTeacherProfile).filter(
        TimetableTeacherProfile.id == teacher_id,
        TimetableTeacherProfile.owner_id == owner_id,
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Teacher not found")
    profile = _validate_teacher_profile(payload.profile)
    short = profile["short"].casefold()
    duplicate = db.query(TimetableTeacherProfile).filter(
        TimetableTeacherProfile.owner_id == owner_id,
        TimetableTeacherProfile.id != teacher_id,
    ).all()
    if any(str((item.profile or {}).get("short", (item.profile or {}).get("code", ""))).strip().casefold() == short for item in duplicate):
        raise HTTPException(status_code=409, detail="That teacher short code is already in use")
    row.profile = profile
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _serialize_teacher(row)


@router.delete("/teachers/{teacher_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_teacher_profile(
    teacher_id: int,
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
):
    row = db.query(TimetableTeacherProfile).filter(
        TimetableTeacherProfile.id == teacher_id,
        TimetableTeacherProfile.owner_id == _owner(claims),
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Teacher not found")
    db.delete(row)
    db.commit()
    return None
