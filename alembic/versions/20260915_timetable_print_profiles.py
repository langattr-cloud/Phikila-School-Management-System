"""Add school-scoped timetable print profiles."""
from alembic import op
import sqlalchemy as sa

revision = "20260915ttprint"
down_revision = "20260908mergeheads"
branch_labels = None
depends_on = None


def _tables():
    return {row[0] for row in sa.inspect(op.get_bind()).get_table_names()}


def upgrade() -> None:
    if "tt_print_profiles" not in _tables():
        op.create_table(
            "tt_print_profiles",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("school_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("config", sa.JSON(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_by", sa.String(160), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("school_id", "name", name="uq_tt_print_profile_name"),
        )
        op.create_index("ix_tt_print_profiles_school_id", "tt_print_profiles", ["school_id"])


def downgrade() -> None:
    if "tt_print_profiles" in _tables():
        op.drop_index("ix_tt_print_profiles_school_id", table_name="tt_print_profiles")
        op.drop_table("tt_print_profiles")
