"""Store contact phone numbers on school memberships."""

from alembic import op
import sqlalchemy as sa

revision = "20261011membershipphone"
down_revision = "20261010modules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tt_memberships", sa.Column("phone", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("tt_memberships", "phone")
