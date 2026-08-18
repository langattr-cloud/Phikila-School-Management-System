from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from . import models as m
from . import schemas as s
from .engine import load_calendar
from .tenancy import Principal, require_role, resolve_principal

router = APIRouter()


def _minutes(value: str) -> int:
    hour, minute = (int(part) for part in value.split(':', 1))
    return hour * 60 + minute


def _owned(db: Session, principal: Principal, ident: int) -> m.TtEvent:
    row = db.query(m.TtEvent).filter(m.TtEvent.id == ident, m.TtEvent.school_id == principal.school_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Event not found')
    return row


def _validate_event(db: Session, principal: Principal, payload: s.EventIn, *, exclude_id: int | None = None) -> None:
    start, end = _minutes(payload.start_time), _minutes(payload.end_time)
    if end <= start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Event end time must be after start time.')
    calendar = load_calendar(db, principal.school_id)
    active_days = {d.index for d in calendar.days if d.is_active}
    invalid_days = set(payload.day_indexes) - active_days
    if invalid_days:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Events can only use active working days.')

    periods = calendar.periods
    for period in periods:
        p_start, p_end = _minutes(period.start_time), _minutes(period.end_time)
        if not period.is_teaching or p_end <= start or p_start >= end:
            continue
        overlapping_days = set(payload.day_indexes)
        if overlapping_days:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"{payload.name} overlaps teaching period {period.name} ({period.start_time}–{period.end_time}).",
            )

    query = db.query(m.TtEvent).filter(m.TtEvent.school_id == principal.school_id)
    if exclude_id is not None:
        query = query.filter(m.TtEvent.id != exclude_id)
    for other in query.all():
        other_days = set(other.day_indexes or [])
        if not other_days.intersection(payload.day_indexes):
            continue
        if _minutes(other.end_time) <= start or _minutes(other.start_time) >= end:
            continue
        raise HTTPException(status.HTTP_409_CONFLICT, f"Event overlaps {other.name} on a shared day.")


def _merge_days(existing: m.TtEvent, days: list[int]) -> m.TtEvent:
    existing.day_indexes = sorted(set(existing.day_indexes or []).union(days))
    return existing


@router.get('/events', response_model=list[s.EventOut])
def list_events(db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    return db.query(m.TtEvent).filter(m.TtEvent.school_id == principal.school_id).order_by(m.TtEvent.start_time, m.TtEvent.id).all()


@router.post('/events', response_model=s.EventOut, status_code=201)
def create_event(payload: s.EventIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin', 'scheduler'))):
    _validate_event(db, principal, payload)
    existing = (
        db.query(m.TtEvent)
        .filter(
            m.TtEvent.school_id == principal.school_id,
            m.TtEvent.name == payload.name,
            m.TtEvent.start_time == payload.start_time,
            m.TtEvent.end_time == payload.end_time,
            m.TtEvent.event_type == payload.event_type,
        )
        .first()
    )
    if existing:
        _merge_days(existing, payload.day_indexes)
        if payload.note is not None:
            existing.note = payload.note
        db.commit(); db.refresh(existing)
        return existing
    row = m.TtEvent(school_id=principal.school_id, **payload.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.put('/events/{ident}', response_model=s.EventOut)
def update_event(ident: int, payload: s.EventIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin', 'scheduler'))):
    row = _owned(db, principal, ident)
    _validate_event(db, principal, payload, exclude_id=ident)
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit(); db.refresh(row)
    return row


@router.delete('/events/{ident}', status_code=204)
def delete_event(ident: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin', 'scheduler'))):
    row = _owned(db, principal, ident)
    db.delete(row); db.commit()
