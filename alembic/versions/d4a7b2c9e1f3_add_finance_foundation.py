"""Add finance accounting foundation and payment inbox."""

from alembic import op
import sqlalchemy as sa

revision = "d4a7b2c9e1f3"
down_revision = "c2f8e9a1d6b4"
branch_labels = None
depends_on = None


def _table_exists(name):
    return name in sa.inspect(op.get_bind()).get_table_names()


def _index_exists(table, name):
    return name in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def _index(name, table, columns):
    if not _index_exists(table, name):
        op.create_index(name, table, columns)


def upgrade() -> None:
    if not _table_exists("chart_of_accounts"):
        op.create_table(
            "chart_of_accounts",
            sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False),
            sa.Column("parent_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id")), sa.Column("code", sa.String(30), nullable=False),
            sa.Column("name", sa.String(150), nullable=False), sa.Column("account_type", sa.String(30), nullable=False),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("school_id", "code", name="uq_finance_account_code"),
        )
    _index("ix_chart_of_accounts_school_id", "chart_of_accounts", ["school_id"])

    if not _table_exists("finance_journals"):
        op.create_table(
            "finance_journals",
            sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False), sa.Column("journal_number", sa.String(50), nullable=False),
            sa.Column("transaction_date", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("description", sa.Text(), nullable=False),
            sa.Column("reference", sa.String(100)), sa.Column("status", sa.String(20), server_default="posted"), sa.Column("created_by", sa.String(64)),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _index("ix_finance_journals_school_id", "finance_journals", ["school_id"])
    _index("ix_finance_journals_journal_number", "finance_journals", ["journal_number"])

    if not _table_exists("finance_journal_entries"):
        op.create_table(
            "finance_journal_entries",
            sa.Column("id", sa.Integer(), primary_key=True), sa.Column("journal_id", sa.Integer(), sa.ForeignKey("finance_journals.id", ondelete="CASCADE"), nullable=False),
            sa.Column("account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id"), nullable=False), sa.Column("debit", sa.Numeric(14, 2), nullable=False, server_default="0"),
            sa.Column("credit", sa.Numeric(14, 2), nullable=False, server_default="0"), sa.Column("description", sa.Text()),
        )
    _index("ix_finance_journal_entries_journal_id", "finance_journal_entries", ["journal_id"])
    _index("ix_finance_journal_entries_account_id", "finance_journal_entries", ["account_id"])

    # payment_inbox predates students_v2 in the Alembic graph. Keep the student
    # reference as an integer here; the student migration owns student FKs later.
    if not _table_exists("payment_inbox"):
        op.create_table(
            "payment_inbox",
            sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False), sa.Column("source", sa.String(30), nullable=False),
            sa.Column("source_account", sa.String(100)), sa.Column("account_name", sa.String(200)), sa.Column("raw_message", sa.Text(), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False), sa.Column("external_reference", sa.String(100), nullable=False), sa.Column("student_identifier", sa.String(50)),
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=False), sa.Column("payment_channel", sa.String(50)), sa.Column("matched_student_id", sa.Integer()),
            sa.Column("match_method", sa.String(50)), sa.Column("match_confidence", sa.Numeric(5, 2)), sa.Column("status", sa.String(30), nullable=False, server_default="RECEIVED"),
            sa.Column("duplicate_of", sa.Integer(), sa.ForeignKey("payment_inbox.id")), sa.Column("posted_payment_id", sa.Integer(), sa.ForeignKey("payments.id")),
            sa.Column("notes", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("reviewed_by", sa.String(64)),
            sa.Column("reviewed_at", sa.DateTime(timezone=True)), sa.Column("posted_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("school_id", "source", "external_reference", name="uq_payment_inbox_reference"),
        )
    for name, cols in {
        "ix_payment_inbox_school_id": ["school_id"], "ix_payment_inbox_student_identifier": ["student_identifier"],
        "ix_payment_inbox_matched_student_id": ["matched_student_id"], "ix_payment_inbox_status": ["status"], "ix_payment_inbox_posted_payment_id": ["posted_payment_id"],
    }.items():
        _index(name, "payment_inbox", cols)


def downgrade() -> None:
    pass
