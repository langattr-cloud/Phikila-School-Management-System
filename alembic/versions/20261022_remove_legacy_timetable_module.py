"""Retire the legacy timetable schema without destroying existing installations.

Revision ID: 20261022timetable_reset
Revises: 20261014capitation

The original draft of this migration dropped legacy timetable tables. That is
not safe to run as part of a feature rollout because deployments may still need
to inspect or export legacy schedules. New timetable tables are created by
separate additive migrations. This revision is intentionally a no-op.
"""
revision = "20261022timetable_reset"
down_revision = "20261014capitation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Preserve all legacy timetable data and entitlement rows. The rebuilt
    # module uses isolated ttb_* tables introduced by later migrations.
    pass


def downgrade() -> None:
    # This revision does not alter the database.
    pass
