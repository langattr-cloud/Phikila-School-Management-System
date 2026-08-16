"""Configurable Finance posting account mappings."""
from alembic import op
import sqlalchemy as sa

revision = "f2b8c1d4e6a7"
down_revision = "e7c1f4a9b2d6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "finance_account_mappings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("mapping_key", sa.String(60), nullable=False),
        sa.Column("debit_account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id"), nullable=True),
        sa.Column("credit_account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "mapping_key", name="uq_finance_account_mapping"),
    )
    op.create_index("ix_finance_account_mapping_school_key", "finance_account_mappings", ["school_id", "mapping_key"])


def downgrade():
    op.drop_index("ix_finance_account_mapping_school_key", table_name="finance_account_mappings")
    op.drop_table("finance_account_mappings")
