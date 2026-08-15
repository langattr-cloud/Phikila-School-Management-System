"""Finance models — school-scoped, Decimal-safe, auditable."""

from __future__ import annotations

from decimal import Decimal
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
    status = Column(String(20), default="pending")  # pending, partial, paid, overdue
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
    payment_method = Column(String(30))  # cash, bank, mobile, cheque
    reference_number = Column(String(100))
    notes = Column(Text)
    received_by = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    invoice = relationship("StudentInvoice", back_populates="payments")
