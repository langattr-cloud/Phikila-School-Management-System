"""Reconcile the optional stream_id column on school_classes.

Production databases may already contain this column because it was created
by an earlier schema deployment. The migration therefore checks the live
schema before adding the column and before creating its index.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260905classstream"
down_revision = "20260905classgrade"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("school_classes")}

    if "stream_id" not in columns:
        op.add_column(
            "school_classes",
            sa.Column("stream_id", sa.BigInteger(), nullable=True),
        )

    indexes = {index["name"] for index in inspector.get_indexes("school_classes")}
    if "ix_school_classes_stream_id" not in indexes:
        op.create_index(
            "ix_school_classes_stream_id",
            "school_classes",
            ["stream_id"],
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("school_classes")}
    columns = {column["name"] for column in inspector.get_columns("school_classes")}

    if "ix_school_classes_stream_id" in indexes:
        op.drop_index("ix_school_classes_stream_id", table_name="school_classes")
    if "stream_id" in columns:
        op.drop_column("school_classes", "stream_id")
