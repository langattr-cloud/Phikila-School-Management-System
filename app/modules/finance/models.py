"""Finance models — school-scoped, Decimal-safe, auditable."""

from __future__ import annotations

from sqlalchemy import (
    Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class FeeStructure(Base):
    """Defines fees for an academic year/term/class/level."""
    __tablename__ = "fee_structures"
    __table_args__ = (
        UniqueConstraint("school_id", "name", "academic_year_id", name="uq_fee_structure"),
        {"extend_existing": True},
    )
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"))
    term_id = Column(Integer, ForeignKey("terms.id"))
    level_id = Column(Integer, ForeignKey("levels.id"))
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="KES")
    status = Column(String(20), default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    invoices = relationship("StudentInvoice", back_populates="fee_structure")


class StudentInvoice(Base):
    """An invoice for a student against a fee structure."""
    __tablename__ = "student_invoices"
    __table_args__ = (
        UniqueConstraint("school_id", "student_id", "fee_structure_id", name="uq_student_invoice"),
        {"extend_existing": True},
    )
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students_v2.id"), nullable=False, index=True)
    fee_structure_id = Column(Integer, ForeignKey("fee_structures.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    balance = Column(Numeric(12, 2), nullable=False)
    status = Column(String(20), default="pending")
    due_date = Column(DateTime)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    fee_structure = relationship("FeeStructure", back_populates="invoices")
    payments = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")


class Payment(Base):
    """A payment made against an invoice."""
    __tablename__ = "payments"
    __table_args__ = {"extend_existing": True}
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    invoice_id = Column(Integer, ForeignKey("student_invoices.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students_v2.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(30))
    reference_number = Column(String(100))
    notes = Column(Text)
    received_by = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    invoice = relationship("StudentInvoice", back_populates="payments")


class ChartOfAccount(Base):
    """Configurable chart of accounts / vote heads."""
    __tablename__ = "chart_of_accounts"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_finance_account_code"),
        {"extend_existing": True},
    )
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("chart_of_accounts.id"))
    code = Column(String(30), nullable=False)
    name = Column(String(150), nullable=False)
    account_type = Column(String(30), nullable=False)  # asset, liability, equity, income, expense
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Journal(Base):
    """Balanced accounting journal header."""
    __tablename__ = "finance_journals"
    __table_args__ = {"extend_existing": True}
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    journal_number = Column(String(50), nullable=False, index=True)
    transaction_date = Column(DateTime(timezone=True), server_default=func.now())
    description = Column(Text, nullable=False)
    reference = Column(String(100))
    status = Column(String(20), default="posted")
    created_by = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class JournalEntry(Base):
    """Individual debit/credit line in a journal."""
    __tablename__ = "finance_journal_entries"
    __table_args__ = {"extend_existing": True}
    id = Column(Integer, primary_key=True, index=True)
    journal_id = Column(Integer, ForeignKey("finance_journals.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("chart_of_accounts.id"), nullable=False, index=True)
    debit = Column(Numeric(14, 2), nullable=False, default=0)
    credit = Column(Numeric(14, 2), nullable=False, default=0)
    description = Column(Text)


class PaymentInbox(Base):
    """Normalized external payment awaiting matching/posting."""
    __tablename__ = "payment_inbox"
    __table_args__ = (
        UniqueConstraint("school_id", "source", "external_reference", name="uq_payment_inbox_reference"),
        {"extend_existing": True},
    )
    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    source = Column(String(30), nullable=False)  # mpesa, bank, sms, statement, api
    source_account = Column(String(100))
    account_name = Column(String(200))
    raw_message = Column(Text, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    external_reference = Column(String(100), nullable=False)
    student_identifier = Column(String(50), index=True)
    received_at = Column(DateTime(timezone=True), nullable=False)
    payment_channel = Column(String(50))
    matched_student_id = Column(Integer, ForeignKey("students_v2.id"), index=True)
    match_method = Column(String(50))
    match_confidence = Column(Numeric(5, 2))
    status = Column(String(30), default="RECEIVED", nullable=False, index=True)
    duplicate_of = Column(Integer, ForeignKey("payment_inbox.id"))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_by = Column(String(64))
    reviewed_at = Column(DateTime(timezone=True))
