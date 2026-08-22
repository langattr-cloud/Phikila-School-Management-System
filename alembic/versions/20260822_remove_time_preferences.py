"""Remove timetable time-of-day preference state.

Time-of-day preferences are not part of the scheduling model. Remove legacy
constraint rows and the obsolete subject column so the database cannot expose
or retain a preference that the scheduler no longer supports.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260822tt01"
down_revision = "20260821tt07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "tt_constraints" in tables:
        bind.execute(
            sa.text(
                "DELETE FROM tt_constraints "
                "WHERE kind IN ('morning_preference', 'time_preference')"
            )
        )

    if "tt_subjects" not in tables:
        return

    columns = {column["name"] for column in inspector.get_columns("tt_subjects")}
    if "prefers_morning" in columns:
        op.drop_column("tt_subjects", "prefers_morning")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "tt_subjects" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("tt_subjects")}
    if "prefers_morning" not in columns:
        op.add_column(
            "tt_subjects",
            sa.Column("prefers_morning", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
