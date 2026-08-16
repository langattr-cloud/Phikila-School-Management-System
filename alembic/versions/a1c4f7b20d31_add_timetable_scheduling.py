"""Add the multi-tenant timetable scheduling schema.

Creates the tt_* tables only. No existing table is altered or dropped, so this
migration is additive and safe to run against the live database.

Revision ID: a1c4f7b20d31
Revises: 3c1551cada12
Create Date: 2026-08-14
"""

from alembic import op
import sqlalchemy as sa

revision = "a1c4f7b20d31"
down_revision = "3c1551cada12"
branch_labels = None
depends_on = None


def _tenant_columns() -> list[sa.Column]:
    return [
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "tt_schools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("slug", sa.String(80), unique=True, index=True),
        sa.Column("timezone", sa.String(60), server_default="Africa/Nairobi"),
        sa.Column("academic_year", sa.String(40)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "tt_memberships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False, index=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("role", sa.String(20), nullable=False, server_default="viewer"),
        sa.Column("email", sa.String(160)),
        sa.Column("teacher_id", sa.Integer()),
        sa.Column("class_id", sa.Integer()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "school_id", name="uq_tt_membership"),
    )

    op.create_table(
        "tt_days",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("index", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_tenant_columns(),
        sa.UniqueConstraint("school_id", "index", name="uq_tt_day"),
    )

    op.create_table(
        "tt_periods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("index", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("start_time", sa.String(5), nullable=False),
        sa.Column("end_time", sa.String(5), nullable=False),
        sa.Column("is_teaching", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_tenant_columns(),
        sa.UniqueConstraint("school_id", "index", name="uq_tt_period_slot"),
    )

    op.create_table(
        "tt_teachers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("email", sa.String(160)),
        sa.Column("department", sa.String(80)),
        sa.Column("max_lessons_per_day", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("max_consecutive", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("workload_target", sa.Integer()),
        sa.Column("unavailable", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_tenant_columns(),
        sa.UniqueConstraint("school_id", "code", name="uq_tt_teacher_code"),
    )

    op.create_table(
        "tt_subjects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("colour", sa.String(9), server_default="#0F2A47"),
        sa.Column("prefers_morning", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("prefers_double", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("spread_across_week", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("required_room_type", sa.String(40)),
        *_tenant_columns(),
        sa.UniqueConstraint("school_id", "code", name="uq_tt_subject_code"),
    )

    op.create_table(
        "tt_rooms",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("building", sa.String(80)),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="40"),
        sa.Column("room_type", sa.String(40), nullable=False, server_default="classroom"),
        sa.Column("is_accessible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("unavailable", sa.JSON(), nullable=False, server_default="{}"),
        *_tenant_columns(),
        sa.UniqueConstraint("school_id", "code", name="uq_tt_room_code"),
    )

    op.create_table(
        "tt_classes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("grade", sa.String(40)),
        sa.Column("student_count", sa.Integer(), nullable=False, server_default="40"),
        sa.Column("home_room_id", sa.Integer(), sa.ForeignKey("tt_rooms.id", ondelete="SET NULL")),
        sa.Column("unavailable", sa.JSON(), nullable=False, server_default="{}"),
        *_tenant_columns(),
        sa.UniqueConstraint("school_id", "code", name="uq_tt_class_code"),
    )

    op.create_table(
        "tt_lesson_requirements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("class_id", sa.Integer(), sa.ForeignKey("tt_classes.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("tt_subjects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("tt_teachers.id", ondelete="SET NULL"), index=True),
        sa.Column("room_id", sa.Integer(), sa.ForeignKey("tt_rooms.id", ondelete="SET NULL")),
        sa.Column("periods_per_week", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("double_periods", sa.Integer(), nullable=False, server_default="0"),
        *_tenant_columns(),
    )

    op.create_table(
        "tt_constraints",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(60), nullable=False),
        sa.Column("scope", sa.String(30), nullable=False, server_default="school"),
        sa.Column("target_id", sa.Integer()),
        sa.Column("is_hard", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("params", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("note", sa.Text()),
        *_tenant_columns(),
    )

    op.create_table(
        "tt_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(120)),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("quality", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("stats", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_by", sa.String(160)),
        sa.Column("published_at", sa.DateTime()),
        *_tenant_columns(),
    )

    op.create_table(
        "tt_lessons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version_id", sa.Integer(), sa.ForeignKey("tt_versions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("requirement_id", sa.Integer(), sa.ForeignKey("tt_lesson_requirements.id", ondelete="CASCADE"), index=True),
        sa.Column("class_id", sa.Integer(), nullable=False, index=True),
        sa.Column("subject_id", sa.Integer(), nullable=False, index=True),
        sa.Column("teacher_id", sa.Integer(), index=True),
        sa.Column("room_id", sa.Integer(), index=True),
        sa.Column("day_index", sa.Integer(), nullable=False),
        sa.Column("period_index", sa.Integer(), nullable=False),
        sa.Column("duration", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_tenant_columns(),
    )
    op.create_index("ix_tt_lesson_slot", "tt_lessons", ["version_id", "day_index", "period_index"])

    op.create_table(
        "tt_solver_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stage", sa.String(60), server_default="Queued"),
        sa.Column("checks", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("result_version_id", sa.Integer()),
        sa.Column("quality", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("message", sa.Text()),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("started_at", sa.DateTime()),
        sa.Column("finished_at", sa.DateTime()),
        sa.Column("created_by", sa.String(160)),
        *_tenant_columns(),
    )

    op.create_table(
        "tt_audit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor", sa.String(160)),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("entity", sa.String(80)),
        sa.Column("entity_id", sa.Integer()),
        sa.Column("summary", sa.Text()),
        sa.Column("before", sa.JSON()),
        sa.Column("after", sa.JSON()),
        sa.Column("at", sa.DateTime(), nullable=False, server_default=sa.func.now(), index=True),
        *_tenant_columns(),
    )


def downgrade() -> None:
    for table in (
        "tt_audit",
        "tt_solver_jobs",
        "tt_lessons",
        "tt_versions",
        "tt_constraints",
        "tt_lesson_requirements",
        "tt_classes",
        "tt_rooms",
        "tt_subjects",
        "tt_teachers",
        "tt_periods",
        "tt_days",
        "tt_memberships",
        "tt_schools",
    ):
        op.drop_table(table)
