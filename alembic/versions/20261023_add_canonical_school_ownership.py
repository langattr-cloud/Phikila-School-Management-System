"""Add nullable school ownership to canonical teacher and subject records.

Revision ID: 20261023own01
Revises: 20261023ttb01
Legacy rows remain NULL until an operator verifies and assigns ownership.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261023own01"
down_revision = "20261023ttb01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "teachers",
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("school_info.id"), nullable=True),
    )
    op.create_index("ix_teachers_school_id", "teachers", ["school_id"])
    op.add_column(
        "subjects",
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("school_info.id"), nullable=True),
    )
    op.create_index("ix_subjects_school_id", "subjects", ["school_id"])


def downgrade() -> None:
    op.drop_index("ix_subjects_school_id", table_name="subjects")
    op.drop_column("subjects", "school_id")
    op.drop_index("ix_teachers_school_id", table_name="teachers")
    op.drop_column("teachers", "school_id")
