"""Remove manual grade display ordering."""
from alembic import op
import sqlalchemy as sa

revision = "20260823grdorder"
down_revision = "20260821mergeall"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("grades")}
    if "display_order" in columns:
        op.drop_column("grades", "display_order")


def downgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("grades")}
    if "display_order" not in columns:
        op.add_column("grades", sa.Column("display_order", sa.Integer(), nullable=False, server_default="1"))
