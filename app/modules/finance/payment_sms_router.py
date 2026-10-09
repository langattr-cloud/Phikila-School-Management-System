"""Secure SMS-gateway intake and verified oldest-first fee allocation.

SMS is treated as an unverified notification. An authorised finance administrator
must compare it with the bank's transaction record before it can post to the ledger.
"""
from __future__ import annotations

import hmac
import os
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.finance import models as m
from app.modules.finance import schemas as s
from app.modules.finance.payment_decoder import decode_payment_message
from app.modules.finance.payment_matching import find_student_by_admission_number
from app.modules.finance.payment_posting import post_fee_payment
from app.modules.scheduling.models import TtAuditEntry
from app.modules.scheduling.tenancy import Principal, require_role

router = APIRouter()


class SmsGatewayPayload(BaseModel):
    sender: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=10000)


class PaymentVerificationPayload(BaseModel):
    verification_reference: str = Field(min_length=3, max_length=200)
    verification_notes: str | None = Field(default=None, max_length=500)


class BankStatementLine(BaseModel):
    reference: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(gt=0)
    transaction_date: datetime | None = None


class PaymentReconciliationRequest(BaseModel):
    statement_reference: str = Field(min_length=1, max_length=200)
    transactions: list[BankStatementLine] = Field(min_length=1, max_length=5000)


def _audit(db: Session, *, school_id: int, actor: str, action: str, entity_id: int, summary: str) -> None:
    db.add(TtAuditEntry(
        school_id=school_id,
        actor=actor,
        action=action,
        entity="payment_inbox",
        entity_id=entity_id,
        summary=summary,
    ))


def _append_note(existing: str | None, addition: str) -> str:
    return f"{existing}\n{addition}" if existing else addition


