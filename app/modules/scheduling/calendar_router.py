from datetime import time
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models as m
from . import schemas as s
from .router import get_calendar
from .tenancy import Principal, require_role

router = APIRouter()

class CalendarDayIn(BaseModel):
    index: int = Field(ge=0, le=6)
    name: str = Field(min_length=1, max_length=80)
    is_active: bool = True

class CalendarIn(BaseModel):
    days: list[CalendarDayIn]
    periods: list[s.PeriodIn]


def _minutes(value: str) -> int:
    hour, minute = (int(part) for part in value.split(':', 1))
    return hour * 60 + minute


def _as_time(value: str) -> time:
    hour, minute = (int(part) for part in value.split(':', 1))
    return time(hour=hour, minute=minute)


def _validate_times(periods: dict[int, s.PeriodIn]) -> None:
    ordered = sorted(periods.values(), key=lambda period: (_minutes(period.start_time), _minutes(period.end_time), period.index))
    previous_end: int | None = None
    for period in ordered:
        start = _minutes(period.start_time)
        end = _minutes(period.end_time)
        if end <= start:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f'{period.name}: end time must be after start time.')
        if previous_end is not None and start < previous_end:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f'{period.name}: time overlaps another configured period/event.')
        previous_end = end


@router.put('/calendar')
def set_calendar(payload: CalendarIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin', 'scheduler'))):
    existing_lessons = db.query(m.TtLesson).filter(m.TtLesson.school_id == principal.school_id).count()
    existing_days = {row.index: row for row in db.query(m.TtDay).filter(m.TtDay.school_id == principal.school_id).all()}
    existing_periods = {row.index: row for row in db.query(m.TtPeriod).filter(m.TtPeriod.school_id == principal.school_id).all()}
    incoming_days = {day.index: day for day in payload.days}
    incoming_periods = {period.index: period for period in payload.periods}
    if len(incoming_days) != len(payload.days) or len(incoming_periods) != len(payload.periods):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Day and period indexes must be unique.')
    _validate_times(incoming_periods)

    if existing_lessons:
        if set(existing_days) != set(incoming_days) or set(existing_periods) != set(incoming_periods):
            raise HTTPException(status.HTTP_409_CONFLICT, 'Existing timetable lessons require the same day and period indexes. Rename labels instead.')
        for index, day in incoming_days.items():
            if existing_days[index].is_active != day.is_active:
                raise HTTPException(status.HTTP_409_CONFLICT, 'Existing timetable lessons require the current active days. Rename labels instead.')

    for index, day in incoming_days.items():
        current = existing_days.get(index)
        if current is None:
            db.add(m.TtDay(school_id=principal.school_id, index=day.index, day_of_week=day.index, name=day.name, is_active=day.is_active))
        else:
            current.name = day.name
            current.is_active = day.is_active
            current.day_of_week = day.index

    for index, period in incoming_periods.items():
        current = existing_periods.get(index)
        start_time = _as_time(period.start_time)
        end_time = _as_time(period.end_time)
        if current is None:
            db.add(m.TtPeriod(
                school_id=principal.school_id,
                index=period.index,
                name=period.name,
                start_time=start_time,
                end_time=end_time,
                is_teaching=period.is_teaching,
            ))
        else:
            current.name = period.name
            current.start_time = start_time
            current.end_time = end_time
            current.is_teaching = period.is_teaching
    db.commit()
    return get_calendar(db, principal)
