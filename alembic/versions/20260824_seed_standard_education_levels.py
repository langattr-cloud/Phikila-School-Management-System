"""Ensure every school has the four standard education levels.

Some schools currently have only a subset of the standard levels, which causes
level selectors to show only the rows that happen to exist (for example,
Junior School). Backfill missing standard levels without changing existing
custom names, codes, grades, or status values.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260824seedlevels"
down_revision = "20260824streamgrade"
branch_labels = None
depends_on = None


STANDARD_LEVELS = (
    ("Pre-Primary School", "PRE", 1),
    ("Primary School", "PRI", 2),
    ("Junior School", "JUN", 3),
    ("Senior School", "SEN", 4),
)


def upgrade() -> None:
    bind = op.get_bind()

    for name, code, display_order in STANDARD_LEVELS:
        bind.execute(
            sa.text(
                """
                INSERT INTO levels (school_id, name, code, display_order, status)
                SELECT s.id, :name, :code, :display_order, 'ACTIVE'
                FROM school_info s
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM levels l
                    WHERE l.school_id = s.id AND l.code = :code
                )
                """
            ),
            {"name": name, "code": code, "display_order": display_order},
        )


def downgrade() -> None:
    bind = op.get_bind()
    # Only remove rows that this migration can identify as the canonical
    # standard levels. Existing rows are intentionally preserved on downgrade
    # when they may have acquired grades or other dependent data.
    for code in ("PRE", "PRI", "JUN", "SEN"):
        bind.execute(
            sa.text(
                """
                DELETE FROM levels l
                WHERE l.code = :code
                  AND l.name IN (
                    'Pre-Primary School',
                    'Primary School',
                    'Junior School',
                    'Senior School'
                  )
                  AND NOT EXISTS (SELECT 1 FROM grades g WHERE g.level_id = l.id)
                  AND NOT EXISTS (SELECT 1 FROM streams s WHERE s.level_id = l.id)
                """
            ),
            {"code": code},
        )