def _post_matched_inbox_item(db: Session, *, inbox_id: int, school_id: int, actor: str) -> m.PaymentInbox:
    """Post a safely matched SMS immediately, without waiting for statement reconciliation.

    Inbox ingestion is committed before posting, so posting failures remain visible
    and retryable instead of losing the original SMS.
    """
    item = db.query(m.PaymentInbox).filter(
        m.PaymentInbox.id == inbox_id,
        m.PaymentInbox.school_id == school_id,
    ).with_for_update().first()
    if not item:
        raise HTTPException(404, "Payment inbox item not found.")
    if item.status == "POSTED" and item.posted_payment_id:
        return item
    if not item.matched_student_id:
        item.status = "UNMATCHED"
        item.notes = _append_note(item.notes, "Automatic posting held: student/admission match is unresolved.")
        db.commit()
        db.refresh(item)
        return item
    if item.status in {"DUPLICATE", "UNMATCHED"}:
        return item

    existing_payment = db.query(m.Payment).filter(
        m.Payment.school_id == school_id,
        m.Payment.reference_number == item.external_reference,
        m.Payment.status != "REVERSED",
    ).first()
    if existing_payment:
        item.status = "DUPLICATE"
        item.notes = _append_note(item.notes, f"Posting held: reference already exists as payment #{existing_payment.id}.")
        _audit(db, school_id=school_id, actor=actor, action="duplicate", entity_id=item.id,
               summary=f"Transaction {item.external_reference} already exists as payment #{existing_payment.id}.")
        db.commit()
        db.refresh(item)
        return item

    invoices = db.query(m.StudentInvoice).filter(
        m.StudentInvoice.school_id == school_id,
        m.StudentInvoice.student_id == item.matched_student_id,
        m.StudentInvoice.balance > 0,
    ).order_by(m.StudentInvoice.created_at.asc(), m.StudentInvoice.id.asc()).with_for_update().all()
    total_outstanding = sum((Decimal(str(invoice.balance)) for invoice in invoices), Decimal("0"))
    amount = Decimal(str(item.amount))
    if not invoices or amount > total_outstanding:
        item.status = "POSTING_FAILED"
        reason = "no outstanding invoice" if not invoices else f"payment {amount} exceeds outstanding balance {total_outstanding}"
        item.notes = _append_note(item.notes, f"Automatic posting held for finance review: {reason}.")
        _audit(db, school_id=school_id, actor=actor, action="posting_exception", entity_id=item.id,
               summary=f"Automatic posting held for {item.external_reference}: {reason}.")
        db.commit()
        db.refresh(item)
        return item

    remaining = amount
    first_payment_id: int | None = None
    allocation_number = 0
    try:
        for invoice in invoices:
            if remaining <= 0:
                break
            portion = min(remaining, Decimal(str(invoice.balance)))
            if portion <= 0:
                continue
            allocation_number += 1
            payment_reference = item.external_reference if allocation_number == 1 else f"{item.external_reference}-ALLOC-{allocation_number}"
            payment, _receipt = post_fee_payment(
                db,
                school_id=school_id,
                invoice=invoice,
                student_id=item.matched_student_id,
                amount=portion,
                payment_method=item.payment_channel or "KCB SMS",
                reference_number=payment_reference,
                notes=f"Automatically posted from KCB SMS; inbox #{item.id}; original reference {item.external_reference}; allocation {allocation_number}",
                actor=actor,
            )
            if first_payment_id is None:
                first_payment_id = payment.id
            remaining -= portion
        if remaining != 0 or first_payment_id is None:
            raise HTTPException(409, "Could not allocate the complete payment.")
        now = datetime.now(timezone.utc)
        item.status = "POSTED"
        item.posted_payment_id = first_payment_id
        item.posted_at = now
        item.reviewed_by = actor
        item.reviewed_at = now
        _audit(db, school_id=school_id, actor=actor, action="auto_post", entity_id=item.id,
               summary=f"Automatically posted KCB SMS {item.external_reference}, amount {amount}, oldest-invoice-first across {allocation_number} invoice(s); first payment #{first_payment_id}. Reconciliation pending.")
        db.commit()
        db.refresh(item)
        return item
    except Exception as exc:
        db.rollback()
        failed = db.query(m.PaymentInbox).filter(
            m.PaymentInbox.id == inbox_id,
            m.PaymentInbox.school_id == school_id,
        ).with_for_update().first()
        if not failed:
            raise
        failed.status = "POSTING_FAILED"
        failed.notes = _append_note(failed.notes, f"Automatic posting failed; finance action required: {str(exc)[:300]}")
        _audit(db, school_id=school_id, actor=actor, action="posting_failed", entity_id=failed.id,
               summary=f"Automatic posting failed for {failed.external_reference}; no partial payment posting was committed.")
        db.commit()
        db.refresh(failed)
        return failed


