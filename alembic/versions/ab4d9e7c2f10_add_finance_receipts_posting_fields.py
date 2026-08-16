"""Complete Finance payment posting, receipts and reversals."""
from alembic import op
import sqlalchemy as sa

revision = "ab4d9e7c2f10"
down_revision = "f2b8c1d4e6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("status", sa.String(20), nullable=False, server_default="POSTED"))
    op.add_column("payments", sa.Column("journal_id", sa.Integer(), sa.ForeignKey("finance_journals.id")))
    op.add_column("payments", sa.Column("reversed_at", sa.DateTime(timezone=True)))
    op.add_column("payments", sa.Column("reversal_reason", sa.Text()))
    op.create_index("ix_payments_status", "payments", ["status"])
    op.create_index("ix_payments_journal_id", "payments", ["journal_id"])


def downgrade() -> None:
    op.drop_index("ix_payments_journal_id", table_name="payments")
    op.drop_index("ix_payments_status", table_name="payments")
    op.drop_column("payments", "reversal_reason")
    op.drop_column("payments", "reversed_at")
    op.drop_column("payments", "journal_id")
    op.drop_column("payments", "status")
