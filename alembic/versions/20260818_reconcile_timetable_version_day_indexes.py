"""Reconcile timetable version columns required by the dashboard API.

The dashboard serializes VersionOut, which includes day_indexes and day_names.
Some production databases had the timetable version table without those columns,
causing GET /api/v1/scheduling/dashboard to fail with a server error.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260818tt05"
down_revision = "20260818streams"
branch_labels = None
depends_on = None


def _columns(table: str):
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    columns = _columns("tt_versions")
    if "day_indexes" not in columns:
        op.add_column(
            "tt_versions",
            sa.Column("day_indexes", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        )
    if "day_names" not in columns:
        op.add_column(
            "tt_versions",
            sa.Column("day_names", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        )


def downgrade() -> None:
    columns = _columns("tt_versions")
    if "day_names" in columns:
        op.drop_column("tt_versions", "day_names")
    if "day_indexes" in columns:
        op.drop_column("tt_versions", "day_indexes")
