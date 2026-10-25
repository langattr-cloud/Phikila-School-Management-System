"""Preserve legacy timetable data while retaining the historical Alembic revision.

The old timetable schema may contain school data. Automated deployment must
never drop timetable tables or delete module entitlements. Decommissioning is
deferred until a separately reviewed, backed-up, explicitly approved migration
is prepared. This revision is kept in the chain for existing installations.
"""
from alembic import op

revision = "20261022timetable_reset"
down_revision = "20261014capitation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Intentionally non-destructive. Preserve legacy timetable tables, rows,
    # triggers, functions, and module entitlements in every not-yet-upgraded DB.
    pass


def downgrade() -> None:
    # A no-op downgrade is safer than attempting to reconstruct or delete data.
    pass
