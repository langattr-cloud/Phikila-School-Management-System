"""Reconcile timetable constraint timestamps with the ORM contract.

Production ``tt_constraints`` predates the current scheduling ORM and is
missing ``updated_at``. SQLAlchemy selects every mapped column when loading a
constraint, so the mismatch causes the constraints endpoint (and Time Off
configuration) to fail with PostgreSQL UndefinedColumn errors.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260821tt07"
down_revision = "20260819attctx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    tables = set(inspector.get_table_names())
    if "tt_constraints" not in tables:
        return

    columns = {column["name"] for column in inspector.get_columns("tt_constraints")}
    if "updated_at" not in columns:
        op.add_column(
            "tt_constraints",
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "tt_constraints" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("tt_constraints")}
    if "updated_at" in columns:
        op.drop_column("tt_constraints", "updated_at")
