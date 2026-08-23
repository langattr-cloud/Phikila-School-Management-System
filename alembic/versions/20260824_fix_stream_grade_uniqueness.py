"""Allow the same stream names in different grades.

The production database can contain the correct uniqueness index already,
possibly created by an earlier migration or deployment. PostgreSQL reports
an existing index/constraint name as DuplicateTable when Alembic attempts to
create the same constraint name. This migration normalizes both forms.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260824streamgrade"
down_revision = "20260823postmerge"
branch_labels = None
depends_on = None


def _constraint_names(bind):
    return {c["name"] for c in sa.inspect(bind).get_unique_constraints("streams") if c.get("name")}


def upgrade() -> None:
    bind = op.get_bind()

    # Remove the old level-scoped uniqueness rule if it exists.
    if "uq_stream_school_level_name" in _constraint_names(bind):
        op.drop_constraint("uq_stream_school_level_name", "streams", type_="unique")

    # A previous deployment may have left an index with the target name even
    # when Alembic does not report it as a unique constraint. Drop that named
    # index first so the constraint can be created deterministically.
    op.execute(sa.text("DROP INDEX IF EXISTS uq_stream_school_year_grade_name"))

    # Recreate the canonical uniqueness rule. It is deliberately scoped to
    # academic year + grade, so Grade 7 Red and Grade 8 Red are both valid.
    op.create_unique_constraint(
        "uq_stream_school_year_grade_name",
        "streams",
        ["school_id", "academic_year_id", "grade_id", "name"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    if "uq_stream_school_year_grade_name" in _constraint_names(bind):
        op.drop_constraint("uq_stream_school_year_grade_name", "streams", type_="unique")

    op.execute(sa.text("DROP INDEX IF EXISTS uq_stream_school_year_grade_name"))
    op.create_unique_constraint(
        "uq_stream_school_level_name",
        "streams",
        ["school_id", "level_id", "name"],
    )
