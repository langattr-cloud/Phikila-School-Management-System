"""Single transactional path for fee payments, receipts and GL posting."""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy.orm import Session
from . import models as m
from .accounting_service import post_journal
from .account_mapping_models import FinanceAccountMapping


def post_fee_payment(db: Session, *, school_id: int, invoice: m.StudentInvoice, student_id: int,
                     amount: Decimal, payment_method: str | None, reference_number: str | None,
                     notes: str | None, actor: str | None) -> tuple[m.Payment, m.FinanceReceipt]:
    if invoice.student_id != student_id:
        raise HTTPException(400, "Student does not match invoice.")
    if amount <= 0 or amount > Decimal(str(invoice.balance)):
        raise HTTPException(400, "Payment amount must be positive and cannot exceed the invoice balance.")
    if reference_number and db.query(m.Payment).filter(m.Payment.school_id == school_id, m.Payment.reference_number == reference_number, m.Payment.status != "REVERSED").first():
        raise HTTPException(409, "Payment reference has already been processed.")
    mapping = db.query(FinanceAccountMapping).filter_by(school_id=school_id, mapping_key="FEE_PAYMENT").first()
    if not mapping or not mapping.is_active:
        raise HTTPException(409, "Finance account mapping FEE_PAYMENT is not configured.")
    payment = m.Payment(school_id=school_id, invoice_id=invoice.id, student_id=student_id, amount=amount,
                        payment_method=payment_method, reference_number=reference_number, notes=notes,
                        received_by=actor, status="POSTED")
    db.add(payment); db.flush()
    journal = post_journal(db, school_id=school_id, journal_number=f"FEE-{payment.id}",
                           description=f"Fee payment for invoice #{invoice.id}", reference=reference_number,
                           created_by=actor,
                           entries=[{"account_id": mapping.debit_account_id, "debit": amount, "credit": 0, "description": "Fee receipt"},
                                    {"account_id": mapping.credit_account_id, "debit": 0, "credit": amount, "description": "Student fee settlement"}])
    payment.journal_id = journal.id
    invoice.balance = max(Decimal(str(invoice.balance)) - amount, Decimal("0"))
    invoice.status = "paid" if invoice.balance == 0 else "partial"
    receipt = m.FinanceReceipt(school_id=school_id, receipt_number=f"RCPT-{payment.id}", payment_id=payment.id,
                               student_id=student_id, amount=amount, status="ISSUED", issued_by=actor,
                               issued_at=datetime.now(timezone.utc))
    db.add(receipt); db.flush()
    return payment, receipt
