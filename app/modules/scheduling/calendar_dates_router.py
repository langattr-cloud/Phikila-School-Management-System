"""CRUD API for standalone concrete calendar dates."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db

from . import calendar_dates as m
from .tenancy import Principal, require_role, resolve_principal

router = APIRouter()


class CalendarDateIn(BaseModel):
    date: date
    label: str | None = Field(default=None, max_length=120)


class CalendarDateOut(CalendarDateIn):
    id: int

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CalendarDateOut])
def list_calendar_dates(
    db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)
):
    return (
        db.query(m.TtCalendarDate)
        .filter(m.TtCalendarDate.school_id == principal.school_id)
        .order_by(m.TtCalendarDate.date)
        .all()
    )


@router.post("", response_model=CalendarDateOut, status_code=201)
def create_calendar_date(
    payload: CalendarDateIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    row = m.TtCalendarDate(school_id=principal.school_id, **payload.model_dump())
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That calendar date already exists.")
    db.refresh(row)
    return row


@router.put("/{ident}", response_model=CalendarDateOut)
def update_calendar_date(
    ident: int,
    payload: CalendarDateIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    row = (
        db.query(m.TtCalendarDate)
        .filter(m.TtCalendarDate.id == ident, m.TtCalendarDate.school_id == principal.school_id)
        .first()
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Calendar date not found.")
    row.date = payload.date
    row.label = payload.label
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That calendar date already exists.")
    db.refresh(row)
    return row


@router.delete("/{ident}", status_code=204)
def delete_calendar_date(
    ident: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    row = (
        db.query(m.TtCalendarDate)
        .filter(m.TtCalendarDate.id == ident, m.TtCalendarDate.school_id == principal.school_id)
        .first()
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Calendar date not found.")
    db.delete(row)
    db.commit()
