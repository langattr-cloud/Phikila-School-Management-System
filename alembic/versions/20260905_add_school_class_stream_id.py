"""Add the stream_id column expected by the SchoolClass ORM model."""
from alembic import op
import sqlalchemy as sa

revision = "20260905classstream"
down_revision = "20260905classgrade"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "school_classes",
        sa.Column("stream_id", sa.BigInteger(), nullable=True),
    )
    op.create_index(
        "ix_school_classes_stream_id",
        "school_classes",
        ["stream_id"],
    )


def downgrade():
    op.drop_index("ix_school_classes_stream_id", table_name="school_classes")
    op.drop_column("school_classes", "stream_id")
