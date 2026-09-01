"""Persist timetable calendar display mode per school."""
from alembic import op
import sqlalchemy as sa

revision = "20260901tt_calendar_config"
down_revision = "20260901tt_calendar_setup"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tt_calendar_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("display_mode", sa.String(10), nullable=False, server_default="day"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", name="uq_tt_calendar_config_school"),
    )


def downgrade():
    op.drop_table("tt_calendar_configs")
