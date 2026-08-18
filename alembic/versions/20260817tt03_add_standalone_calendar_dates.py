"""Add standalone concrete calendar dates for timetable setup."""

from alembic import op
import sqlalchemy as sa

revision = "20260817tt03"
down_revision = "20260817tt02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    table_exists = bind.execute(
        sa.text("SELECT to_regclass('public.tt_calendar_dates')")
    ).scalar_one_or_none() is not None

    if not table_exists:
        op.create_table(
            "tt_calendar_dates",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("school_id", sa.Integer(), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("label", sa.String(length=120), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("school_id", "date", name="uq_tt_calendar_date"),
        )

    # The table may already exist from the production/manual schema repair.
    # Create the runtime indexes idempotently in either case.
    bind.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_tt_calendar_dates_school_id "
        "ON public.tt_calendar_dates (school_id)"
    ))
    bind.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_tt_calendar_dates_date "
        "ON public.tt_calendar_dates (date)"
    ))


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DROP INDEX IF EXISTS public.ix_tt_calendar_dates_date"))
    bind.execute(sa.text("DROP INDEX IF EXISTS public.ix_tt_calendar_dates_school_id"))
    bind.execute(sa.text("DROP TABLE IF EXISTS public.tt_calendar_dates"))
