"""Persist academic year and level on timetable classes.

The canonical class identity is now School + Academic Year + Level + Class Code.
Existing timetable classes are retained and enriched from school_classes when a
matching school/code exists.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260830ttclassctx"
down_revision = "20260819attctx"
branch_labels = None
depends_on = None


def _tables(bind):
    return set(sa.inspect(bind).get_table_names())


def _columns(bind, table):
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def _indexes(bind, table):
    return {i["name"] for i in sa.inspect(bind).get_indexes(table)}


def upgrade():
    bind = op.get_bind()
    tables = _tables(bind)

    if "tt_classes" not in tables:
        return

    cols = _columns(bind, "tt_classes")
    if "academic_year_id" not in cols:
        op.add_column(
            "tt_classes",
            sa.Column("academic_year_id", sa.Integer(), sa.ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=True),
        )
    if "level_id" not in cols:
        op.add_column(
            "tt_classes",
            sa.Column("level_id", sa.Integer(), sa.ForeignKey("levels.id", ondelete="RESTRICT"), nullable=True),
        )

    cols = _columns(bind, "tt_classes")
    indexes = _indexes(bind, "tt_classes")
    if "ix_tt_class_academic_year_id" not in indexes:
        op.create_index("ix_tt_class_academic_year_id", "tt_classes", ["academic_year_id"])
    if "ix_tt_class_level_id" not in indexes:
        op.create_index("ix_tt_class_level_id", "tt_classes", ["level_id"])

    # Backfill existing timetable classes from the canonical academic class
    # registry where school + code uniquely identifies the same class.
    if "school_classes" in tables:
        sc_cols = _columns(bind, "school_classes")
        if {"school_id", "code", "academic_year_id", "level_id"}.issubset(sc_cols):
            bind.execute(
                sa.text(
                    """
                    UPDATE tt_classes tc
                    SET academic_year_id = sc.academic_year_id,
                        level_id = sc.level_id
                    FROM school_classes sc
                    WHERE tc.school_id = sc.school_id
                      AND tc.code = sc.code
                      AND (tc.academic_year_id IS NULL OR tc.level_id IS NULL)
                    """
                )
            )


def downgrade():
    bind = op.get_bind()
    if "tt_classes" not in _tables(bind):
        return
    cols = _columns(bind, "tt_classes")
    indexes = _indexes(bind, "tt_classes")
    if "ix_tt_class_academic_year_id" in indexes:
        op.drop_index("ix_tt_class_academic_year_id", table_name="tt_classes")
    if "ix_tt_class_level_id" in indexes:
        op.drop_index("ix_tt_class_level_id", table_name="tt_classes")
    if "level_id" in cols:
        op.drop_column("tt_classes", "level_id")
    if "academic_year_id" in cols:
        op.drop_column("tt_classes", "academic_year_id")
