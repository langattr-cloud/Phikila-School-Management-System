"""Add optional teacher phone and role assignment metadata."""
from alembic import op
import sqlalchemy as sa

revision = "20260824teacherroles"
down_revision = "20260824streamgrade"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("tt_teachers")}
    if "phone" not in columns:
        op.add_column("tt_teachers", sa.Column("phone", sa.String(length=40), nullable=True))
    if "role" not in columns:
        op.add_column("tt_teachers", sa.Column("role", sa.String(length=80), nullable=False, server_default="Teacher"))
    if "role_assignment" not in columns:
        op.add_column("tt_teachers", sa.Column("role_assignment", sa.JSON(), nullable=False, server_default=sa.text("'{}'::jsonb")))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("tt_teachers")}
    for name in ("role_assignment", "role", "phone"):
        if name in columns:
            op.drop_column("tt_teachers", name)
