"""Add responsible teacher to examination subject assignments.

This is additive: existing examination data remains intact and teacher_id is
nullable so historical and unassigned exam subjects continue to work.
"""

from alembic import op
import sqlalchemy as sa

revision = "c2f8e9a1d6b4"
down_revision = "a1c4f7b20d31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exam_subjects", sa.Column("teacher_id", sa.Integer(), nullable=True))
    op.create_index("ix_exam_subjects_teacher_id", "exam_subjects", ["teacher_id"])


def downgrade() -> None:
    op.drop_index("ix_exam_subjects_teacher_id", table_name="exam_subjects")
    op.drop_column("exam_subjects", "teacher_id")
