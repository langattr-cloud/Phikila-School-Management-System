"""Add isolated, additive tables for the rebuilt timetabling module.

Revision ID: 20261023ttb01
Revises: 20261022timetable_reset
This migration creates only new ttb_* tables and does not drop, rename, or
rewrite school, student, teacher, subject, or historical timetable data.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261023ttb01"
down_revision = "20261022timetable_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ttb_projects",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("school_id", sa.BigInteger(), nullable=False),
        sa.Column("academic_year_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Africa/Nairobi"),
        sa.Column("state", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("ends_on >= starts_on", name="ck_ttb_project_date_range"),
    )
    op.create_index("ix_ttb_projects_school_id", "ttb_projects", ["school_id"])
    op.create_index("ix_ttb_projects_academic_year_id", "ttb_projects", ["academic_year_id"])
    op.create_index("ix_ttb_projects_state", "ttb_projects", ["state"])
    op.create_table(
        "ttb_periods",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("ttb_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("period_number", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.Time(), nullable=False),
        sa.Column("ends_at", sa.Time(), nullable=False),
        sa.Column("week_pattern", sa.String(16), nullable=False, server_default="every_week"),
        sa.Column("is_break", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("label", sa.String(80)),
        sa.UniqueConstraint("project_id", "day_of_week", "period_number", "week_pattern", name="uq_ttb_period_slot"),
        sa.CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_ttb_period_day"),
        sa.CheckConstraint("period_number BETWEEN 1 AND 32", name="ck_ttb_period_number"),
        sa.CheckConstraint("ends_at > starts_at", name="ck_ttb_period_duration"),
    )
    op.create_index("ix_ttb_periods_project_id", "ttb_periods", ["project_id"])
    op.create_table(
        "ttb_lesson_requirements",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("ttb_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_id", sa.BigInteger(), nullable=False),
        sa.Column("subject_id", sa.BigInteger(), nullable=False),
        sa.Column("teacher_ids", sa.JSON(), nullable=False),
        sa.Column("lessons_per_week", sa.Integer(), nullable=False),
        sa.Column("duration_periods", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("room_type", sa.String(80)),
        sa.Column("fixed_day", sa.Integer()),
        sa.Column("fixed_period", sa.Integer()),
        sa.Column("locked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("week_pattern", sa.String(16), nullable=False, server_default="every_week"),
        sa.CheckConstraint("lessons_per_week BETWEEN 1 AND 40", name="ck_ttb_requirement_frequency"),
        sa.CheckConstraint("duration_periods BETWEEN 1 AND 8", name="ck_ttb_requirement_duration"),
    )
    for column in ("project_id", "class_id", "subject_id"):
        op.create_index(f"ix_ttb_lesson_requirements_{column}", "ttb_lesson_requirements", [column])
    op.create_table(
        "ttb_constraints",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("ttb_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("hardness", sa.String(8), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.UniqueConstraint("project_id", "code", name="uq_ttb_constraint_code"),
        sa.CheckConstraint("hardness IN ('hard', 'soft')", name="ck_ttb_constraint_hardness"),
        sa.CheckConstraint("weight BETWEEN 1 AND 1000", name="ck_ttb_constraint_weight"),
    )
    op.create_index("ix_ttb_constraints_project_id", "ttb_constraints", ["project_id"])
    op.create_table(
        "ttb_versions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("ttb_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("placements", sa.JSON(), nullable=False),
        sa.Column("diagnostics", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(160)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "version_number", name="uq_ttb_version_number"),
    )
    op.create_index("ix_ttb_versions_project_id", "ttb_versions", ["project_id"])


def downgrade() -> None:
    op.drop_table("ttb_versions")
    op.drop_table("ttb_constraints")
    op.drop_table("ttb_lesson_requirements")
    op.drop_table("ttb_periods")
    op.drop_table("ttb_projects")
