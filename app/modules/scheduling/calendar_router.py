from datetime import date, time
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models as m
from . import schemas as s
from .tenancy import Principal, require_role

router = APIRouter()

class CalendarDayIn(BaseModel):
    index: int = Field(ge=0, le=30)
    name: str = Field(min_length=1, max_length=80)
    short_form: str = Field(default='', max_length=20)
    date_value: str | None = Field(default=None, max_length=40)
    is_active: bool = True

class CalendarIn(BaseModel):
    days: list[CalendarDayIn]
    periods: list[s.PeriodIn]
    display_mode: str = Field(default='day', pattern='^(day|date)$')

def _minutes(value: str) -> int:
    hour, minute = (int(part) for part in value.split(':', 1))
    return hour * 60 + minute

def _as_time(value: str) -> time:
    hour, minute = (int(part) for part in value.split(':', 1))
    return time(hour=hour, minute=minute)

def _parse_date(value: str | None) -> date | None:
    if value is None or not value.strip(): return None
    raw = value.strip()
    from datetime import datetime
    for fmt in ('%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y', '%d/%m/%y', '%d-%m-%y', '%d.%m.%y', '%d/%m', '%d-%m', '%d.%m'):
        try:
            parsed = datetime.strptime(raw, fmt).date()
            if fmt in ('%d/%m', '%d-%m', '%d.%m'): parsed = parsed.replace(year=date.today().year)
            return parsed
        except ValueError: pass
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f'Invalid date "{value}".')

def _validate_times(periods: dict[int, s.PeriodIn]) -> None:
    ordered = sorted(periods.values(), key=lambda period: (_minutes(period.start_time), _minutes(period.end_time), period.index))
    previous_end = None
    for period in ordered:
        start = _minutes(period.start_time); end = _minutes(period.end_time)
        if end <= start: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f'{period.name}: end time must be after start time.')
        if previous_end is not None and start < previous_end: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f'{period.name}: time overlaps another configured period/event.')
        previous_end = end

def _rank_map(existing: dict[int, object], incoming: dict[int, object]) -> dict[int, int]:
    return dict(zip(sorted(existing), sorted(incoming)))

def _remap_json_slots(value, day_map: dict[int, int], period_map: dict[int, int]):
    if not isinstance(value, dict): return value
    result = {}
    for day, periods in value.items():
        try: old_day = int(day)
        except (TypeError, ValueError): old_day = None
        new_day = day_map.get(old_day, old_day) if old_day is not None else day
        if isinstance(periods, (list, tuple, set)):
            mapped = []
            for period in periods:
                try: old_period = int(period)
                except (TypeError, ValueError): continue
                mapped.append(period_map.get(old_period, old_period))
            result[str(new_day)] = mapped
        else: result[str(new_day)] = periods
    return result

def _remap_calendar_references(db: Session, school_id: int, day_map: dict[int, int], period_map: dict[int, int]) -> None:
    for lesson in db.query(m.TtLesson).filter(m.TtLesson.school_id == school_id).all():
        if lesson.day_index in day_map: lesson.day_index = day_map[lesson.day_index]
        if lesson.period_index in period_map: lesson.period_index = period_map[lesson.period_index]
    for version in db.query(m.TtVersion).filter(m.TtVersion.school_id == school_id).all():
        if isinstance(version.day_indexes, list): version.day_indexes = [day_map.get(int(v), int(v)) for v in version.day_indexes]
    for timetable_type in db.query(m.TtTimetableType).filter(m.TtTimetableType.school_id == school_id).all():
        if isinstance(timetable_type.day_indexes, list): timetable_type.day_indexes = [day_map.get(int(v), int(v)) for v in timetable_type.day_indexes]
        if isinstance(timetable_type.period_indexes, list): timetable_type.period_indexes = [period_map.get(int(v), int(v)) for v in timetable_type.period_indexes if int(v) in period_map]
    for event in db.query(m.TtEvent).filter(m.TtEvent.school_id == school_id).all():
        if isinstance(event.day_indexes, list): event.day_indexes = [day_map.get(int(v), int(v)) for v in event.day_indexes]
    for model in (m.TtTeacher, m.TtClass, m.TtRoom):
        for row in db.query(model).filter(model.school_id == school_id).all():
            if row.unavailable: row.unavailable = _remap_json_slots(row.unavailable, day_map, period_map)

