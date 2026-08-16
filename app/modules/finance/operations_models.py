"""ORM models for additive Finance operations tables."""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base

class FinanceFiscalPeriod(Base):
    __tablename__ = "finance_fiscal_periods"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); name=Column(String(100),nullable=False); academic_year_id=Column(Integer); term_id=Column(Integer); start_date=Column(Date,nullable=False); end_date=Column(Date,nullable=False); status=Column(String(20),nullable=False,default="open"); created_at=Column(DateTime(timezone=True),server_default=func.now())
    __table_args__=(UniqueConstraint("school_id","name",name="uq_finance_fiscal_period"),)
class FinanceBankAccount(Base):
    __tablename__="finance_bank_accounts"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); bank_name=Column(String(120),nullable=False); branch_name=Column(String(120)); account_name=Column(String(200),nullable=False); account_identifier=Column(String(100),nullable=False); currency=Column(String(3),default="KES",nullable=False); opening_balance=Column(Numeric(14,2),default=0,nullable=False); status=Column(String(20),default="active",nullable=False); created_at=Column(DateTime(timezone=True),server_default=func.now())
    __table_args__=(UniqueConstraint("school_id","account_identifier",name="uq_finance_bank_account"),)
class FinanceCashBook(Base):
    __tablename__="finance_cash_books"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); name=Column(String(120),nullable=False); book_type=Column(String(30),nullable=False); bank_account_id=Column(Integer,ForeignKey("finance_bank_accounts.id")); opening_balance=Column(Numeric(14,2),default=0,nullable=False); status=Column(String(20),default="active",nullable=False)
class FinanceCashBookEntry(Base):
    __tablename__="finance_cash_book_entries"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); cash_book_id=Column(Integer,ForeignKey("finance_cash_books.id"),index=True,nullable=False); entry_date=Column(DateTime(timezone=True),nullable=False); entry_type=Column(String(20),nullable=False); amount=Column(Numeric(14,2),nullable=False); reference=Column(String(100)); description=Column(Text); source_entity=Column(String(60)); source_id=Column(Integer); created_by=Column(String(64)); created_at=Column(DateTime(timezone=True),server_default=func.now())
class FinanceBankTransaction(Base):
    __tablename__="finance_bank_transactions"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); bank_account_id=Column(Integer,ForeignKey("finance_bank_accounts.id"),index=True,nullable=False); transaction_date=Column(DateTime(timezone=True),nullable=False); value_date=Column(DateTime(timezone=True)); amount=Column(Numeric(14,2),nullable=False); transaction_type=Column(String(20),nullable=False); external_reference=Column(String(100)); description=Column(Text); status=Column(String(30),default="UNMATCHED",nullable=False); source=Column(String(30)); raw_data=Column(Text); matched_entity=Column(String(60)); matched_id=Column(Integer); created_at=Column(DateTime(timezone=True),server_default=func.now())
    __table_args__=(UniqueConstraint("school_id","bank_account_id","external_reference",name="uq_finance_bank_transaction_ref"),)
class FinanceBankReconciliation(Base):
    __tablename__="finance_bank_reconciliations"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); bank_account_id=Column(Integer,ForeignKey("finance_bank_accounts.id"),nullable=False); statement_date=Column(Date,nullable=False); statement_balance=Column(Numeric(14,2),nullable=False); book_balance=Column(Numeric(14,2),nullable=False); difference=Column(Numeric(14,2),nullable=False); status=Column(String(20),default="OPEN",nullable=False); reconciled_by=Column(String(64)); reconciled_at=Column(DateTime(timezone=True)); notes=Column(Text)
class FinanceBudget(Base):
    __tablename__="finance_budgets"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); name=Column(String(150),nullable=False); fiscal_period_id=Column(Integer,ForeignKey("finance_fiscal_periods.id")); total_amount=Column(Numeric(14,2),default=0,nullable=False); status=Column(String(20),default="DRAFT",nullable=False); approved_by=Column(String(64)); approved_at=Column(DateTime(timezone=True)); created_at=Column(DateTime(timezone=True),server_default=func.now())
class FinanceBudgetLine(Base):
    __tablename__="finance_budget_lines"
    id=Column(Integer,primary_key=True); budget_id=Column(Integer,ForeignKey("finance_budgets.id",ondelete="CASCADE"),index=True,nullable=False); account_id=Column(Integer,ForeignKey("chart_of_accounts.id"),index=True,nullable=False); budget_amount=Column(Numeric(14,2),nullable=False); revised_amount=Column(Numeric(14,2),default=0,nullable=False); committed_amount=Column(Numeric(14,2),default=0,nullable=False); actual_amount=Column(Numeric(14,2),default=0,nullable=False)
