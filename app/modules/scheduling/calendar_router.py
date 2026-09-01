from datetime import date, time
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
    index:int=Field(ge=0,le=30); name:str=Field(min_length=1,max_length=80); short_form:str=Field(default='',max_length=20); date_value:str|None=Field(default=None,max_length=40); is_active:bool=True
class CalendarIn(BaseModel): days:list[CalendarDayIn]; periods:list[s.PeriodIn]; display_mode:str=Field(default='day',pattern='^(day|date)$')
def _minutes(value:str)->int: hour,minute=(int(part) for part in value.split(':',1)); return hour*60+minute
def _as_time(value:str)->time: hour,minute=(int(part) for part in value.split(':',1)); return time(hour=hour,minute=minute)
def _parse_date(value:str|None)->date|None:
    if value is None or not value.strip(): return None
    raw=value.strip()
    from datetime import datetime
    for fmt in ('%d/%m/%Y','%d-%m-%Y','%d.%m.%Y','%d/%m/%y','%d-%m-%y','%d.%m.%y','%d/%m','%d-%m','%d.%m'):
        try:
            parsed=datetime.strptime(raw,fmt).date()
            if fmt in ('%d/%m','%d-%m','%d.%m'): parsed=parsed.replace(year=date.today().year)
            return parsed
        except ValueError: pass
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,f'Invalid date "{value}". Use a date such as 31/8, 31-8, 31.8, 31/8/2026, or 31-8-2026.')
def _validate_times(periods:dict[int,s.PeriodIn])->None:
    ordered=sorted(periods.values(),key=lambda period:(_minutes(period.start_time),_minutes(period.end_time),period.index)); previous_end=None
    for period in ordered:
        start=_minutes(period.start_time); end=_minutes(period.end_time)
        if end<=start: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,f'{period.name}: end time must be after start time.')
        if previous_end is not None and start<previous_end: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,f'{period.name}: time overlaps another configured period/event.')
        previous_end=end
@router.get('/calendar')
def calendar(db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    days=db.query(m.TtDay).filter(m.TtDay.school_id==principal.school_id).order_by(m.TtDay.index).all(); periods=db.query(m.TtPeriod).filter(m.TtPeriod.school_id==principal.school_id).order_by(m.TtPeriod.index).all(); config=db.query(m.TtCalendarConfig).filter(m.TtCalendarConfig.school_id==principal.school_id).first()
    mode=config.display_mode if config else 'day'
    return {'days':[s.DayOut.model_validate(d).model_dump() for d in days],'periods':[s.PeriodOut.model_validate(p).model_dump() for p in periods],'display_mode':mode}
@router.put('/calendar')
def set_calendar(payload:CalendarIn,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    existing_lessons=db.query(m.TtLesson).filter(m.TtLesson.school_id==principal.school_id).count(); existing_days={r.index:r for r in db.query(m.TtDay).filter(m.TtDay.school_id==principal.school_id).all()}; existing_periods={r.index:r for r in db.query(m.TtPeriod).filter(m.TtPeriod.school_id==principal.school_id).all()}; incoming_days={d.index:d for d in payload.days}; incoming_periods={p.index:p for p in payload.periods}
    if len(incoming_days)!=len(payload.days) or len(incoming_periods)!=len(payload.periods): raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,'Day and period indexes must be unique.')
    if not incoming_days or not incoming_periods: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,'At least one day/date and one period are required.')
    _validate_times(incoming_periods)
    for day in incoming_days.values():
        if payload.display_mode=='date': _parse_date(day.date_value or day.name)
        elif day.date_value: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,'Dates are not allowed when Days mode is selected.')
    if existing_lessons:
        if set(existing_days)!=set(incoming_days) or set(existing_periods)!=set(incoming_periods): raise HTTPException(status.HTTP_409_CONFLICT,'Existing timetable lessons require the same day and period indexes. Rename labels instead.')
        for index,day in incoming_days.items():
            if existing_days[index].is_active!=day.is_active: raise HTTPException(status.HTTP_409_CONFLICT,'Existing timetable lessons require the current active days. Rename labels instead.')
    config=db.query(m.TtCalendarConfig).filter(m.TtCalendarConfig.school_id==principal.school_id).first()
    if config is None: db.add(m.TtCalendarConfig(school_id=principal.school_id,display_mode=payload.display_mode))
    else: config.display_mode=payload.display_mode
    for index,day in incoming_days.items():
        current=existing_days.get(index); parsed=_parse_date(day.date_value or day.name) if payload.display_mode=='date' else None
        if current is None: db.add(m.TtDay(school_id=principal.school_id,index=index,day_of_week=index,name=day.name,short_form=day.short_form,date_value=parsed,is_active=day.is_active))
        else: current.name=day.name; current.short_form=day.short_form; current.date_value=parsed; current.is_active=day.is_active; current.day_of_week=index
    for index,period in incoming_periods.items():
        current=existing_periods.get(index); start=_as_time(period.start_time); end=_as_time(period.end_time)
        if current is None: db.add(m.TtPeriod(school_id=principal.school_id,index=index,name=period.name or f'Period {index+1}',short_form=period.short_form,start_time=start,end_time=end,is_teaching=period.is_teaching))
        else: current.name=period.name or f'Period {index+1}'; current.short_form=period.short_form; current.start_time=start; current.end_time=end; current.is_teaching=period.is_teaching
    db.commit(); return calendar(db,principal)
