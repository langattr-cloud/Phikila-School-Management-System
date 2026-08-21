"""Merge the final timetable migration branch into the canonical head.

Render diagnostics showed two actual Alembic heads: the timetable calendar
branch and the reconciliation merge. This no-op migration joins them so
``alembic upgrade head`` has one unambiguous target.
"""

revision = "20260821finalmerge"
down_revision = ("20260821mergeall", "20260818tt06")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
