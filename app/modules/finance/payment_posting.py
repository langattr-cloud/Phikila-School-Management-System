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
    remaining = amount
    items = db.query(m.InvoiceItem).filter(m.InvoiceItem.school_id == school_id, m.InvoiceItem.invoice_id == invoice.id, m.InvoiceItem.balance > 0).order_by(m.InvoiceItem.id).all()
    if not items: raise HTTPException(409, "Invoice has no vote-head allocations.")
    for item in items:
        applied = min(remaining, Decimal(str(item.balance)))
        if applied > 0:
            item.balance = Decimal(str(item.balance)) - applied
            db.add(m.PaymentAllocation(school_id=school_id, payment_id=payment.id, invoice_id=invoice.id, invoice_item_id=item.id, vote_head_id=item.vote_head_id, amount=applied, allocation_type="FEE"))
            remaining -= applied
        if remaining <= 0: break
    if remaining > 0: raise HTTPException(409, "Payment exceeds the remaining vote-head allocation balance.")
    receipt = m.FinanceReceipt(school_id=school_id, receipt_number=f"RCPT-{payment.id}", payment_id=payment.id,
                               student_id=student_id, amount=amount, status="ISSUED", issued_by=actor,
                               issued_at=datetime.now(timezone.utc))
    db.add(receipt); db.flush()
    return payment, receipt
