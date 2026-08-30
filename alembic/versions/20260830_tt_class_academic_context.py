"""Persist academic year and level on timetable classes."""
from alembic import op
import sqlalchemy as sa

revision = "20260830ttclassctx"
down_revision = "20260825mergeheads"
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
        op.add_column("tt_classes", sa.Column("academic_year_id", sa.Integer(), sa.ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=True))
    if "level_id" not in cols:
        op.add_column("tt_classes", sa.Column("level_id", sa.Integer(), sa.ForeignKey("levels.id", ondelete="RESTRICT"), nullable=True))

    indexes = _indexes(bind, "tt_classes")
    if "ix_tt_class_academic_year_id" not in indexes:
        op.create_index("ix_tt_class_academic_year_id", "tt_classes", ["academic_year_id"])
    if "ix_tt_class_level_id" not in indexes:
        op.create_index("ix_tt_class_level_id", "tt_classes", ["level_id"])

    if "school_classes" in tables:
        sc_cols = _columns(bind, "school_classes")
        required = {"school_id", "code", "academic_year_id", "level_id"}
        if required.issubset(sc_cols):
            bind.execute(sa.text("""
                WITH candidates AS (
                    SELECT tc.id, sc.academic_year_id, sc.level_id,
                           ROW_NUMBER() OVER (
                               PARTITION BY tc.school_id, sc.academic_year_id,
                                            sc.level_id, upper(trim(sc.code))
                               ORDER BY tc.id
                           ) AS rn
                    FROM tt_classes tc
                    JOIN school_classes sc
                      ON tc.school_id = sc.school_id
                     AND upper(trim(tc.code)) = upper(trim(sc.code))
                    WHERE (tc.academic_year_id IS NULL OR tc.level_id IS NULL)
                      AND sc.academic_year_id IS NOT NULL
                      AND sc.level_id IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1 FROM tt_classes existing
                          WHERE existing.id <> tc.id
                            AND existing.school_id = tc.school_id
                            AND existing.academic_year_id = sc.academic_year_id
                            AND existing.level_id = sc.level_id
                            AND upper(trim(existing.code)) = upper(trim(sc.code))
                      )
                ), chosen AS (
                    SELECT id, academic_year_id, level_id
                    FROM candidates WHERE rn = 1
                )
                UPDATE tt_classes tc
                SET academic_year_id = chosen.academic_year_id,
                    level_id = chosen.level_id
                FROM chosen
                WHERE tc.id = chosen.id
            """))


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
