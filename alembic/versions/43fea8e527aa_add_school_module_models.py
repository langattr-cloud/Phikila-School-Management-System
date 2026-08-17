"""Reconcile school module schema with existing production data.

Revision ID: 43fea8e527aa
Revises: 4c7888868b57
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "43fea8e527aa"
down_revision = "4c7888868b57"
branch_labels = None
depends_on = None


def _inspector():
    return inspect(op.get_bind())


def _tables():
    return set(_inspector().get_table_names())


def _columns(table):
    return {c["name"] for c in _inspector().get_columns(table)}


def _indexes(table):
    return {i["name"] for i in _inspector().get_indexes(table)}


def _foreign_keys(table):
    return _inspector().get_foreign_keys(table)


def _unique_constraints(table):
    return {u.get("name") for u in _inspector().get_unique_constraints(table)}


def _add_column(table, column):
    if column.name not in _columns(table):
        op.add_column(table, column)


def _add_index(name, table, columns, unique=False):
    if name not in _indexes(table):
        op.create_index(name, table, columns, unique=unique)


def _add_fk(table, column, referred_table, referred_column="id"):
    if column in _columns(table):
        for fk in _foreign_keys(table):
            if column in fk.get("constrained_columns", []) and fk.get("referred_table") == referred_table:
                return
        op.create_foreign_key(
            f"fk_{table}_{column}_{referred_table}",
            table,
            referred_table,
            [column],
            [referred_column],
            ondelete="CASCADE",
        )


def _create_school_child_table(name, columns):
    if name in _tables():
        for column in columns:
            if column.name != "id":
                _add_column(name, column.copy())
        return
    op.create_table(name, *columns)
    _add_index(f"ix_{name}_id", name, ["id"])


def upgrade() -> None:
    # These tables may already exist in the live Supabase schema.
    _create_school_child_table(
        "school_branding",
        [
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("school_id", sa.Integer(), nullable=True),
            sa.Column("logo_path", sa.String(255)),
            sa.Column("stamp_path", sa.String(255)),
            sa.Column("report_header", sa.Text()),
            sa.Column("report_footer", sa.Text()),
            sa.Column("primary_color", sa.String(50)),
            sa.Column("secondary_color", sa.String(50)),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        ],
    )
    _create_school_child_table(
        "school_contact",
        [
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("school_id", sa.Integer(), nullable=True),
            sa.Column("principal", sa.String(255)),
            sa.Column("deputy_principal", sa.String(255)),
            sa.Column("bursar", sa.String(255)),
            sa.Column("telephone", sa.String(50)),
            sa.Column("mobile", sa.String(50)),
            sa.Column("email", sa.String(255)),
            sa.Column("emergency_contact", sa.String(50)),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        ],
    )

    # Never remove the baseline school_working_days table from production.
    if "school_working_days" not in _tables():
        op.create_table(
            "school_working_days",
            sa.Column("id", sa.Integer(), primary_key=True),
        )
        _add_index("ix_school_working_days_id", "school_working_days", ["id"])

    school_info_columns = [
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("registration_number", sa.String(100), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("county", sa.String(100), nullable=True),
        sa.Column("sub_county", sa.String(100), nullable=True),
        sa.Column("ward", sa.String(100), nullable=True),
        sa.Column("postal_address", sa.String(255), nullable=True),
        sa.Column("physical_address", sa.Text(), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("alternative_phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("website", sa.String(255), nullable=True),
        sa.Column("vision", sa.Text(), nullable=True),
        sa.Column("mission", sa.Text(), nullable=True),
        sa.Column("principal_name", sa.String(255), nullable=True),
        sa.Column("established_year", sa.Integer(), nullable=True),
        sa.Column("logo", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
    ]
    for column in school_info_columns:
        _add_column("school_info", column)

    # Preserve legacy school_name/school_code data when the canonical fields are new.
    bind = op.get_bind()
    info_cols = _columns("school_info")
    if "name" in info_cols and "school_name" in info_cols:
        bind.execute(text("UPDATE school_info SET name = school_name WHERE name IS NULL"))
    if "code" in info_cols and "school_code" in info_cols:
        bind.execute(text("UPDATE school_info SET code = school_code WHERE code IS NULL"))

    _add_index("ix_school_info_code", "school_info", ["code"], unique=False)
    _add_index("ix_school_info_name", "school_info", ["name"], unique=False)

    settings_columns = [
        sa.Column("school_id", sa.Integer(), nullable=True),
        sa.Column("timezone", sa.String(100), nullable=True),
        sa.Column("currency", sa.String(10), nullable=True),
        sa.Column("date_format", sa.String(50), nullable=True),
        sa.Column("time_format", sa.String(50), nullable=True),
        sa.Column("language", sa.String(50), nullable=True),
        sa.Column("allow_multiple_sessions", sa.Boolean(), nullable=True),
        sa.Column("default_lesson_duration", sa.Integer(), nullable=True),
        sa.Column("current_academic_year_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
    ]
    for column in settings_columns:
        _add_column("school_settings", column)

    # Add the FK only after the nullable column exists; existing rows remain intact.
    if "school_settings" in _tables():
        _add_fk("school_settings", "school_id", "school_info")


def downgrade() -> None:
    # Intentionally non-destructive. Production data must not be removed by downgrade.
    pass
