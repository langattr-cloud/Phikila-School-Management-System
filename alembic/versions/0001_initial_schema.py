"""Alembic migration script for initial schema.

Creates the working_days, lesson_periods, and timetables tables.
"""

from alembic import op  # noqa: E402
import sqlalchemy as sa  # noqa: E402

# revision identifiers
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "working_days",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("day_name", sa.String, nullable=False),
    )
    op.create_table(
        "lesson_periods",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("period_name", sa.String, nullable=False),
        sa.Column("start_time", sa.String),
        sa.Column("end_time", sa.String),
    )
    op.create_table(
        "timetables",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("day_id", sa.Integer, sa.ForeignKey("working_days.id")),
        sa.Column("period_id", sa.Integer, sa.ForeignKey("lesson_periods.id")),
    )


def downgrade() -> None:
    op.drop_table("timetables")
    op.drop_table("lesson_periods")
    op.drop_table("working_days")
