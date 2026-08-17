"""Complete Finance payment posting, receipts and reversals."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "ab4d9e7c2f10"
down_revision = "f2b8c1d4e6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "payments" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("payments")}
    if "status" not in columns:
        op.add_column("payments", sa.Column("status", sa.String(20), nullable=False, server_default="POSTED"))
    if "journal_id" not in columns:
        op.add_column("payments", sa.Column("journal_id", sa.BigInteger(), sa.ForeignKey("finance_journals.id")))
    if "reversed_at" not in columns:
        op.add_column("payments", sa.Column("reversed_at", sa.DateTime(timezone=True)))
    if "reversal_reason" not in columns:
        op.add_column("payments", sa.Column("reversal_reason", sa.Text()))

    indexes = {i["name"] for i in inspect(bind).get_indexes("payments")}
    if "ix_payments_status" not in indexes:
        op.create_index("ix_payments_status", "payments", ["status"])
    if "ix_payments_journal_id" not in indexes:
        op.create_index("ix_payments_journal_id", "payments", ["journal_id"])


def downgrade() -> None:
    pass
