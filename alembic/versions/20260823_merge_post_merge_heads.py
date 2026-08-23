"""Merge the current Alembic branches into one deployable head.

Recent feature migrations were based on ``20260821mergeall`` while the
existing timetable reconciliation continued through ``20260821finalmerge``.
That left the timetable head plus the three new feature heads in parallel.
This no-op merge makes ``alembic upgrade head`` unambiguous without changing
any application tables itself.
"""

revision = "20260823postmerge"
down_revision = (
    "20260821finalmerge",
    "20260823grdorder",
    "20260823streamcap",
    "20260823classteacher",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
