"""Merge the actual remaining Alembic heads into one canonical target.

The runtime/finance and academic/timetable reconciliation work already joins
through these revisions. Pointing this merge at the actual leaf revisions
prevents Alembic from retaining older ancestor revisions as parallel heads.
"""

revision = "20260821mergeall"
down_revision = ("c6f1a9d2e4b7", "f8a1c2d3e4b5", "20260821lvlstatus")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
