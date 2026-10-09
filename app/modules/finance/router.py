"""Finance management API — school-scoped, auditable, Decimal-safe."""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from app.modules.students.models_v2 import Student
from . import models as m
from . import schemas as s
from .accounting_service import post_journal
from .payment_decoder import decode_payment_message
from .payment_matching import find_student_by_admission_number
from .payment_posting import post_fee_payment

router = APIRouter()

def _audit(db, principal, action, entity, eid, summary):
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(school_id=principal.school_id, actor=principal.email or principal.user_id, action=action, entity=entity, entity_id=eid, summary=summary))

def _invoice(db, principal, invoice_id):
    return db.query(m.StudentInvoice).filter(m.StudentInvoice.id == invoice_id, m.StudentInvoice.school_id == principal.school_id).first()

@router.get("/finance/vote-heads", response_model=list[s.VoteHeadResponse])
def list_vote_heads(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return db.query(m.FinanceVoteHead).filter(m.FinanceVoteHead.school_id == principal.school_id).order_by(m.FinanceVoteHead.display_order, m.FinanceVoteHead.id).all()

@router.post("/finance/vote-heads", response_model=s.VoteHeadResponse, status_code=201)
def create_vote_head(payload: s.VoteHeadCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    name = payload.name.strip()
    code = payload.code.strip().upper() if payload.code else None
    if db.query(m.FinanceVoteHead).filter(m.FinanceVoteHead.school_id == principal.school_id, func.lower(m.FinanceVoteHead.name) == name.lower()).first():
        raise HTTPException(409, "A vote head with this name already exists.")
    if code and db.query(m.FinanceVoteHead).filter(m.FinanceVoteHead.school_id == principal.school_id, func.upper(m.FinanceVoteHead.code) == code).first():
        raise HTTPException(409, "A vote head with this code already exists.")
    head = m.FinanceVoteHead(school_id=principal.school_id, name=name, code=code, description=payload.description.strip() if payload.description else None, status=payload.status, display_order=payload.display_order)
    db.add(head); _audit(db, principal, "create", "vote_head", 0, f"Created vote head '{name}'"); db.commit(); db.refresh(head); return head

@router.patch("/finance/vote-heads/{vote_head_id}", response_model=s.VoteHeadResponse)
def update_vote_head(vote_head_id: int, payload: s.VoteHeadUpdate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    head = db.query(m.FinanceVoteHead).filter(m.FinanceVoteHead.id == vote_head_id, m.FinanceVoteHead.school_id == principal.school_id).first()
    if not head: raise HTTPException(404, "Vote head not found.")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
        if db.query(m.FinanceVoteHead).filter(m.FinanceVoteHead.school_id == principal.school_id, func.lower(m.FinanceVoteHead.name) == data["name"].lower(), m.FinanceVoteHead.id != head.id).first():
            raise HTTPException(409, "A vote head with this name already exists.")
    if "code" in data:
        data["code"] = data["code"].strip().upper() if data["code"] else None
        if data["code"] and db.query(m.FinanceVoteHead).filter(m.FinanceVoteHead.school_id == principal.school_id, func.upper(m.FinanceVoteHead.code) == data["code"], m.FinanceVoteHead.id != head.id).first():
            raise HTTPException(409, "A vote head with this code already exists.")
    for key, value in data.items(): setattr(head, key, value)
    _audit(db, principal, "update", "vote_head", head.id, f"Updated vote head '{head.name}'"); db.commit(); db.refresh(head); return head


@router.get("/finance/fee-structures/{fee_structure_id}/items", response_model=list[s.FeeStructureAllocationResponse])
def list_fee_structure_items(fee_structure_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    fee = db.query(m.FeeStructure).filter(m.FeeStructure.id == fee_structure_id, m.FeeStructure.school_id == principal.school_id).first()
    if not fee: raise HTTPException(404, "Fee structure not found.")
    return db.query(m.FeeStructureItem).filter(m.FeeStructureItem.school_id == principal.school_id, m.FeeStructureItem.fee_structure_id == fee_structure_id).order_by(m.FeeStructureItem.display_order, m.FeeStructureItem.id).all()

@router.post("/finance/fee-structures/{fee_structure_id}/items", response_model=s.FeeStructureAllocationResponse, status_code=201)
def create_fee_structure_item(fee_structure_id: int, payload: s.FeeStructureAllocationCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    fee = db.query(m.FeeStructure).filter(m.FeeStructure.id == fee_structure_id, m.FeeStructure.school_id == principal.school_id).first()
    if not fee: raise HTTPException(404, "Fee structure not found.")
    head = db.query(m.FinanceVoteHead).filter(m.FinanceVoteHead.id == payload.vote_head_id, m.FinanceVoteHead.school_id == principal.school_id, m.FinanceVoteHead.status == "ACTIVE").first()
    if not head: raise HTTPException(404, "Active vote head not found.")
    if db.query(m.FeeStructureItem).filter(m.FeeStructureItem.school_id == principal.school_id, m.FeeStructureItem.fee_structure_id == fee.id, m.FeeStructureItem.vote_head_id == head.id).first():
        raise HTTPException(409, "This vote head is already allocated to the fee structure.")
    current = db.query(func.coalesce(func.sum(m.FeeStructureItem.amount), 0)).filter(m.FeeStructureItem.school_id == principal.school_id, m.FeeStructureItem.fee_structure_id == fee.id).scalar()
    if Decimal(str(current)) + payload.amount > Decimal(str(fee.amount)): raise HTTPException(409, "Vote-head allocations cannot exceed the fee structure amount.")
    item = m.FeeStructureItem(school_id=principal.school_id, fee_structure_id=fee.id, vote_head_id=head.id, amount=payload.amount, display_order=payload.display_order)
    db.add(item); _audit(db, principal, "create", "fee_structure_item", item.id if item.id else 0, f"Allocated {payload.amount} to vote head '{head.name}' for fee structure #{fee.id}"); db.commit(); db.refresh(item); return item

@router.get("/finance/fee-structures", response_model=list[s.FeeStructureResponse])
def list_fee_structures(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return db.query(m.FeeStructure).filter(m.FeeStructure.school_id == principal.school_id).order_by(m.FeeStructure.name).all()

@router.post("/finance/fee-structures", response_model=s.FeeStructureResponse, status_code=201)
def create_fee_structure(payload: s.FeeStructureCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    allocations = payload.allocations or []
    total = sum((Decimal(str(x.amount)) for x in allocations), Decimal("0"))
    if not allocations or total != Decimal(str(payload.amount)): raise HTTPException(409, f"Vote-head allocations must total exactly KES {payload.amount}.")
    vote_ids = [x.vote_head_id for x in allocations]
    if len(vote_ids) != len(set(vote_ids)): raise HTTPException(409, "Each vote head can only be allocated once.")
    heads = db.query(m.FinanceVoteHead).filter(m.FinanceVoteHead.school_id == principal.school_id, m.FinanceVoteHead.id.in_(vote_ids), m.FinanceVoteHead.status == "ACTIVE").all()
    if len(heads) != len(vote_ids): raise HTTPException(409, "Every allocation must use an active vote head.")
    duplicate = db.query(m.FeeStructure).filter(
        m.FeeStructure.school_id == principal.school_id,
        m.FeeStructure.name == payload.name,
        m.FeeStructure.academic_year_id == payload.academic_year_id,
        m.FeeStructure.grade_id == payload.grade_id,
        func.coalesce(m.FeeStructure.stream_id, 0) == (payload.stream_id or 0),
    ).first()
    if duplicate:
        raise HTTPException(
            409,
            f"A fee structure named '{duplicate.name}' already exists for this academic year and grade (KES {duplicate.amount}). Open Finance → Fees to view it instead of creating a duplicate.",
        )
    data = payload.model_dump(exclude={"allocations"})
    fs = m.FeeStructure(school_id=principal.school_id, **data)
    db.add(fs)
    try:
        db.flush()
        for item in allocations:
            db.add(m.FeeStructureItem(school_id=principal.school_id, fee_structure_id=fs.id, vote_head_id=item.vote_head_id, amount=item.amount, display_order=item.display_order))
        _audit(db, principal, "create", "fee_structure", fs.id, f"Created fee structure '{payload.name}' — {payload.amount} with {len(allocations)} vote-head allocations")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "uq_fee_structure_scope" in str(exc.orig):
            raise HTTPException(
                409,
                f"A fee structure named '{payload.name}' already exists for this academic year and grade. Open Finance → Fees to view it instead of creating a duplicate.",
            ) from exc
        raise
    db.refresh(fs)
    return fs

@router.delete("/finance/fee-structures/{fee_structure_id}", status_code=204)
def delete_fee_structure(fee_structure_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    """Delete a fee structure only if it has never been used to issue invoices."""
    fee = db.query(m.FeeStructure).filter(
        m.FeeStructure.id == fee_structure_id,
        m.FeeStructure.school_id == principal.school_id,
    ).first()
    if not fee:
        raise HTTPException(404, "Fee structure not found.")

    invoice_count = db.query(func.count(m.StudentInvoice.id)).filter(
        m.StudentInvoice.school_id == principal.school_id,
        m.StudentInvoice.fee_structure_id == fee.id,
    ).scalar() or 0
    if invoice_count:
        raise HTTPException(
            409,
            f"This fee structure has {invoice_count} invoice(s) and cannot be deleted because it is part of billing history. Set its status to inactive instead.",
        )

    db.query(m.FeeStructureItem).filter(
        m.FeeStructureItem.school_id == principal.school_id,
        m.FeeStructureItem.fee_structure_id == fee.id,
    ).delete(synchronize_session=False)
    fee_name = fee.name
    fee_id = fee.id
    db.delete(fee)
    _audit(db, principal, "delete", "fee_structure", fee_id, f"Deleted unused fee structure '{fee_name}'")
    db.commit()
    return None


@router.post("/finance/billing-runs", response_model=s.BillingRunResponse, status_code=201)
def create_billing_run(payload: s.BillingRunCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    """Bill every active enrollee matching the selected academic hierarchy.

    Billing is enrollment-driven; duplicate invoices are skipped safely.
    """
    from app.modules.academics.models import AcademicYear, Grade, Level, Stream

    year = db.query(AcademicYear).filter(AcademicYear.id == payload.academic_year_id, AcademicYear.school_id == principal.school_id).first()
    if not year:
        raise HTTPException(404, "Academic year not found.")
    grade = db.query(Grade).filter(Grade.id == payload.grade_id, Grade.level_id == payload.level_id, Grade.school_id == principal.school_id, Grade.status == True).first()
    if not grade:
        raise HTTPException(404, "Grade not found for the selected level.")
    if payload.stream_id is not None:
        stream = db.query(Stream).filter(Stream.id == payload.stream_id, Stream.school_id == principal.school_id, Stream.academic_year_id == payload.academic_year_id, Stream.level_id == payload.level_id, Stream.grade_id == payload.grade_id, Stream.status == "ACTIVE").first()
        if not stream:
            raise HTTPException(404, "Stream not found for the selected academic hierarchy.")

    fee = db.query(m.FeeStructure).filter(
        m.FeeStructure.id == payload.fee_structure_id,
        m.FeeStructure.school_id == principal.school_id,
        m.FeeStructure.status == "active",
    ).first()
    if not fee:
        raise HTTPException(404, "Fee structure not found.")

    if fee.academic_year_id not in (None, payload.academic_year_id):
        raise HTTPException(409, "Fee structure belongs to a different academic year.")
    if fee.level_id not in (None, payload.level_id):
        raise HTTPException(409, "Fee structure belongs to a different level.")
    if fee.grade_id not in (None, payload.grade_id):
        raise HTTPException(409, "Fee structure belongs to a different grade.")
    if fee.stream_id not in (None, payload.stream_id):
        raise HTTPException(409, "Fee structure belongs to a different stream.")

    q = db.query(m.StudentEnrollment).filter(
        m.StudentEnrollment.school_id == principal.school_id,
        m.StudentEnrollment.academic_year_id == payload.academic_year_id,
        m.StudentEnrollment.level_id == payload.level_id,
        m.StudentEnrollment.grade_id == payload.grade_id,
        m.StudentEnrollment.status == "active",
    )
    if payload.stream_id is not None:
        q = q.filter(m.StudentEnrollment.stream_id == payload.stream_id)
    enrollments = q.all()

    created = 0
    skipped = 0
    for enrollment in enrollments:
        duplicate = db.query(m.StudentInvoice).filter(
            m.StudentInvoice.school_id == principal.school_id,
            m.StudentInvoice.student_id == enrollment.student_id,
            m.StudentInvoice.fee_structure_id == fee.id,
        ).first()
        if duplicate:
            skipped += 1
            continue
        allocation_rows = db.query(m.FeeStructureItem).filter(m.FeeStructureItem.school_id == principal.school_id, m.FeeStructureItem.fee_structure_id == fee.id).order_by(m.FeeStructureItem.display_order, m.FeeStructureItem.id).all()
        if not allocation_rows or sum((Decimal(str(x.amount)) for x in allocation_rows), Decimal("0")) != Decimal(str(fee.amount)): raise HTTPException(409, "Fee structure vote-head allocations must total exactly the fee amount before billing.")
        invoice = m.StudentInvoice(school_id=principal.school_id, student_id=enrollment.student_id, fee_structure_id=fee.id, amount=fee.amount, balance=fee.amount, due_date=payload.due_date)
        db.add(invoice); db.flush()
        for allocation in allocation_rows: db.add(m.InvoiceItem(school_id=principal.school_id, invoice_id=invoice.id, vote_head_id=allocation.vote_head_id, amount=allocation.amount, balance=allocation.amount))
        created += 1

    _audit(db, principal, "create", "billing_run", 0, f"Billing run for {year.name}/{grade.name}: created={created}, skipped={skipped}")
    db.commit()
    return s.BillingRunResponse(
        academic_year_id=payload.academic_year_id,
        level_id=payload.level_id,
        grade_id=payload.grade_id,
        stream_id=payload.stream_id,
        fee_structure_id=fee.id,
        matched_students=len(enrollments),
        invoices_created=created,
        invoices_skipped=skipped,
    )

@router.get("/finance/invoices", response_model=list[s.InvoiceResponse])
def list_invoices(student_id: int | None = Query(default=None), status_filter: str | None = Query(default=None, alias="status"), db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    q = db.query(m.StudentInvoice).filter(m.StudentInvoice.school_id == principal.school_id)
    if student_id: q = q.filter(m.StudentInvoice.student_id == student_id)
    if status_filter: q = q.filter(m.StudentInvoice.status == status_filter)
    return q.order_by(m.StudentInvoice.created_at.desc()).limit(200).all()

@router.post("/finance/invoices", response_model=s.InvoiceResponse, status_code=201)
def create_invoice(payload: s.InvoiceCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    if not db.query(Student).filter(Student.id == payload.student_id, Student.school_id == principal.school_id).first(): raise HTTPException(404, "Student not found.")
    if not db.query(m.FeeStructure).filter(m.FeeStructure.id == payload.fee_structure_id, m.FeeStructure.school_id == principal.school_id).first(): raise HTTPException(404, "Fee structure not found.")
    if db.query(m.StudentInvoice).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.student_id == payload.student_id, m.StudentInvoice.fee_structure_id == payload.fee_structure_id).first(): raise HTTPException(409, "This student has already been billed for this fee structure.")
    fee = db.query(m.FeeStructure).filter(m.FeeStructure.id == payload.fee_structure_id, m.FeeStructure.school_id == principal.school_id).first()
    if not fee: raise HTTPException(404, "Fee structure not found.")
    if payload.amount != fee.amount: raise HTTPException(409, "Invoice amount must match the fee structure amount.")
    allocations = db.query(m.FeeStructureItem).filter(m.FeeStructureItem.school_id == principal.school_id, m.FeeStructureItem.fee_structure_id == fee.id).order_by(m.FeeStructureItem.display_order, m.FeeStructureItem.id).all()
    if not allocations or sum((Decimal(str(x.amount)) for x in allocations), Decimal("0")) != Decimal(str(fee.amount)): raise HTTPException(409, "Fee structure vote-head allocations are incomplete.")
    inv = m.StudentInvoice(school_id=principal.school_id, balance=payload.amount, student_id=payload.student_id, fee_structure_id=payload.fee_structure_id, amount=payload.amount, due_date=payload.due_date); db.add(inv); db.flush()
    for allocation in allocations: db.add(m.InvoiceItem(school_id=principal.school_id, invoice_id=inv.id, vote_head_id=allocation.vote_head_id, amount=allocation.amount, balance=allocation.amount))
    _audit(db, principal, "create", "invoice", inv.id, f"Invoiced student #{payload.student_id} — {payload.amount}"); db.commit(); db.refresh(inv); return inv


@router.get("/finance/payments/{payment_id}/allocations", response_model=list[s.PaymentAllocationResponse])
def list_payment_allocations(payment_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    if not db.query(m.Payment).filter(m.Payment.id == payment_id, m.Payment.school_id == principal.school_id).first(): raise HTTPException(404, "Payment not found.")
    return db.query(m.PaymentAllocation).filter(m.PaymentAllocation.school_id == principal.school_id, m.PaymentAllocation.payment_id == payment_id).order_by(m.PaymentAllocation.id).all()

@router.get("/finance/payments", response_model=list[s.PaymentResponse])
def list_payments(student_id: int | None = Query(default=None), db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    q = db.query(m.Payment).filter(m.Payment.school_id == principal.school_id)
    if student_id: q = q.filter(m.Payment.student_id == student_id)
    return q.order_by(m.Payment.created_at.desc()).limit(200).all()

@router.post("/finance/payments", response_model=s.PaymentResponse, status_code=201)
def record_payment(payload: s.PaymentCreate, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin", "scheduler"))):
    invoice = _invoice(db, principal, payload.invoice_id)
    if not invoice: raise HTTPException(404, "Invoice not found.")
    payment, _ = post_fee_payment(db, school_id=principal.school_id, invoice=invoice, student_id=payload.student_id, amount=payload.amount, payment_method=payload.payment_method, reference_number=payload.reference_number, notes=payload.notes, actor=principal.user_id)
    _audit(db, principal, "post", "payment", payment.id, f"Posted fee payment of {payload.amount} with GL journal and receipt"); db.commit(); db.refresh(payment); return payment

@router.get("/finance/receipts", response_model=list[s.ReceiptResponse])
def list_receipts(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    return db.query(m.FinanceReceipt).filter(m.FinanceReceipt.school_id == principal.school_id).order_by(m.FinanceReceipt.issued_at.desc()).limit(200).all()

@router.get("/finance/receipts/{receipt_id}", response_model=s.ReceiptResponse)
def get_receipt(receipt_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    receipt = db.query(m.FinanceReceipt).filter(m.FinanceReceipt.id == receipt_id, m.FinanceReceipt.school_id == principal.school_id).first()
    if not receipt: raise HTTPException(404, "Receipt not found.")
    return receipt

@router.post("/finance/payments/{payment_id}/reverse", response_model=s.PaymentResponse)
def reverse_payment(payment_id: int, payload: s.PaymentReversalRequest, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    payment = db.query(m.Payment).filter(m.Payment.id == payment_id, m.Payment.school_id == principal.school_id).first()
    if not payment: raise HTTPException(404, "Payment not found.")
    if payment.status == "REVERSED": raise HTTPException(409, "Payment is already reversed.")
    journal = db.query(m.Journal).filter(m.Journal.id == payment.journal_id, m.Journal.school_id == principal.school_id).first()
    if not journal: raise HTTPException(409, "Posted payment has no journal and cannot be reversed safely.")
    entries = db.query(m.JournalEntry).filter(m.JournalEntry.journal_id == journal.id).all()
    reversal = post_journal(db, school_id=principal.school_id, journal_number=f"REV-{payment.id}", description=f"Reversal of payment #{payment.id}: {payload.reason}", reference=payment.reference_number, created_by=principal.user_id, entries=[{"account_id": e.account_id, "debit": e.credit, "credit": e.debit, "description": "Payment reversal"} for e in entries])
    invoice = _invoice(db, principal, payment.invoice_id)
    if invoice: invoice.balance = Decimal(str(invoice.balance)) + Decimal(str(payment.amount)); invoice.status = "pending"
    allocations = db.query(m.PaymentAllocation).filter(m.PaymentAllocation.school_id == principal.school_id, m.PaymentAllocation.payment_id == payment.id, m.PaymentAllocation.allocation_type == "FEE").all()
    for allocation in allocations:
        if allocation.invoice_item_id:
            item = db.query(m.InvoiceItem).filter(m.InvoiceItem.id == allocation.invoice_item_id, m.InvoiceItem.school_id == principal.school_id).first()
            if item: item.balance = Decimal(str(item.balance)) + Decimal(str(allocation.amount))
    payment.status = "REVERSED"; payment.reversed_at = datetime.now(timezone.utc); payment.reversal_reason = payload.reason
    receipt = db.query(m.FinanceReceipt).filter(m.FinanceReceipt.payment_id == payment.id, m.FinanceReceipt.school_id == principal.school_id).first()
    if receipt: receipt.status = "REVERSED"
    _audit(db, principal, "reverse", "payment", payment.id, f"Reversed payment #{payment.id}; reversal journal #{reversal.id}; reason={payload.reason}"); db.commit(); db.refresh(payment); return payment

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
    amount = payload.amount or decoded["amount"]; external_reference = payload.external_reference or decoded["external_reference"]; student_identifier = payload.student_identifier or decoded["student_identifier"]; received_at = payload.received_at or decoded["received_at"] or datetime.now(timezone.utc)
    if not amount or not external_reference: raise HTTPException(400, "Payment amount and external reference could not be determined.")
    duplicate = db.query(m.PaymentInbox).filter(m.PaymentInbox.school_id == principal.school_id, m.PaymentInbox.source == payload.source, m.PaymentInbox.external_reference == external_reference).first()
    if duplicate: raise HTTPException(409, f"Duplicate payment reference; already received as inbox item #{duplicate.id}.")
    matched_student = find_student_by_admission_number(db, school_id=principal.school_id, admission_number=student_identifier)
    inbox_status = "MATCHED" if matched_student else "UNMATCHED"
    item = m.PaymentInbox(school_id=principal.school_id, source=payload.source, source_account=payload.source_account, account_name=payload.account_name or decoded["account_name"], raw_message=payload.raw_message, amount=amount, external_reference=external_reference, student_identifier=student_identifier, received_at=received_at, payment_channel=payload.payment_channel or decoded["payment_channel"], matched_student_id=matched_student.id if matched_student else None, match_method="admission_number" if matched_student else None, match_confidence=Decimal("100.00") if matched_student else None, status=inbox_status)
    db.add(item); _audit(db, principal, "create", "payment_inbox", 0, f"Ingested external payment {external_reference} — {amount}; status={inbox_status}"); db.commit(); db.refresh(item); return item

@router.post("/finance/payment-inbox/{inbox_id}/post", response_model=s.PaymentInboxResponse)
def post_payment_inbox(inbox_id: int, payload: s.PaymentInboxPostRequest | None = None, db: Session = Depends(get_db), principal: Principal = Depends(require_role("admin"))):
    payload = payload or s.PaymentInboxPostRequest(); item = db.query(m.PaymentInbox).filter(m.PaymentInbox.id == inbox_id, m.PaymentInbox.school_id == principal.school_id).first()
    if not item: raise HTTPException(404, "Payment inbox item not found.")
    if item.status == "POSTED": return item
    if item.status in {"DUPLICATE", "REJECTED", "REVERSED"}: raise HTTPException(409, f"Payment is already {item.status.lower()} and cannot be posted.")
    if item.status != "MATCHED" or not item.matched_student_id: raise HTTPException(409, "Only a uniquely matched payment can be posted.")
    if db.query(m.Payment).filter(m.Payment.school_id == principal.school_id, m.Payment.reference_number == item.external_reference, m.Payment.status != "REVERSED").first():
        item.status = "DUPLICATE"; item.reviewed_by = principal.user_id; item.reviewed_at = datetime.now(timezone.utc); _audit(db, principal, "duplicate", "payment_inbox", item.id, f"Duplicate payment reference {item.external_reference}"); db.commit(); db.refresh(item); return item
    if payload.invoice_id: invoice = _invoice(db, principal, payload.invoice_id)
    else:
        open_invoices = db.query(m.StudentInvoice).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.student_id == item.matched_student_id, m.StudentInvoice.balance > 0).order_by(m.StudentInvoice.created_at.asc()).all()
        if len(open_invoices) != 1: raise HTTPException(409, "The matched student has multiple open invoices; select an invoice explicitly before posting.")
        invoice = open_invoices[0]
    if not invoice or invoice.student_id != item.matched_student_id: raise HTTPException(404, "Selected invoice not found for matched student.")
    payment, _ = post_fee_payment(db, school_id=principal.school_id, invoice=invoice, student_id=item.matched_student_id, amount=item.amount, payment_method=item.payment_channel or item.source, reference_number=item.external_reference, notes=payload.reason or f"Posted from payment inbox #{item.id}", actor=principal.user_id)
    now = datetime.now(timezone.utc); item.status = "POSTED"; item.posted_payment_id = payment.id; item.posted_at = now; item.reviewed_by = principal.user_id; item.reviewed_at = now
    _audit(db, principal, "post", "payment_inbox", item.id, f"Posted {item.external_reference} as payment #{payment.id} against invoice #{invoice.id}"); db.commit(); db.refresh(item); return item

@router.get("/finance/students/{student_id}/balance", response_model=s.StudentBalance)
def student_balance(student_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    student = db.query(Student).filter(Student.id == student_id, Student.school_id == principal.school_id).first()
    if not student: raise HTTPException(404, "Student not found.")
    total_invoiced = db.query(func.coalesce(func.sum(m.StudentInvoice.amount), 0)).filter(m.StudentInvoice.student_id == student_id, m.StudentInvoice.school_id == principal.school_id).scalar()
    total_paid = db.query(func.coalesce(func.sum(m.Payment.amount), 0)).filter(m.Payment.student_id == student_id, m.Payment.school_id == principal.school_id, m.Payment.status != "REVERSED").scalar()
    return s.StudentBalance(student_id=student_id, student_name=f"{student.first_name} {student.last_name}", total_invoiced=Decimal(str(total_invoiced)), total_paid=Decimal(str(total_paid)), balance=max(Decimal(str(total_invoiced)) - Decimal(str(total_paid)), Decimal("0")))

@router.get("/finance/reports/student-balances", response_model=list[s.StudentBalanceReportRow])
def student_balance_report(
    academic_year_id: int | None = Query(default=None),
    level_id: int | None = Query(default=None),
    grade_id: int | None = Query(default=None),
    stream_id: int | None = Query(default=None),
    outstanding_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("viewer", "teacher", "admin")),
):
    # Finance roster is driven by the same admission hierarchy:
    # Academic Year -> Level -> Grade -> optional Stream.
    enrollment_query = db.query(m.StudentEnrollment).filter(
        m.StudentEnrollment.school_id == principal.school_id,
        m.StudentEnrollment.status == "active",
    )
    if academic_year_id is not None:
        enrollment_query = enrollment_query.filter(m.StudentEnrollment.academic_year_id == academic_year_id)
    else:
        from app.modules.academics.models import AcademicYear
        current = db.query(AcademicYear.id).filter(
            AcademicYear.school_id == principal.school_id,
            AcademicYear.status == "ACTIVE",
        ).order_by(AcademicYear.is_current.desc(), AcademicYear.id.desc()).first()
        if current:
            academic_year_id = current[0]
            enrollment_query = enrollment_query.filter(m.StudentEnrollment.academic_year_id == academic_year_id)
    if level_id is not None:
        enrollment_query = enrollment_query.filter(m.StudentEnrollment.level_id == level_id)
    if grade_id is not None:
        enrollment_query = enrollment_query.filter(m.StudentEnrollment.grade_id == grade_id)
    if stream_id is not None:
        enrollment_query = enrollment_query.filter(m.StudentEnrollment.stream_id == stream_id)

    enrollments = enrollment_query.order_by(m.StudentEnrollment.student_id).all()
    if not enrollments:
        return []

    student_ids = [e.student_id for e in enrollments]
    students = {
        x.id: x for x in db.query(Student).filter(
            Student.school_id == principal.school_id,
            Student.id.in_(student_ids),
        ).all()
    }

    # Only invoices belonging to the selected academic year contribute to the
    # year-specific finance totals. Students remain visible even when they have
    # no invoice yet, so admission automatically produces a finance roster.
    invoice_query = db.query(m.StudentInvoice).join(
        m.FeeStructure, m.StudentInvoice.fee_structure_id == m.FeeStructure.id
    ).filter(
        m.StudentInvoice.school_id == principal.school_id,
        m.StudentInvoice.student_id.in_(student_ids),
    )
    if academic_year_id is not None:
        invoice_query = invoice_query.filter(m.FeeStructure.academic_year_id == academic_year_id)
    invoices = invoice_query.all()

    totals = {student_id: [Decimal("0"), Decimal("0")] for student_id in student_ids}
    invoice_ids = []
    for inv in invoices:
        totals[inv.student_id][0] += Decimal(str(inv.amount))
        invoice_ids.append(inv.id)

    if invoice_ids:
        for pay in db.query(m.Payment).filter(
            m.Payment.school_id == principal.school_id,
            m.Payment.invoice_id.in_(invoice_ids),
            m.Payment.status != "REVERSED",
        ).all():
            if pay.student_id in totals:
                totals[pay.student_id][1] += Decimal(str(pay.amount))

    from app.modules.academics.models import Grade, Level, Stream
    grade_ids = {e.grade_id for e in enrollments if e.grade_id is not None}
    stream_ids = {e.stream_id for e in enrollments if e.stream_id is not None}
    level_ids = {e.level_id for e in enrollments}
    grades = {x.id: x.name for x in db.query(Grade).filter(Grade.id.in_(grade_ids)).all()} if grade_ids else {}
    levels = {x.id: x.name for x in db.query(Level).filter(Level.id.in_(level_ids)).all()} if level_ids else {}
    streams = {x.id: x.name for x in db.query(Stream).filter(Stream.id.in_(stream_ids)).all()} if stream_ids else {}

    rows = []
    for e in enrollments:
        student = students.get(e.student_id)
        if not student:
            continue
        invoiced, paid = totals[e.student_id]
        balance = max(invoiced - paid, Decimal("0"))
        if outstanding_only and balance <= 0:
            continue
        student_invoice_ids = {inv.student_id for inv in invoices}
        rows.append(s.StudentBalanceReportRow(
            student_id=e.student_id,
            admission_number=student.admission_number,
            student_name=" ".join(x for x in [student.first_name, student.middle_name, student.last_name] if x),
            level_name=levels.get(e.level_id),
            grade_name=grades.get(e.grade_id),
            stream_name=streams.get(e.stream_id),
            total_invoiced=invoiced,
            total_paid=paid,
            balance=balance,
            billing_status="BILLED" if e.student_id in student_invoice_ids else "NOT_BILLED",
        ))
    return rows

@router.get("/finance/reports/student/{student_id}/statement", response_model=s.StudentStatement)
def student_statement(student_id: int, academic_year_id: int | None = Query(default=None), db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    student = db.query(Student).filter(Student.id == student_id, Student.school_id == principal.school_id).first()
    if not student: raise HTTPException(404, "Student not found.")
    q = db.query(m.StudentInvoice).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.student_id == student_id)
    if academic_year_id is not None:
        q = q.join(m.FeeStructure, m.StudentInvoice.fee_structure_id == m.FeeStructure.id).filter(m.FeeStructure.academic_year_id == academic_year_id)
    invoices = q.order_by(m.StudentInvoice.created_at.asc()).all()
    payments = db.query(m.Payment).filter(m.Payment.school_id == principal.school_id, m.Payment.student_id == student_id, m.Payment.status != "REVERSED").order_by(m.Payment.created_at.asc()).all()
    enrollment = db.query(m.StudentEnrollment).filter(m.StudentEnrollment.school_id == principal.school_id, m.StudentEnrollment.student_id == student_id, *([m.StudentEnrollment.academic_year_id == academic_year_id] if academic_year_id else [])).order_by(m.StudentEnrollment.academic_year_id.desc()).first()
    from app.modules.academics.models import Grade, Level, Stream
    grade = db.query(Grade.name).filter(Grade.id == enrollment.grade_id).scalar() if enrollment and enrollment.grade_id else None
    level = db.query(Level.name).filter(Level.id == enrollment.level_id).scalar() if enrollment else None
    stream = db.query(Stream.name).filter(Stream.id == enrollment.stream_id).scalar() if enrollment and enrollment.stream_id else None
    invoice_ids = {i.id for i in invoices}
    paid = sum((Decimal(str(p.amount)) for p in payments if p.invoice_id in invoice_ids), Decimal("0"))
    invoiced = sum((Decimal(str(i.amount)) for i in invoices), Decimal("0"))
    return s.StudentStatement(
        student_id=student.id, admission_number=student.admission_number,
        student_name=" ".join(x for x in [student.first_name, student.middle_name, student.last_name] if x),
        level_name=level, grade_name=grade, stream_name=stream,
        total_invoiced=invoiced, total_paid=paid, balance=max(invoiced-paid, Decimal("0")),
        invoices=[s.StatementInvoice(id=i.id, description=(db.query(m.FeeStructure.name).filter(m.FeeStructure.id == i.fee_structure_id).scalar() or f"Invoice #{i.id}"), amount=i.amount, balance=i.balance, due_date=i.due_date, created_at=i.created_at) for i in invoices],
        payments=[s.StatementPayment(id=p.id, amount=p.amount, payment_method=p.payment_method, reference_number=p.reference_number, created_at=p.created_at) for p in payments if p.invoice_id in invoice_ids],
    )

@router.get("/finance/overview", response_model=s.FinanceOverview)
def finance_overview(db: Session = Depends(get_db), principal: Principal = Depends(require_role("viewer", "teacher", "admin"))):
    total_invoiced = db.query(func.coalesce(func.sum(m.StudentInvoice.amount), 0)).filter(m.StudentInvoice.school_id == principal.school_id).scalar(); total_paid = db.query(func.coalesce(func.sum(m.Payment.amount), 0)).filter(m.Payment.school_id == principal.school_id, m.Payment.status != "REVERSED").scalar(); total_outstanding = max(Decimal(str(total_invoiced)) - Decimal(str(total_paid)), Decimal("0"))
    invoices_count = db.query(func.count(m.StudentInvoice.id)).filter(m.StudentInvoice.school_id == principal.school_id).scalar() or 0; paid_count = db.query(func.count(m.StudentInvoice.id)).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.status == "paid").scalar() or 0; pending_count = db.query(func.count(m.StudentInvoice.id)).filter(m.StudentInvoice.school_id == principal.school_id, m.StudentInvoice.status.in_(["pending", "partial", "overdue"])).scalar() or 0
    return s.FinanceOverview(total_invoiced=Decimal(str(total_invoiced)), total_collected=Decimal(str(total_paid)), total_outstanding=total_outstanding, invoices_count=invoices_count, paid_count=paid_count, pending_count=pending_count)
