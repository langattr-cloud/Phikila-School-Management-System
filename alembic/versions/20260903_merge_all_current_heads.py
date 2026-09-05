"""Merge the current Alembic heads into one canonical head."""

revision = "20260903mergeheads"
# The class/timetable integrity chain and the academic/timetable type chain
# are both parents here. This merge must include every leaf so `alembic
# upgrade head` resolves to exactly one head.
down_revision = (
    "20260902classnames",
    "20260903tttypeperiods",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
