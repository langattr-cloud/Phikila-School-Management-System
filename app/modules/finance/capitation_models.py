"""Government capitation configuration and transaction models.

Vote-head labels and allocations are persisted reference data, not application constants.
"""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class CapitationTemplate(Base):
    __tablename__ = "finance_capitation_templates"
    __table_args__ = (UniqueConstraint("school_id", "name", "version", name="uq_capitation_template_version"),)
    id = Column(Integer, primary_key=True)
    school_id = Column(Integer, nullable=False, index=True)
    name = Column(String(160), nullable=False)
    school_type = Column(String(60), nullable=False)
    programme = Column(String(160), nullable=False)
    source_circular = Column(String(250), nullable=False)
    source_url = Column(Text)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False, default="DRAFT")
    notes = Column(Text)
    created_by = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CapitationVoteHead(Base):
    __tablename__ = "finance_capitation_vote_heads"
    __table_args__ = (UniqueConstraint("school_id", "template_id", "code", name="uq_capitation_vote_head_code"),)
    id = Column(Integer, primary_key=True)
    school_id = Column(Integer, nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("finance_capitation_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(60), nullable=False)
    name = Column(String(180), nullable=False)
    description = Column(Text)
    parent_id = Column(Integer, ForeignKey("finance_capitation_vote_heads.id"))
    permitted_amount = Column(Numeric(14, 2))
    per_learner_rate = Column(Numeric(12, 2))
    display_order = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CapitationReceipt(Base):
    __tablename__ = "finance_capitation_receipts"
    __table_args__ = (UniqueConstraint("school_id", "reference_number", name="uq_capitation_receipt_reference"),)
    id = Column(Integer, primary_key=True)
    school_id = Column(Integer, nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("finance_capitation_templates.id"), nullable=False, index=True)
    academic_year_id = Column(Integer)
    term_id = Column(Integer)
    funding_period = Column(String(80), nullable=False)
    agency = Column(String(180), nullable=False, default="Ministry of Education")
    received_date = Column(Date, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    bank_account_id = Column(Integer, ForeignKey("finance_bank_accounts.id"))
    bank_account_name = Column(String(180))
    reference_number = Column(String(120), nullable=False)
    allocation_notice = Column(String(250))
    supporting_document_url = Column(Text)
    notes = Column(Text)
    status = Column(String(20), nullable=False, default="POSTED")
    created_by = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CapitationAllocation(Base):
    __tablename__ = "finance_capitation_allocations"
    __table_args__ = (UniqueConstraint("school_id", "receipt_id", "vote_head_id", name="uq_capitation_receipt_vote_head"),)
    id = Column(Integer, primary_key=True)
    school_id = Column(Integer, nullable=False, index=True)
    receipt_id = Column(Integer, ForeignKey("finance_capitation_receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    vote_head_id = Column(Integer, ForeignKey("finance_capitation_vote_heads.id"), nullable=False, index=True)
    allocated_amount = Column(Numeric(14, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CapitationExpenditure(Base):
    __tablename__ = "finance_capitation_expenditure"
    __table_args__ = (UniqueConstraint("school_id", "expenditure_reference", name="uq_capitation_expenditure_reference"),)
    id = Column(Integer, primary_key=True)
    school_id = Column(Integer, nullable=False, index=True)
    receipt_id = Column(Integer, ForeignKey("finance_capitation_receipts.id"), nullable=False, index=True)
    vote_head_id = Column(Integer, ForeignKey("finance_capitation_vote_heads.id"), nullable=False, index=True)
    expenditure_date = Column(Date, nullable=False)
    payee = Column(String(180), nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    expenditure_reference = Column(String(120), nullable=False)
    supplier_invoice_reference = Column(String(120))
    supporting_document_url = Column(Text)
    status = Column(String(20), nullable=False, default="POSTED")
    recorded_by = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
