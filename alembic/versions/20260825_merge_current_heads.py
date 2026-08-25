"""Merge the two feature heads created from the timetable stream/grade fix.

The teacher-role and standard-level seed migrations both descend from
20260824streamgrade. Alembic therefore sees two heads unless they are joined
by an explicit no-op merge revision.
"""

revision = "20260825mergeheads"
down_revision = ("20260824teacherroles", "20260824seedlevels")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
