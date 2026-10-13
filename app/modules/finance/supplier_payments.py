"""Supplier invoices and payments, including cheque lifecycle tracking."""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Session

from app.core.database import Base, get_db
from app.modules.scheduling.tenancy import Principal, require_role
from .router import _audit

router = APIRouter()


class Supplier(Base):
    __tablename__ = "finance_suppliers"
    __table_args__ = (UniqueConstraint("school_id", "name", name="uq_finance_supplier_name"), {"extend_existing": True})
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    name = Column(String(180), nullable=False)
    contact_person = Column(String(150))
    phone = Column(String(50))
    email = Column(String(254))
    address = Column(Text)
    tax_pin = Column(String(50))
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class SupplierInvoice(Base):
    __tablename__ = "finance_supplier_invoices"
    __table_args__ = (UniqueConstraint("school_id", "supplier_id", "invoice_number", name="uq_supplier_invoice_number"), {"extend_existing": True})
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("finance_suppliers.id"), nullable=False, index=True)
    invoice_number = Column(String(100), nullable=False)
    invoice_date = Column(Date, nullable=False)
    due_date = Column(Date)
    description = Column(Text, nullable=False)
    expense_category = Column(String(120), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="KES")
    status = Column(String(20), nullable=False, default="OPEN")
    document_url = Column(Text)
    created_by = Column(String(100))
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class SupplierPayment(Base):
    __tablename__ = "finance_supplier_payments"
    __table_args__ = (UniqueConstraint("school_id", "cheque_number", name="uq_supplier_cheque_number"), {"extend_existing": True})
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("finance_suppliers.id"), nullable=False, index=True)
    invoice_id = Column(Integer, ForeignKey("finance_supplier_invoices.id"), nullable=False, index=True)
    payment_date = Column(Date, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    payment_method = Column(String(20), nullable=False)
    payment_reference = Column(String(120))
    bank_account = Column(String(180))
    cheque_number = Column(String(80))
    cheque_date = Column(Date)
    cheque_payee = Column(String(180))
    status = Column(String(20), nullable=False, default="CLEARED")
    notes = Column(Text)
    created_by = Column(String(100))
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    contact_person: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=254)
    address: str | None = None
    tax_pin: str | None = Field(default=None, max_length=50)


class SupplierInvoiceCreate(BaseModel):
    supplier_id: int
    invoice_number: str = Field(min_length=1, max_length=100)
    invoice_date: date
    due_date: date | None = None
    description: str = Field(min_length=1, max_length=2000)
    expense_category: str = Field(min_length=1, max_length=120)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="KES", min_length=3, max_length=3)
    document_url: str | None = None


class SupplierPaymentCreate(BaseModel):
    supplier_id: int
    invoice_id: int
    payment_date: date
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method: str = Field(pattern="^(cash|bank_transfer|mobile|cheque)$")
    payment_reference: str | None = Field(default=None, max_length=120)
    bank_account: str | None = Field(default=None, max_length=180)
    cheque_number: str | None = Field(default=None, max_length=80)
    cheque_date: date | None = None
    cheque_payee: str | None = Field(default=None, max_length=180)
    notes: str | None = None

    @model_validator(mode="after")
    def validate_cheque_fields(self):
        if self.payment_method == "cheque":
            if not self.cheque_number or not self.cheque_number.strip():
                raise ValueError("Cheque number is required for cheque payments.")
            if not self.cheque_date:
                raise ValueError("Cheque date is required for cheque payments.")
            if not self.bank_account or not self.bank_account.strip():
                raise ValueError("Issuing bank/account is required for cheque payments.")
            if not self.cheque_payee or not self.cheque_payee.strip():
                raise ValueError("Cheque payee is required for cheque payments.")
        return self


class ChequeStatusUpdate(BaseModel):
    status: str = Field(pattern="^(ISSUED|CLEARED|CANCELLED|BOUNCED)$")
    notes: str | None = Field(default=None, max_length=2000)