def _calendar_response(db: Session, principal: Principal):
    days = db.query(m.TtDay).filter(m.TtDay.school_id == principal.school_id).order_by(m.TtDay.index).all()
    periods = db.query(m.TtPeriod).filter(m.TtPeriod.school_id == principal.school_id).order_by(m.TtPeriod.index).all()
    config = db.query(m.TtCalendarConfig).filter(m.TtCalendarConfig.school_id == principal.school_id).first()
    return {'days':[s.DayOut.model_validate(d).model_dump() for d in days],'periods':[s.PeriodOut.model_validate(p).model_dump() for p in periods],'display_mode':config.display_mode if config else 'day'}

@router.get('/calendar')
def calendar(db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin', 'scheduler'))): return _calendar_response(db, principal)

@router.put('/calendar')
def set_calendar(payload: CalendarIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin', 'scheduler'))):
    existing_days = {r.index:r for r in db.query(m.TtDay).filter(m.TtDay.school_id == principal.school_id).all()}
    existing_periods = {r.index:r for r in db.query(m.TtPeriod).filter(m.TtPeriod.school_id == principal.school_id).all()}
    incoming_days = {d.index:d for d in payload.days}; incoming_periods = {p.index:p for p in payload.periods}
    if len(incoming_days) != len(payload.days) or len(incoming_periods) != len(payload.periods): raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Day and period indexes must be unique.')
    if not incoming_days or not incoming_periods: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'At least one day/date and one period are required.')
    _validate_times(incoming_periods)
    for day in incoming_days.values():
        if payload.display_mode == 'date': _parse_date(day.date_value or day.name)
        elif day.date_value: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Dates are not allowed when Days mode is selected.')

    old_days = sorted(existing_days.values(), key=lambda row: row.index); old_periods = sorted(existing_periods.values(), key=lambda row: row.index)
    new_days = [incoming_days[i] for i in sorted(incoming_days)]; new_periods = [incoming_periods[i] for i in sorted(incoming_periods)]
    dropped_days = old_days[len(new_days):]; dropped_periods = old_periods[len(new_periods):]
    if dropped_days:
        indexes={r.index for r in dropped_days}
        if db.query(m.TtLesson).filter(m.TtLesson.school_id == principal.school_id, m.TtLesson.day_index.in_(indexes)).first(): raise HTTPException(status.HTTP_409_CONFLICT, 'Cannot remove a day that contains timetable lessons. Move those lessons first.')
    if dropped_periods:
        indexes={r.index for r in dropped_periods}
        if db.query(m.TtLesson).filter(m.TtLesson.school_id == principal.school_id, m.TtLesson.period_index.in_(indexes)).first(): raise HTTPException(status.HTTP_409_CONFLICT, 'Cannot remove a period that contains timetable lessons. Move those lessons first.')

    day_map=_rank_map(existing_days,incoming_days); period_map=_rank_map(existing_periods,incoming_periods)
    _remap_calendar_references(db,principal.school_id,day_map,period_map)
    config=db.query(m.TtCalendarConfig).filter(m.TtCalendarConfig.school_id == principal.school_id).first()
    if config is None: db.add(m.TtCalendarConfig(school_id=principal.school_id,display_mode=payload.display_mode))
    else: config.display_mode=payload.display_mode

    temporary_base=1000
    for offset,current in enumerate(old_days): current.index=temporary_base+offset
    for offset,current in enumerate(old_periods): current.index=temporary_base+offset
    db.flush()
    for current in dropped_days+dropped_periods: db.delete(current)
    for position,day in enumerate(new_days):
        current=old_days[position] if position < len(old_days) else None; parsed=_parse_date(day.date_value or day.name) if payload.display_mode=='date' else None
        if current is None: db.add(m.TtDay(school_id=principal.school_id,index=day.index,day_of_week=day.index,name=day.name,short_form=day.short_form,date_value=parsed,is_active=day.is_active))
        else: current.index=day.index; current.day_of_week=day.index; current.name=day.name; current.short_form=day.short_form; current.date_value=parsed; current.is_active=day.is_active
    for position,period in enumerate(new_periods):
        current=old_periods[position] if position < len(old_periods) else None; start=_as_time(period.start_time); end=_as_time(period.end_time)
        if current is None: db.add(m.TtPeriod(school_id=principal.school_id,index=period.index,name=period.name or f'Period {period.index+1}',short_form=period.short_form,start_time=start,end_time=end,is_teaching=period.is_teaching))
        else: current.index=period.index; current.name=period.name or f'Period {period.index+1}'; current.short_form=period.short_form; current.start_time=start; current.end_time=end; current.is_teaching=period.is_teaching
    db.commit(); return _calendar_response(db,principal)
