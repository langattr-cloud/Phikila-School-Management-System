"""Allow the same stream names in different grades.

The original school-scoped stream migration created a legacy uniqueness
constraint on ``(school_id, level_id, name)``. That incorrectly prevents
Grade 7 Red and Grade 8 Red from coexisting when both grades belong to the
same level. The canonical stream identity is school + academic year + grade
+ name, matching the Stream model and bulk API semantics.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260824streamgrade"
down_revision = "20260823postmerge"
branch_labels = None
depends_on = None


def _constraints(bind):
    return {c["name"] for c in sa.inspect(bind).get_unique_constraints("streams")}


def upgrade() -> None:
    bind = op.get_bind()
    constraints = _constraints(bind)

    # Legacy constraint: stream name was unique across an entire level.
    # This is too restrictive because multiple grades in the same level may
    # legitimately use the same names (e.g. Red/Blue/Yellow/Green).
    if "uq_stream_school_level_name" in constraints:
        op.drop_constraint("uq_stream_school_level_name", "streams", type_="unique")

    constraints = _constraints(bind)
    if "uq_stream_school_year_grade_name" not in constraints:
        op.create_unique_constraint(
            "uq_stream_school_year_grade_name",
            "streams",
            ["school_id", "academic_year_id", "grade_id", "name"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    constraints = _constraints(bind)

    if "uq_stream_school_year_grade_name" in constraints:
        op.drop_constraint("uq_stream_school_year_grade_name", "streams", type_="unique")

    constraints = _constraints(bind)
    if "uq_stream_school_level_name" not in constraints:
        op.create_unique_constraint(
            "uq_stream_school_level_name",
            "streams",
            ["school_id", "level_id", "name"],
        )
