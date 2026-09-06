"""Store encrypted delegated Microsoft 365 OAuth connections."""
from alembic import op
import sqlalchemy as sa

revision = "20260906outlook"
down_revision = "20260906classsync"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "outlook_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("school_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "school_id", name="uq_outlook_connection_user_school"),
    )
    op.create_index("ix_outlook_connections_user_id", "outlook_connections", ["user_id"])
    op.create_index("ix_outlook_connections_school_id", "outlook_connections", ["school_id"])


def downgrade():
    op.drop_index("ix_outlook_connections_school_id", table_name="outlook_connections")
    op.drop_index("ix_outlook_connections_user_id", table_name="outlook_connections")
    op.drop_table("outlook_connections")
