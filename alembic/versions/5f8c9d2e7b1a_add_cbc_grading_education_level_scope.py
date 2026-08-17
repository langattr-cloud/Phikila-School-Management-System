"""Add CBC grading education-level scope to grade_scales.

CBC / KPSEA / KJSEA grading amendment: adds an optional ``education_level``
column (``primary`` / ``junior`` / ``senior``, or NULL) to ``grade_scales``.

* Existing rows keep NULL and continue to drive the legacy Senior School
  raw-score grading — behaviour is unchanged.
* ``primary`` / ``junior`` rows define percentage-based CBC band overrides
  for the corresponding education level.

Non-destructive: purely additive, no data is rewritten.

Revision ID: 5f8c9d2e7b1a
Revises: c6f1a9d2e4b7
Create Date: 2026-08-17
"""

from alembic import op
import sqlalchemy as sa

revision = "5f8c9d2e7b1a"
down_revision = "c6f1a9d2e4b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "grade_scales",
        sa.Column("education_level", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("grade_scales", "education_level")
