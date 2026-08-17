"""Capture the production calendar schema repair in repository history.

This is intentionally idempotent because the same columns already exist in
production from the manual repair. It creates no calendar rows and does not
assign a synthetic school ID.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260817tt02"
down_revision = "20260817tt01"
branch_labels = None
depends_on = None


def _add_if_missing(table: str) -> None:
    bind = op.get_bind()
    exists = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=:table "
            "AND column_name='updated_at'"
        ),
        {"table": table},
    ).scalar_one_or_none()
    if not exists:
        bind.execute(sa.text(
            f"ALTER TABLE public.{table} "
            "ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now()"
        ))


def upgrade() -> None:
    _add_if_missing("tt_days")
    _add_if_missing("tt_periods")


def downgrade() -> None:
    # Keep the production repair intact on downgrade; dropping these columns
    # would recreate the original runtime failure.
    pass
