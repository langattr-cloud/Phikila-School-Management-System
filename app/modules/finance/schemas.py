"""Finance schemas."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class FeeStructureCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    academic_year_id: int | None = None
    term_id: int | None = None
    level_id: int | None = None
    amount: Decimal = Field(ge=0)
    currency: str = "KES"


class FeeStructureResponse(BaseModel):
    id: int
    school_id: int
    name: str
    description: str | None = None
    academic_year_id: int | None = None
    term_id: int | None = None
    level_id: int | None = None
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
    model_config = {"from_attributes": True}


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
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


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
