"""Merge all current Alembic heads into one canonical head."""

revision = "20260903mergeheads"
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