def _supplier_dict(row):
    return {k: getattr(row, k) for k in ("id", "school_id", "name", "contact_person", "phone", "email", "address", "tax_pin", "status", "created_at")}


def _invoice_dict(db, row):
    paid = db.query(SupplierPayment).filter(
        SupplierPayment.school_id == row.school_id,
        SupplierPayment.invoice_id == row.id,
        SupplierPayment.status.in_([ "ISSUED", "CLEARED" ]),
    ).with_entities(__import__("sqlalchemy").func.coalesce(__import__("sqlalchemy").func.sum(SupplierPayment.amount), 0)).scalar()
    paid_amount = Decimal(str(paid or 0))
    amount = Decimal(str(row.amount))
    balance = max(amount - paid_amount, Decimal("0.00"))
    status = "PAID" if balance == 0 else ("PART_PAID" if paid_amount > 0 else "OPEN")
    return {"id": row.id, "school_id": row.school_id, "supplier_id": row.supplier_id, "invoice_number": row.invoice_number, "invoice_date": row.invoice_date, "due_date": row.due_date, "description": row.description, "expense_category": row.expense_category, "amount": amount, "paid_amount": paid_amount, "balance": balance, "currency": row.currency, "status": status, "document_url": row.document_url, "created_at": row.created_at}


def _payment_dict(row):
    return {k: getattr(row, k) for k in ("id", "school_id", "supplier_id", "invoice_id", "payment_date", "amount", "payment_method", "payment_reference", "bank_account", "cheque_number", "cheque_date", "cheque_payee", "status", "notes", "created_by", "created_at")}


