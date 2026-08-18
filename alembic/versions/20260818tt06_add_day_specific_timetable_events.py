"""Add recurring timetable events with explicit applicable days."""
from alembic import op
import sqlalchemy as sa

revision = "20260818tt06"
down_revision = "20260818tt05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tt_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("start_time", sa.String(5), nullable=False),
        sa.Column("end_time", sa.String(5), nullable=False),
        sa.Column("day_indexes", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("event_type", sa.String(40), nullable=False, server_default="break"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["school_id"], ["school_info.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_tt_events_school_id", "tt_events", ["school_id"])
    op.create_index("ix_tt_event_school_time", "tt_events", ["school_id", "start_time", "end_time"])
    bind = op.get_bind()
    bind.execute(sa.text("""
        ALTER TABLE tt_events ENABLE ROW LEVEL SECURITY;
        CREATE POLICY tt_events_read ON tt_events FOR SELECT USING (school_id IN (SELECT public.tt_user_schools()));
        CREATE POLICY tt_events_write ON tt_events FOR ALL
          USING (school_id IN (SELECT public.tt_user_schools()) AND public.tt_can_write(school_id))
          WITH CHECK (school_id IN (SELECT public.tt_user_schools()) AND public.tt_can_write(school_id));
    """))


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DROP POLICY IF EXISTS tt_events_write ON tt_events"))
    bind.execute(sa.text("DROP POLICY IF EXISTS tt_events_read ON tt_events"))
    bind.execute(sa.text("ALTER TABLE tt_events DISABLE ROW LEVEL SECURITY"))
    op.drop_index("ix_tt_event_school_time", table_name="tt_events")
    op.drop_index("ix_tt_events_school_id", table_name="tt_events")
    op.drop_table("tt_events")
