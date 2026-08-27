"""Scheduling API."""
from __future__ import annotations
from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.email.service import email_service
from . import copilot as ai
from . import jobs as job_queue
from . import models as m
from . import schemas as s
from .engine import DEFAULT_DAYS, _blockers, _name_lookup, assign_rooms_to_lessons, detect_conflicts, explain_move, load_calendar, suggest_slots
from .solver import ORTOOLS_AVAILABLE
from .tenancy import Principal, require_role, resolve_principal
router=APIRouter()
def _owned(db:Session,model,school_id:int,ident:int):
    row=db.query(model).filter(model.id==ident,model.school_id==school_id).first()
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND,"Not found")
    return row
def _audit(db:Session,principal:Principal,action:str,entity:str,entity_id:int|None,summary:str,before:dict|None=None,after:dict|None=None)->None:
    db.add(m.TtAuditEntry(school_id=principal.school_id,actor=principal.email or principal.user_id,action=action,entity=entity,entity_id=entity_id,summary=summary,before=before,after=after))
def _crud(path:str,model,schema_in,schema_out,entity:str,update_schema=None)->None:
    update_schema=update_schema or schema_in
    def _list(db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
        return db.query(model).filter(model.school_id==principal.school_id).order_by(model.id).all()
    def _create(payload,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
        row=model(school_id=principal.school_id,**payload.model_dump());db.add(row)
        try: db.commit()
        except Exception:
            db.rollback();raise HTTPException(status.HTTP_409_CONFLICT,f"A {entity} with that code already exists.")
        db.refresh(row);_audit(db,principal,"create",entity,row.id,f"Created {entity} {getattr(row,'name',row.id)}");db.commit();return row
    def _update(ident:int,payload,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
        row=_owned(db,model,principal.school_id,ident)
        for key,value in payload.model_dump(exclude_unset=True).items(): setattr(row,key,value)
        try: db.commit()
        except Exception:
            db.rollback();raise HTTPException(status.HTTP_409_CONFLICT,f"A {entity} with that code already exists.")
        db.refresh(row);_audit(db,principal,"update",entity,row.id,f"Updated {entity} {getattr(row,'name',row.id)}");db.commit();return row
    def _delete(ident:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role("admin","scheduler"))):
        row=_owned(db,model,principal.school_id,ident);name=getattr(row,"name",row.id);db.delete(row);_audit(db,principal,"delete",entity,ident,f"Deleted {entity} {name}");db.commit()
    _create.__annotations__["payload"]=schema_in;_update.__annotations__["payload"]=update_schema
    for fn,suffix in ((_list,"list"),(_create,"create"),(_update,"update"),(_delete,"delete")): fn.__name__=f"{suffix}_{entity}"
    router.get(f"/{path}",response_model=list[schema_out],name=f"list_{entity}")(_list)
    router.post(f"/{path}",response_model=schema_out,status_code=201,name=f"create_{entity}")(_create)
    router.put(f"/{path}/{{ident}}",response_model=schema_out,name=f"update_{entity}")(_update)
    router.delete(f"/{path}/{{ident}}",status_code=204,name=f"delete_{entity}")(_delete)
_crud("teachers",m.TtTeacher,s.TeacherIn,s.TeacherOut,"teacher")
_crud("subjects",m.TtSubject,s.SubjectIn,s.SubjectOut,"subject")
_crud("rooms",m.TtRoom,s.RoomIn,s.RoomOut,"room")
_crud("classes",m.TtClass,s.ClassIn,s.ClassOut,"class",update_schema=s.ClassUpdateIn)
@router.get("/classes/academic-streams",response_model=list[s.ClassOut],name="list_classes_with_academic_stream")
def list_classes_with_academic_stream(db:Session=Depends(get_db),principal:Principal=Depends(resolve_principal)):
    from app.modules.academics.models import Stream
    rows=db.query(m.TtClass).filter(m.TtClass.school_id==principal.school_id).order_by(m.TtClass.id).all();streams={int(r.id):r for r in db.query(Stream).filter(Stream.school_id==principal.school_id).all()};out=[]
    for row in rows:
        item=s.ClassOut.model_validate(row);stream=None
        if row.code and row.code.upper().startswith("STREAM-"):
            try: stream=streams.get(int(row.code.split("-",1)[1]))
            except ValueError: pass
        if stream:
            grade=stream.grade.code or stream.grade.name if stream.grade else "";grade_num=''.join(ch for ch in str(grade) if ch.isdigit());stream_code=(stream.code or "").strip();stream_name=(stream.name or "").strip();token=stream_code or (stream_name[:1] if stream_name else "");item.academic_stream=f"{grade_num}{token.upper()}" if grade_num and token else (stream_name or None)
        out.append(item)
    return out
_crud("constraints",m.TtConstraint,s.ConstraintIn,s.ConstraintOut,"constraint")
@router.get("/me")
def whoami(principal:Principal=Depends(resolve_principal)): return {"user_id":principal.user_id,"email":principal.email,"school_id":principal.school_id,"role":principal.role,"teacher_id":principal.teacher_id,"class_id":principal.class_id,"solver_available":ORTOOLS_AVAILABLE}
