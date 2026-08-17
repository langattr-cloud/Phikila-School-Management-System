"""Reconcile pre-existing platform bootstrap tables with ORM models.

The original platform migration intentionally skipped all platform tables when
Supabase had already created them. That left older bootstrap schemas missing
columns required by the application. This migration is deliberately additive:
it preserves existing data and only adds missing model fields, indexes, and
uniqueness constraints.
"""

from alembic import op
import sqlalchemy as sa

revision = "d9f4c7b1e2a3"
down_revision = ("b7d2e9a41c08", "c2f8e9a1d6b4", "5f8c9d2e7b1a")
branch_labels = None
depends_on = None


def _columns(inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}


def _add_missing_columns(table: str, columns: list[sa.Column]) -> None:
    inspector = sa.inspect(op.get_bind())
    existing = _columns(inspector, table)
    for column in columns:
        if column.name not in existing:
            op.add_column(table, column)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "tt_platform_admins" in tables:
        _add_missing_columns(
            "tt_platform_admins",
            [
                sa.Column("email", sa.String(160), nullable=True),
                sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
                sa.Column("granted_by", sa.String(64), nullable=True),
            ],
        )

        indexes = {index["name"] for index in sa.inspect(bind).get_indexes("tt_platform_admins")}
        if "ix_tt_platform_admins_user_id" not in indexes:
            op.create_index(
                "ix_tt_platform_admins_user_id",
                "tt_platform_admins",
                ["user_id"],
            )

        unique_constraints = {
            constraint["name"]
            for constraint in sa.inspect(bind).get_unique_constraints("tt_platform_admins")
        }
        if "uq_tt_platform_admins_user_id" not in unique_constraints:
            duplicate = bind.execute(
                sa.text(
                    """
                    SELECT 1
                    FROM tt_platform_admins
                    GROUP BY user_id
                    HAVING COUNT(*) > 1
                    LIMIT 1
                    """
                )
            ).first()
            if duplicate is not None:
                raise RuntimeError(
                    "Cannot add unique constraint uq_tt_platform_admins_user_id: "
                    "tt_platform_admins contains duplicate user_id values."
                )
            op.create_unique_constraint(
                "uq_tt_platform_admins_user_id",
                "tt_platform_admins",
                ["user_id"],
            )

    if "tt_access_requests" in tables:
        _add_missing_columns(
            "tt_access_requests",
            [
                sa.Column("email", sa.String(160), nullable=True),
                sa.Column("full_name", sa.String(160), nullable=True),
                sa.Column("note", sa.Text(), nullable=True),
                sa.Column("granted_role", sa.String(20), nullable=True),
                sa.Column("granted_school_id", sa.Integer(), nullable=True),
            ],
        )

        bind.execute(
            sa.text(
                "UPDATE tt_access_requests SET email = '' WHERE email IS NULL"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE tt_access_requests SET requested_role = 'teacher' "
                "WHERE requested_role IS NULL"
            )
        )
        op.alter_column(
            "tt_access_requests",
            "email",
            existing_type=sa.String(160),
            nullable=False,
        )
        op.alter_column(
            "tt_access_requests",
            "requested_role",
            existing_type=sa.String(20),
            nullable=False,
            server_default="teacher",
        )

        indexes = {index["name"] for index in sa.inspect(bind).get_indexes("tt_access_requests")}
        if "ix_tt_access_requests_user_id" not in indexes:
            op.create_index(
                "ix_tt_access_requests_user_id",
                "tt_access_requests",
                ["user_id"],
            )
        if "ix_tt_access_request_status" not in indexes:
            op.create_index(
                "ix_tt_access_request_status",
                "tt_access_requests",
                ["status", "created_at"],
            )

        unique_constraints = {
            constraint["name"]
            for constraint in sa.inspect(bind).get_unique_constraints("tt_access_requests")
        }
        if "uq_tt_access_request_user" not in unique_constraints:
            duplicate = bind.execute(
                sa.text(
                    """
                    SELECT 1
                    FROM tt_access_requests
                    GROUP BY user_id
                    HAVING COUNT(*) > 1
                    LIMIT 1
                    """
                )
            ).first()
            if duplicate is not None:
                raise RuntimeError(
                    "Cannot add unique constraint uq_tt_access_request_user: "
                    "tt_access_requests contains duplicate user_id values."
                )
            op.create_unique_constraint(
                "uq_tt_access_request_user",
                "tt_access_requests",
                ["user_id"],
            )


def downgrade() -> None:
    pass
