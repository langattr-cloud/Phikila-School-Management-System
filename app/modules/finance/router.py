"""Finance management API — school-scoped, auditable, Decimal-safe."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from app.modules.students.models_v2 import Student

from . import models as m
from . import schemas as s

router = APIRouter()


def _audit(db, principal, action, entity, eid, summary):
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(
        school_id=principal.school_id, actor=principal.email or principal.user_id,
        action=action, entity=entity, entity_id=eid, summary=summary,
    ))


# ---- Fee Structures ----

@router.get("/finance/fee-structures", response_model=list[s.FeeStructureResponse])
def list_fee_structures(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return db.query(m.FeeStructure).filter(m.FeeStructure.school_id == principal.school_id).order_by(m.FeeStructure.name).all()


@router.post("/finance/fee-structures", response_model=s.FeeStructureResponse, status_code=201)
def create_fee_structure(payload: s.FeeStructureCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    fs = m.FeeStructure(school_id=principal.school_id, **payload.model_dump())
    db.add(fs)
    _audit(db, principal, "create", "fee_structure", 0, f"Created fee structure '{payload.name}' — {payload.amount}")
    db.commit()
    db.refresh(fs)
    return fs


# ---- Invoices ----

@router.get("/finance/invoices", response_model=list[s.InvoiceResponse])
def list_invoices(
    student_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("viewer", "teacher", "admin")),
):
    q = db.query(m.StudentInvoice).filter(m.StudentInvoice.school_id == principal.school_id)
    if student_id:
        q = q.filter(m.StudentInvoice.student_id == student_id)
    if status_filter:
        q = q.filter(m.StudentInvoice.status == status_filter)
    return q.order_by(m.StudentInvoice.created_at.desc()).limit(200).all()


@router.post("/finance/invoices", response_model=s.InvoiceResponse, status_code=201)
def create_invoice(payload: s.InvoiceCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    inv = m.StudentInvoice(
        school_id=principal.school_id,
        balance=payload.amount,
        **payload.model_dump(),
    )
    db.add(inv)
    _audit(db, principal, "create", "invoice", 0, f"Invoiced student #{payload.student_id} — {payload.amount}")
    db.commit()
    db.refresh(inv)
    return inv


# ---- Payments ----

@router.get("/finance/payments", response_model=list[s.PaymentResponse])
def list_payments(
    student_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("viewer", "teacher", "admin")),
):
    q = db.query(m.Payment).filter(m.Payment.school_id == principal.school_id)
    if student_id:
        q = q.filter(m.Payment.student_id == student_id)
    return q.order_by(m.Payment.created_at.desc()).limit(200).all()


@router.post("/finance/payments", response_model=s.PaymentResponse, status_code=201)
def record_payment(payload: s.PaymentCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    invoice = db.query(m.StudentInvoice).filter(
        m.StudentInvoice.id == payload.invoice_id,
        m.StudentInvoice.school_id == principal.school_id,
    ).first()
    if not invoice:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")

    if payload.amount > invoice.balance:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment amount {payload.amount} exceeds balance {invoice.balance}.")

    payment = m.Payment(
        school_id=principal.school_id,
        received_by=principal.user_id,
        **payload.model_dump(),
    )
    db.add(payment)

    invoice.balance = Decimal(str(invoice.balance)) - Decimal(str(payload.amount))
    if invoice.balance <= 0:
        invoice.balance = Decimal("0")
        invoice.status = "paid"
    else:
        invoice.status = "partial"

    _audit(db, principal, "create", "payment", 0,
           f"Recorded payment of {payload.amount} for invoice #{payload.invoice_id}")
    db.commit()
    db.refresh(payment)
    return payment


# ---- Balances & Overview ----

@router.get("/finance/students/{student_id}/balance", response_model=s.StudentBalance)
def student_balance(student_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    student = db.query(Student).filter(Student.id == student_id, Student.school_id == principal.school_id).first()
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    total_invoiced = db.query(func.coalesce(func.sum(m.StudentInvoice.amount), 0)).filter(
        m.StudentInvoice.student_id == student_id, m.StudentInvoice.school_id == principal.school_id,
    ).scalar()
    total_paid = db.query(func.coalesce(func.sum(m.Payment.amount), 0)).filter(
        m.Payment.student_id == student_id, m.Payment.school_id == principal.school_id,
    ).scalar()
    balance = Decimal(str(total_invoiced)) - Decimal(str(total_paid))

    return s.StudentBalance(
        student_id=student_id,
        student_name=f"{student.first_name} {student.last_name}",
        total_invoiced=Decimal(str(total_invoiced)),
        total_paid=Decimal(str(total_paid)),
        balance=max(balance, Decimal("0")),
    )


@router.get("/finance/overview", response_model=s.FinanceOverview)
def finance_overview(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    total_invoiced = db.query(func.coalesce(func.sum(m.StudentInvoice.amount), 0)).filter(m.StudentInvoice.school_id == principal.school_id).scalar()
    total_paid = db.query(func.coalesce(func.sum(m.Payment.amount), 0)).filter(m.Payment.school_id == principal.school_id).scalar()
    total_outstanding = Decimal(str(total_invoiced)) - Decimal(str(total_paid))

    invoices_count = db.query(func.count(m.StudentInvoice.id)).filter(m.StudentInvoice.school_id == principal.school_id).scalar() or 0
    paid_count = db.query(func.count(m.StudentInvoice.id)).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.status == "paid").scalar() or 0
    pending_count = db.query(func.count(m.StudentInvoice.id)).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.status.in_(["pending", "partial", "overdue"])).scalar() or 0

    return s.FinanceOverview(
        total_invoiced=Decimal(str(total_invoiced)),
        total_collected=Decimal(str(total_paid)),
        total_outstanding=max(total_outstanding, Decimal("0")),
        invoices_count=invoices_count,
        paid_count=paid_count,
        pending_count=pending_count,
    )