@router.post("/finance/payment-inbox/sms-gateway", response_model=s.PaymentInboxResponse)
def ingest_sms_gateway_message(
    payload: SmsGatewayPayload,
    x_payment_gateway_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Receive a forwarded SMS from the school's configured Android gateway."""
    expected_token = os.getenv("PAYMENT_SMS_GATEWAY_TOKEN", "")
    school_id_raw = os.getenv("PAYMENT_SMS_SCHOOL_ID", "")
    expected_account = os.getenv("PAYMENT_SMS_SCHOOL_ACCOUNT", "").strip()
    allowed_senders = {
        value.strip().casefold()
        for value in os.getenv("PAYMENT_SMS_ALLOWED_SENDERS", "").split(",")
        if value.strip()
    }
    if not expected_token or not school_id_raw or not expected_account or not allowed_senders:
        raise HTTPException(503, "SMS payment gateway is not configured on the server.")
    if not x_payment_gateway_token or not hmac.compare_digest(x_payment_gateway_token, expected_token):
        raise HTTPException(401, "Invalid SMS gateway token.")
    if payload.sender.strip().casefold() not in allowed_senders:
        raise HTTPException(403, "SMS sender is not on the configured allowlist.")
    try:
        school_id = int(school_id_raw)
    except ValueError as exc:
        raise HTTPException(503, "PAYMENT_SMS_SCHOOL_ID must be a numeric school ID.") from exc

    decoded = decode_payment_message(payload.message)
    amount = decoded["amount"]
    external_reference = decoded["external_reference"]
    student_identifier = decoded["student_identifier"]
    received_at = decoded["received_at"]
    source_account = decoded["school_account_identifier"]
    if not amount or amount <= 0 or not external_reference or not student_identifier or not received_at or not source_account:
        raise HTTPException(422, "SMS could not be parsed safely; amount, reference, account/admission number and transaction date are required.")
    if source_account != expected_account:
        raise HTTPException(422, "SMS account number does not match the configured school account.")
    if decoded["bank"] != "KCB":
        raise HTTPException(422, "Only configured KCB payment notifications are accepted by this endpoint.")

    source = "KCB_SMS"
    existing = db.query(m.PaymentInbox).filter(
        m.PaymentInbox.school_id == school_id,
        m.PaymentInbox.source == source,
        m.PaymentInbox.external_reference == external_reference,
    ).first()
    if existing:
        if (
            Decimal(str(existing.amount)) != amount
            or existing.student_identifier != student_identifier
            or existing.source_account != source_account
        ):
            raise HTTPException(409, "This transaction reference was already received with different payment details.")
        return existing

    student = find_student_by_admission_number(
        db, school_id=school_id, admission_number=student_identifier
    )
    item = m.PaymentInbox(
        school_id=school_id,
        source=source,
        source_account=source_account,
        account_name=decoded["account_name"],
        raw_message=payload.message,
        amount=amount,
        external_reference=external_reference,
        student_identifier=student_identifier,
        received_at=received_at,
        payment_channel="M-PESA → KCB",
        matched_student_id=student.id if student else None,
        match_method="admission_number" if student else None,
        match_confidence=Decimal("100.00") if student else None,
        status="UNVERIFIED" if student else "UNMATCHED",
        notes=f"SMS sender: {payload.sender.strip()}",
    )
    db.add(item)
    try:
        db.flush()
        _audit(
            db,
            school_id=school_id,
            actor="sms-gateway",
            action="receive",
            entity_id=item.id,
            summary=f"Received KCB SMS transaction {external_reference} for {amount}; status={item.status}. Not yet bank-verified.",
        )
        db.commit()
        db.refresh(item)
        if student:
            item = _post_matched_inbox_item(
                db, inbox_id=item.id, school_id=school_id, actor="sms-gateway"
            )
        return item
    except IntegrityError:
        db.rollback()
        existing = db.query(m.PaymentInbox).filter(
            m.PaymentInbox.school_id == school_id,
            m.PaymentInbox.source == source,
            m.PaymentInbox.external_reference == external_reference,
        ).first()
        if existing:
            if Decimal(str(existing.amount)) == amount and existing.student_identifier == student_identifier:
                return existing
            raise HTTPException(409, "Conflicting transaction details for an existing reference.")
        raise


@router.post("/finance/payment-inbox/{inbox_id}/verify-and-post", response_model=s.PaymentInboxResponse)
def verify_and_post_sms_payment(
    inbox_id: int,
    payload: PaymentVerificationPayload,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin")),
):
    """Record independent bank verification, then allocate oldest invoice first."""
    item = db.query(m.PaymentInbox).filter(
        m.PaymentInbox.id == inbox_id,
        m.PaymentInbox.school_id == principal.school_id,
    ).with_for_update().first()
    if not item:
        raise HTTPException(404, "Payment inbox item not found.")
    if item.status == "POSTED":
        return item
    if item.status not in {"UNVERIFIED", "VERIFIED", "VERIFIED_UNALLOCATED", "POSTING_FAILED", "MATCHED"} or not item.matched_student_id:
        raise HTTPException(409, "Only a uniquely matched, unposted SMS payment can be retried.")
    evidence = f"Bank verification reference: {payload.verification_reference.strip()}"
    if payload.verification_notes:
        evidence += f"; {payload.verification_notes.strip()}"
    item.reviewed_by = principal.email or principal.user_id
    item.reviewed_at = datetime.now(timezone.utc)
    item.notes = _append_note(item.notes, evidence)
    db.commit()
    return _post_matched_inbox_item(
        db, inbox_id=item.id, school_id=principal.school_id,
        actor=principal.email or principal.user_id,
    )




@router.post("/finance/payment-inbox/reconcile")
def reconcile_kcb_statement(
    payload: PaymentReconciliationRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin")),
):
    """Compare an uploaded/entered KCB statement batch with inbox notifications."""
    references = [line.reference.strip() for line in payload.transactions]
    if len(references) != len(set(references)):
        raise HTTPException(422, "Statement contains duplicate transaction references; reconcile a corrected statement.")
    results: list[dict] = []
    matched = mismatched = missing_sms = missing_bank = 0
    actor = principal.email or principal.user_id
    run_summary = f"KCB reconciliation {payload.statement_reference.strip()}"
    for line in payload.transactions:
        reference = line.reference.strip()
        item = db.query(m.PaymentInbox).filter(
            m.PaymentInbox.school_id == principal.school_id,
            m.PaymentInbox.source.in_({"KCB_SMS", "M-PESA"}),
            m.PaymentInbox.external_reference == reference,
        ).first()
        if item is None:
            missing_sms += 1
            result = {"reference": reference, "statement_amount": line.amount, "status": "BANK_TRANSACTION_WITHOUT_SMS"}
            _audit(db, school_id=principal.school_id, actor=actor, action="reconcile_missing_sms",
                   entity_id=0, summary=f"{run_summary}: bank transaction {reference} for {line.amount} has no matching SMS inbox record.")
        elif Decimal(str(item.amount)) != line.amount:
            mismatched += 1
            result = {"reference": reference, "statement_amount": line.amount, "sms_amount": item.amount, "inbox_id": item.id, "status": "AMOUNT_MISMATCH"}
            item.notes = _append_note(item.notes, f"{run_summary}: amount mismatch; bank={line.amount}, SMS={item.amount}.")
            _audit(db, school_id=principal.school_id, actor=actor, action="reconcile_mismatch",
                   entity_id=item.id, summary=f"{run_summary}: amount mismatch for {reference}; bank={line.amount}, SMS={item.amount}.")
        else:
            matched += 1
            result = {"reference": reference, "statement_amount": line.amount, "sms_amount": item.amount, "inbox_id": item.id, "status": "AMOUNT_MATCH"}
            item.notes = _append_note(item.notes, f"{run_summary}: amount matched bank statement.")
            _audit(db, school_id=principal.school_id, actor=actor, action="reconcile_match",
                   entity_id=item.id, summary=f"{run_summary}: bank statement amount matches SMS amount for {reference}; inbox status={item.status}.")
        results.append(result)
    inbox_without_statement = db.query(m.PaymentInbox).filter(
        m.PaymentInbox.school_id == principal.school_id,
        m.PaymentInbox.source.in_({"KCB_SMS", "M-PESA"}),
        ~m.PaymentInbox.external_reference.in_(references),
    ).all()
    for item in inbox_without_statement:
        missing_bank += 1
        results.append({
            "reference": item.external_reference,
            "sms_amount": item.amount,
            "inbox_id": item.id,
            "status": "SMS_WITHOUT_BANK_TRANSACTION",
        })
        item.notes = _append_note(item.notes, f"{run_summary}: no matching transaction was supplied in the bank statement.")
        _audit(db, school_id=principal.school_id, actor=actor, action="reconcile_missing_bank",
               entity_id=item.id, summary=f"{run_summary}: SMS transaction {item.external_reference} is absent from the supplied bank statement.")

    _audit(db, school_id=principal.school_id, actor=actor, action="reconcile_run",
           entity_id=0, summary=f"{run_summary}: statement rows={len(payload.transactions)}, matched={matched}, amount mismatches={mismatched}, bank rows without SMS={missing_sms}, SMS rows without bank transactions={missing_bank}.")
    db.commit()
    return {
        "statement_reference": payload.statement_reference,
        "statement_rows": len(payload.transactions),
        "amount_matched": matched,
        "amount_mismatches": mismatched,
        "bank_transactions_without_sms": missing_sms,
        "sms_transactions_without_bank_record": missing_bank,
        "results": results,
    }