@router.get("/finance/suppliers")
def list_suppliers(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    rows = db.query(Supplier).filter(Supplier.school_id == principal.school_id, Supplier.status == "ACTIVE").order_by(Supplier.name).all()
    return [_supplier_dict(row) for row in rows]


@router.post("/finance/suppliers", status_code=201)
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    name = payload.name.strip()
    if db.query(Supplier).filter(Supplier.school_id == principal.school_id, Supplier.name.ilike(name)).first():
        raise HTTPException(409, "A supplier with this name already exists.")
    row = Supplier(school_id=principal.school_id, name=name, contact_person=payload.contact_person, phone=payload.phone, email=payload.email, address=payload.address, tax_pin=payload.tax_pin)
    db.add(row)
    db.flush()
    _audit(db, principal, "create", "supplier", row.id, f"Created supplier '{name}'")
    db.commit()
    db.refresh(row)
    return _supplier_dict(row)


@router.get("/finance/supplier-invoices")
def list_supplier_invoices(status_filter: str | None = Query(default=None, alias="status"), db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    query = db.query(SupplierInvoice).filter(SupplierInvoice.school_id == principal.school_id)
    if status_filter:
        if status_filter not in {"OPEN", "PART_PAID", "PAID"}:
            raise HTTPException(400, "Unsupported invoice status.")
        rows = query.order_by(SupplierInvoice.invoice_date.desc(), SupplierInvoice.id.desc()).all()
        return [item for row in rows if (item := _invoice_dict(db, row))["status"] == status_filter]
    return [_invoice_dict(db, row) for row in query.order_by(SupplierInvoice.invoice_date.desc(), SupplierInvoice.id.desc()).all()]


@router.post("/finance/supplier-invoices", status_code=201)
def create_supplier_invoice(payload: SupplierInvoiceCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id, Supplier.school_id == principal.school_id, Supplier.status == "ACTIVE").first()
    if not supplier:
        raise HTTPException(404, "Supplier not found.")
    if payload.due_date and payload.due_date < payload.invoice_date:
        raise HTTPException(400, "Due date cannot be before invoice date.")
    row = SupplierInvoice(school_id=principal.school_id, supplier_id=supplier.id, invoice_number=payload.invoice_number.strip(), invoice_date=payload.invoice_date, due_date=payload.due_date, description=payload.description.strip(), expense_category=payload.expense_category.strip(), amount=payload.amount, currency=payload.currency.upper(), document_url=payload.document_url, created_by=principal.user_id)
    db.add(row)
    try:
        db.flush()
    except Exception as exc:
        db.rollback()
        raise HTTPException(409, "This supplier invoice number may already exist.") from exc
    _audit(db, principal, "create", "supplier_invoice", row.id, f"Recorded supplier invoice {row.invoice_number} for {row.amount}")
    db.commit()
    db.refresh(row)
    return _invoice_dict(db, row)


@router.get("/finance/supplier-payments")
def list_supplier_payments(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    rows = db.query(SupplierPayment).filter(SupplierPayment.school_id == principal.school_id).order_by(SupplierPayment.payment_date.desc(), SupplierPayment.id.desc()).limit(500).all()
    return [_payment_dict(row) for row in rows]


@router.post("/finance/supplier-payments", status_code=201)
def create_supplier_payment(payload: SupplierPaymentCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id, Supplier.school_id == principal.school_id).first()
    invoice = db.query(SupplierInvoice).filter(SupplierInvoice.id == payload.invoice_id, SupplierInvoice.school_id == principal.school_id, SupplierInvoice.supplier_id == payload.supplier_id).first()
    if not supplier or not invoice:
        raise HTTPException(404, "Supplier or matching supplier invoice not found.")
    invoice_view = _invoice_dict(db, invoice)
    if payload.amount > invoice_view["balance"]:
        raise HTTPException(400, f"Payment exceeds the outstanding invoice balance of {invoice_view['currency']} {invoice_view['balance']}.")
    if payload.payment_method == "cheque" and db.query(SupplierPayment).filter(SupplierPayment.school_id == principal.school_id, SupplierPayment.cheque_number == payload.cheque_number).first():
        raise HTTPException(409, "This cheque number has already been recorded for this school.")
    status_value = "ISSUED" if payload.payment_method == "cheque" else "CLEARED"
    row = SupplierPayment(school_id=principal.school_id, supplier_id=supplier.id, invoice_id=invoice.id, payment_date=payload.payment_date, amount=payload.amount, payment_method=payload.payment_method, payment_reference=payload.payment_reference, bank_account=payload.bank_account, cheque_number=payload.cheque_number.strip() if payload.cheque_number else None, cheque_date=payload.cheque_date, cheque_payee=payload.cheque_payee.strip() if payload.cheque_payee else None, status=status_value, notes=payload.notes, created_by=principal.user_id)
    db.add(row)
    db.flush()
    _audit(db, principal, "create", "supplier_payment", row.id, f"Recorded {payload.payment_method} payment {row.amount} against supplier invoice #{invoice.id}; status={status_value}")
    db.commit()
    db.refresh(row)
    return _payment_dict(row)


@router.patch("/finance/supplier-payments/{payment_id}/cheque-status")
def update_cheque_status(payment_id: int, payload: ChequeStatusUpdate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    row = db.query(SupplierPayment).filter(SupplierPayment.id == payment_id, SupplierPayment.school_id == principal.school_id).first()
    if not row:
        raise HTTPException(404, "Supplier payment not found.")
    if row.payment_method != "cheque":
        raise HTTPException(400, "Only cheque payments have cheque lifecycle statuses.")
    if row.status in {"CANCELLED", "BOUNCED"} and payload.status != row.status:
        raise HTTPException(409, "Cancelled or bounced cheques cannot be reactivated; record a replacement payment instead.")
    if payload.status == "ISSUED" and row.status == "CLEARED":
        raise HTTPException(409, "A cleared cheque cannot be returned to issued status.")
    old_status = row.status
    row.status = payload.status
    if payload.notes:
        row.notes = (row.notes + "\n" if row.notes else "") + payload.notes
    _audit(db, principal, "update", "supplier_payment", row.id, f"Changed cheque #{row.cheque_number} status from {old_status} to {row.status}")
    db.commit()
    db.refresh(row)
    return _payment_dict(row)
