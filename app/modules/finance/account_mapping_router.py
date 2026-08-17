"""Administration endpoints for configurable Finance posting mappings."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from .models import ChartOfAccount
from .account_mapping_models import FinanceAccountMapping

router = APIRouter()

@router.get("/finance/account-mappings")
def list_account_mappings(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "admin"))):
    rows = db.query(FinanceAccountMapping).filter_by(school_id=principal.school_id).order_by(FinanceAccountMapping.mapping_key).all()
    return [{"id": r.id, "mapping_key": r.mapping_key, "debit_account_id": r.debit_account_id, "credit_account_id": r.credit_account_id, "is_active": r.is_active} for r in rows]

@router.put("/finance/account-mappings/{mapping_key}")
def upsert_account_mapping(mapping_key: str, payload: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    if not mapping_key or len(mapping_key) > 60:
        raise HTTPException(400, "Invalid mapping key")
    debit_id, credit_id = payload.get("debit_account_id"), payload.get("credit_account_id")
    if debit_id is None or credit_id is None or debit_id == credit_id:
        raise HTTPException(400, "Distinct debit and credit accounts are required")
    accounts = db.query(ChartOfAccount).filter(ChartOfAccount.school_id == principal.school_id, ChartOfAccount.id.in_([debit_id, credit_id]), ChartOfAccount.is_active == 1).all()
    if len(accounts) != 2:
        raise HTTPException(400, "Both accounts must belong to this school and be active")
    row = db.query(FinanceAccountMapping).filter_by(school_id=principal.school_id, mapping_key=mapping_key).first()
    if not row:
        row = FinanceAccountMapping(school_id=principal.school_id, mapping_key=mapping_key)
        db.add(row)
    row.debit_account_id, row.credit_account_id = debit_id, credit_id
    row.is_active = bool(payload.get("is_active", True))
    db.commit(); db.refresh(row)
    return {"id": row.id, "mapping_key": row.mapping_key, "debit_account_id": row.debit_account_id, "credit_account_id": row.credit_account_id, "is_active": row.is_active}
