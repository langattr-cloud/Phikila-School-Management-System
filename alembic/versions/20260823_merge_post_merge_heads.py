"""Merge the three migrations added after the canonical merge head."""

revision = "20260823postmerge"
down_revision = (
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
