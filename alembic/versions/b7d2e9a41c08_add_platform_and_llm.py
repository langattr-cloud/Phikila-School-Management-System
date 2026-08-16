"""Add platform roles, access requests, audit and LLM provider settings.

Additive only. The single change to an existing table is a nullable-with-default
``status`` column on ``tt_schools``, which is backfilled to 'active'.

Revision ID: b7d2e9a41c08
Revises: a1c4f7b20d31
Create Date: 2026-08-14
"""

from alembic import op
import sqlalchemy as sa

revision = "b7d2e9a41c08"
down_revision = "a1c4f7b20d31"
branch_labels = None
depends_on = None


def _migrate_bootstrap_platform_admins() -> None:
    """Replace the temporary UUID-based bootstrap table with the model schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "tt_platform_admins" not in inspector.get_table_names():
        return

    rows = bind.execute(
        sa.text(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'tt_platform_admins'
            """
        )
    ).all()
    types = {row[0]: row[1] for row in rows}
    if types.get("id") == "integer" and types.get("user_id") in {"character varying", "text"}:
        return

    op.execute("DROP INDEX IF EXISTS ix_tt_platform_admins_user_id")
    op.execute("DROP INDEX IF EXISTS ix_tt_platform_admins_email")
    op.execute("ALTER TABLE tt_platform_admins DROP CONSTRAINT IF EXISTS tt_platform_admins_pkey")
    op.execute("ALTER TABLE tt_platform_admins DROP CONSTRAINT IF EXISTS tt_platform_admins_user_id_key")
    op.execute("ALTER TABLE tt_platform_admins RENAME TO tt_platform_admins_bootstrap")

    op.create_table(
        "tt_platform_admins",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("email", sa.String(160)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("granted_by", sa.String(64)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.execute(
        """
        INSERT INTO tt_platform_admins (user_id, email, is_active, granted_by, created_at)
        SELECT user_id::text, email::text, is_active, granted_by::text, created_at
        FROM tt_platform_admins_bootstrap
        """
    )
    op.drop_table("tt_platform_admins_bootstrap")


def upgrade() -> None:
    op.add_column(
        "tt_schools",
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
    )

    _migrate_bootstrap_platform_admins()
    bind = op.get_bind()
    if "tt_platform_admins" not in sa.inspect(bind).get_table_names():
        op.create_table(
            "tt_platform_admins",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.String(64), nullable=False, unique=True, index=True),
            sa.Column("email", sa.String(160)),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("granted_by", sa.String(64)),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    op.create_table(
        "tt_access_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False, index=True),
        sa.Column("email", sa.String(160), nullable=False),
        sa.Column("full_name", sa.String(160)),
        sa.Column("requested_role", sa.String(20), nullable=False, server_default="teacher"),
        sa.Column("requested_school_id", sa.Integer(), index=True),
        sa.Column("requested_school_name", sa.String(160)),
        sa.Column("note", sa.Text()),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("decided_by", sa.String(64)),
        sa.Column("decided_at", sa.DateTime()),
        sa.Column("decision_note", sa.Text()),
        sa.Column("granted_role", sa.String(20)),
        sa.Column("granted_school_id", sa.Integer()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", name="uq_tt_access_request_user"),
    )
    op.create_index("ix_tt_access_request_status", "tt_access_requests", ["status", "created_at"])

    op.create_table(
        "tt_platform_audit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor", sa.String(160)),
        sa.Column("actor_id", sa.String(64), index=True),
        sa.Column("action", sa.String(80), nullable=False, index=True),
        sa.Column("entity", sa.String(80)),
        sa.Column("entity_id", sa.String(80)),
        sa.Column("school_id", sa.Integer(), index=True),
        sa.Column("summary", sa.Text()),
        sa.Column("at", sa.DateTime(), nullable=False, server_default=sa.func.now(), index=True),
    )

    op.create_table(
        "tt_llm_credentials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(40), nullable=False, index=True),
        sa.Column("encrypted_api_key", sa.Text(), nullable=False),
        sa.Column("last4", sa.String(8)),
        sa.Column("status", sa.String(30), nullable=False, server_default="not_configured"),
        sa.Column("last_tested_at", sa.DateTime()),
        sa.Column("last_error", sa.String(300)),
        sa.Column("models_available", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.String(160)),
        sa.Column("updated_by", sa.String(160)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime()),
        sa.UniqueConstraint("provider", name="uq_tt_llm_credential_provider"),
    )

    op.create_table(
        "tt_llm_models",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(40), nullable=False, index=True),
        sa.Column("model_id", sa.String(200), nullable=False),
        sa.Column("display_name", sa.String(200)),
        sa.Column("context_window", sa.Integer()),
        sa.Column("input_price", sa.Float()),
        sa.Column("output_price", sa.Float()),
        sa.Column("supports_tools", sa.Boolean()),
        sa.Column("supports_vision", sa.Boolean()),
        sa.Column("supports_reasoning", sa.Boolean()),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false(), index=True),
        sa.Column("last_tested_at", sa.DateTime()),
        sa.Column("last_test_ok", sa.Boolean()),
        sa.Column("last_test_ms", sa.Integer()),
        sa.Column("last_test_error", sa.String(300)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime()),
        sa.UniqueConstraint("provider", "model_id", name="uq_tt_llm_model"),
    )

    op.create_table(
        "tt_llm_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("default_provider", sa.String(40)),
        sa.Column("default_model_id", sa.String(200)),
        sa.Column("updated_by", sa.String(160)),
        sa.Column("updated_at", sa.DateTime()),
    )


def downgrade() -> None:
    op.drop_table("tt_llm_settings")
    op.drop_table("tt_llm_models")
    op.drop_table("tt_llm_credentials")
    op.drop_table("tt_platform_audit")
    op.drop_index("ix_tt_access_request_status", table_name="tt_access_requests")
    op.drop_table("tt_access_requests")
    op.drop_table("tt_platform_admins")
    op.drop_column("tt_schools", "status")
