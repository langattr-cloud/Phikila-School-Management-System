"""Add effective date to timetables.

Revision ID: 20260901tt_effective
Revises: 20260830classintegrity
"""
from alembic import op
import sqlalchemy as sa

revision = "20260901tt_effective"
down_revision = "20260830classintegrity"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tt_versions", sa.Column("effective_from", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("tt_versions", "effective_from")
