"""Reconcile runtime ORM fields with the deployed Supabase schema.

This migration is additive and preserves existing data. It records the
production schema reconciliation that was applied after the ORM advanced
beyond the original bootstrap schema.
"""

from alembic import op
import sqlalchemy as sa

revision = "f8a1c2d3e4b5"
down_revision = "d9f4c7b1e2a3"
branch_labels = None
depends_on = None


def _add(table: str, column: sa.Column) -> None:
    inspector = sa.inspect(op.get_bind())
    if column.name not in {c["name"] for c in inspector.get_columns(table)}:
        op.add_column(table, column)


def upgrade() -> None:
    _add("tt_audit", sa.Column("before", sa.JSON(), nullable=True))
    _add("tt_audit", sa.Column("after", sa.JSON(), nullable=True))
    _add("academic_years", sa.Column("school_id", sa.BigInteger(), server_default="1", nullable=True))
    _add("terms", sa.Column("academic_year_id", sa.BigInteger(), server_default="1", nullable=True))
    _add("terms", sa.Column("school_id", sa.BigInteger(), server_default="1", nullable=True))
    _add("levels", sa.Column("school_id", sa.BigInteger(), server_default="1", nullable=True))
    _add("tt_teachers", sa.Column("code", sa.String(30), server_default="", nullable=True))
    _add("tt_versions", sa.Column("number", sa.Integer(), server_default="0", nullable=True))
    _add("student_invoices", sa.Column("school_id", sa.Integer(), server_default="1", nullable=True))
    _add("student_invoices", sa.Column("balance", sa.Numeric(12, 2), server_default="0", nullable=True))
    _add("finance_receipts", sa.Column("school_id", sa.Integer(), server_default="1", nullable=True))
    _add("finance_receipts", sa.Column("status", sa.String(20), server_default="ISSUED", nullable=True))
    _add("finance_receipts", sa.Column("issued_by", sa.String(64), nullable=True))
    _add("chart_of_accounts", sa.Column("school_id", sa.BigInteger(), server_default="1", nullable=True))
    _add("chart_of_accounts", sa.Column("parent_id", sa.BigInteger(), nullable=True))
    _add("chart_of_accounts", sa.Column("is_active", sa.Integer(), server_default="1", nullable=True))
    _add("finance_journals", sa.Column("school_id", sa.Integer(), server_default="1", nullable=True))
    _add("finance_journals", sa.Column("journal_number", sa.String(50), nullable=True))
    _add("payment_inbox", sa.Column("school_id", sa.Integer(), server_default="1", nullable=True))
    _add("payment_inbox", sa.Column("source_account", sa.String(100), nullable=True))
    _add("payment_inbox", sa.Column("account_name", sa.String(200), nullable=True))
    _add("payment_inbox", sa.Column("raw_message", sa.Text(), nullable=True))
    _add("payment_inbox", sa.Column("external_reference", sa.String(100), nullable=True))
    _add("payment_inbox", sa.Column("student_identifier", sa.String(50), nullable=True))
    _add("payment_inbox", sa.Column("payment_channel", sa.String(50), nullable=True))
    _add("payment_inbox", sa.Column("matched_student_id", sa.Integer(), nullable=True))
    _add("payment_inbox", sa.Column("match_method", sa.String(50), nullable=True))
    _add("payment_inbox", sa.Column("match_confidence", sa.Numeric(5, 2), nullable=True))
    _add("payment_inbox", sa.Column("duplicate_of", sa.BigInteger(), nullable=True))
    _add("payment_inbox", sa.Column("posted_payment_id", sa.BigInteger(), nullable=True))
    _add("payment_inbox", sa.Column("notes", sa.Text(), nullable=True))
    _add("payment_inbox", sa.Column("reviewed_by", sa.String(64), nullable=True))
    _add("payment_inbox", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    _add("payment_inbox", sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True))

    bind = op.get_bind()
    bind.execute(sa.text("UPDATE academic_years SET school_id=1 WHERE school_id IS NULL"))
    bind.execute(sa.text("UPDATE terms SET school_id=1 WHERE school_id IS NULL"))
    bind.execute(sa.text("UPDATE terms SET academic_year_id=year_id WHERE academic_year_id IS NULL"))
    bind.execute(sa.text("UPDATE levels SET school_id=1 WHERE school_id IS NULL"))
    bind.execute(sa.text("UPDATE tt_teachers SET code='T' || id::text WHERE code IS NULL OR code=''"))
    bind.execute(sa.text("UPDATE tt_versions SET number=id WHERE number IS NULL OR number=0"))
    bind.execute(sa.text("UPDATE student_invoices SET school_id=1 WHERE school_id IS NULL"))
    bind.execute(sa.text("UPDATE student_invoices SET balance=amount WHERE balance IS NULL"))
    bind.execute(sa.text("UPDATE finance_receipts SET school_id=1 WHERE school_id IS NULL"))
    bind.execute(sa.text("UPDATE finance_journals SET school_id=1 WHERE school_id IS NULL"))
    bind.execute(sa.text("UPDATE finance_journals SET journal_number='JRN-' || id::text WHERE journal_number IS NULL OR journal_number=''"))
    bind.execute(sa.text("UPDATE chart_of_accounts SET school_id=1 WHERE school_id IS NULL"))
    bind.execute(sa.text("UPDATE chart_of_accounts SET is_active=1 WHERE is_active IS NULL"))
    bind.execute(sa.text("UPDATE payment_inbox SET school_id=1 WHERE school_id IS NULL"))
    bind.execute(sa.text("UPDATE payment_inbox SET raw_message=COALESCE(raw_message,narration,'') WHERE raw_message IS NULL"))
    bind.execute(sa.text("UPDATE payment_inbox SET external_reference=COALESCE(external_reference,transaction_id,'') WHERE external_reference IS NULL"))
    bind.execute(sa.text("UPDATE payment_inbox SET received_at=COALESCE(received_at,created_at,now()) WHERE received_at IS NULL"))


def downgrade() -> None:
    pass
