"""Finance schemas."""
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field

class VoteHeadCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    code: str | None = Field(default=None, max_length=30)
    description: str | None = Field(default=None, max_length=500)
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|INACTIVE)$")
    display_order: int = Field(default=0, ge=0)

class VoteHeadUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    code: str | None = Field(default=None, max_length=30)
    description: str | None = Field(default=None, max_length=500)
    status: str | None = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")
    display_order: int | None = Field(default=None, ge=0)

class VoteHeadResponse(BaseModel):
    id: int
    school_id: int
    name: str
    code: str | None = None
    description: str | None = None
    status: str
    display_order: int
    revenue_account_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = {"from_attributes": True}

class FeeStructureAllocationCreate(BaseModel):
    vote_head_id: int
    amount: Decimal = Field(gt=0)
    display_order: int = Field(default=0, ge=0)

class FeeStructureAllocationResponse(BaseModel):
    id: int
    school_id: int
    fee_structure_id: int
    vote_head_id: int
    amount: Decimal
    display_order: int
    created_at: datetime | None = None
    model_config = {"from_attributes": True}

class InvoiceItemResponse(BaseModel):
    id: int
    school_id: int
    invoice_id: int
    vote_head_id: int | None = None
    description: str | None = None
    amount: Decimal
    balance: Decimal
    created_at: datetime | None = None
    model_config = {"from_attributes": True}

class PaymentAllocationResponse(BaseModel):
    id: int
    school_id: int
    payment_id: int
    invoice_id: int | None = None
    invoice_item_id: int | None = None
    vote_head_id: int | None = None
    amount: Decimal
    allocation_type: str
    created_at: datetime | None = None
    model_config = {"from_attributes": True}

class FeeStructureCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    academic_year_id: int | None = None
    term_id: int | None = None
    level_id: int | None = None
    grade_id: int | None = None
    stream_id: int | None = None
    amount: Decimal = Field(gt=0)
    currency: str = "KES"
    allocations: list[FeeStructureAllocationCreate] = []

class FeeStructureResponse(BaseModel):
    id: int
    school_id: int
    name: str
    description: str | None = None
    academic_year_id: int | None = None
    term_id: int | None = None
    level_id: int | None = None
    grade_id: int | None = None
    stream_id: int | None = None
    amount: Decimal
    currency: str
    status: str
    created_at: datetime | None = None
    model_config = {"from_attributes": True}

class InvoiceCreate(BaseModel):
    student_id: int
    fee_structure_id: int
    amount: Decimal = Field(ge=0)
    due_date: date | None = None

class InvoiceResponse(BaseModel):
    id: int
    school_id: int
    student_id: int
    fee_structure_id: int
    amount: Decimal
    balance: Decimal
    status: str
    due_date: date | None = None
    created_at: datetime | None = None

class PaymentCreate(BaseModel):
    invoice_id: int
    student_id: int
    amount: Decimal = Field(gt=0)
    payment_method: str | None = None
    reference_number: str | None = None
    notes: str | None = None

class PaymentResponse(BaseModel):
    id: int
    school_id: int
    invoice_id: int
    student_id: int
    amount: Decimal
    payment_method: str | None = None
    reference_number: str | None = None
    notes: str | None = None
    received_by: str | None = None
    status: str
    journal_id: int | None = None
    reversed_at: datetime | None = None
    reversal_reason: str | None = None
    created_at: datetime | None = None

class ReceiptResponse(BaseModel):
    id: int
    school_id: int
    receipt_number: str
    payment_id: int
    student_id: int
    amount: Decimal
    status: str
    issued_by: str | None = None
    issued_at: datetime | None = None

class PaymentReversalRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)

class StudentBalance(BaseModel):
    student_id: int
    student_name: str
    total_invoiced: Decimal
    total_paid: Decimal
    balance: Decimal

class FinanceOverview(BaseModel):
    total_invoiced: Decimal
    total_collected: Decimal
    total_outstanding: Decimal
    invoices_count: int
    paid_count: int
    pending_count: int

class PaymentDecodeRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)

class PaymentDecodeResponse(BaseModel):
    amount: Decimal | None = None
    external_reference: str | None = None
    student_identifier: str | None = None
    received_at: datetime | None = None
    account_name: str | None = None
    school_account_identifier: str | None = None
    bank: str | None = None
    payment_channel: str | None = None
    raw_message: str

class PaymentInboxCreate(BaseModel):
    source: str = Field(min_length=1, max_length=30)
    raw_message: str = Field(min_length=1, max_length=10000)
    source_account: str | None = None
    account_name: str | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    external_reference: str | None = None
    student_identifier: str | None = None
    received_at: datetime | None = None
    payment_channel: str | None = None

class PaymentInboxPostRequest(BaseModel):
    invoice_id: int | None = None
    reason: str | None = Field(default=None, max_length=500)

class PaymentInboxResponse(BaseModel):
    id: int
    school_id: int
    source: str
    source_account: str | None = None
    account_name: str | None = None
    raw_message: str
    amount: Decimal
    external_reference: str
    student_identifier: str | None = None
    received_at: datetime
    payment_channel: str | None = None
    matched_student_id: int | None = None
    match_method: str | None = None
    match_confidence: Decimal | None = None
    status: str
    duplicate_of: int | None = None
    posted_payment_id: int | None = None
    posted_at: datetime | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    notes: str | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class StudentBalanceReportRow(BaseModel):
    student_id: int
    admission_number: str
    student_name: str
    level_name: str | None = None
    grade_name: str | None = None
    stream_name: str | None = None
    total_invoiced: Decimal
    total_paid: Decimal
    balance: Decimal
    billing_status: str = "NOT_BILLED"

class BillingRunCreate(BaseModel):
    academic_year_id: int
    level_id: int
    grade_id: int
    stream_id: int | None = None
    fee_structure_id: int
    due_date: date | None = None

class BillingRunResponse(BaseModel):
    academic_year_id: int
    level_id: int
    grade_id: int
    stream_id: int | None = None
    fee_structure_id: int
    matched_students: int
    invoices_created: int
    invoices_skipped: int

class StatementInvoice(BaseModel):
    id: int
    description: str
    amount: Decimal
    balance: Decimal
    due_date: date | None = None
    created_at: datetime | None = None

class StatementPayment(BaseModel):
    id: int
    amount: Decimal
    payment_method: str | None = None
    reference_number: str | None = None
    created_at: datetime | None = None

class StudentStatement(BaseModel):
    student_id: int
    admission_number: str
    student_name: str
    level_name: str | None = None
    grade_name: str | None = None
    stream_name: str | None = None
    total_invoiced: Decimal
    total_paid: Decimal
    balance: Decimal
    invoices: list[StatementInvoice] = []
    payments: list[StatementPayment] = []
