"""Add an optional class teacher to timetable classes."""
from alembic import op
import sqlalchemy as sa

revision = "20260823classteacher"
down_revision = "20260821mergeall"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tt_classes", sa.Column("class_teacher_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tt_classes_class_teacher_id",
        "tt_classes",
        "tt_teachers",
        ["class_teacher_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_tt_classes_class_teacher_id", "tt_classes", ["class_teacher_id"])


def downgrade() -> None:
    op.drop_index("ix_tt_classes_class_teacher_id", table_name="tt_classes")
    op.drop_constraint("fk_tt_classes_class_teacher_id", "tt_classes", type_="foreignkey")
    op.drop_column("tt_classes", "class_teacher_id")
