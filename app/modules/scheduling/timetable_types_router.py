from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models as m
from . import schemas as s
from .tenancy import Principal, require_role, resolve_principal

router = APIRouter()

@router.get('/timetable-types', response_model=list[s.TimetableTypeOut])
def list_timetable_types(db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    return db.query(m.TtTimetableType).filter(m.TtTimetableType.school_id == principal.school_id, m.TtTimetableType.is_active.is_(True)).order_by(m.TtTimetableType.is_system.desc(), m.TtTimetableType.name).all()

@router.post('/timetable-types', response_model=s.TimetableTypeOut, status_code=201)
def create_timetable_type(payload: s.TimetableTypeIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin','scheduler'))):
    code = payload.code.strip().upper().replace(' ', '_')
    if db.query(m.TtTimetableType).filter(m.TtTimetableType.school_id == principal.school_id, m.TtTimetableType.code == code).first():
        raise HTTPException(status.HTTP_409_CONFLICT, 'A timetable type with that code already exists.')
    configured = {d.index for d in db.query(m.TtDay).filter(m.TtDay.school_id == principal.school_id).all()}
    if not set(payload.day_indexes).issubset(configured):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, 'One or more selected days are not configured for this school.')
    row = m.TtTimetableType(school_id=principal.school_id, name=payload.name.strip(), code=code, day_indexes=sorted(set(payload.day_indexes)), is_active=payload.is_active, is_system=payload.is_system)
    db.add(row); db.commit(); db.refresh(row); return row

@router.put('/timetable-types/{ident}', response_model=s.TimetableTypeOut)
def update_timetable_type(ident: int, payload: s.TimetableTypeIn, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin','scheduler'))):
    row = db.query(m.TtTimetableType).filter(m.TtTimetableType.id == ident, m.TtTimetableType.school_id == principal.school_id).first()
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND, 'Timetable type not found.')
    if row.is_system and payload.code.strip().upper().replace(' ','_') != row.code: raise HTTPException(status.HTTP_400_BAD_REQUEST, 'System timetable types cannot be renamed.')
    row.name = payload.name.strip(); row.code = payload.code.strip().upper().replace(' ','_'); row.day_indexes = sorted(set(payload.day_indexes)); row.is_active = payload.is_active
    db.commit(); db.refresh(row); return row

@router.delete('/timetable-types/{ident}', status_code=204)
def delete_timetable_type(ident: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin','scheduler'))):
    row = db.query(m.TtTimetableType).filter(m.TtTimetableType.id == ident, m.TtTimetableType.school_id == principal.school_id).first()
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND, 'Timetable type not found.')
    if row.is_system: raise HTTPException(status.HTTP_400_BAD_REQUEST, 'System timetable types cannot be deleted.')
    row.is_active = False; db.commit()
