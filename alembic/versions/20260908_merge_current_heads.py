"""Merge the remaining class-stream and timetable/outlook migration heads."""

revision = "20260908mergeheads"
down_revision = (
    "20260906outlook",
    "20260905classstream",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
