"""Reconcile timetable bootstrap tables with the production Supabase schema."""

from alembic import op
import sqlalchemy as sa

revision = "a1c4f7b20d31"
down_revision = "3c1551cada12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())

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

    # The remaining tt_* scheduling tables are already present in the
    # production bootstrap schema. Do not recreate or overwrite them.


def downgrade() -> None:
    pass
