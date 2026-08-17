"""Compatibility revision for the teachers/class-register chain.

The preceding reconciliation migration owns the qualifications table. This
revision must not destroy it on a live database.
"""
from alembic import op
import sqlalchemy as sa

revision = "e794a52fda40"
down_revision = "4721a8a1f38d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No destructive operation: qualifications may already contain production data.
    return


def downgrade() -> None:
    return
