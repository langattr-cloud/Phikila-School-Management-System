"""Add configurable government capitation templates, receipts and expenditure.

Vote-head names and allocations are data maintained against each approved circular.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261014capitation"
down_revision = "20261014suppliercontact"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "finance_capitation_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("school_type", sa.String(60), nullable=False),
        sa.Column("programme", sa.String(160), nullable=False),
        sa.Column("source_circular", sa.String(250), nullable=False),
        sa.Column("source_url", sa.Text()),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "name", "version", name="uq_capitation_template_version"),
    )
    op.create_table(
        "finance_capitation_vote_heads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("finance_capitation_templates.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("code", sa.String(60), nullable=False),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("finance_capitation_vote_heads.id")),
        sa.Column("permitted_amount", sa.Numeric(14, 2)),
        sa.Column("per_learner_rate", sa.Numeric(12, 2)),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "template_id", "code", name="uq_capitation_vote_head_code"),
    )
    op.create_table(
        "finance_capitation_receipts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("finance_capitation_templates.id"), nullable=False, index=True),
        sa.Column("academic_year_id", sa.Integer()),
        sa.Column("term_id", sa.Integer()),
        sa.Column("funding_period", sa.String(80), nullable=False),
        sa.Column("agency", sa.String(180), nullable=False, server_default="Ministry of Education"),
        sa.Column("received_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("bank_account_id", sa.Integer(), sa.ForeignKey("finance_bank_accounts.id")),
        sa.Column("bank_account_name", sa.String(180)),
        sa.Column("reference_number", sa.String(120), nullable=False),
        sa.Column("allocation_notice", sa.String(250)),
        sa.Column("supporting_document_url", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("status", sa.String(20), nullable=False, server_default="POSTED"),
        sa.Column("created_by", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "reference_number", name="uq_capitation_receipt_reference"),
    )
    op.create_table(
        "finance_capitation_allocations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("receipt_id", sa.Integer(), sa.ForeignKey("finance_capitation_receipts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("vote_head_id", sa.Integer(), sa.ForeignKey("finance_capitation_vote_heads.id"), nullable=False, index=True),
        sa.Column("allocated_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "receipt_id", "vote_head_id", name="uq_capitation_receipt_vote_head"),
    )
    op.create_table(
        "finance_capitation_expenditure",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("receipt_id", sa.Integer(), sa.ForeignKey("finance_capitation_receipts.id"), nullable=False, index=True),
        sa.Column("vote_head_id", sa.Integer(), sa.ForeignKey("finance_capitation_vote_heads.id"), nullable=False, index=True),
        sa.Column("expenditure_date", sa.Date(), nullable=False),
        sa.Column("payee", sa.String(180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("expenditure_reference", sa.String(120), nullable=False),
        sa.Column("supplier_invoice_reference", sa.String(120)),
        sa.Column("supporting_document_url", sa.Text()),
        sa.Column("status", sa.String(20), nullable=False, server_default="POSTED"),
        sa.Column("recorded_by", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "expenditure_reference", name="uq_capitation_expenditure_reference"),
    )


def downgrade() -> None:
    op.drop_table("finance_capitation_expenditure")
    op.drop_table("finance_capitation_allocations")
    op.drop_table("finance_capitation_receipts")
    op.drop_table("finance_capitation_vote_heads")
    op.drop_table("finance_capitation_templates")
