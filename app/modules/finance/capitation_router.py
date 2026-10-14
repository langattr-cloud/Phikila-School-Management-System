"""School-scoped government capitation API with configurable vote-head templates."""
from datetime import date
from decimal import Decimal, InvalidOperation
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from . import capitation_models as m
from . import operations_models as ops

router = APIRouter()


def _audit(db, principal, action, entity, entity_id, summary):
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(school_id=principal.school_id, actor=principal.email or principal.user_id,
                         action=action, entity=entity, entity_id=entity_id, summary=summary))


def _money(value, field="amount"):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise HTTPException(422, f"{field} must be a valid monetary amount.")
    if not result.is_finite() or result <= 0:
        raise HTTPException(422, f"{field} must be greater than zero.")
    return result.quantize(Decimal("0.01"))


def _date(value, field):
    try:
        return date.fromisoformat(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        raise HTTPException(422, f"{field} must be an ISO date (YYYY-MM-DD).")


def _template(db, principal, template_id):
    item = db.query(m.CapitationTemplate).filter_by(id=template_id, school_id=principal.school_id).first()
    if not item:
        raise HTTPException(404, "Capitation template not found.")
    return item


def _receipt(db, principal, receipt_id):
    item = db.query(m.CapitationReceipt).filter_by(id=receipt_id, school_id=principal.school_id).first()
    if not item:
        raise HTTPException(404, "Capitation receipt not found.")
    return item


@router.get("/finance/capitation/templates")
def list_templates(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return db.query(m.CapitationTemplate).filter_by(school_id=principal.school_id).order_by(m.CapitationTemplate.created_at.desc()).all()


@router.post("/finance/capitation/templates", status_code=201)
def create_template(payload: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    required = ("name", "school_type", "programme", "source_circular", "effective_from")
    for key in required:
        if not str(payload.get(key, "")).strip():
            raise HTTPException(422, f"{key} is required.")
    version = int(payload.get("version", 1))
    if version < 1:
        raise HTTPException(422, "version must be positive.")
    item = m.CapitationTemplate(
        school_id=principal.school_id, name=payload["name"].strip(), school_type=payload["school_type"].strip(),
        programme=payload["programme"].strip(), source_circular=payload["source_circular"].strip(),
        source_url=payload.get("source_url") or None, effective_from=_date(payload["effective_from"], "effective_from"),
        effective_to=_date(payload["effective_to"], "effective_to") if payload.get("effective_to") else None,
        version=version, status="DRAFT", notes=payload.get("notes"), created_by=principal.user_id)
    if item.effective_to and item.effective_to < item.effective_from:
        raise HTTPException(422, "effective_to cannot be earlier than effective_from.")
    db.add(item)
    try:
        db.flush()
        for index, row in enumerate(payload.get("vote_heads") or []):
            code, name = str(row.get("code", "")).strip(), str(row.get("name", "")).strip()
            if not code or not name:
                raise HTTPException(422, "Each vote head needs a code and name.")
            db.add(m.CapitationVoteHead(school_id=principal.school_id, template_id=item.id, code=code,
                name=name, description=row.get("description"), permitted_amount=_money(row["permitted_amount"], "permitted_amount") if row.get("permitted_amount") not in (None, "") else None,
                display_order=int(row.get("display_order", index)), status="ACTIVE"))
        _audit(db, principal, "create", "capitation_template", item.id, f"Created capitation template '{item.name}' version {version}")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "A template with this name and version already exists.") from exc
    except Exception:
        db.rollback()
        raise
    db.refresh(item)
    return item


@router.get("/finance/capitation/templates/{template_id}/vote-heads")
def list_vote_heads(template_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    _template(db, principal, template_id)
    return db.query(m.CapitationVoteHead).filter_by(school_id=principal.school_id, template_id=template_id).order_by(m.CapitationVoteHead.display_order, m.CapitationVoteHead.id).all()


@router.post("/finance/capitation/templates/{template_id}/vote-heads", status_code=201)
def create_vote_head(template_id: int, payload: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    _template(db, principal, template_id)
    if not str(payload.get("code", "")).strip() or not str(payload.get("name", "")).strip():
        raise HTTPException(422, "code and name are required.")
    item = m.CapitationVoteHead(school_id=principal.school_id, template_id=template_id, code=payload["code"].strip(),
        name=payload["name"].strip(), description=payload.get("description"), parent_id=payload.get("parent_id"),
        permitted_amount=_money(payload["permitted_amount"], "permitted_amount") if payload.get("permitted_amount") not in (None, "") else None,
        display_order=int(payload.get("display_order", 0)), status=payload.get("status", "ACTIVE"))
    db.add(item)
    try:
        db.flush(); _audit(db, principal, "create", "capitation_vote_head", item.id, f"Added vote head '{item.name}'"); db.commit()
    except IntegrityError as exc:
        db.rollback(); raise HTTPException(409, "Vote-head code already exists in this template.") from exc
    db.refresh(item)
    return item


@router.patch("/finance/capitation/templates/{template_id}/activate")
def activate_template(template_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    item = _template(db, principal, template_id)
    heads = db.query(m.CapitationVoteHead).filter_by(school_id=principal.school_id, template_id=item.id, status="ACTIVE").count()
    if not heads:
        raise HTTPException(409, "Add at least one active vote head before activating this template.")
    item.status = "ACTIVE"
    _audit(db, principal, "activate", "capitation_template", item.id, f"Activated template '{item.name}' version {item.version}")
    db.commit(); db.refresh(item)
    return item


@router.post("/finance/capitation/receipts", status_code=201)
def create_receipt(payload: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    for key in ("template_id", "funding_period", "received_date", "amount", "reference_number"):
        if payload.get(key) in (None, ""):
            raise HTTPException(422, f"{key} is required.")
    template = _template(db, principal, int(payload["template_id"]))
    if template.status != "ACTIVE":
        raise HTTPException(409, "Activate the applicable circular/template before recording receipts.")
    amount = _money(payload["amount"])
    reference = str(payload["reference_number"]).strip()
    if db.query(m.CapitationReceipt).filter_by(school_id=principal.school_id, reference_number=reference).first():
        raise HTTPException(409, "This government payment reference has already been recorded.")
    bank_id = payload.get("bank_account_id")
    bank_name = None
    if bank_id:
        bank = db.query(ops.FinanceBankAccount).filter_by(id=int(bank_id), school_id=principal.school_id).first()
        if not bank:
            raise HTTPException(404, "Bank account not found for this school.")
        bank_name = bank.account_name
    item = m.CapitationReceipt(school_id=principal.school_id, template_id=template.id,
        academic_year_id=payload.get("academic_year_id"), term_id=payload.get("term_id"),
        funding_period=str(payload["funding_period"]).strip(), agency=str(payload.get("agency") or "Ministry of Education").strip(),
        received_date=_date(payload["received_date"], "received_date"), amount=amount, bank_account_id=bank_id,
        bank_account_name=bank_name or payload.get("bank_account_name"), reference_number=reference,
        allocation_notice=payload.get("allocation_notice"), supporting_document_url=payload.get("supporting_document_url"),
        notes=payload.get("notes"), created_by=principal.user_id)
    allocations = payload.get("allocations") or []
    if allocations:
        seen = set()
        total = Decimal("0")
        heads = {}
        for row in allocations:
            head_id = int(row["vote_head_id"])
            if head_id in seen:
                raise HTTPException(422, "A vote head may only be allocated once per receipt.")
            seen.add(head_id)
            head = db.query(m.CapitationVoteHead).filter_by(id=head_id, school_id=principal.school_id, template_id=template.id, status="ACTIVE").first()
            if not head:
                raise HTTPException(422, "Every allocation must reference an active vote head in the selected template.")
            value = _money(row.get("allocated_amount"), "allocated_amount")
            if head.permitted_amount is not None and value > Decimal(str(head.permitted_amount)):
                raise HTTPException(409, f"Allocation exceeds the permitted amount for '{head.name}'.")
            heads[head_id] = value
            total += value
        if total != amount:
            raise HTTPException(409, "Vote-head allocations must total the receipt amount.")
    db.add(item)
    try:
        db.flush()
        for head_id, value in (heads.items() if allocations else []):
            db.add(m.CapitationAllocation(school_id=principal.school_id, receipt_id=item.id, vote_head_id=head_id, allocated_amount=value))
        _audit(db, principal, "create", "capitation_receipt", item.id, f"Recorded capitation receipt {reference}: KES {amount}")
        db.commit()
    except IntegrityError as exc:
        db.rollback(); raise HTTPException(409, "Receipt conflicts with an existing reference.") from exc
    db.refresh(item)
    return item


@router.get("/finance/capitation/receipts")
def list_receipts(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return db.query(m.CapitationReceipt).filter_by(school_id=principal.school_id).order_by(m.CapitationReceipt.received_date.desc(), m.CapitationReceipt.id.desc()).limit(500).all()


@router.get("/finance/capitation/receipts/{receipt_id}/allocations")
def receipt_allocations(receipt_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    _receipt(db, principal, receipt_id)
    rows = db.query(m.CapitationAllocation, m.CapitationVoteHead).join(m.CapitationVoteHead, m.CapitationAllocation.vote_head_id == m.CapitationVoteHead.id).filter(
        m.CapitationAllocation.school_id == principal.school_id, m.CapitationAllocation.receipt_id == receipt_id).all()
    return [{"id": a.id, "vote_head_id": h.id, "code": h.code, "name": h.name, "allocated_amount": a.allocated_amount} for a, h in rows]


@router.post("/finance/capitation/expenditure", status_code=201)
def create_expenditure(payload: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    for key in ("receipt_id", "vote_head_id", "expenditure_date", "payee", "description", "amount", "expenditure_reference"):
        if payload.get(key) in (None, ""):
            raise HTTPException(422, f"{key} is required.")
    receipt = _receipt(db, principal, int(payload["receipt_id"]))
    head = db.query(m.CapitationVoteHead).filter_by(id=int(payload["vote_head_id"]), school_id=principal.school_id, template_id=receipt.template_id, status="ACTIVE").first()
    if not head:
        raise HTTPException(422, "Vote head must be active and belong to the receipt's funding template.")
    amount = _money(payload["amount"])
    allocated = db.query(func.coalesce(func.sum(m.CapitationAllocation.allocated_amount), 0)).filter_by(
        school_id=principal.school_id, receipt_id=receipt.id, vote_head_id=head.id).scalar()
    spent = db.query(func.coalesce(func.sum(m.CapitationExpenditure.amount), 0)).filter_by(
        school_id=principal.school_id, receipt_id=receipt.id, vote_head_id=head.id, status="POSTED").scalar()
    # A receipt with no explicit split is tracked at receipt level until an approved split is supplied.
    if allocated == 0 and db.query(m.CapitationAllocation.id).filter_by(school_id=principal.school_id, receipt_id=receipt.id).first():
        raise HTTPException(409, "No funds are allocated to this vote head for this receipt.")
    if allocated and Decimal(str(spent)) + amount > Decimal(str(allocated)):
        raise HTTPException(409, "This expenditure would exceed the remaining allocation for the vote head.")
    if not allocated:
        total_spent = db.query(func.coalesce(func.sum(m.CapitationExpenditure.amount), 0)).filter_by(
            school_id=principal.school_id, receipt_id=receipt.id, status="POSTED").scalar()
        if Decimal(str(total_spent)) + amount > Decimal(str(receipt.amount)):
            raise HTTPException(409, "This expenditure would exceed the unallocated receipt balance.")
    item = m.CapitationExpenditure(school_id=principal.school_id, receipt_id=receipt.id, vote_head_id=head.id,
        expenditure_date=_date(payload["expenditure_date"], "expenditure_date"), payee=str(payload["payee"]).strip(),
        description=str(payload["description"]).strip(), amount=amount, expenditure_reference=str(payload["expenditure_reference"]).strip(),
        supplier_invoice_reference=payload.get("supplier_invoice_reference"), supporting_document_url=payload.get("supporting_document_url"),
        recorded_by=principal.user_id)
    db.add(item)
    try:
        db.flush(); _audit(db, principal, "create", "capitation_expenditure", item.id, f"Recorded {amount} capitation expenditure against '{head.name}'"); db.commit()
    except IntegrityError as exc:
        db.rollback(); raise HTTPException(409, "This expenditure reference already exists.") from exc
    db.refresh(item)
    return item


@router.get("/finance/capitation/expenditure")
def list_expenditure(receipt_id: int | None = None, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    q = db.query(m.CapitationExpenditure).filter_by(school_id=principal.school_id)
    if receipt_id:
        _receipt(db, principal, receipt_id)
        q = q.filter_by(receipt_id=receipt_id)
    return q.order_by(m.CapitationExpenditure.expenditure_date.desc(), m.CapitationExpenditure.id.desc()).limit(1000).all()


@router.get("/finance/capitation/summary")
def capitation_summary(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    receipts = db.query(m.CapitationReceipt).filter_by(school_id=principal.school_id, status="POSTED").all()
    result = []
    for receipt in receipts:
        spent = db.query(func.coalesce(func.sum(m.CapitationExpenditure.amount), 0)).filter_by(
            school_id=principal.school_id, receipt_id=receipt.id, status="POSTED").scalar()
        allocated = db.query(func.coalesce(func.sum(m.CapitationAllocation.allocated_amount), 0)).filter_by(
            school_id=principal.school_id, receipt_id=receipt.id).scalar()
        result.append({"receipt_id": receipt.id, "reference_number": receipt.reference_number,
            "funding_period": receipt.funding_period, "received_date": receipt.received_date,
            "amount": receipt.amount, "allocated": allocated, "spent": spent,
            "balance": Decimal(str(receipt.amount)) - Decimal(str(spent))})
    return result
