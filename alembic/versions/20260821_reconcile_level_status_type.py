"""Reconcile the levels.status column with the application enum.

Some production databases still have the legacy BOOLEAN representation for
levels.status, while the current ORM expects the PostgreSQL statusenum. This
migration converts the legacy boolean representation to ACTIVE/INACTIVE and
is a no-op when the column is already the statusenum.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260821lvlstatus"
down_revision = ("20260821mergeacad", "20260821tt07")
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "levels" not in inspector.get_table_names():
        return

    column = next((c for c in inspector.get_columns("levels") if c["name"] == "status"), None)
    if column is None:
        return

    # If the enum already exists, keep the production type and data untouched.
    enum_exists = bind.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM pg_type t
                JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'public' AND t.typname = 'statusenum'
            )
            """
        )
    ).scalar_one()

    if not enum_exists:
        bind.execute(sa.text("CREATE TYPE statusenum AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED')"))

    data_type = column.get("type")
    is_boolean = isinstance(data_type, sa.Boolean)

    if is_boolean:
        bind.execute(
            sa.text(
                """
                ALTER TABLE levels
                ALTER COLUMN status DROP DEFAULT
                """
            )
        )
        bind.execute(
            sa.text(
                """
                ALTER TABLE levels
                ALTER COLUMN status TYPE statusenum
                USING CASE
                    WHEN status IS TRUE THEN 'ACTIVE'::statusenum
                    WHEN status IS FALSE THEN 'INACTIVE'::statusenum
                    ELSE 'ACTIVE'::statusenum
                END
                """
            )
        )
        bind.execute(
            sa.text(
                "ALTER TABLE levels ALTER COLUMN status SET DEFAULT 'ACTIVE'::statusenum"
            )
        )


def downgrade() -> None:
    # Do not convert production enum data back to BOOLEAN automatically.
    pass
