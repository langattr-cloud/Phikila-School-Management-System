"""Finance management API — school-scoped, auditable, Decimal-safe."""

from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from app.modules.students.models_v2 import Student
from . import models as m
from . import schemas as s
from .payment_decoder import decode_payment_message

router = APIRouter()

def _audit(db, principal, action, entity, eid, summary):
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(school_id=principal.school_id, actor=principal.email or principal.user_id, action=action, entity=entity, entity_id=eid, summary=summary))

@router.get("/finance/fee-structures", response_model=list[s.FeeStructureResponse])
def list_fee_structures(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return db.query(m.FeeStructure).filter(m.FeeStructure.school_id == principal.school_id).order_by(m.FeeStructure.name).all()

@router.post("/finance/fee-structures", response_model=s.FeeStructureResponse, status_code=201)
def create_fee_structure(payload: s.FeeStructureCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    fs = m.FeeStructure(school_id=principal.school_id, **payload.model_dump())
    db.add(fs); _audit(db, principal, "create", "fee_structure", 0, f"Created fee structure '{payload.name}' — {payload.amount}")
    db.commit(); db.refresh(fs); return fs

@router.get("/finance/invoices", response_model=list[s.InvoiceResponse])
def list_invoices(student_id: int | None = Query(default=None), status_filter: str | None = Query(default=None, alias="status"), db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    q = db.query(m.StudentInvoice).filter(m.StudentInvoice.school_id == principal.school_id)
    if student_id: q = q.filter(m.StudentInvoice.student_id == student_id)
    if status_filter: q = q.filter(m.StudentInvoice.status == status_filter)
    return q.order_by(m.StudentInvoice.created_at.desc()).limit(200).all()

@router.post("/finance/invoices", response_model=s.InvoiceResponse, status_code=201)
def create_invoice(payload: s.InvoiceCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    student = db.query(Student).filter(Student.id == payload.student_id, Student.school_id == principal.school_id).first()
    if not student: raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    fee = db.query(m.FeeStructure).filter(m.FeeStructure.id == payload.fee_structure_id, m.FeeStructure.school_id == principal.school_id).first()
    if not fee: raise HTTPException(status.HTTP_404_NOT_FOUND, "Fee structure not found.")
    duplicate = db.query(m.StudentInvoice).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.student_id == payload.student_id, m.StudentInvoice.fee_structure_id == payload.fee_structure_id).first()
    if duplicate: raise HTTPException(status.HTTP_409_CONFLICT, "This student has already been billed for this fee structure.")
    inv = m.StudentInvoice(school_id=principal.school_id, balance=payload.amount, **payload.model_dump())
    db.add(inv); _audit(db, principal, "create", "invoice", 0, f"Invoiced student #{payload.student_id} — {payload.amount}")
    db.commit(); db.refresh(inv); return inv

@router.get("/finance/payments", response_model=list[s.PaymentResponse])
def list_payments(student_id: int | None = Query(default=None), db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    q = db.query(m.Payment).filter(m.Payment.school_id == principal.school_id)
    if student_id: q = q.filter(m.Payment.student_id == student_id)
    return q.order_by(m.Payment.created_at.desc()).limit(200).all()

@router.post("/finance/payments", response_model=s.PaymentResponse, status_code=201)
def record_payment(payload: s.PaymentCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    invoice = db.query(m.StudentInvoice).filter(m.StudentInvoice.id == payload.invoice_id, m.StudentInvoice.school_id == principal.school_id).first()
    if not invoice: raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")
    if invoice.student_id != payload.student_id: raise HTTPException(status.HTTP_400_BAD_REQUEST, "Student does not match invoice.")
    if payload.amount > invoice.balance: raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment amount {payload.amount} exceeds balance {invoice.balance}.")
    if payload.reference_number and db.query(m.Payment).filter(m.Payment.school_id == principal.school_id, m.Payment.reference_number == payload.reference_number).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Payment reference has already been processed.")
    payment = m.Payment(school_id=principal.school_id, received_by=principal.user_id, **payload.model_dump())
    db.add(payment); invoice.balance = max(Decimal(str(invoice.balance)) - Decimal(str(payload.amount)), Decimal("0")); invoice.status = "paid" if invoice.balance == 0 else "partial"
    _audit(db, principal, "create", "payment", 0, f"Recorded payment of {payload.amount} for invoice #{payload.invoice_id}")
    db.commit(); db.refresh(payment); return payment

@router.post("/finance/payments/decode", response_model=s.PaymentDecodeResponse)
def decode_payment(payload: s.PaymentDecodeRequest, principal: Principal = Depends(require_role("viewer", "admin"))):
    return decode_payment_message(payload.message)

@router.get("/finance/payment-inbox", response_model=list[s.PaymentInboxResponse])
def list_payment_inbox(status_filter: str | None = Query(default=None, alias="status"), db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "admin"))):
    q = db.query(m.PaymentInbox).filter(m.PaymentInbox.school_id == principal.school_id)
    if status_filter: q = q.filter(m.PaymentInbox.status == status_filter)
    return q.order_by(m.PaymentInbox.received_at.desc()).limit(200).all()

@router.post("/finance/payment-inbox", response_model=s.PaymentInboxResponse, status_code=201)
def ingest_payment(payload: s.PaymentInboxCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    decoded = decode_payment_message(payload.raw_message)
    amount = payload.amount or decoded["amount"]; external_reference = payload.external_reference or decoded["external_reference"]
    student_identifier = payload.student_identifier or decoded["student_identifier"]; received_at = payload.received_at or decoded["received_at"] or datetime.now(timezone.utc)
    if not amount or not external_reference: raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment amount and external reference could not be determined.")
    duplicate = db.query(m.PaymentInbox).filter(m.PaymentInbox.school_id == principal.school_id, m.PaymentInbox.source == payload.source, m.PaymentInbox.external_reference == external_reference).first()
    if duplicate: raise HTTPException(status.HTTP_409_CONFLICT, f"Duplicate payment reference; already received as inbox item #{duplicate.id}.")
    matched_student = None; match_method = None; confidence = None; inbox_status = "UNMATCHED"
    if student_identifier:
        matched_student = db.query(Student).filter(Student.school_id == principal.school_id, Student.admission_number == student_identifier).first()
        if matched_student: match_method, confidence, inbox_status = "admission_number", Decimal("100.00"), "MATCHED"
    item = m.PaymentInbox(school_id=principal.school_id, source=payload.source, source_account=payload.source_account, account_name=payload.account_name or decoded["account_name"], raw_message=payload.raw_message, amount=amount, external_reference=external_reference, student_identifier=student_identifier, received_at=received_at, payment_channel=payload.payment_channel or decoded["payment_channel"], matched_student_id=matched_student.id if matched_student else None, match_method=match_method, match_confidence=confidence, status=inbox_status)
    db.add(item); _audit(db, principal, "create", "payment_inbox", 0, f"Ingested external payment {external_reference} — {amount}; status={inbox_status}")
    db.commit(); db.refresh(item); return item

@router.post("/finance/payment-inbox/{inbox_id}/post", response_model=s.PaymentInboxResponse)
def post_payment_inbox(inbox_id: int, payload: s.PaymentInboxPostRequest | None = None, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    payload = payload or s.PaymentInboxPostRequest()
    item = db.query(m.PaymentInbox).filter(m.PaymentInbox.id == inbox_id, m.PaymentInbox.school_id == principal.school_id).first()
    if not item: raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment inbox item not found.")
    if item.status == "POSTED": return item
    if item.status in {"DUPLICATE", "REJECTED", "REVERSED"}: raise HTTPException(status.HTTP_409_CONFLICT, f"Payment is already {item.status.lower()} and cannot be posted.")
    if item.status != "MATCHED" or not item.matched_student_id: raise HTTPException(status.HTTP_409_CONFLICT, "Only a uniquely matched payment can be posted.")
    if item.posted_payment_id: raise HTTPException(status.HTTP_409_CONFLICT, "Payment has already been posted.")
    if db.query(m.Payment).filter(m.Payment.school_id == principal.school_id, m.Payment.reference_number == item.external_reference).first():
        item.status = "DUPLICATE"; item.reviewed_by = principal.user_id; item.reviewed_at = datetime.now(timezone.utc)
        _audit(db, principal, "duplicate", "payment_inbox", item.id, f"Duplicate payment reference {item.external_reference}")
        db.commit(); db.refresh(item); return item
    if payload.invoice_id:
        invoice = db.query(m.StudentInvoice).filter(m.StudentInvoice.id == payload.invoice_id, m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.student_id == item.matched_student_id).first()
        if not invoice: raise HTTPException(status.HTTP_404_NOT_FOUND, "Selected invoice not found for matched student.")
    else:
        open_invoices = db.query(m.StudentInvoice).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.student_id == item.matched_student_id, m.StudentInvoice.balance > 0).order_by(m.StudentInvoice.created_at.asc()).all()
        if len(open_invoices) != 1: raise HTTPException(status.HTTP_409_CONFLICT, "The matched student has multiple open invoices; select an invoice explicitly before posting.")
        invoice = open_invoices[0]
    if item.amount > invoice.balance: raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment exceeds the selected invoice balance.")
    payment = m.Payment(school_id=principal.school_id, invoice_id=invoice.id, student_id=item.matched_student_id, amount=item.amount, payment_method=item.payment_channel or item.source, reference_number=item.external_reference, notes=payload.reason or f"Posted from payment inbox #{item.id}", received_by=principal.user_id)
    db.add(payment); db.flush(); invoice.balance = max(Decimal(str(invoice.balance)) - Decimal(str(item.amount)), Decimal("0")); invoice.status = "paid" if invoice.balance == 0 else "partial"
    now = datetime.now(timezone.utc); item.status, item.posted_payment_id, item.posted_at = "POSTED", payment.id, now; item.reviewed_by, item.reviewed_at = principal.user_id, now
    _audit(db, principal, "post", "payment_inbox", item.id, f"Posted {item.external_reference} as payment #{payment.id} against invoice #{invoice.id}")
    db.commit(); db.refresh(item); return item

@router.get("/finance/students/{student_id}/balance", response_model=s.StudentBalance)
def student_balance(student_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    student = db.query(Student).filter(Student.id == student_id, Student.school_id == principal.school_id).first()
    if not student: raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    total_invoiced = db.query(func.coalesce(func.sum(m.StudentInvoice.amount), 0)).filter(m.StudentInvoice.student_id == student_id, m.StudentInvoice.school_id == principal.school_id).scalar()
    total_paid = db.query(func.coalesce(func.sum(m.Payment.amount), 0)).filter(m.Payment.student_id == student_id, m.Payment.school_id == principal.school_id).scalar()
    return s.StudentBalance(student_id=student_id, student_name=f"{student.first_name} {student.last_name}", total_invoiced=Decimal(str(total_invoiced)), total_paid=Decimal(str(total_paid)), balance=max(Decimal(str(total_invoiced)) - Decimal(str(total_paid)), Decimal("0")))

@router.get("/finance/overview", response_model=s.FinanceOverview)
def finance_overview(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    total_invoiced = db.query(func.coalesce(func.sum(m.StudentInvoice.amount), 0)).filter(m.StudentInvoice.school_id == principal.school_id).scalar()
    total_paid = db.query(func.coalesce(func.sum(m.Payment.amount), 0)).filter(m.Payment.school_id == principal.school_id).scalar()
    total_outstanding = max(Decimal(str(total_invoiced)) - Decimal(str(total_paid)), Decimal("0"))
    invoices_count = db.query(func.count(m.StudentInvoice.id)).filter(m.StudentInvoice.school_id == principal.school_id).scalar() or 0
    paid_count = db.query(func.count(m.StudentInvoice.id)).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.status == "paid").scalar() or 0
    pending_count = db.query(func.count(m.StudentInvoice.id)).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.status.in_(["pending", "partial", "overdue"])).scalar() or 0
    return s.FinanceOverview(total_invoiced=Decimal(str(total_invoiced)), total_collected=Decimal(str(total_paid)), total_outstanding=total_outstanding, invoices_count=invoices_count, paid_count=paid_count, pending_count=pending_count)
