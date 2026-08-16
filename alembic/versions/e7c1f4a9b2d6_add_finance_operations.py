"""Add Finance operations, treasury, procurement, budget and reporting tables.

This migration is additive and intentionally keeps the existing fee/payment/GL
foundation intact. All tables are school-scoped and preserve historical rows.
"""
from alembic import op
import sqlalchemy as sa

revision = "e7c1f4a9b2d6"
down_revision = "d4a7b2c9e1f3"
branch_labels = None
depends_on = None


def _table(name, *columns, constraints=()):
    op.create_table(name, *columns, *constraints)


def upgrade() -> None:
    _table("finance_fiscal_periods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False), sa.Column("academic_year_id", sa.Integer()),
        sa.Column("term_id", sa.Integer()), sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False), sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        constraints=[sa.UniqueConstraint("school_id", "name", name="uq_finance_fiscal_period")])

    _table("finance_bank_accounts",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("bank_name", sa.String(120), nullable=False), sa.Column("branch_name", sa.String(120)),
        sa.Column("account_name", sa.String(200), nullable=False), sa.Column("account_identifier", sa.String(100), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="KES"), sa.Column("opening_balance", sa.Numeric(14,2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        constraints=[sa.UniqueConstraint("school_id", "account_identifier", name="uq_finance_bank_account")])

    _table("finance_cash_books",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False), sa.Column("book_type", sa.String(30), nullable=False),
        sa.Column("bank_account_id", sa.Integer(), sa.ForeignKey("finance_bank_accounts.id")), sa.Column("opening_balance", sa.Numeric(14,2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"))

    _table("finance_cash_book_entries",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("cash_book_id", sa.Integer(), sa.ForeignKey("finance_cash_books.id"), nullable=False, index=True),
        sa.Column("entry_date", sa.DateTime(timezone=True), nullable=False), sa.Column("entry_type", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(14,2), nullable=False), sa.Column("reference", sa.String(100)), sa.Column("description", sa.Text()),
        sa.Column("source_entity", sa.String(60)), sa.Column("source_id", sa.Integer()), sa.Column("created_by", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))

    _table("finance_bank_transactions",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("bank_account_id", sa.Integer(), sa.ForeignKey("finance_bank_accounts.id"), nullable=False, index=True),
        sa.Column("transaction_date", sa.DateTime(timezone=True), nullable=False), sa.Column("value_date", sa.DateTime(timezone=True)),
        sa.Column("amount", sa.Numeric(14,2), nullable=False), sa.Column("transaction_type", sa.String(20), nullable=False),
        sa.Column("external_reference", sa.String(100)), sa.Column("description", sa.Text()), sa.Column("status", sa.String(30), nullable=False, server_default="UNMATCHED"),
        sa.Column("source", sa.String(30)), sa.Column("raw_data", sa.Text()), sa.Column("matched_entity", sa.String(60)), sa.Column("matched_id", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        constraints=[sa.UniqueConstraint("school_id", "bank_account_id", "external_reference", name="uq_finance_bank_transaction_ref")])

    _table("finance_bank_reconciliations",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("bank_account_id", sa.Integer(), sa.ForeignKey("finance_bank_accounts.id"), nullable=False),
        sa.Column("statement_date", sa.Date(), nullable=False), sa.Column("statement_balance", sa.Numeric(14,2), nullable=False),
        sa.Column("book_balance", sa.Numeric(14,2), nullable=False), sa.Column("difference", sa.Numeric(14,2), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="OPEN"), sa.Column("reconciled_by", sa.String(64)),
        sa.Column("reconciled_at", sa.DateTime(timezone=True)), sa.Column("notes", sa.Text()))

    _table("finance_budgets",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(150), nullable=False), sa.Column("fiscal_period_id", sa.Integer(), sa.ForeignKey("finance_fiscal_periods.id")),
        sa.Column("total_amount", sa.Numeric(14,2), nullable=False, server_default="0"), sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("approved_by", sa.String(64)), sa.Column("approved_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))

    _table("finance_budget_lines",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("budget_id", sa.Integer(), sa.ForeignKey("finance_budgets.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id"), nullable=False, index=True),
        sa.Column("budget_amount", sa.Numeric(14,2), nullable=False), sa.Column("revised_amount", sa.Numeric(14,2), nullable=False, server_default="0"),
        sa.Column("committed_amount", sa.Numeric(14,2), nullable=False, server_default="0"), sa.Column("actual_amount", sa.Numeric(14,2), nullable=False, server_default="0"))

    _table("finance_payment_vouchers",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("voucher_number", sa.String(60), nullable=False), sa.Column("payee", sa.String(200), nullable=False),
        sa.Column("amount", sa.Numeric(14,2), nullable=False), sa.Column("description", sa.Text(), nullable=False),
        sa.Column("invoice_reference", sa.String(100)), sa.Column("lpo_reference", sa.String(100)), sa.Column("status", sa.String(30), nullable=False, server_default="REQUESTED"),
        sa.Column("requested_by", sa.String(64)), sa.Column("paid_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        constraints=[sa.UniqueConstraint("school_id", "voucher_number", name="uq_finance_voucher_number")])

    _table("finance_approvals",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("entity_type", sa.String(50), nullable=False), sa.Column("entity_id", sa.Integer(), nullable=False, index=True),
        sa.Column("sequence", sa.Integer(), nullable=False), sa.Column("required_role", sa.String(50), nullable=False),
        sa.Column("approver", sa.String(64)), sa.Column("decision", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("amount_threshold", sa.Numeric(14,2)), sa.Column("reason", sa.Text()), sa.Column("decided_at", sa.DateTime(timezone=True)))

    _table("finance_imprests",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("applicant", sa.String(64), nullable=False), sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(14,2), nullable=False), sa.Column("issued_amount", sa.Numeric(14,2), nullable=False, server_default="0"),
        sa.Column("spent_amount", sa.Numeric(14,2), nullable=False, server_default="0"), sa.Column("returned_amount", sa.Numeric(14,2), nullable=False, server_default="0"),
        sa.Column("due_date", sa.Date()), sa.Column("status", sa.String(30), nullable=False, server_default="REQUESTED"), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))

    _table("finance_suppliers",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False), sa.Column("contact", sa.String(120)), sa.Column("tax_identifier", sa.String(80)),
        sa.Column("bank_details", sa.Text()), sa.Column("payment_terms", sa.String(100)), sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))

    _table("finance_purchase_orders",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("po_number", sa.String(60), nullable=False), sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("finance_suppliers.id")),
        sa.Column("amount", sa.Numeric(14,2), nullable=False), sa.Column("status", sa.String(30), nullable=False, server_default="DRAFT"), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        constraints=[sa.UniqueConstraint("school_id", "po_number", name="uq_finance_po_number")])

    _table("finance_grns",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("grn_number", sa.String(60), nullable=False), sa.Column("purchase_order_id", sa.Integer(), sa.ForeignKey("finance_purchase_orders.id")),
        sa.Column("received_date", sa.Date(), nullable=False), sa.Column("received_by", sa.String(64)), sa.Column("status", sa.String(20), nullable=False, server_default="RECEIVED"),
        constraints=[sa.UniqueConstraint("school_id", "grn_number", name="uq_finance_grn_number")])

    _table("finance_assets",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("asset_number", sa.String(60), nullable=False), sa.Column("category", sa.String(100), nullable=False), sa.Column("description", sa.Text(), nullable=False),
        sa.Column("purchase_date", sa.Date()), sa.Column("cost", sa.Numeric(14,2), nullable=False), sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("finance_suppliers.id")),
        sa.Column("location", sa.String(150)), sa.Column("responsible_department", sa.String(120)), sa.Column("serial_number", sa.String(120)), sa.Column("asset_tag", sa.String(120)),
        sa.Column("useful_life_months", sa.Integer()), sa.Column("depreciation", sa.Numeric(14,2), nullable=False, server_default="0"), sa.Column("book_value", sa.Numeric(14,2), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="ACTIVE"),
        constraints=[sa.UniqueConstraint("school_id", "asset_number", name="uq_finance_asset_number")])

    _table("finance_capitation_records",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("academic_year_id", sa.Integer()), sa.Column("term_id", sa.Integer()), sa.Column("expected_amount", sa.Numeric(14,2), nullable=False, server_default="0"),
        sa.Column("received_amount", sa.Numeric(14,2), nullable=False, server_default="0"), sa.Column("received_date", sa.Date()), sa.Column("allocation", sa.Text()),
        sa.Column("spent_amount", sa.Numeric(14,2), nullable=False, server_default="0"), sa.Column("balance", sa.Numeric(14,2), nullable=False, server_default="0"),
        sa.Column("reporting_status", sa.String(30), nullable=False, server_default="OPEN"), sa.Column("supporting_documents", sa.Text()))

    _table("finance_other_income",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("income_type", sa.String(80), nullable=False), sa.Column("description", sa.Text()), sa.Column("amount", sa.Numeric(14,2), nullable=False),
        sa.Column("received_date", sa.DateTime(timezone=True), nullable=False), sa.Column("reference", sa.String(100)), sa.Column("account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id")),
        sa.Column("created_by", sa.String(64)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))

    _table("finance_fee_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students_v2.id"), nullable=False, index=True), sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("student_invoices.id")),
        sa.Column("adjustment_type", sa.String(40), nullable=False), sa.Column("amount", sa.Numeric(14,2), nullable=False), sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("supporting_document", sa.Text()), sa.Column("requested_by", sa.String(64)), sa.Column("approved_by", sa.String(64)), sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("academic_year_id", sa.Integer()), sa.Column("term_id", sa.Integer()), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))

    _table("finance_receipts",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("receipt_number", sa.String(80), nullable=False), sa.Column("payment_id", sa.Integer(), sa.ForeignKey("payments.id"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students_v2.id"), nullable=False), sa.Column("amount", sa.Numeric(14,2), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="ISSUED"), sa.Column("issued_by", sa.String(64)), sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        constraints=[sa.UniqueConstraint("school_id", "receipt_number", name="uq_finance_receipt_number")])

    _table("finance_reporting_templates",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("report_type", sa.String(60), nullable=False), sa.Column("version", sa.String(30), nullable=False), sa.Column("template", sa.Text(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False), sa.Column("active", sa.Integer(), nullable=False, server_default="1"),
        constraints=[sa.UniqueConstraint("school_id", "report_type", "version", name="uq_finance_report_template")])


def downgrade() -> None:
    for name in [
        "finance_reporting_templates", "finance_receipts", "finance_fee_adjustments", "finance_other_income",
        "finance_capitation_records", "finance_assets", "finance_grns", "finance_purchase_orders", "finance_suppliers",
        "finance_imprests", "finance_approvals", "finance_payment_vouchers", "finance_budget_lines", "finance_budgets",
        "finance_bank_reconciliations", "finance_bank_transactions", "finance_cash_book_entries", "finance_cash_books",
        "finance_bank_accounts", "finance_fiscal_periods",
    ]:
        op.drop_table(name)
