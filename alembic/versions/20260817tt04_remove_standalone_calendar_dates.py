"""Remove standalone calendar dates and store timetable day snapshots.

Revision 20260817tt03 introduced concrete calendar dates. The feature is now
replaced by independent timetable configurations, so the old table is removed
without rewriting migration history.

This migration is intentionally idempotent for the timetable day columns:
some production databases already contain them from the later reconciliation
migration, while Alembic still needs to advance through this historical
revision.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260817tt04"
down_revision = "20260817tt03"
branch_labels = None
depends_on = None


def _columns(table: str):
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    columns = _columns("tt_versions")
    if "day_indexes" not in columns:
        op.add_column("tt_versions", sa.Column("day_indexes", sa.JSON(), nullable=True))
    if "day_names" not in columns:
        op.add_column("tt_versions", sa.Column("day_names", sa.JSON(), nullable=True))

    # Existing rows must have concrete values before enforcing NOT NULL.
    if "day_indexes" in columns or "day_indexes" not in columns:
        op.execute("UPDATE tt_versions SET day_indexes='[]' WHERE day_indexes IS NULL")
    if "day_names" in columns or "day_names" not in columns:
        op.execute("UPDATE tt_versions SET day_names='[]' WHERE day_names IS NULL")

    op.alter_column("tt_versions", "day_indexes", nullable=False)
    op.alter_column("tt_versions", "day_names", nullable=False)

    op.execute("DROP INDEX IF EXISTS public.ix_tt_calendar_dates_date")
    op.execute("DROP INDEX IF EXISTS public.ix_tt_calendar_dates_school_id")
    op.execute("DROP TABLE IF EXISTS public.tt_calendar_dates")


def downgrade():
    table_exists = op.get_bind().execute(
        sa.text("SELECT to_regclass('public.tt_calendar_dates')")
    ).scalar_one_or_none() is not None
    if not table_exists:
        op.create_table(
            "tt_calendar_dates",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("school_id", sa.Integer(), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("label", sa.String(length=120)),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("school_id", "date", name="uq_tt_calendar_date"),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tt_calendar_dates_school_id "
        "ON public.tt_calendar_dates (school_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tt_calendar_dates_date "
        "ON public.tt_calendar_dates (date)"
    )
    columns = _columns("tt_versions")
    if "day_names" in columns:
        op.drop_column("tt_versions", "day_names")
    if "day_indexes" in columns:
        op.drop_column("tt_versions", "day_indexes")
