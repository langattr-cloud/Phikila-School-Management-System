"""Normalize and enforce unique term names within an academic year.

Existing duplicate rows are preserved rather than guessed at or deleted. The
unique index prevents new logical duplicates while leaving historical data
available for a later explicit cleanup/migration decision.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260902termuniq"
down_revision = "20260821finalmerge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Normalize whitespace/case before enforcing uniqueness. Keep the first
    # row for each logical term and rename later duplicates temporarily so the
    # migration remains safe on databases that already contain duplicates.
    duplicates = bind.execute(sa.text("""
        SELECT school_id, academic_year_id, lower(trim(name)) AS normalized_name,
               array_agg(id ORDER BY id) AS ids
        FROM terms
        GROUP BY school_id, academic_year_id, lower(trim(name))
        HAVING count(*) > 1
    """)).fetchall()

    for row in duplicates:
        ids = list(row.ids)
        for duplicate_id in ids[1:]:
            bind.execute(
                sa.text("UPDATE terms SET name = :name WHERE id = :id"),
                {"name": f"{row.normalized_name} (duplicate {duplicate_id})", "id": duplicate_id},
            )

    bind.execute(sa.text("UPDATE terms SET name = trim(name) WHERE name IS NOT NULL"))

    op.create_index(
        "uq_terms_school_year_name_ci",
        "terms",
        ["school_id", "academic_year_id", sa.text("lower(name)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_terms_school_year_name_ci", table_name="terms")
