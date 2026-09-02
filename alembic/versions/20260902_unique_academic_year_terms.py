"""Normalize and enforce unique term names within an academic year."""
from alembic import op
import sqlalchemy as sa

revision = "20260902termuniq"
down_revision = "20260821finalmerge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Terms are currently a standalone academic-calendar entity. No model in
    # the application references term_id, so duplicate logical rows can be
    # safely collapsed by retaining the earliest row for each school/year/name.
    bind.execute(sa.text("""
        DELETE FROM terms t
        USING terms keeper
        WHERE t.id > keeper.id
          AND t.school_id = keeper.school_id
          AND t.academic_year_id = keeper.academic_year_id
          AND lower(trim(t.name)) = lower(trim(keeper.name))
    """))
    bind.execute(sa.text("UPDATE terms SET name = trim(name) WHERE name IS NOT NULL"))

    op.create_index(
        "uq_terms_school_year_name_ci",
        "terms",
        ["school_id", "academic_year_id", sa.text("lower(name)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_terms_school_year_name_ci", table_name="terms")
