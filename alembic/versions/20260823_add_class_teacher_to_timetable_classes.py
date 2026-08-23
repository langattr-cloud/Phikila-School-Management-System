"""Add an optional class teacher to timetable classes.

The production database may already contain this column from an earlier
partial deployment. The migration is therefore idempotent for the column,
foreign key, and index.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260823classteacher"
down_revision = "20260821mergeall"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("tt_classes")}
    if "class_teacher_id" not in columns:
        op.add_column("tt_classes", sa.Column("class_teacher_id", sa.Integer(), nullable=True))

    fks = {fk.get("name") for fk in inspector.get_foreign_keys("tt_classes")}
    if "fk_tt_classes_class_teacher_id" not in fks:
        op.create_foreign_key(
            "fk_tt_classes_class_teacher_id",
            "tt_classes",
            "tt_teachers",
            ["class_teacher_id"],
            ["id"],
            ondelete="SET NULL",
        )

    indexes = {idx.get("name") for idx in inspector.get_indexes("tt_classes")}
    if "ix_tt_classes_class_teacher_id" not in indexes:
        op.create_index("ix_tt_classes_class_teacher_id", "tt_classes", ["class_teacher_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {idx.get("name") for idx in inspector.get_indexes("tt_classes")}
    if "ix_tt_classes_class_teacher_id" in indexes:
        op.drop_index("ix_tt_classes_class_teacher_id", table_name="tt_classes")
    fks = {fk.get("name") for fk in inspector.get_foreign_keys("tt_classes")}
    if "fk_tt_classes_class_teacher_id" in fks:
        op.drop_constraint("fk_tt_classes_class_teacher_id", "tt_classes", type_="foreignkey")
    columns = {c["name"] for c in inspector.get_columns("tt_classes")}
    if "class_teacher_id" in columns:
        op.drop_column("tt_classes", "class_teacher_id")
