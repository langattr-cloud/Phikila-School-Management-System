"""Merge all currently independent migration heads.

The recent timetable-type and calendar migrations branched from older
revisions instead of the current Alembic head. This no-op merge makes
``alembic upgrade head`` unambiguous while preserving every existing
migration and its order.
"""

revision = "20260903mergeheads"
down_revision = (
    "20260902termuniq",
    "20260901tt_effective",
    "20260903tttypeperiods",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
