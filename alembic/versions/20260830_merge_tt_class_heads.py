"""Merge the timetable academic-context head with the remaining migration head(s)."""

from alembic import op

revision = "20260830merge_tt_heads"
down_revision = ("20260830ttclassctx", "20260825mergeheads")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
