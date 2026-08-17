"""Add CBC grading education-level scope to grade_scales.

CBC / KPSEA / KJSEA grading amendment: adds an optional ``education_level``
column (``primary`` / ``junior`` / ``senior``, or NULL) to ``grade_scales``.

* Existing rows keep NULL and continue to drive the legacy Senior School
  raw-score grading — behaviour is unchanged.
* ``primary`` / ``junior`` rows define percentage-based CBC band overrides
  for the corresponding education level.

Production compatibility: some existing deployments are stamped at this
revision's parent but do not have the optional ``grade_scales`` table. In
that case this migration is intentionally a no-op rather than failing the
entire production migration run. If the table exists, only the missing column
is added.

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
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "grade_scales" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("grade_scales")}
    if "education_level" not in columns:
        op.add_column(
            "grade_scales",
            sa.Column("education_level", sa.String(20), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "grade_scales" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("grade_scales")}
    if "education_level" in columns:
        op.drop_column("grade_scales", "education_level")
