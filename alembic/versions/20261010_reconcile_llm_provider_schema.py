"""Reconcile legacy Supabase LLM settings tables with the current ORM.

Preserves the legacy provider-key column and key/value settings rows. Adds
current fields idempotently so the API can read and write encrypted provider
settings after older Supabase bootstrap schemas.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261010llmschema"
down_revision = "20261010receiptfk"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _add(table: str, column: sa.Column) -> None:
    if column.name not in _columns(table):
        op.add_column(table, column)


def _has_unique(table: str, columns: tuple[str, ...]) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(
        tuple(constraint.get("column_names") or ()) == columns
        for constraint in inspector.get_unique_constraints(table)
    )


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "tt_llm_credentials" in tables:
        columns = _columns("tt_llm_credentials")
        if "encrypted_api_key" not in columns and "api_key_encrypted" in columns:
            op.alter_column(
                "tt_llm_credentials",
                "api_key_encrypted",
                new_column_name="encrypted_api_key",
                existing_type=sa.Text(),
            )
        elif "encrypted_api_key" in columns and "api_key_encrypted" in columns:
            # If an earlier partial rollout created both names, preserve the
            # old ciphertext without ever decrypting or logging it.
            bind.execute(sa.text(
                "UPDATE tt_llm_credentials SET encrypted_api_key = api_key_encrypted "
                "WHERE encrypted_api_key IS NULL AND api_key_encrypted IS NOT NULL"
            ))
        elif "encrypted_api_key" not in columns:
            raise RuntimeError(
                "tt_llm_credentials has neither encrypted_api_key nor api_key_encrypted; "
                "manual review is required before migration."
            )

        _add("tt_llm_credentials", sa.Column("last4", sa.String(8), nullable=True))
        _add("tt_llm_credentials", sa.Column(
            "status", sa.String(30), nullable=False, server_default="not_configured"
        ))
        _add("tt_llm_credentials", sa.Column("last_tested_at", sa.DateTime(timezone=True)))
        _add("tt_llm_credentials", sa.Column("last_error", sa.String(300)))
        _add("tt_llm_credentials", sa.Column(
            "models_available", sa.Integer(), nullable=False, server_default="0"
        ))
        _add("tt_llm_credentials", sa.Column("created_by", sa.String(160)))
        _add("tt_llm_credentials", sa.Column("updated_by", sa.String(160)))
        _add("tt_llm_credentials", sa.Column("updated_at", sa.DateTime(timezone=True)))

        columns = _columns("tt_llm_credentials")
        if "is_connected" in columns:
            bind.execute(sa.text("""
                UPDATE tt_llm_credentials
                SET status = CASE WHEN is_connected IS TRUE THEN 'connected'
                                  ELSE COALESCE(NULLIF(status, 'not_configured'), 'not_configured')
                             END
            """))

    if "tt_llm_models" in tables:
        _add("tt_llm_models", sa.Column("context_window", sa.Integer()))
        _add("tt_llm_models", sa.Column("input_price", sa.Float()))
        _add("tt_llm_models", sa.Column("output_price", sa.Float()))
        _add("tt_llm_models", sa.Column("supports_tools", sa.Boolean()))
        _add("tt_llm_models", sa.Column("supports_vision", sa.Boolean()))
        _add("tt_llm_models", sa.Column("supports_reasoning", sa.Boolean()))
        _add("tt_llm_models", sa.Column(
            "enabled", sa.Boolean(), nullable=False, server_default=sa.false()
        ))
        _add("tt_llm_models", sa.Column("last_tested_at", sa.DateTime(timezone=True)))
        _add("tt_llm_models", sa.Column("last_test_ok", sa.Boolean()))
        _add("tt_llm_models", sa.Column("last_test_ms", sa.Integer()))
        _add("tt_llm_models", sa.Column("last_test_error", sa.String(300)))
        _add("tt_llm_models", sa.Column("updated_at", sa.DateTime(timezone=True)))

        columns = _columns("tt_llm_models")
        if "is_default" in columns:
            bind.execute(sa.text(
                "UPDATE tt_llm_models SET enabled = TRUE "
                "WHERE is_default IS TRUE AND enabled IS FALSE"
            ))

        if not _has_unique("tt_llm_models", ("provider", "model_id")):
            duplicate = bind.execute(sa.text("""
                SELECT 1 FROM tt_llm_models
                GROUP BY provider, model_id HAVING COUNT(*) > 1 LIMIT 1
            """)).first()
            if duplicate:
                raise RuntimeError(
                    "Cannot add the LLM model uniqueness constraint: duplicate provider/model_id rows exist."
                )
            op.create_unique_constraint(
                "uq_tt_llm_model", "tt_llm_models", ["provider", "model_id"]
            )

    if "tt_llm_settings" in tables:
        _add("tt_llm_settings", sa.Column("default_provider", sa.String(40)))
        _add("tt_llm_settings", sa.Column("default_model_id", sa.String(200)))
        _add("tt_llm_settings", sa.Column("updated_by", sa.String(160)))
        _add("tt_llm_settings", sa.Column("updated_at", sa.DateTime(timezone=True)))

        # The previous bootstrap used a key/value table. Keep those rows intact,
        # but allow a separate singleton row for the platform default settings.
        columns = _columns("tt_llm_settings")
        if "key" in columns:
            op.alter_column(
                "tt_llm_settings", "key", existing_type=sa.Text(), nullable=True
            )
        if "value" in columns:
            op.alter_column(
                "tt_llm_settings", "value",
                existing_type=postgresql.JSONB(), nullable=True
            )


def downgrade() -> None:
    # Intentionally non-destructive: old ciphertext and key/value settings
    # must not be dropped or renamed back during a rollback.
    pass
