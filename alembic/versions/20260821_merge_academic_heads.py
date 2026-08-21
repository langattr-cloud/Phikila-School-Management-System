"""Merge the two academic-context migration branches.

Both branches have already been applied to the production schema through
manual/idempotent reconciliation work. This revision only joins the Alembic
graph so future upgrades have a single head; it intentionally performs no
additional DDL or data changes.
"""

revision = "20260821mergeacad"
down_revision = ("20260819academich", "20260819attctx")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
