"""Enforce timetable class identity and clean orphan duplicates."""
from alembic import op
import sqlalchemy as sa

revision = "20260830classintegrity"
down_revision = "20260830merge_tt_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "tt_classes" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("tt_classes")}
    if "school_class_id" not in cols and "school_classes" in tables:
        op.add_column("tt_classes", sa.Column("school_class_id", sa.Integer(), nullable=True))
        op.create_index("ix_tt_class_school_class_id", "tt_classes", ["school_class_id"])
        op.create_foreign_key("fk_tt_classes_school_class_id", "tt_classes", "school_classes", ["school_class_id"], ["id"], ondelete="SET NULL")
    cols = {c["name"] for c in sa.inspect(bind).get_columns("tt_classes")}
    if "school_class_id" in cols and "school_classes" in tables:
        bind.execute(sa.text("""
            UPDATE tt_classes tc SET school_class_id = sc.id
            FROM school_classes sc
            WHERE tc.school_id = sc.school_id
              AND upper(trim(tc.code)) = upper(trim(sc.code))
              AND tc.school_class_id IS NULL
        """))
        bind.execute(sa.text("""
            DELETE FROM tt_classes tc
            WHERE tc.school_class_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM tt_lesson_requirements r WHERE r.class_id = tc.id)
              AND NOT EXISTS (SELECT 1 FROM tt_lessons l WHERE l.class_id = tc.id)
              AND EXISTS (
                SELECT 1 FROM tt_classes keep
                WHERE keep.id <> tc.id
                  AND keep.school_id = tc.school_id
                  AND keep.school_class_id = tc.school_class_id
                  AND (
                    EXISTS (SELECT 1 FROM tt_lesson_requirements r WHERE r.class_id = keep.id)
                    OR EXISTS (SELECT 1 FROM tt_lessons l WHERE l.class_id = keep.id)
                    OR keep.id < tc.id
                  )
              )
        """))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "tt_classes" not in inspector.get_table_names():
        return
    fks = {fk.get("name") for fk in inspector.get_foreign_keys("tt_classes")}
    if "fk_tt_classes_school_class_id" in fks:
        op.drop_constraint("fk_tt_classes_school_class_id", "tt_classes", type_="foreignkey")
    indexes = {i["name"] for i in inspector.get_indexes("tt_classes")}
    if "ix_tt_class_school_class_id" in indexes:
        op.drop_index("ix_tt_class_school_class_id", table_name="tt_classes")
    cols = {c["name"] for c in inspector.get_columns("tt_classes")}
    if "school_class_id" in cols:
        op.drop_column("tt_classes", "school_class_id")
