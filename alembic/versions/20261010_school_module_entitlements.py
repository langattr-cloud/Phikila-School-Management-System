"""Persist per-school module access and backfill the requested starter set.

This migration is additive and does not remove or alter school records.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261010modules"
down_revision = "20261010receiptfk"
branch_labels = None
depends_on = None

MODULES = (
    "students", "staff", "attendance", "examinations", "finance",
    "timetable", "library", "transport", "parent_portal", "ai_tools",
)
DEFAULT_ENABLED = {"students", "staff", "attendance", "examinations"}


def upgrade() -> None:
    op.create_table(
        "tt_school_module_entitlements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("tt_schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("module_key", sa.String(length=40), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_by", sa.String(length=160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "module_key", name="uq_school_module_entitlement"),
    )
    op.create_index("ix_tt_school_module_entitlements_school_id", "tt_school_module_entitlements", ["school_id"])
    # Backfill existing schools with the explicitly requested starter modules.
    bind = op.get_bind()
    school_ids = bind.execute(sa.text("SELECT id FROM tt_schools")).scalars().all()
    rows = [
        {"school_id": school_id, "module_key": module, "enabled": module in DEFAULT_ENABLED}
        for school_id in school_ids for module in MODULES
    ]
    if rows:
        bind.execute(sa.text(
            "INSERT INTO tt_school_module_entitlements (school_id, module_key, enabled) "
            "VALUES (:school_id, :module_key, :enabled)"
        ), rows)


def downgrade() -> None:
    op.drop_index("ix_tt_school_module_entitlements_school_id", table_name="tt_school_module_entitlements")
    op.drop_table("tt_school_module_entitlements")
