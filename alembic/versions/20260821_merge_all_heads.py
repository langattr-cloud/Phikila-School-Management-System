"""Merge the remaining Alembic heads into one linear upgrade target.

The platform bootstrap reconciliation and the academic/timetable reconciliation
branches were both valid migration paths, but they previously remained as
separate heads. Render runs ``alembic upgrade head`` at startup, so the graph
must expose one canonical head.
"""

revision = "20260821mergeall"
down_revision = ("d9f4c7b1e2a3", "20260821lvlstatus")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
