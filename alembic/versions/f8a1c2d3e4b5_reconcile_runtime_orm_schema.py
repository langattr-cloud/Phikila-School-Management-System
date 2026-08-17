"""Reconcile runtime ORM fields with the deployed Supabase schema.

This migration is additive and preserves existing data. School-owned fields
are intentionally not assigned a synthetic tenant ID: legacy NULL values are
backfilled only when the database contains exactly one school. With multiple
schools, ambiguous legacy records stop the migration and require explicit
mapping before retrying.
"""

from alembic import op
import sqlalchemy as sa

revision = "f8a1c2d3e4b5"
down_revision = "d9f4c7b1e2a3"
branch_labels = None
depends_on = None


SCHOOL_OWNED_COLUMNS = (
    ("academic_years", "school_id"),
    ("terms", "school_id"),
    ("levels", "school_id"),
    ("student_invoices", "school_id"),
    ("finance_receipts", "school_id"),
    ("finance_journals", "school_id"),
    ("chart_of_accounts", "school_id"),
    ("payment_inbox", "school_id"),
)


def _add(table: str, column: sa.Column) -> None:
    inspector = sa.inspect(op.get_bind())
    if column.name not in {c["name"] for c in inspector.get_columns(table)}:
        op.add_column(table, column)


def _remove_school_default(table: str) -> None:
    """Ensure reconciliation never installs a synthetic tenant default."""
    inspector = sa.inspect(op.get_bind())
    if "school_id" in {c["name"] for c in inspector.get_columns(table)}:
        op.alter_column(
            table,
            "school_id",
            existing_type=sa.BigInteger() if table in {"academic_years", "terms", "levels", "chart_of_accounts"} else sa.Integer(),
            server_default=None,
        )


def _backfill_school_ids(bind) -> None:
    """Backfill NULL school IDs only when the mapping is unambiguous."""
    school_count = bind.execute(sa.text("SELECT COUNT(*) FROM school_info")).scalar_one()

    unresolved = []
    for table, column in SCHOOL_OWNED_COLUMNS:
        count = bind.execute(
            sa.text(f"SELECT COUNT(*) FROM {table} WHERE {column} IS NULL")
        ).scalar_one()
        if count:
            unresolved.append((table, count))

    if not unresolved:
        return

    if school_count == 1:
        school_id = bind.execute(sa.text("SELECT id FROM school_info LIMIT 1")).scalar_one()
        for table, _ in unresolved:
            bind.execute(
                sa.text(f"UPDATE {table} SET school_id = :school_id WHERE school_id IS NULL"),
                {"school_id": school_id},
            )
        return

    if school_count == 0:
        details = ", ".join(f"{table} ({count} records)" for table, count in unresolved)
        raise RuntimeError(
            "Cannot reconcile school-owned records because school_info contains no schools. "
            f"The following records require an explicit school ID before migration can continue: {details}. "
            "Create/map the appropriate school records, then rerun the migration."
        )

    details = ", ".join(f"{table} ({count} records)" for table, count in unresolved)
    raise RuntimeError(
        "Cannot reconcile NULL school_id values because school_info contains multiple schools. "
        f"The following records require explicit school mapping: {details}. "
        "Assign the correct school_id to each record, then rerun the migration."
    )


def upgrade() -> None:
    _add("tt_audit", sa.Column("before", sa.JSON(), nullable=True))
    _add("tt_audit", sa.Column("after", sa.JSON(), nullable=True))
    _add("academic_years", sa.Column("school_id", sa.BigInteger(), nullable=True))
    _add("terms", sa.Column("academic_year_id", sa.BigInteger(), server_default="1", nullable=True))
    _add("terms", sa.Column("school_id", sa.BigInteger(), nullable=True))
    _add("levels", sa.Column("school_id", sa.BigInteger(), nullable=True))
    _add("tt_teachers", sa.Column("code", sa.String(30), server_default="", nullable=True))
    _add("tt_versions", sa.Column("number", sa.Integer(), server_default="0", nullable=True))
    _add("student_invoices", sa.Column("school_id", sa.Integer(), nullable=True))
    _add("student_invoices", sa.Column("balance", sa.Numeric(12, 2), server_default="0", nullable=True))
    _add("finance_receipts", sa.Column("school_id", sa.Integer(), nullable=True))
    _add("finance_receipts", sa.Column("status", sa.String(20), server_default="ISSUED", nullable=True))
    _add("finance_receipts", sa.Column("issued_by", sa.String(64), nullable=True))
    _add("chart_of_accounts", sa.Column("school_id", sa.BigInteger(), nullable=True))
    _add("chart_of_accounts", sa.Column("parent_id", sa.BigInteger(), nullable=True))
    _add("chart_of_accounts", sa.Column("is_active", sa.Integer(), server_default="1", nullable=True))
    _add("finance_journals", sa.Column("school_id", sa.Integer(), nullable=True))
    _add("finance_journals", sa.Column("journal_number", sa.String(50), nullable=True))
    _add("payment_inbox", sa.Column("school_id", sa.Integer(), nullable=True))
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

    for table in {
        "academic_years",
        "terms",
        "levels",
        "student_invoices",
        "finance_receipts",
        "finance_journals",
        "chart_of_accounts",
        "payment_inbox",
    }:
        _remove_school_default(table)

    _backfill_school_ids(bind)

    bind.execute(sa.text("UPDATE terms SET academic_year_id=year_id WHERE academic_year_id IS NULL"))
    bind.execute(sa.text("UPDATE tt_teachers SET code='T' || id::text WHERE code IS NULL OR code=''"))
    bind.execute(sa.text("UPDATE tt_versions SET number=id WHERE number IS NULL OR number=0"))
    bind.execute(sa.text("UPDATE student_invoices SET balance=amount WHERE balance IS NULL"))
    bind.execute(sa.text("UPDATE finance_journals SET journal_number='JRN-' || id::text WHERE journal_number IS NULL OR journal_number=''"))
    bind.execute(sa.text("UPDATE chart_of_accounts SET is_active=1 WHERE is_active IS NULL"))
    bind.execute(sa.text("UPDATE payment_inbox SET raw_message=COALESCE(raw_message,narration,'') WHERE raw_message IS NULL"))
    bind.execute(sa.text("UPDATE payment_inbox SET external_reference=COALESCE(external_reference,transaction_id,'') WHERE external_reference IS NULL"))
    bind.execute(sa.text("UPDATE payment_inbox SET received_at=COALESCE(received_at,created_at,now()) WHERE received_at IS NULL"))


def downgrade() -> None:
    """Intentionally non-destructive for this production reconciliation.

    This revision can reconcile columns that already existed in production, so
    dropping them on downgrade could destroy pre-existing application data.
    There is therefore no safe generic downgrade; restore the prior schema
    explicitly if a rollback is required.
    """
    pass
