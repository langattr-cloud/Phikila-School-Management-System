"""Finance schemas."""

from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field

class FeeStructureCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150); description: str | None = None
    academic_year_id: int | None = None; term_id: int | None = None; level_id: int | None = None
    amount: Decimal = Field(ge=0); currency: str = "KES"
class FeeStructureResponse(BaseModel):
    id: int; school_id: int; name: str; description: str | None = None; academic_year_id: int | None = None; term_id: int | None = None; level_id: int | None = None
    amount: Decimal; currency: str; status: str; created_at: datetime | None = None
    model_config = {"from_attributes": True}
class InvoiceCreate(BaseModel):
    student_id: int; fee_structure_id: int; amount: Decimal = Field(ge=0); due_date: date | None = None
class InvoiceResponse(BaseModel):
    id: int; school_id: int; student_id: int; fee_structure_id: int; amount: Decimal; balance: Decimal; status: str; due_date: date | None = None; created_at: datetime | None = None
    model_config = {"from_attributes": True}
class PaymentCreate(BaseModel):
    invoice_id: int; student_id: int; amount: Decimal = Field(gt=0); payment_method: str | None = None; reference_number: str | None = None; notes: str | None = None
class PaymentResponse(BaseModel):
    id: int; school_id: int; invoice_id: int; student_id: int; amount: Decimal; payment_method: str | None = None; reference_number: str | None = None; notes: str | None = None; received_by: str | None = None; status: str; journal_id: int | None = None; reversed_at: datetime | None = None; reversal_reason: str | None = None; created_at: datetime | None = None
    model_config = {"from_attributes": True}
class ReceiptResponse(BaseModel):
    id: int; school_id: int; receipt_number: str; payment_id: int; student_id: int; amount: Decimal; status: str; issued_by: str | None = None; issued_at: datetime | None = None
    model_config = {"from_attributes": True}
class PaymentReversalRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
class StudentBalance(BaseModel):
    student_id: int; student_name: str; total_invoiced: Decimal; total_paid: Decimal; balance: Decimal
class FinanceOverview(BaseModel):
    total_invoiced: Decimal; total_collected: Decimal; total_outstanding: Decimal; invoices_count: int; paid_count: int; pending_count: int
class PaymentDecodeRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
class PaymentDecodeResponse(BaseModel):
    amount: Decimal | None = None; external_reference: str | None = None; student_identifier: str | None = None; received_at: datetime | None = None; account_name: str | None = None; bank: str | None = None; payment_channel: str | None = None; raw_message: str
class PaymentInboxCreate(BaseModel):
    source: str = Field(min_length=1, max_length=30); raw_message: str = Field(min_length=1, max_length=10000); source_account: str | None = None; account_name: str | None = None; amount: Decimal | None = Field(default=None, gt=0); external_reference: str | None = None; student_identifier: str | None = None; received_at: datetime | None = None; payment_channel: str | None = None
class PaymentInboxPostRequest(BaseModel):
    invoice_id: int | None = None; reason: str | None = Field(default=None, max_length=500)
class PaymentInboxResponse(BaseModel):
    id: int; school_id: int; source: str; source_account: str | None = None; account_name: str | None = None; raw_message: str; amount: Decimal; external_reference: str; student_identifier: str | None = None; received_at: datetime; payment_channel: str | None = None; matched_student_id: int | None = None; match_method: str | None = None; match_confidence: Decimal | None = None; status: str; duplicate_of: int | None = None; posted_payment_id: int | None = None; posted_at: datetime | None = None; reviewed_by: str | None = None; reviewed_at: datetime | None = None; notes: str | None = None; created_at: datetime | None = None
    model_config = {"from_attributes": True}
