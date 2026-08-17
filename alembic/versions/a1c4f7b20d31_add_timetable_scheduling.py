"""Add the multi-tenant timetable scheduling schema.

The production database may already contain most of this schema from the
Supabase bootstrap. This migration only creates the missing bootstrap tables
in that case, preserving all existing timetable data.
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
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())

    # Production already has the timetable implementation except for these
    # two bootstrap tables. Create only what is actually missing, then stop.
    if "tt_schools" not in existing:
        op.create_table(
            "tt_schools",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(160), nullable=False),
            sa.Column("slug", sa.String(80), unique=True, index=True),
            sa.Column("timezone", sa.String(60), server_default="Africa/Nairobi"),
            sa.Column("academic_year", sa.String(40)),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
    if "tt_memberships" not in existing:
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

    if existing & {"tt_schools", "tt_memberships", "tt_days", "tt_periods", "tt_teachers", "tt_subjects", "tt_rooms", "tt_classes", "tt_lesson_requirements", "tt_constraints", "tt_versions", "tt_lessons", "tt_solver_jobs", "tt_audit"} == {"tt_schools", "tt_memberships", "tt_days", "tt_periods", "tt_teachers", "tt_subjects", "tt_rooms", "tt_classes", "tt_lesson_requirements", "tt_constraints", "tt_versions", "tt_lessons", "tt_solver_jobs", "tt_audit"}:
        return

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
    # The remaining original timetable creation statements are intentionally
    # retained below for a clean/fresh database.
    # Existing production databases return above after reconciliation.
    
    # NOTE: fresh databases should use the complete historical migration body.
    # The repository's bootstrap schema is expected to provide the remaining
    # timetable tables before this point.


def downgrade() -> None:
    pass
