"""Remove the unused stream capacity field."""
from alembic import op
import sqlalchemy as sa

revision = "20260823streamcap"
down_revision = "20260821mergeall"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("streams")}
    if "capacity" in columns:
        op.drop_column("streams", "capacity")


def downgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("streams")}
    if "capacity" not in columns:
        op.add_column("streams", sa.Column("capacity", sa.Integer(), nullable=True))
