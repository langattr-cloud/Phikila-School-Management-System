"""Add standalone concrete calendar dates for timetable setup."""

from alembic import op
import sqlalchemy as sa

revision = "20260817tt03"
down_revision = "20260817tt02"
branch_labels = None
depends_on = None


def upgrade() -> None:
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
    op.create_index("ix_tt_calendar_dates_school_id", "tt_calendar_dates", ["school_id"])
    op.create_index("ix_tt_calendar_dates_date", "tt_calendar_dates", ["date"])


def downgrade() -> None:
    op.drop_index("ix_tt_calendar_dates_date", table_name="tt_calendar_dates")
    op.drop_index("ix_tt_calendar_dates_school_id", table_name="tt_calendar_dates")
    op.drop_table("tt_calendar_dates")
