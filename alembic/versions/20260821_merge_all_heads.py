"""Merge all remaining Alembic heads into one canonical upgrade target.

The platform/runtime reconciliation and academic/timetable reconciliation
branches are joined here with the independent finance posting branch so Render
can safely run ``alembic upgrade head`` during startup.
"""

revision = "20260821mergeall"
down_revision = ("d9f4c7b1e2a3", "20260821lvlstatus", "ab4d9e7c2f10")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