class FinancePaymentVoucher(Base):
    __tablename__="finance_payment_vouchers"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); voucher_number=Column(String(60),nullable=False); payee=Column(String(200),nullable=False); amount=Column(Numeric(14,2),nullable=False); description=Column(Text,nullable=False); invoice_reference=Column(String(100)); lpo_reference=Column(String(100)); status=Column(String(30),default="REQUESTED",nullable=False); requested_by=Column(String(64)); paid_at=Column(DateTime(timezone=True)); created_at=Column(DateTime(timezone=True),server_default=func.now())
    __table_args__=(UniqueConstraint("school_id","voucher_number",name="uq_finance_voucher_number"),)
class FinanceApproval(Base):
    __tablename__="finance_approvals"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); entity_type=Column(String(50),nullable=False); entity_id=Column(Integer,index=True,nullable=False); sequence=Column(Integer,nullable=False); required_role=Column(String(50),nullable=False); approver=Column(String(64)); decision=Column(String(20),default="PENDING",nullable=False); amount_threshold=Column(Numeric(14,2)); reason=Column(Text); decided_at=Column(DateTime(timezone=True))
class FinanceImprest(Base):
    __tablename__="finance_imprests"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); applicant=Column(String(64),nullable=False); purpose=Column(Text,nullable=False); amount=Column(Numeric(14,2),nullable=False); issued_amount=Column(Numeric(14,2),default=0,nullable=False); spent_amount=Column(Numeric(14,2),default=0,nullable=False); returned_amount=Column(Numeric(14,2),default=0,nullable=False); due_date=Column(Date); status=Column(String(30),default="REQUESTED",nullable=False); created_at=Column(DateTime(timezone=True),server_default=func.now())
class FinanceSupplier(Base):
    __tablename__="finance_suppliers"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); name=Column(String(200),nullable=False); contact=Column(String(120)); tax_identifier=Column(String(80)); bank_details=Column(Text); payment_terms=Column(String(100)); status=Column(String(20),default="active",nullable=False); created_at=Column(DateTime(timezone=True),server_default=func.now())
class FinancePurchaseOrder(Base):
    __tablename__="finance_purchase_orders"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); po_number=Column(String(60),nullable=False); supplier_id=Column(Integer,ForeignKey("finance_suppliers.id")); amount=Column(Numeric(14,2),nullable=False); status=Column(String(30),default="DRAFT",nullable=False); created_at=Column(DateTime(timezone=True),server_default=func.now())
    __table_args__=(UniqueConstraint("school_id","po_number",name="uq_finance_po_number"),)
class FinanceGrn(Base):
    __tablename__="finance_grns"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); grn_number=Column(String(60),nullable=False); purchase_order_id=Column(Integer,ForeignKey("finance_purchase_orders.id")); received_date=Column(Date,nullable=False); received_by=Column(String(64)); status=Column(String(20),default="RECEIVED",nullable=False)
    __table_args__=(UniqueConstraint("school_id","grn_number",name="uq_finance_grn_number"),)
class FinanceAsset(Base):
    __tablename__="finance_assets"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); asset_number=Column(String(60),nullable=False); category=Column(String(100),nullable=False); description=Column(Text,nullable=False); purchase_date=Column(Date); cost=Column(Numeric(14,2),nullable=False); supplier_id=Column(Integer,ForeignKey("finance_suppliers.id")); location=Column(String(150)); responsible_department=Column(String(120)); serial_number=Column(String(120)); asset_tag=Column(String(120)); useful_life_months=Column(Integer); depreciation=Column(Numeric(14,2),default=0,nullable=False); book_value=Column(Numeric(14,2),nullable=False); status=Column(String(30),default="ACTIVE",nullable=False)
    __table_args__=(UniqueConstraint("school_id","asset_number",name="uq_finance_asset_number"),)
class FinanceCapitationRecord(Base):
    __tablename__="finance_capitation_records"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); academic_year_id=Column(Integer); term_id=Column(Integer); expected_amount=Column(Numeric(14,2),default=0,nullable=False); received_amount=Column(Numeric(14,2),default=0,nullable=False); received_date=Column(Date); allocation=Column(Text); spent_amount=Column(Numeric(14,2),default=0,nullable=False); balance=Column(Numeric(14,2),default=0,nullable=False); reporting_status=Column(String(30),default="OPEN",nullable=False); supporting_documents=Column(Text)
class FinanceOtherIncome(Base):
    __tablename__="finance_other_income"
    id=Column(Integer,primary_key=True); school_id=Column(Integer,index=True,nullable=False); income_type=Column(String(80),nullable=False); description=Column(Text); amount=Column(Numeric(14,2),nullable=False); received_date=Column(DateTime(timezone=True),nullable=False); reference=Column(String(100)); account_id=Column(Integer,ForeignKey("chart_of_accounts.id")); created_by=Column(String(64)); created_at=Column(DateTime(timezone=True),server_default=func.now())
