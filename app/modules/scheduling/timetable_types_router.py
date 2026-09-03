from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models as m
from . import schemas as s
from .tenancy import Principal, require_role, resolve_principal
router = APIRouter()
def _configured_days(db: Session, school_id: int) -> set[int]: return {int(d.index) for d in db.query(m.TtDay).filter(m.TtDay.school_id == school_id).all()}
def _configured_periods(db: Session, school_id: int) -> set[int]: return {int(p.index) for p in db.query(m.TtPeriod).filter(m.TtPeriod.school_id == school_id, m.TtPeriod.is_teaching.is_(True)).all()}
def _activate_only(db: Session, school_id: int, selected_id: int) -> None:
    db.query(m.TtTimetableType).filter(m.TtTimetableType.school_id == school_id, m.TtTimetableType.id != selected_id, m.TtTimetableType.is_active.is_(True)).update({'is_active': False}, synchronize_session=False)
def _values(payload: dict, db: Session, school_id: int):
    name = str(payload.get('name') or '').strip(); code = str(payload.get('code') or '').strip().upper().replace(' ', '_')
    if not name or not code: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Timetable type name and code are required.')
    days = sorted(set(int(i) for i in (payload.get('day_indexes') or []))); configured_days = _configured_days(db, school_id)
    if not days or not set(days).issubset(configured_days): raise HTTPException(status.HTTP_400_BAD_REQUEST, 'One or more selected days are not configured for this school.')
    configured_periods = _configured_periods(db, school_id)
    raw_periods = payload.get('period_indexes')
    periods = sorted(set(int(i) for i in (raw_periods if raw_periods is not None else configured_periods)))
    if not periods or not set(periods).issubset(configured_periods): raise HTTPException(status.HTTP_400_BAD_REQUEST, 'One or more selected teaching periods are not configured for this school.')
    display_mode = payload.get('display_mode') or 'day'
    if display_mode not in {'day', 'date'}: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Invalid timetable display mode.')
    return name, code, display_mode, days, periods
@router.get('/timetable-types', response_model=list[s.TimetableTypeOut])
def list_timetable_types(db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    return db.query(m.TtTimetableType).filter(m.TtTimetableType.school_id == principal.school_id, m.TtTimetableType.is_active.is_(True)).order_by(m.TtTimetableType.id.desc()).all()
@router.post('/timetable-types', response_model=s.TimetableTypeOut, status_code=201)
def create_timetable_type(payload: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin','scheduler'))):
    name, code, display_mode, days, periods = _values(payload, db, principal.school_id)
    if db.query(m.TtTimetableType).filter(m.TtTimetableType.school_id == principal.school_id, m.TtTimetableType.code == code).first(): raise HTTPException(status.HTTP_409_CONFLICT, 'A timetable type with that code already exists.')
    row = m.TtTimetableType(school_id=principal.school_id, name=name, code=code, display_mode=display_mode, day_indexes=days, period_indexes=periods, is_active=True, is_system=False); db.add(row); db.flush(); _activate_only(db, principal.school_id, row.id); db.commit(); db.refresh(row); return row
@router.put('/timetable-types/{ident}', response_model=s.TimetableTypeOut)
def update_timetable_type(ident: int, payload: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin','scheduler'))):
    row = db.query(m.TtTimetableType).filter(m.TtTimetableType.id == ident, m.TtTimetableType.school_id == principal.school_id).first()
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND, 'Timetable type not found.')
    name, code, display_mode, days, periods = _values(payload, db, principal.school_id)
    duplicate = db.query(m.TtTimetableType).filter(m.TtTimetableType.school_id == principal.school_id, m.TtTimetableType.code == code, m.TtTimetableType.id != ident).first()
    if duplicate: raise HTTPException(status.HTTP_409_CONFLICT, 'A timetable type with that code already exists.')
    row.name=name; row.code=code; row.display_mode=display_mode; row.day_indexes=days; row.period_indexes=periods; row.is_active=True; _activate_only(db, principal.school_id, row.id); db.commit(); db.refresh(row); return row
@router.delete('/timetable-types/{ident}', status_code=204)
def delete_timetable_type(ident: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin','scheduler'))):
    row = db.query(m.TtTimetableType).filter(m.TtTimetableType.id == ident, m.TtTimetableType.school_id == principal.school_id).first()
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND, 'Timetable type not found.')
    row.is_active=False; row.is_system=False; db.commit()
