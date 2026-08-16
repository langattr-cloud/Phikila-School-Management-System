from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class FinanceAccountMapping(Base):
    __tablename__ = "finance_account_mappings"
    __table_args__ = (UniqueConstraint("school_id", "mapping_key", name="uq_finance_account_mapping"), {"extend_existing": True})
    id = Column(Integer, primary_key=True)
    school_id = Column(Integer, nullable=False, index=True)
    mapping_key = Column(String(60), nullable=False)
    debit_account_id = Column(Integer, ForeignKey("chart_of_accounts.id"))
    credit_account_id = Column(Integer, ForeignKey("chart_of_accounts.id"))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
