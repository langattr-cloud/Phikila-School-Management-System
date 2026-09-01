"""Add configurable timetable types and generation selections.

Revision ID: 20260901tt_types
Revises: 20260901tt_effective
"""
from alembic import op
import sqlalchemy as sa

revision = "20260901tt_types"
down_revision = "20260901tt_effective"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tt_timetable_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("day_indexes", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "code", name="uq_tt_timetable_type_code"),
    )
    op.add_column("tt_versions", sa.Column("timetable_type_id", sa.Integer(), nullable=True))
    op.create_index("ix_tt_versions_timetable_type_id", "tt_versions", ["timetable_type_id"])
    op.add_column("tt_solver_jobs", sa.Column("config", sa.JSON(), nullable=False, server_default="{}"))


def downgrade():
    op.drop_column("tt_solver_jobs", "config")
    op.drop_index("ix_tt_versions_timetable_type_id", table_name="tt_versions")
    op.drop_column("tt_versions", "timetable_type_id")
    op.drop_table("tt_timetable_types")
